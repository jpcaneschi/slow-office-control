-- ─────────────────────────────────────────────────────────────────────────────
-- Fase b.1 — Custo histórico do item na venda (COGS)
-- Cada item de venda passa a guardar o custo unitário do produto NO MOMENTO
-- da venda, para o lucro de vendas antigas não mudar se o custo do produto
-- for alterado depois.
-- Backfill: preenche os itens já existentes com o custo ATUAL do produto
-- (aproximação, já que o histórico real não existia).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.venda_itens
  add column if not exists custo_unitario numeric(12, 2) not null default 0;

update public.venda_itens vi
set custo_unitario = coalesce(p.custo, 0)
from public.produtos p
where p.id = vi.produto_id
  and vi.custo_unitario = 0;
