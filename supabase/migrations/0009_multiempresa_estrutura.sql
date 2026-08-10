-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 3.1 + 3.2 — Fundação multiempresa (estrutura + organization_id)
-- ADITIVO e SEGURO: NÃO altera o RLS das tabelas existentes (isso é o passo 3.3).
-- O app continua funcionando por user_id enquanto isso.
--
-- Cria: organizations, stores (unidades), organization_members, audit_logs.
-- Faz backfill: 1 empresa por dono atual + 1 unidade + membership "owner".
-- Adiciona organization_id (default = empresa do usuário) em todas as tabelas
-- operacionais e preenche com a empresa do dono de cada linha.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Tabelas novas ────────────────────────────────────────────────────────────
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  nome text not null default 'Minha empresa',
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  nome text not null default 'Unidade principal',
  created_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  papel text not null default 'owner',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  acao text not null,
  entidade text,
  registro_id uuid,
  dados jsonb,
  created_at timestamptz not null default now()
);

create index if not exists organization_members_user_idx
  on public.organization_members (user_id);
create index if not exists stores_org_idx on public.stores (organization_id);
create index if not exists audit_logs_org_idx on public.audit_logs (organization_id);

-- ── Função: empresa "atual" do usuário logado (usada como default) ───────────
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id
  from public.organization_members
  where user_id = auth.uid()
  order by created_at
  limit 1
$$;

-- ── Backfill: 1 empresa por dono existente ───────────────────────────────────
insert into public.organizations (nome, owner_user_id)
select coalesce(cf.nome_operacao, 'Minha empresa'), donos.user_id
from (
  select distinct user_id from public.configuracoes where user_id is not null
  union select distinct user_id from public.clientes where user_id is not null
  union select distinct user_id from public.produtos where user_id is not null
  union select distinct user_id from public.vendas where user_id is not null
  union select distinct user_id from public.condicionais where user_id is not null
  union select distinct user_id from public.promissorias where user_id is not null
  union select distinct user_id from public.despesas where user_id is not null
  union select distinct user_id from public.eventos where user_id is not null
  union select distinct user_id from public.tatuagem_atendimentos where user_id is not null
) donos
left join lateral (
  select nome_operacao from public.configuracoes c
  where c.user_id = donos.user_id
  order by created_at limit 1
) cf on true
where not exists (
  select 1 from public.organizations o where o.owner_user_id = donos.user_id
);

-- Unidade principal por empresa
insert into public.stores (organization_id, nome)
select o.id, 'Unidade principal'
from public.organizations o
where not exists (select 1 from public.stores s where s.organization_id = o.id);

-- Membership "owner" do dono
insert into public.organization_members (organization_id, user_id, papel)
select o.id, o.owner_user_id, 'owner'
from public.organizations o
where not exists (
  select 1 from public.organization_members m
  where m.organization_id = o.id and m.user_id = o.owner_user_id
);

-- ── organization_id (default = empresa do usuário) em todas as operacionais ──
do $$
declare t text;
begin
  foreach t in array array[
    'clientes','produtos','vendas','venda_itens','condicionais',
    'condicional_itens','promissorias','despesas','estoque_movimentacoes',
    'eventos','notificacoes','configuracoes','tatuagem_atendimentos',
    'despesas_recorrentes'
  ] loop
    execute format(
      'alter table public.%I add column if not exists organization_id uuid references public.organizations(id)', t);
    execute format(
      'alter table public.%I alter column organization_id set default public.current_org_id()', t);
    execute format(
      'update public.%I x set organization_id = o.id from public.organizations o where o.owner_user_id = x.user_id and x.organization_id is null', t);
    execute format(
      'create index if not exists %I on public.%I (organization_id)', t || '_org_idx', t);
  end loop;
end $$;

-- ── RLS somente nas tabelas NOVAS (não toca nas existentes) ──────────────────
alter table public.organizations enable row level security;
alter table public.stores enable row level security;
alter table public.organization_members enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "org_select" on public.organizations;
create policy "org_select" on public.organizations for select to authenticated
  using (id in (select organization_id from public.organization_members where user_id = auth.uid()));
drop policy if exists "org_insert" on public.organizations;
create policy "org_insert" on public.organizations for insert to authenticated
  with check (owner_user_id = auth.uid());
drop policy if exists "org_update" on public.organizations;
create policy "org_update" on public.organizations for update to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

drop policy if exists "stores_all" on public.stores;
create policy "stores_all" on public.stores for all to authenticated
  using (organization_id in (select organization_id from public.organization_members where user_id = auth.uid()))
  with check (organization_id in (select organization_id from public.organization_members where user_id = auth.uid()));

drop policy if exists "members_select" on public.organization_members;
create policy "members_select" on public.organization_members for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "members_insert" on public.organization_members;
create policy "members_insert" on public.organization_members for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "audit_all" on public.audit_logs;
create policy "audit_all" on public.audit_logs for all to authenticated
  using (organization_id in (select organization_id from public.organization_members where user_id = auth.uid()))
  with check (organization_id in (select organization_id from public.organization_members where user_id = auth.uid()));
