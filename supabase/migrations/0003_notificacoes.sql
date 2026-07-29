-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 3.5 — Notificações (sino do cabeçalho)
-- As notificações são geradas automaticamente pelo app a partir das tabelas
-- existentes (estoque, promissórias, condicionais, tarefas, aniversários).
-- A coluna `chave` é única e evita duplicar a mesma notificação para o mesmo
-- registro/evento.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.notificacoes (
  id          uuid primary key default gen_random_uuid(),
  chave       text not null unique,   -- dedupe: ex 'estoque_baixo:<produto_id>'
  tipo        text not null,          -- estoque | promissoria | condicional | tarefa | aniversario
  titulo      text not null,
  descricao   text,
  href        text,                   -- link para o registro de origem
  lida        boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists notificacoes_lida_idx on public.notificacoes (lida);

alter table public.notificacoes enable row level security;

drop policy if exists "notificacoes_acesso_total" on public.notificacoes;
create policy "notificacoes_acesso_total"
  on public.notificacoes
  for all
  to anon, authenticated
  using (true)
  with check (true);
