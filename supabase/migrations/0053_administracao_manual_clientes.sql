-- Administração manual de clientes enquanto o gateway ainda não está ligado.
--
-- A conta da plataforma aprova/rejeita cadastros e ativa o plano da empresa.
-- Clientes comuns continuam sem qualquer permissão de escrita em subscriptions.

-- A aprovação também faz parte da fronteira do banco. Assim, rejeitar/revogar
-- uma conta corta o acesso aos dados mesmo que alguém tente ignorar a interface
-- e chamar a API do Supabase diretamente com uma sessão ainda válida.
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.organization_id
  from public.organization_members m
  where m.user_id = auth.uid()
    and exists (
      select 1
      from public.access_requests r
      where r.user_id = auth.uid()
        and r.status = 'aprovado'
    )
    and public.fn_assinatura_permite_acesso(m.organization_id)
  order by m.created_at
  limit 1
$$;

revoke all on function public.current_org_id() from public;
revoke all on function public.current_org_id() from anon;
grant execute on function public.current_org_id() to authenticated;

create or replace function public.admin_listar_acessos()
returns table (
  id uuid,
  user_id uuid,
  email text,
  nome text,
  nome_loja text,
  status text,
  created_at timestamptz,
  decided_at timestamptz,
  organization_id uuid,
  organization_nome text,
  plano text,
  assinatura_status text,
  current_period_end timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito ao administrador da plataforma'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    r.id,
    r.user_id,
    r.email,
    r.nome,
    r.nome_loja,
    r.status,
    r.created_at,
    r.decided_at,
    m.organization_id,
    o.nome,
    s.plano,
    s.status,
    s.current_period_end
  from public.access_requests r
  left join lateral (
    select om.organization_id
    from public.organization_members om
    where om.user_id = r.user_id
    order by om.created_at
    limit 1
  ) m on true
  left join public.organizations o on o.id = m.organization_id
  left join public.subscriptions s on s.organization_id = m.organization_id
  order by r.created_at desc;
end;
$$;

revoke all on function public.admin_listar_acessos() from public;
revoke all on function public.admin_listar_acessos() from anon;
grant execute on function public.admin_listar_acessos() to authenticated;

create or replace function public.admin_decidir_acesso(
  p_pedido_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito ao administrador da plataforma'
      using errcode = 'insufficient_privilege';
  end if;

  if p_status not in ('aprovado', 'rejeitado') then
    raise exception 'Status de acesso inválido' using errcode = 'check_violation';
  end if;

  update public.access_requests
  set status = p_status,
      decided_by = auth.uid(),
      decided_at = now()
  where id = p_pedido_id;

  if not found then
    raise exception 'Solicitação não encontrada';
  end if;
end;
$$;

revoke all on function public.admin_decidir_acesso(uuid, text) from public;
revoke all on function public.admin_decidir_acesso(uuid, text) from anon;
grant execute on function public.admin_decidir_acesso(uuid, text) to authenticated;

create or replace function public.admin_definir_assinatura(
  p_user_id uuid,
  p_plano text,
  p_status text default 'ativa'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_email text;
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito ao administrador da plataforma'
      using errcode = 'insufficient_privilege';
  end if;

  if p_plano not in ('Essencial', 'Profissional', 'Master') then
    raise exception 'Plano inválido' using errcode = 'check_violation';
  end if;

  if p_status not in ('ativa', 'inativa', 'atrasada', 'cancelada') then
    raise exception 'Status de assinatura inválido'
      using errcode = 'check_violation';
  end if;

  select m.organization_id
    into v_org
    from public.organization_members m
    where m.user_id = p_user_id
    order by m.created_at
    limit 1;

  if v_org is null then
    raise exception 'O cliente precisa entrar uma vez e concluir o cadastro da loja';
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = p_user_id;

  insert into public.subscriptions (
    organization_id, provider, email, plano, status, current_period_end, updated_at
  ) values (
    v_org, 'manual', v_email, p_plano, p_status, null, now()
  )
  on conflict (organization_id) do update
    set provider = 'manual',
        email = excluded.email,
        plano = excluded.plano,
        status = excluded.status,
        current_period_end = null,
        updated_at = now();
end;
$$;

revoke all on function public.admin_definir_assinatura(uuid, text, text) from public;
revoke all on function public.admin_definir_assinatura(uuid, text, text) from anon;
grant execute on function public.admin_definir_assinatura(uuid, text, text)
  to authenticated;

-- A alteração deixa de ser feita diretamente pelo navegador; passa pela RPC,
-- que valida o administrador e limita os campos permitidos.
revoke update on table public.access_requests from authenticated;
