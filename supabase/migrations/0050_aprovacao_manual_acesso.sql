-- ─────────────────────────────────────────────────────────────────────────────
-- Cadastro público com aprovação manual.
--
-- Criar um usuário no Supabase não dá acesso à operação. Toda conta nova nasce
-- como "pendente" e só pode criar/entrar em uma empresa depois de um
-- administrador da plataforma aprovar o pedido.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  nome text,
  nome_loja text,
  status text not null default 'pendente'
    check (status in ('pendente', 'aprovado', 'rejeitado')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists access_requests_status_created_idx
  on public.access_requests (status, created_at desc);

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.access_requests enable row level security;
alter table public.platform_admins enable row level security;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins a where a.user_id = auth.uid()
  )
$$;

revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

drop policy if exists "access_requests_self_select" on public.access_requests;
create policy "access_requests_self_select"
  on public.access_requests for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "access_requests_admin_select" on public.access_requests;
create policy "access_requests_admin_select"
  on public.access_requests for select to authenticated
  using (public.is_platform_admin());

drop policy if exists "access_requests_admin_update" on public.access_requests;
create policy "access_requests_admin_update"
  on public.access_requests for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "platform_admins_self_select" on public.platform_admins;
create policy "platform_admins_self_select"
  on public.platform_admins for select to authenticated
  using (user_id = auth.uid());

-- Usuários que já pertenciam a uma empresa continuam liberados. Contas antigas
-- sem vínculo ficam pendentes, como qualquer cadastro novo.
insert into public.access_requests (
  user_id, email, nome, nome_loja, status, decided_at
)
select
  u.id,
  coalesce(u.email, ''),
  nullif(u.raw_user_meta_data ->> 'nome', ''),
  nullif(u.raw_user_meta_data ->> 'nome_loja', ''),
  case
    when exists (
      select 1 from public.organization_members m where m.user_id = u.id
    ) then 'aprovado'
    else 'pendente'
  end,
  case
    when exists (
      select 1 from public.organization_members m where m.user_id = u.id
    ) then now()
    else null
  end
from auth.users u
on conflict (user_id) do nothing;

-- O pedido é criado dentro do banco, mesmo quando confirmação de e-mail está
-- ligada e o signUp não devolve uma sessão ao navegador.
create or replace function public.fn_criar_pedido_acesso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.access_requests (
    user_id, email, nome, nome_loja, status
  ) values (
    NEW.id,
    coalesce(NEW.email, ''),
    nullif(NEW.raw_user_meta_data ->> 'nome', ''),
    nullif(NEW.raw_user_meta_data ->> 'nome_loja', ''),
    'pendente'
  )
  on conflict (user_id) do update
    set email = excluded.email,
        nome = coalesce(public.access_requests.nome, excluded.nome),
        nome_loja = coalesce(public.access_requests.nome_loja, excluded.nome_loja),
        updated_at = now();
  return NEW;
end;
$$;

drop trigger if exists trg_criar_pedido_acesso on auth.users;
create trigger trg_criar_pedido_acesso
  after insert on auth.users
  for each row execute function public.fn_criar_pedido_acesso();

-- Atualiza o timestamp sem permitir que o usuário comum altere o próprio
-- status (não existe policy de UPDATE para ele).
create or replace function public.fn_access_request_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists trg_access_request_updated_at on public.access_requests;
create trigger trg_access_request_updated_at
  before update on public.access_requests
  for each row execute function public.fn_access_request_updated_at();

-- Recria a RPC do onboarding com o gate de aprovação antes de qualquer criação
-- ou aceite de convite.
create or replace function public.garantir_empresa(p_nome text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_org uuid;
  v_convite record;
  v_tem_convite boolean := false;
begin
  if v_user is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if not exists (
    select 1
    from public.access_requests r
    where r.user_id = v_user and r.status = 'aprovado'
  ) then
    raise exception 'Acesso aguardando aprovacao';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  select m.organization_id
    into v_org
    from public.organization_members m
    where m.user_id = v_user
    order by m.created_at
    limit 1;

  if v_org is not null then
    return v_org;
  end if;

  if v_email <> '' then
    select i.*
      into v_convite
      from public.organization_invites i
      where lower(i.email) = v_email
        and i.status = 'pendente'
        and (i.expires_at is null or i.expires_at > now())
      order by i.created_at desc
      limit 1
      for update;
    v_tem_convite := found;
  end if;

  if v_tem_convite then
    insert into public.organization_members (
      organization_id, user_id, papel, email
    ) values (
      v_convite.organization_id, v_user,
      case
        when v_convite.papel in ('owner', 'gerente', 'caixa', 'financeiro')
          then v_convite.papel
        else 'caixa'
      end,
      nullif(v_email, '')
    );

    update public.organization_invites
      set status = 'aceito', used_at = now(), used_by = v_user
      where id = v_convite.id;

    return v_convite.organization_id;
  end if;

  insert into public.organizations (nome, owner_user_id)
  values (coalesce(nullif(trim(p_nome), ''), 'Minha empresa'), v_user)
  returning id into v_org;

  insert into public.organization_members (
    organization_id, user_id, papel, email
  ) values (
    v_org, v_user, 'owner', nullif(v_email, '')
  );

  insert into public.stores (organization_id, nome)
  values (v_org, 'Unidade principal');

  return v_org;
end;
$$;

revoke all on function public.garantir_empresa(text) from public;
grant execute on function public.garantir_empresa(text) to authenticated;

-- A tabela de administradores começa vazia de propósito. Em cada ambiente,
-- cadastre explicitamente o usuário responsável com service_role/SQL Editor:
-- insert into public.platform_admins (user_id)
-- select id from auth.users where lower(email) = lower('email-do-admin');
