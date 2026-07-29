-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 3 — Tarefas & Calendário
-- Tabela de eventos/tarefas MANUAIS (compromissos, lembretes, agendamentos...).
-- Eventos automáticos (vencimentos, retornos de condicional, aniversários) são
-- calculados em tempo real a partir das tabelas existentes, não são copiados
-- para cá (evita duplicação).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.eventos (
  id           uuid primary key default gen_random_uuid(),
  titulo       text not null,
  descricao    text,
  tipo         text not null default 'tarefa',    -- tarefa | compromisso | lembrete | agendamento | anotacao | outro
  prioridade   text not null default 'media',     -- baixa | media | alta
  status       text not null default 'pendente',  -- pendente | concluida | cancelada
  data         date not null,                      -- dia do evento
  hora         time,                               -- horário (opcional)
  responsavel  text,
  cliente_id   uuid references public.clientes(id) on delete set null,
  observacoes  text,
  -- vínculo opcional com um registro de origem (uso futuro)
  origem_tipo  text,                               -- ex: 'condicional', 'promissoria'
  origem_id    uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Índice para as consultas do calendário (por dia).
create index if not exists eventos_data_idx on public.eventos (data);

-- Segurança: mesmo padrão aberto das tabelas atuais (sem login por enquanto).
-- Na Fase 2 (autenticação) trocamos por políticas baseadas no usuário.
alter table public.eventos enable row level security;

drop policy if exists "eventos_acesso_total" on public.eventos;
create policy "eventos_acesso_total"
  on public.eventos
  for all
  to anon, authenticated
  using (true)
  with check (true);
