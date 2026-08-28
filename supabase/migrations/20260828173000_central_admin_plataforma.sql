-- Central administrativa da plataforma Nexo.
--
-- Mantém o administrador fora das organizações clientes e expõe somente
-- metadados de acesso/cobrança por RPCs protegidas por is_platform_admin().
-- Nenhuma função abaixo permite consultar vendas, clientes, estoque ou
-- financeiro operacional das lojas.

alter table public.access_requests
  add column if not exists plano_admin text,
  add column if not exists valor_mensal numeric(12, 2);

do $$
begin
  alter table public.access_requests
    add constraint access_requests_plano_admin_check
    check (plano_admin is null or plano_admin in ('Essencial', 'Profissional', 'Master'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.access_requests
    add constraint access_requests_valor_mensal_check
    check (valor_mensal is null or valor_mensal >= 0);
exception when duplicate_object then null;
end $$;

create table if not exists public.platform_access_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  nome text,
  nome_loja text,
  plano text not null check (plano in ('Essencial', 'Profissional', 'Master')),
  valor_mensal numeric(12, 2) check (valor_mensal is null or valor_mensal >= 0),
  status text not null default 'pendente'
    check (status in ('pendente', 'usado', 'cancelado')),
  invited_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists platform_access_invites_email_pending_uidx
  on public.platform_access_invites (lower(email))
  where status = 'pendente';

create index if not exists platform_access_invites_status_created_idx
  on public.platform_access_invites (status, created_at desc);

create index if not exists platform_access_invites_invited_by_idx
  on public.platform_access_invites (invited_by);

create index if not exists platform_access_invites_used_by_idx
  on public.platform_access_invites (used_by)
  where used_by is not null;

create table if not exists public.subscription_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  competencia date not null,
  vencimento date not null,
  valor numeric(12, 2) not null check (valor >= 0),
  status text not null default 'pendente'
    check (status in ('pendente', 'paga', 'atrasada', 'cancelada')),
  pago_em timestamptz,
  observacoes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, competencia),
  check (competencia = date_trunc('month', competencia)::date)
);

create index if not exists subscription_invoices_competencia_status_idx
  on public.subscription_invoices (competencia desc, status, vencimento);

create index if not exists subscription_invoices_org_idx
  on public.subscription_invoices (organization_id, competencia desc);

create index if not exists subscription_invoices_created_by_idx
  on public.subscription_invoices (created_by);

create index if not exists subscription_invoices_updated_by_idx
  on public.subscription_invoices (updated_by)
  where updated_by is not null;

create table if not exists public.platform_admin_audit (
  id bigint generated always as identity primary key,
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  acao text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  detalhes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_admin_audit_created_idx
  on public.platform_admin_audit (created_at desc);

create index if not exists platform_admin_audit_admin_user_idx
  on public.platform_admin_audit (admin_user_id);

create index if not exists platform_admin_audit_target_user_idx
  on public.platform_admin_audit (target_user_id)
  where target_user_id is not null;

create index if not exists platform_admin_audit_org_idx
  on public.platform_admin_audit (organization_id)
  where organization_id is not null;

create index if not exists access_requests_decided_by_idx
  on public.access_requests (decided_by)
  where decided_by is not null;

alter table public.platform_access_invites enable row level security;
alter table public.subscription_invoices enable row level security;
alter table public.platform_admin_audit enable row level security;

-- Uma única policy preserva a leitura do próprio pedido e a visão global do
-- administrador, evitando duas policies permissivas concorrentes.
drop policy if exists "access_requests_self_select" on public.access_requests;
drop policy if exists "access_requests_admin_select" on public.access_requests;
drop policy if exists "access_requests_self_or_admin_select" on public.access_requests;
create policy "access_requests_self_or_admin_select"
  on public.access_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_platform_admin()));

drop policy if exists "platform_invites_admin_select" on public.platform_access_invites;
create policy "platform_invites_admin_select"
  on public.platform_access_invites for select to authenticated
  using ((select public.is_platform_admin()));

drop policy if exists "subscription_invoices_admin_select" on public.subscription_invoices;
create policy "subscription_invoices_admin_select"
  on public.subscription_invoices for select to authenticated
  using ((select public.is_platform_admin()));

drop policy if exists "platform_admin_audit_admin_select" on public.platform_admin_audit;
create policy "platform_admin_audit_admin_select"
  on public.platform_admin_audit for select to authenticated
  using ((select public.is_platform_admin()));

revoke all on table public.platform_access_invites from anon, authenticated;
revoke all on table public.subscription_invoices from anon, authenticated;
revoke all on table public.platform_admin_audit from anon, authenticated;
grant select on table public.platform_access_invites to authenticated;
grant select on table public.subscription_invoices to authenticated;
grant select on table public.platform_admin_audit to authenticated;

create or replace function public.fn_admin_auditar(
  p_acao text,
  p_target_user_id uuid default null,
  p_organization_id uuid default null,
  p_detalhes jsonb default '{}'::jsonb
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

  insert into public.platform_admin_audit (
    admin_user_id, acao, target_user_id, organization_id, detalhes
  ) values (
    auth.uid(), p_acao, p_target_user_id, p_organization_id,
    coalesce(p_detalhes, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.fn_admin_auditar(text, uuid, uuid, jsonb)
  from public, anon, authenticated;

-- Convites criados pelo administrador já aprovam a conta no momento do
-- cadastro, sem confiar em metadados editáveis do usuário.
create or replace function public.fn_criar_pedido_acesso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_convite public.platform_access_invites%rowtype;
  v_aprovado boolean := false;
begin
  select i.*
    into v_convite
    from public.platform_access_invites i
    where lower(i.email) = lower(coalesce(NEW.email, ''))
      and i.status = 'pendente'
      and (i.expires_at is null or i.expires_at > now())
    order by i.created_at desc
    limit 1
    for update;

  v_aprovado := found;

  insert into public.access_requests (
    user_id, email, nome, nome_loja, status, decided_by, decided_at,
    plano_admin, valor_mensal
  ) values (
    NEW.id,
    coalesce(NEW.email, ''),
    coalesce(nullif(NEW.raw_user_meta_data ->> 'nome', ''), v_convite.nome),
    coalesce(nullif(NEW.raw_user_meta_data ->> 'nome_loja', ''), v_convite.nome_loja),
    case when v_aprovado then 'aprovado' else 'pendente' end,
    case when v_aprovado then v_convite.invited_by else null end,
    case when v_aprovado then now() else null end,
    case when v_aprovado then v_convite.plano else null end,
    case when v_aprovado then v_convite.valor_mensal else null end
  )
  on conflict (user_id) do update
    set email = excluded.email,
        nome = coalesce(public.access_requests.nome, excluded.nome),
        nome_loja = coalesce(public.access_requests.nome_loja, excluded.nome_loja),
        status = case
          when v_aprovado then 'aprovado'
          else public.access_requests.status
        end,
        decided_by = case
          when v_aprovado then v_convite.invited_by
          else public.access_requests.decided_by
        end,
        decided_at = case
          when v_aprovado then now()
          else public.access_requests.decided_at
        end,
        plano_admin = coalesce(v_convite.plano, public.access_requests.plano_admin),
        valor_mensal = coalesce(v_convite.valor_mensal, public.access_requests.valor_mensal),
        updated_at = now();

  if v_aprovado then
    update public.platform_access_invites
      set status = 'usado', used_by = NEW.id, used_at = now(), updated_at = now()
      where id = v_convite.id;
  end if;

  return NEW;
end;
$$;

-- Uma loja aprovada com plano definido nasce ativa. Solicitações comuns sem
-- plano definido continuam recebendo o trial já existente.
create or replace function public.fn_criar_trial_empresa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plano text;
  v_valor numeric(12, 2);
begin
  select r.plano_admin, r.valor_mensal
    into v_plano, v_valor
    from public.access_requests r
    where r.user_id = auth.uid() and r.status = 'aprovado'
    limit 1;

  insert into public.subscriptions (
    organization_id, provider, email, plano, status, valor, current_period_end
  ) values (
    NEW.id,
    case when v_plano is not null then 'manual' else 'trial' end,
    nullif(lower(coalesce(auth.jwt() ->> 'email', '')), ''),
    coalesce(v_plano, 'Teste gratuito'),
    case when v_plano is not null then 'ativa' else 'trial' end,
    v_valor,
    case when v_plano is not null then null else now() + interval '14 days' end
  )
  on conflict (organization_id) do nothing;
  return NEW;
end;
$$;

create or replace function public.admin_resumo_plataforma()
returns jsonb
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

  return jsonb_build_object(
    'solicitacoes_pendentes', (
      select count(*) from public.access_requests where status = 'pendente'
    ),
    'clientes_liberados', (
      select count(*)
      from public.access_requests r
      where r.status = 'aprovado'
        and exists (
          select 1 from public.organization_members m where m.user_id = r.user_id
        )
    ),
    'assinaturas_ativas', (
      select count(*) from public.subscriptions where status in ('ativa', 'trial')
    ),
    'assinaturas_atrasadas', (
      select count(*) from public.subscriptions where status = 'atrasada'
    ),
    'receita_mensal_prevista', (
      select coalesce(sum(valor), 0)
      from public.subscriptions
      where status in ('ativa', 'trial')
    ),
    'convites_pendentes', (
      select count(*) from public.platform_access_invites
      where status = 'pendente' and (expires_at is null or expires_at > now())
    )
  );
end;
$$;

revoke all on function public.admin_resumo_plataforma() from public, anon;
grant execute on function public.admin_resumo_plataforma() to authenticated;

drop function if exists public.admin_listar_acessos();
create function public.admin_listar_acessos()
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
  valor_mensal numeric,
  current_period_end timestamptz,
  provider text,
  total_membros bigint,
  ultimo_login timestamptz
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
    coalesce(s.plano, r.plano_admin),
    s.status,
    coalesce(s.valor, r.valor_mensal),
    s.current_period_end,
    s.provider,
    coalesce(mc.total, 0),
    u.last_sign_in_at
  from public.access_requests r
  join auth.users u on u.id = r.user_id
  left join lateral (
    select om.organization_id
    from public.organization_members om
    where om.user_id = r.user_id
    order by om.created_at
    limit 1
  ) m on true
  left join public.organizations o on o.id = m.organization_id
  left join public.subscriptions s on s.organization_id = m.organization_id
  left join lateral (
    select count(*) as total
    from public.organization_members omc
    where omc.organization_id = m.organization_id
  ) mc on true
  order by
    case r.status when 'pendente' then 0 when 'aprovado' then 1 else 2 end,
    r.created_at desc;
end;
$$;

revoke all on function public.admin_listar_acessos() from public, anon;
grant execute on function public.admin_listar_acessos() to authenticated;

drop function if exists public.admin_decidir_acesso(uuid, text);
create function public.admin_decidir_acesso(
  p_pedido_id uuid,
  p_status text,
  p_plano text default null,
  p_valor_mensal numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pedido public.access_requests%rowtype;
  v_org uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito ao administrador da plataforma'
      using errcode = 'insufficient_privilege';
  end if;

  if p_status not in ('aprovado', 'rejeitado') then
    raise exception 'Status de acesso inválido' using errcode = 'check_violation';
  end if;
  if p_status = 'aprovado' and p_plano not in ('Essencial', 'Profissional', 'Master') then
    raise exception 'Plano inválido' using errcode = 'check_violation';
  end if;
  if p_valor_mensal is not null and p_valor_mensal < 0 then
    raise exception 'Valor mensal inválido' using errcode = 'check_violation';
  end if;

  select * into v_pedido
  from public.access_requests
  where id = p_pedido_id
  for update;

  if not found then raise exception 'Solicitação não encontrada'; end if;

  select m.organization_id into v_org
  from public.organization_members m
  where m.user_id = v_pedido.user_id
  order by m.created_at
  limit 1;

  update public.access_requests
  set status = p_status,
      decided_by = auth.uid(),
      decided_at = now(),
      plano_admin = case when p_status = 'aprovado' then p_plano else plano_admin end,
      valor_mensal = case when p_status = 'aprovado' then p_valor_mensal else valor_mensal end
  where id = p_pedido_id;

  if v_org is not null and p_status = 'rejeitado' then
    update public.subscriptions
    set status = 'cancelada', updated_at = now()
    where organization_id = v_org;
  elsif v_org is not null and p_status = 'aprovado' then
    insert into public.subscriptions (
      organization_id, provider, email, plano, status, valor, current_period_end, updated_at
    ) values (
      v_org, 'manual', lower(v_pedido.email), p_plano, 'ativa', p_valor_mensal, null, now()
    )
    on conflict (organization_id) do update
      set provider = 'manual',
          email = excluded.email,
          plano = excluded.plano,
          status = 'ativa',
          valor = excluded.valor,
          current_period_end = null,
          updated_at = now();
  end if;

  perform public.fn_admin_auditar(
    case when p_status = 'aprovado' then 'acesso_aprovado' else 'acesso_rejeitado' end,
    v_pedido.user_id,
    v_org,
    jsonb_build_object('plano', p_plano, 'valor_mensal', p_valor_mensal)
  );
end;
$$;

revoke all on function public.admin_decidir_acesso(uuid, text, text, numeric)
  from public, anon;
grant execute on function public.admin_decidir_acesso(uuid, text, text, numeric)
  to authenticated;

drop function if exists public.admin_definir_assinatura(uuid, text, text);
create function public.admin_definir_assinatura(
  p_user_id uuid,
  p_plano text,
  p_status text default 'ativa',
  p_valor_mensal numeric default null,
  p_current_period_end timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_email text;
  v_validade timestamptz;
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito ao administrador da plataforma'
      using errcode = 'insufficient_privilege';
  end if;
  if p_plano not in ('Essencial', 'Profissional', 'Master') then
    raise exception 'Plano inválido' using errcode = 'check_violation';
  end if;
  if p_status not in ('ativa', 'trial', 'inativa', 'atrasada', 'cancelada') then
    raise exception 'Status de assinatura inválido' using errcode = 'check_violation';
  end if;
  if p_valor_mensal is not null and p_valor_mensal < 0 then
    raise exception 'Valor mensal inválido' using errcode = 'check_violation';
  end if;

  select m.organization_id into v_org
  from public.organization_members m
  where m.user_id = p_user_id
  order by m.created_at
  limit 1;

  if v_org is null then
    raise exception 'O cliente precisa entrar uma vez e concluir o cadastro da loja';
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = p_user_id;
  v_validade := case
    when p_status = 'trial' then coalesce(p_current_period_end, now() + interval '14 days')
    else p_current_period_end
  end;

  update public.access_requests
  set plano_admin = p_plano, valor_mensal = p_valor_mensal
  where user_id = p_user_id;

  insert into public.subscriptions (
    organization_id, provider, email, plano, status, valor,
    current_period_end, updated_at
  ) values (
    v_org, 'manual', v_email, p_plano, p_status, p_valor_mensal,
    v_validade, now()
  )
  on conflict (organization_id) do update
    set provider = 'manual',
        email = excluded.email,
        plano = excluded.plano,
        status = excluded.status,
        valor = excluded.valor,
        current_period_end = excluded.current_period_end,
        updated_at = now();

  perform public.fn_admin_auditar(
    'assinatura_atualizada', p_user_id, v_org,
    jsonb_build_object(
      'plano', p_plano,
      'status', p_status,
      'valor_mensal', p_valor_mensal,
      'current_period_end', v_validade
    )
  );
end;
$$;

revoke all on function public.admin_definir_assinatura(uuid, text, text, numeric, timestamptz)
  from public, anon;
grant execute on function public.admin_definir_assinatura(uuid, text, text, numeric, timestamptz)
  to authenticated;

create or replace function public.admin_criar_convite(
  p_email text,
  p_nome text,
  p_nome_loja text,
  p_plano text,
  p_valor_mensal numeric default null,
  p_expira_em timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_convite_id uuid;
  v_user uuid;
  v_org uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito ao administrador da plataforma'
      using errcode = 'insufficient_privilege';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'E-mail inválido' using errcode = 'check_violation';
  end if;
  if p_plano not in ('Essencial', 'Profissional', 'Master') then
    raise exception 'Plano inválido' using errcode = 'check_violation';
  end if;
  if p_valor_mensal is not null and p_valor_mensal < 0 then
    raise exception 'Valor mensal inválido' using errcode = 'check_violation';
  end if;

  select id into v_convite_id
  from public.platform_access_invites
  where lower(email) = v_email and status = 'pendente'
  limit 1
  for update;

  if v_convite_id is null then
    insert into public.platform_access_invites (
      email, nome, nome_loja, plano, valor_mensal, invited_by, expires_at
    ) values (
      v_email, nullif(trim(p_nome), ''), nullif(trim(p_nome_loja), ''),
      p_plano, p_valor_mensal, auth.uid(), p_expira_em
    ) returning id into v_convite_id;
  else
    update public.platform_access_invites
    set nome = nullif(trim(p_nome), ''),
        nome_loja = nullif(trim(p_nome_loja), ''),
        plano = p_plano,
        valor_mensal = p_valor_mensal,
        invited_by = auth.uid(),
        expires_at = p_expira_em,
        updated_at = now()
    where id = v_convite_id;
  end if;

  select u.id into v_user from auth.users u where lower(u.email) = v_email limit 1;
  if v_user is not null then
    insert into public.access_requests (
      user_id, email, nome, nome_loja, status, decided_by, decided_at,
      plano_admin, valor_mensal
    ) values (
      v_user, v_email, nullif(trim(p_nome), ''), nullif(trim(p_nome_loja), ''),
      'aprovado', auth.uid(), now(), p_plano, p_valor_mensal
    )
    on conflict (user_id) do update
      set status = 'aprovado',
          decided_by = auth.uid(),
          decided_at = now(),
          plano_admin = p_plano,
          valor_mensal = p_valor_mensal,
          nome = coalesce(nullif(trim(p_nome), ''), public.access_requests.nome),
          nome_loja = coalesce(nullif(trim(p_nome_loja), ''), public.access_requests.nome_loja),
          updated_at = now();

    update public.platform_access_invites
    set status = 'usado', used_by = v_user, used_at = now(), updated_at = now()
    where id = v_convite_id;

    select m.organization_id into v_org
    from public.organization_members m
    where m.user_id = v_user
    order by m.created_at
    limit 1;

    if v_org is not null then
      insert into public.subscriptions (
        organization_id, provider, email, plano, status, valor, current_period_end, updated_at
      ) values (
        v_org, 'manual', v_email, p_plano, 'ativa', p_valor_mensal, null, now()
      )
      on conflict (organization_id) do update
        set provider = 'manual', email = excluded.email, plano = excluded.plano,
            status = 'ativa', valor = excluded.valor, current_period_end = null,
            updated_at = now();
    end if;
  end if;

  perform public.fn_admin_auditar(
    'convite_criado', v_user, v_org,
    jsonb_build_object('email', v_email, 'plano', p_plano, 'valor_mensal', p_valor_mensal)
  );
  return v_convite_id;
end;
$$;

revoke all on function public.admin_criar_convite(text, text, text, text, numeric, timestamptz)
  from public, anon;
grant execute on function public.admin_criar_convite(text, text, text, text, numeric, timestamptz)
  to authenticated;

create or replace function public.admin_listar_convites()
returns table (
  id uuid,
  email text,
  nome text,
  nome_loja text,
  plano text,
  valor_mensal numeric,
  status text,
  expires_at timestamptz,
  created_at timestamptz
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
  select i.id, i.email, i.nome, i.nome_loja, i.plano, i.valor_mensal,
         i.status, i.expires_at, i.created_at
  from public.platform_access_invites i
  order by i.created_at desc;
end;
$$;

revoke all on function public.admin_listar_convites() from public, anon;
grant execute on function public.admin_listar_convites() to authenticated;

create or replace function public.admin_cancelar_convite(p_convite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_email text;
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito ao administrador da plataforma'
      using errcode = 'insufficient_privilege';
  end if;
  update public.platform_access_invites
  set status = 'cancelado', updated_at = now()
  where id = p_convite_id and status = 'pendente'
  returning email into v_email;
  if not found then raise exception 'Convite pendente não encontrado'; end if;
  perform public.fn_admin_auditar(
    'convite_cancelado', null, null, jsonb_build_object('email', v_email)
  );
end;
$$;

revoke all on function public.admin_cancelar_convite(uuid) from public, anon;
grant execute on function public.admin_cancelar_convite(uuid) to authenticated;

create or replace function public.admin_gerar_mensalidades(
  p_competencia date,
  p_vencimento date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_total integer;
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito ao administrador da plataforma'
      using errcode = 'insufficient_privilege';
  end if;
  if p_vencimento < v_competencia or p_vencimento >= (v_competencia + interval '1 month')::date then
    raise exception 'O vencimento deve pertencer à competência informada'
      using errcode = 'check_violation';
  end if;

  insert into public.subscription_invoices (
    organization_id, competencia, vencimento, valor, status, created_by
  )
  select s.organization_id, v_competencia, p_vencimento, s.valor, 'pendente', auth.uid()
  from public.subscriptions s
  where s.status in ('ativa', 'trial', 'atrasada')
    and s.valor is not null and s.valor > 0
  on conflict (organization_id, competencia) do nothing;

  get diagnostics v_total = row_count;
  perform public.fn_admin_auditar(
    'mensalidades_geradas', null, null,
    jsonb_build_object(
      'competencia', v_competencia,
      'vencimento', p_vencimento,
      'quantidade', v_total
    )
  );
  return v_total;
end;
$$;

revoke all on function public.admin_gerar_mensalidades(date, date) from public, anon;
grant execute on function public.admin_gerar_mensalidades(date, date) to authenticated;

create or replace function public.admin_listar_mensalidades(p_competencia date)
returns table (
  invoice_id uuid,
  organization_id uuid,
  user_id uuid,
  organization_nome text,
  email text,
  plano text,
  valor numeric,
  competencia date,
  vencimento date,
  status text,
  pago_em timestamptz,
  observacoes text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_competencia date := date_trunc('month', p_competencia)::date;
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito ao administrador da plataforma'
      using errcode = 'insufficient_privilege';
  end if;
  return query
  select
    f.id,
    o.id,
    o.owner_user_id,
    o.nome,
    coalesce(s.email, r.email),
    s.plano,
    coalesce(f.valor, s.valor),
    v_competencia,
    f.vencimento,
    case
      when f.id is null then 'nao_gerada'
      when f.status = 'pendente' and f.vencimento < current_date then 'atrasada'
      else f.status
    end,
    f.pago_em,
    f.observacoes
  from public.organizations o
  left join public.subscriptions s on s.organization_id = o.id
  left join public.access_requests r on r.user_id = o.owner_user_id
  left join public.subscription_invoices f
    on f.organization_id = o.id and f.competencia = v_competencia
  order by
    case
      when f.id is null then 2
      when f.status = 'paga' then 3
      when f.status = 'cancelada' then 4
      when f.status = 'atrasada' or (f.status = 'pendente' and f.vencimento < current_date) then 0
      else 1
    end,
    o.nome;
end;
$$;

revoke all on function public.admin_listar_mensalidades(date) from public, anon;
grant execute on function public.admin_listar_mensalidades(date) to authenticated;

create or replace function public.admin_atualizar_mensalidade(
  p_invoice_id uuid,
  p_status text,
  p_pago_em timestamptz default null,
  p_observacoes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fatura public.subscription_invoices%rowtype;
  v_user uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito ao administrador da plataforma'
      using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('pendente', 'paga', 'atrasada', 'cancelada') then
    raise exception 'Status de mensalidade inválido' using errcode = 'check_violation';
  end if;

  update public.subscription_invoices
  set status = p_status,
      pago_em = case
        when p_status = 'paga' then coalesce(p_pago_em, now())
        else null
      end,
      observacoes = nullif(trim(p_observacoes), ''),
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_invoice_id
  returning * into v_fatura;

  if not found then raise exception 'Mensalidade não encontrada'; end if;

  if p_status = 'paga' then
    update public.subscriptions
    set status = 'ativa', updated_at = now()
    where organization_id = v_fatura.organization_id;
  elsif p_status = 'atrasada' then
    update public.subscriptions
    set status = 'atrasada', updated_at = now()
    where organization_id = v_fatura.organization_id;
  end if;

  select owner_user_id into v_user
  from public.organizations where id = v_fatura.organization_id;

  perform public.fn_admin_auditar(
    'mensalidade_atualizada', v_user, v_fatura.organization_id,
    jsonb_build_object(
      'invoice_id', v_fatura.id,
      'competencia', v_fatura.competencia,
      'status', p_status,
      'valor', v_fatura.valor
    )
  );
end;
$$;

revoke all on function public.admin_atualizar_mensalidade(uuid, text, timestamptz, text)
  from public, anon;
grant execute on function public.admin_atualizar_mensalidade(uuid, text, timestamptz, text)
  to authenticated;

create or replace function public.admin_listar_auditoria(p_limite integer default 30)
returns table (
  id bigint,
  acao text,
  admin_email text,
  target_email text,
  organization_nome text,
  detalhes jsonb,
  created_at timestamptz
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
  select a.id, a.acao, au.email, tu.email, o.nome, a.detalhes, a.created_at
  from public.platform_admin_audit a
  join auth.users au on au.id = a.admin_user_id
  left join auth.users tu on tu.id = a.target_user_id
  left join public.organizations o on o.id = a.organization_id
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_limite, 30), 100));
end;
$$;

revoke all on function public.admin_listar_auditoria(integer) from public, anon;
grant execute on function public.admin_listar_auditoria(integer) to authenticated;
