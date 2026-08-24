-- Teste automatizado para o SQL Editor do staging (sem comandos do psql).
begin;
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select user_id::text from public.organization_members where papel = 'owner' limit 1),
    'role', 'authenticated'
  )::text,
  true
);
set local role authenticated;

do $$
declare
  v_produto uuid;
  v_venda uuid;
  v_forma text;
  v_total numeric;
  v_estoque numeric;
  v_taxa numeric;
  v_despesas int;
begin
  insert into public.produtos (nome, preco, custo, estoque, status, tem_variacoes)
  values ('QA Pagamento Dividido', 100, 40, 5, 'ativo', false)
  returning id into v_produto;

  select public.criar_venda_multiforma(
    null, 'QA', null, 10, 'teste multiforma',
    jsonb_build_array(jsonb_build_object(
      'produto_id', v_produto, 'variacao_id', null,
      'quantidade', 1, 'preco_unitario', 100, 'custo_unitario', 40
    )),
    jsonb_build_array(
      jsonb_build_object('forma','dinheiro','valor',30,'parcelas',1,'taxa_percentual',0),
      jsonb_build_object('forma','pix','valor',60,'parcelas',1,'taxa_percentual',0)
    ), 'qa-' || gen_random_uuid()::text
  ) into v_venda;

  select forma_pagamento, total into v_forma, v_total
  from public.vendas where id = v_venda;
  select estoque into v_estoque from public.produtos where id = v_produto;
  if v_forma <> 'multiplo' or v_total <> 90 or v_estoque <> 4 then
    raise exception 'Falha dinheiro+Pix: forma %, total %, estoque %', v_forma, v_total, v_estoque;
  end if;
  if (select count(*) from public.venda_pagamentos where venda_id = v_venda) <> 2 then
    raise exception 'Ledger não registrou as duas formas';
  end if;

  insert into public.produtos (nome, preco, custo, estoque, status, tem_variacoes)
  values ('QA Taxa Dividida', 100, 40, 5, 'ativo', false)
  returning id into v_produto;

  select public.criar_venda_multiforma(
    null, 'QA', null, 0, null,
    jsonb_build_array(jsonb_build_object(
      'produto_id', v_produto, 'variacao_id', null,
      'quantidade', 1, 'preco_unitario', 100, 'custo_unitario', 40
    )),
    jsonb_build_array(
      jsonb_build_object('forma','cartao','valor',50,'parcelas',2,'taxa_percentual',10),
      jsonb_build_object('forma','pix','valor',50,'parcelas',1,'taxa_percentual',0)
    ), 'qa-' || gen_random_uuid()::text
  ) into v_venda;

  select taxa_valor into v_taxa from public.vendas where id = v_venda;
  select count(*) into v_despesas from public.despesas
  where venda_id = v_venda and categoria = 'Taxa de cartão';
  if v_taxa <> 5 or v_despesas <> 1 then
    raise exception 'Falha cartão+Pix: taxa %, despesas %', v_taxa, v_despesas;
  end if;

  begin
    perform public.criar_venda_multiforma(
      null, 'QA', null, 0, null, '[]'::jsonb,
      '[{"forma":"pix","valor":50},{"forma":"pix","valor":50}]'::jsonb,
      'qa-' || gen_random_uuid()::text
    );
    raise exception 'Pagamento repetido não foi bloqueado';
  exception
    when others then
      if sqlerrm = 'Pagamento repetido não foi bloqueado' then raise; end if;
  end;
end;
$$;

rollback;
select 'TESTE_MULTIFORMA_OK' as status;
