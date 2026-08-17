-- ─────────────────────────────────────────────────────────────────────────────
-- PROVA: taxa de cartão lançada 1x como despesa e estornada no cancelamento.
-- Rode no SQL Editor do STAGING. Cobre a Área #1 (migration 0035).
--
-- Pré-requisito: uma conta dona (owner) com pelo menos 1 produto. Troque
-- COLE_O_UUID pelo user_id (select id, email from auth.users;) e COLE_O_PRODUTO
-- por um id de produto da mesma empresa (select id from produtos limit 1;).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── (1) Venda no cartão: snapshot + taxa lançada exatamente 1x ───────────────
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_O_UUID', 'role', 'authenticated')::text, true);

  -- Venda R$100, custo R$50, cartão 3x, taxa 10%.
  select public.criar_venda(
    null, 'Teste', null, 'cartao', 0,
    3, 10, null, null, null,
    100, 0, 100, 'teste taxa',
    jsonb_build_array(jsonb_build_object(
      'produto_id', 'COLE_O_PRODUTO', 'variacao_id', '',
      'quantidade', 1, 'preco_unitario', 100, 'custo_unitario', 50
    )),
    false, null, null, null, null
  ) as venda_id \gset

  -- Snapshot esperado: bruto 100, taxa_valor 10, valor_liquido 90, custo 50, margem 40.
  select valor_bruto, taxa, taxa_valor, valor_liquido, custo_total, margem
    from public.vendas where id = :'venda_id';

  -- Deve existir EXATAMENTE 1 despesa de taxa (R$10) para esta venda.
  select count(*) as qtd_taxa, coalesce(sum(valor),0) as total_taxa
    from public.despesas
    where venda_id = :'venda_id' and categoria = 'Taxa de cartão';
  -- Esperado: qtd_taxa = 1, total_taxa = 10.00

  -- Idempotência: relançar NÃO duplica.
  select public.registrar_taxa_venda(:'venda_id');
  select count(*) as qtd_taxa_apos_reexec
    from public.despesas
    where venda_id = :'venda_id' and categoria = 'Taxa de cartão';
  -- Esperado: 1 (não 2)

  -- ── (2) Cancelar estorna a taxa (sem duplicidade) ──────────────────────────
  select public.cancelar_venda(:'venda_id', 'teste de estorno');
  select count(*) as qtd_taxa_apos_cancel
    from public.despesas
    where venda_id = :'venda_id' and categoria = 'Taxa de cartão';
  -- Esperado: 0 (a despesa da taxa foi estornada)

  -- Cancelar de novo é no-op (idempotente) — não deve dar erro:
  select public.cancelar_venda(:'venda_id', 'teste de estorno');
rollback;  -- desfaz tudo (é só teste)

-- ── (3) Venda em dinheiro NÃO gera taxa ──────────────────────────────────────
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_O_UUID', 'role', 'authenticated')::text, true);

  select public.criar_venda(
    null, 'Teste', null, 'dinheiro', 0,
    1, 0, null, 100, 0,
    100, 0, 100, 'venda dinheiro',
    jsonb_build_array(jsonb_build_object(
      'produto_id', 'COLE_O_PRODUTO', 'variacao_id', '',
      'quantidade', 1, 'preco_unitario', 100, 'custo_unitario', 50
    )),
    false, null, null, null, null
  ) as venda_id \gset

  select taxa_valor, valor_liquido from public.vendas where id = :'venda_id';
  -- Esperado: taxa_valor = 0, valor_liquido = 100

  select count(*) as taxa_em_dinheiro
    from public.despesas
    where venda_id = :'venda_id' and categoria = 'Taxa de cartão';
  -- Esperado: 0
rollback;
