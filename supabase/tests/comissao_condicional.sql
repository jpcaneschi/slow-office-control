-- ─────────────────────────────────────────────────────────────────────────────
-- PROVA: venda convertida de condicional recebe funcionario_id → gera comissão.
-- Rode no STAGING. Cobre a Área #3 (migration 0037).
--
-- Pré-requisito: conta owner; módulo 'condicional' LIGADO; um FUNCIONÁRIO ativo
-- e um CONDICIONAL aberto cujo responsável seja EXATAMENTE o nome do funcionário.
-- Troque COLE_O_UUID, COLE_O_COND_ID e COLE_O_COND_ITEM_ID + o produto.
-- ─────────────────────────────────────────────────────────────────────────────

begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_O_UUID', 'role', 'authenticated')::text, true);

  -- Confirme que o responsável do condicional casa com um funcionário ativo:
  select c.responsavel,
         (select id from public.funcionarios f
            where f.organization_id = c.organization_id
              and f.ativo = true
              and lower(trim(f.nome)) = lower(trim(c.responsavel))
            limit 1) as funcionario_casado
    from public.condicionais c where c.id = 'COLE_O_COND_ID';

  -- Converte (1 item vendido). Ajuste quantidade/preço/custo conforme o item.
  select public.converter_condicional_venda(
    'COLE_O_COND_ID', 'dinheiro',
    jsonb_build_array(jsonb_build_object(
      'condicional_item_id', 'COLE_O_COND_ITEM_ID',
      'quantidade_vendida', 1, 'quantidade_devolvida', 0,
      'quantidade', 1, 'preco_unitario', 100, 'custo_unitario', 50
    ))
  ) as venda_id \gset

  -- A venda gerada DEVE ter funcionario_id preenchido (antes vinha NULL):
  select id, responsavel, funcionario_id, total, custo_total, margem
    from public.vendas where id = :'venda_id';
  -- Esperado: funcionario_id = o funcionário casado; margem = total - custo.
rollback;  -- é só teste
