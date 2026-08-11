-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 3 P1 — #9 Condicional com variação + #10 Conversão parcial por quantidade
--
-- • condicional_itens ganha variacao_id (produto com grade sai/volta/vende na
--   variação certa).
-- • converter_condicional_venda passa a aceitar, POR ITEM, quantidade_vendida e
--   quantidade_devolvida (soma = quantidade enviada). Vende o que ficou (na
--   variação) e devolve o resto ao estoque (retorno_condicional). Atômico.
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.condicional_itens
  add column if not exists variacao_id uuid references public.produto_variacoes (id);

drop function if exists public.converter_condicional_venda(uuid, text, jsonb);

create or replace function public.converter_condicional_venda(
  p_condicional_id uuid,
  p_forma_pagamento text,
  p_itens jsonb  -- [{condicional_item_id, preco_unitario, custo_unitario, quantidade_vendida, quantidade_devolvida}]
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
  v_ci record;
  v_qv numeric;
  v_qd numeric;
begin
  select * into v_cond from public.condicionais where id = p_condicional_id;
  if v_cond is null then
    raise exception 'Condicional não encontrado';
  end if;
  if v_cond.status <> 'aberto' then
    raise exception 'Este condicional já foi finalizado';
  end if;

  select coalesce(
    sum((e->>'quantidade_vendida')::numeric * (e->>'preco_unitario')::numeric), 0
  )
  into v_total
  from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) e;

  if v_total <= 0 then
    raise exception 'Nada foi marcado como vendido. Use "Recolher tudo" se o cliente devolveu tudo.';
  end if;

  insert into public.vendas (
    cliente_id, responsavel, forma_pagamento, subtotal, desconto, total,
    valor_liquido, status, observacao
  ) values (
    v_cond.cliente_id, v_cond.responsavel, p_forma_pagamento, v_total, 0, v_total,
    v_total, 'concluida', 'Convertido de condicional'
  ) returning id into v_venda_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb))
  loop
    v_qv := coalesce((v_item->>'quantidade_vendida')::numeric, 0);
    v_qd := coalesce((v_item->>'quantidade_devolvida')::numeric, 0);

    select * into v_ci from public.condicional_itens
      where id = (v_item->>'condicional_item_id')::uuid
        and condicional_id = p_condicional_id;
    if not found then
      raise exception 'Item do condicional não encontrado';
    end if;
    if v_qv + v_qd <> v_ci.quantidade then
      raise exception 'Item %: vendido (%) + devolvido (%) deve somar a quantidade enviada (%)',
        v_ci.produto_id, v_qv, v_qd, v_ci.quantidade;
    end if;

    if v_qv > 0 then
      insert into public.venda_itens (
        venda_id, produto_id, variacao_id, quantidade, preco_unitario, total_item, custo_unitario
      ) values (
        v_venda_id, v_ci.produto_id, v_ci.variacao_id, v_qv,
        (v_item->>'preco_unitario')::numeric,
        v_qv * (v_item->>'preco_unitario')::numeric,
        coalesce((v_item->>'custo_unitario')::numeric, 0)
      );
    end if;

    if v_qd > 0 then
      perform public.registrar_movimentacao(
        v_ci.produto_id, 'retorno_condicional', v_qd, 'Retorno de condicional',
        null, p_condicional_id, v_ci.variacao_id
      );
    end if;

    update public.condicional_itens
      set status = case when v_qd = 0 then 'vendido'
                        when v_qv = 0 then 'devolvido'
                        else 'parcial' end
      where id = v_ci.id;
  end loop;

  update public.condicionais
    set status = 'finalizado',
        data_retorno = (now() at time zone 'America/Sao_Paulo')::date
    where id = p_condicional_id;

  perform public.log_auditoria(
    'condicional_convertido', 'condicionais', p_condicional_id,
    jsonb_build_object('venda_id', v_venda_id, 'total', v_total)
  );

  return v_venda_id;
end;
$$;
