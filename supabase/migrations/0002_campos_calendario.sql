-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 3.4 — Campos para eventos automáticos no calendário
--   • clientes.data_nascimento  → aniversários no calendário
--   • promissorias.data_vencimento → vencimento no calendário / alertas
-- Ambos opcionais (nullable). Registros antigos ficam sem valor até serem
-- preenchidos nas telas de Clientes e Promissórias.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.clientes
  add column if not exists data_nascimento date;

alter table public.promissorias
  add column if not exists data_vencimento date;
