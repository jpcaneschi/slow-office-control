-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 4 — Módulo Tatuagem
-- Registra atendimentos de tatuagem feitos no espaço da loja.
-- O tatuador repassa um percentual (padrão 10%) sobre o valor cobrado.
-- Cliente pode ser vinculado a um cliente da loja (cliente_id) OU ser
-- apenas de tatuagem (só o nome em cliente_nome).
-- Multi-tenant: user_id = auth.uid(), com RLS de isolamento por dono.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.tatuagem_atendimentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  cliente_id uuid references public.clientes (id) on delete set null,
  cliente_nome text not null,
  tatuador text,
  descricao text,
  data date not null default current_date,
  valor numeric(12, 2) not null default 0,
  percentual numeric(6, 2) not null default 10,
  observacao text,
  created_at timestamptz not null default now()
);

-- Índices úteis para listagem/filtro por dono e por data.
create index if not exists tatuagem_atendimentos_user_idx
  on public.tatuagem_atendimentos (user_id);
create index if not exists tatuagem_atendimentos_data_idx
  on public.tatuagem_atendimentos (data);

-- RLS: cada empresa só enxerga os próprios atendimentos.
alter table public.tatuagem_atendimentos enable row level security;

drop policy if exists "tenant_isolation" on public.tatuagem_atendimentos;
create policy "tenant_isolation"
  on public.tatuagem_atendimentos
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
