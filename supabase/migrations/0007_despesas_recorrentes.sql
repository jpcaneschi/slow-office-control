-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 4.1 — Contas recorrentes (despesas fixas mensais)
-- Modelos de despesa que se repetem todo mês (aluguel, internet, etc.).
-- A partir de cada modelo, o usuário "lança" a despesa real do mês na
-- tabela public.despesas.
-- Multi-tenant: user_id = auth.uid(), com RLS de isolamento por dono.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.despesas_recorrentes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  descricao text not null,
  categoria text not null default 'Outros',
  valor numeric(12, 2) not null default 0,
  dia_vencimento int not null default 5,
  ativo boolean not null default true,
  observacao text,
  created_at timestamptz not null default now()
);

create index if not exists despesas_recorrentes_user_idx
  on public.despesas_recorrentes (user_id);

alter table public.despesas_recorrentes enable row level security;

drop policy if exists "tenant_isolation" on public.despesas_recorrentes;
create policy "tenant_isolation"
  on public.despesas_recorrentes
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
