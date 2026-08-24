-- PROVA: venda com pagamento dividido (migration 0056).
-- Troque COLE_O_UUID pelo user_id de um owner do staging e rode via psql.

-- (1) Dinheiro + Pix fecham a venda e ficam registrados sem resíduos.
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_O_UUID', 'role', 'authenticated')::text, true);

  insert into public.produtos (nome, preco, custo, estoque, status, tem_variacoes)
    values ('QA Pagamento Dividido', 100, 40, 5, 'ativo', false)
    returning id as produto_id \gset

  select public.criar_venda_multiforma(
    null, 'QA', null, 10, 'teste multiforma',
    jsonb_build_array(jsonb_build_object(
      'produto_id', :'produto_id', 'variacao_id', null,
      'quantidade', 1, 'preco_unitario', 100, 'custo_unitario', 40
    )),
    jsonb_build_array(
      jsonb_build_object('forma','dinheiro','valor',30,'parcelas',1,'taxa_percentual',0),
      jsonb_build_object('forma','pix','valor',60,'parcelas',1,'taxa_percentual',0)
    ),
    'qa-multiforma-001'
  ) as venda_id \gset

  select forma_pagamento, subtotal, desconto, total, valor_recebido
    from public.vendas where id = :'venda_id';
  -- Esperado: multiplo | 100 | 10 | 90 | 90

  select forma, valor from public.venda_pagamentos
    where venda_id = :'venda_id' order by forma;
  -- Esperado: dinheiro=30 e pix=60

  select estoque from public.produtos where id = :'produto_id';
  -- Esperado: 4
rollback;

-- (2) Cartão em uma das partes consolida taxa e lança uma única despesa.
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_O_UUID', 'role', 'authenticated')::text, true);
  insert into public.produtos (nome, preco, custo, estoque, status, tem_variacoes)
    values ('QA Taxa Dividida', 100, 40, 5, 'ativo', false)
    returning id as produto_id \gset

  select public.criar_venda_multiforma(
    null, 'QA', null, 0, null,
    jsonb_build_array(jsonb_build_object(
      'produto_id', :'produto_id', 'variacao_id', null,
      'quantidade', 1, 'preco_unitario', 100, 'custo_unitario', 40
    )),
    jsonb_build_array(
      jsonb_build_object('forma','cartao','valor',50,'parcelas',2,'taxa_percentual',10),
      jsonb_build_object('forma','pix','valor',50,'parcelas',1,'taxa_percentual',0)
    ), 'qa-multiforma-002'
  ) as venda_id \gset

  select taxa_valor, valor_liquido, margem from public.vendas where id = :'venda_id';
  -- Esperado: taxa_valor=5, valor_liquido=95, margem=55
  select count(*) as despesas_taxa, sum(valor) as total_taxa
    from public.despesas where venda_id = :'venda_id' and categoria = 'Taxa de cartão';
  -- Esperado: 1 | 5
rollback;

-- (3) Repetir a mesma forma é bloqueado (este erro é o sucesso do bloco).
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_O_UUID', 'role', 'authenticated')::text, true);
  select public.criar_venda_multiforma(
    null, 'QA', null, 0, null, '[]'::jsonb,
    '[{"forma":"pix","valor":50},{"forma":"pix","valor":50}]'::jsonb,
    'qa-multiforma-003'
  );
  -- Esperado: erro "Não repita a mesma forma de pagamento".
rollback;
