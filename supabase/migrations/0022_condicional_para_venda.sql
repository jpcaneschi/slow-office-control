-- ─────────────────────────────────────────────────────────────────────────────
-- Fase (condicional→venda) — Converter condicional em venda (atômico)
--
-- O cliente levou peças em condicional (o estoque já SAIU na criação). Ao
-- converter: os itens VENDIDOS viram uma venda (sem baixar estoque de novo,
-- pois já saiu) e os itens NÃO vendidos VOLTAM ao estoque (retorno_condicional).
-- O condicional é finalizado. Tudo numa transação (tudo ou nada).
--
-- SECURITY INVOKER (respeita RLS por papel); usa registrar_movimentacao (definer)
-- para devolver estoque e log_auditoria para registrar. Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.converter_condicional_venda(
  p_condicional_id uuid,
  p_forma_pagamento text,
  p_itens_vendidos jsonb   -- [{condicional_item_id, produto_id, quantidade, preco_unitario, custo_unitario}]
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cond record;
  v_venda_id uuid;
  v_total numeric := 0;
  v_item jsonb;
  v_vendidos uuid[] := '{}';
  v_ci record;
begin
  select * into v_cond from public.condicionais where id = p_condicional_id;
  if v_cond is null then
    raise exception 'Condicional não encontrado';
  end if;
  if v_cond.status <> 'aberto' then
    raise exception 'Este condicional já foi finalizado';
  end if;

  -- Total dos itens vendidos.
  select coalesce(
    sum((e->>'quantidade')::numeric * (e->>'preco_unitario')::numeric), 0
  )
  into v_total
  from jsonb_array_elements(coalesce(p_itens_vendidos, '[]'::jsonb)) e;

  -- Cria a venda (estoque já saiu no condicional → NÃO baixa de novo).
  insert into public.vendas (
    cliente_id, responsavel, forma_pagamento, subtotal, desconto, total,
    valor_liquido, status, observacao
  ) values (
    v_cond.cliente_id, v_cond.responsavel, p_forma_pagamento, v_total, 0, v_total,
    v_total, 'concluida', 'Convertido de condicional'
  ) returning id into v_venda_id;

  -- Itens vendidos → venda_itens + marca o item do condicional como vendido.
  for v_item in select * from jsonb_array_elements(coalesce(p_itens_vendidos, '[]'::jsonb))
  loop
    insert into public.venda_itens (
      venda_id, produto_id, quantidade, preco_unitario, total_item, custo_unitario
    ) values (
      v_venda_id,
      (v_item->>'produto_id')::uuid,
      (v_item->>'quantidade')::numeric,
      (v_item->>'preco_unitario')::numeric,
      (v_item->>'quantidade')::numeric * (v_item->>'preco_unitario')::numeric,
      coalesce((v_item->>'custo_unitario')::numeric, 0)
    );

    update public.condicional_itens
      set status = 'vendido'
      where id = (v_item->>'condicional_item_id')::uuid;

    v_vendidos := array_append(v_vendidos, (v_item->>'condicional_item_id')::uuid);
  end loop;

  -- Itens NÃO vendidos → devolve ao estoque e marca como devolvido.
  for v_ci in
    select * from public.condicional_itens
    where condicional_id = p_condicional_id
      and not (id = any(v_vendidos))
      and coalesce(status, '') <> 'devolvido'
  loop
    perform public.registrar_movimentacao(
      v_ci.produto_id, 'retorno_condicional', v_ci.quantidade,
      'Retorno de condicional', null, p_condicional_id, null
    );
    update public.condicional_itens set status = 'devolvido' where id = v_ci.id;
  end loop;

  -- Finaliza o condicional.
  update public.condicionais
    set status = 'finalizado', data_retorno = now()::date
    where id = p_condicional_id;

  perform public.log_auditoria(
    'condicional_convertido', 'condicionais', p_condicional_id,
    jsonb_build_object('venda_id', v_venda_id, 'total', v_total)
  );

  return v_venda_id;
end;
$$;
