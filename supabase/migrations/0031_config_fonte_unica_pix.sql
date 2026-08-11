-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 3 P1 — #12 Config como fonte única + #11 Pix consistente
--
-- #12: preenche valores explícitos onde estava NULL e define DEFAULTs nas
--      colunas → o que a tela mostra é exatamente o que o sistema usa.
-- #11: converter_condicional_venda passa a aplicar o desconto Pix da config
--      (mesmo motor do PDV) quando a conversão for em Pix, e guarda o snapshot.
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── #12: DEFAULTs + backfill de nulos ────────────────────────────────────────
alter table public.configuracoes
  alter column pix_desconto set default 5,
  alter column tatuagem_percentual set default 10,
  alter column max_parcelas set default 6,
  alter column condicional_prazo_dias set default 2,
  alter column parcela_minima set default 0,
  alter column promissoria_prazo_meses set default 4;

update public.configuracoes set
  pix_desconto            = coalesce(pix_desconto, 5),
  tatuagem_percentual     = coalesce(tatuagem_percentual, 10),
  max_parcelas            = coalesce(max_parcelas, 6),
  condicional_prazo_dias  = coalesce(condicional_prazo_dias, 2),
  parcela_minima          = coalesce(parcela_minima, 0),
  promissoria_prazo_meses = coalesce(promissoria_prazo_meses, 4);

-- ── #11: Pix no motor da conversão de condicional ────────────────────────────
drop function if exists public.converter_condicional_venda(uuid, text, jsonb);

create or replace function public.converter_condicional_venda(
  p_condicional_id uuid,
  p_forma_pagamento text,
  p_itens jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cond record;
  v_venda_id uuid;
  v_bruto numeric := 0;
  v_pix_pct numeric;
  v_desc_pix numeric;
  v_total numeric;
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
  into v_bruto
  from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) e;

  if v_bruto <= 0 then
    raise exception 'Nada foi marcado como vendido. Use "Recolher tudo" se o cliente devolveu tudo.';
  end if;

  -- Mesmo motor de precificação do PDV: desconto Pix vem da config.
  select coalesce(pix_desconto, 5) into v_pix_pct
    from public.configuracoes order by created_at limit 1;
  v_pix_pct := coalesce(v_pix_pct, 5);
  v_desc_pix := case when p_forma_pagamento = 'pix'
                     then round(v_bruto * v_pix_pct / 100.0, 2) else 0 end;
  v_total := v_bruto - v_desc_pix;

  insert into public.vendas (
    cliente_id, responsavel, forma_pagamento, subtotal, desconto_pix,
    pix_desconto_pct, desconto, total, valor_liquido, status, observacao
  ) values (
    v_cond.cliente_id, v_cond.responsavel, p_forma_pagamento, v_bruto, v_desc_pix,
    case when p_forma_pagamento = 'pix' then v_pix_pct else 0 end,
    0, v_total, v_total, 'concluida', 'Convertido de condicional'
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
