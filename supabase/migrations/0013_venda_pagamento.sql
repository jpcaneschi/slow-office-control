-- ─────────────────────────────────────────────────────────────────────────────
-- Fase b.4.2 — Detalhes de pagamento na venda
-- Guarda os dados reais da forma de pagamento (single-form por enquanto;
-- misto/promissória com parcelas vêm no b.4.3):
--   parcelas       : nº de parcelas no cartão
--   taxa           : taxa (%) da maquininha
--   valor_liquido  : quanto a loja recebe após a taxa
--   valor_recebido : valor entregue em dinheiro
--   troco          : troco devolvido
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.vendas
  add column if not exists parcelas int not null default 1,
  add column if not exists taxa numeric(6, 2) not null default 0,
  add column if not exists valor_liquido numeric(12, 2),
  add column if not exists valor_recebido numeric(12, 2),
  add column if not exists troco numeric(12, 2);
