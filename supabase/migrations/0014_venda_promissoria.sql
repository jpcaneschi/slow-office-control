-- ─────────────────────────────────────────────────────────────────────────────
-- Fase b.4.3 — Venda no fiado (promissória) e pagamento misto
-- Liga a promissória à venda que a originou. Quando a venda é "promissoria"
-- (tudo no fiado) ou "misto" (entrada + restante no fiado), a tela de Vendas
-- cria automaticamente uma linha em `promissorias` com venda_id preenchido.
-- A promissória continua sendo gerida (paga/atrasada) na tela de Promissórias.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.promissorias
  add column if not exists venda_id uuid references public.vendas(id) on delete set null;

create index if not exists idx_promissorias_venda_id
  on public.promissorias (venda_id);
