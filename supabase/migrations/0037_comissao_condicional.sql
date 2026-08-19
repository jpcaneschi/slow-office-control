-- ─────────────────────────────────────────────────────────────────────────────
-- Correção final P0 — #3 Comissão de vendas originadas do condicional
--
-- Bug: converter_condicional_venda criava a venda só com `responsavel` (texto) e
-- SEM `funcionario_id` → a venda convertida não entrava na comissão do vendedor.
--
-- Esta migration recria a função resolvendo o `funcionario_id` a partir do
-- responsável (casamento por nome com funcionarios ativos da mesma empresa — a
-- mesma ideia usada no PDV) e gravando-o na venda. Assim, TODA venda concluída
-- elegível paga comissão independentemente da origem (PDV ou condicional).
-- Também preenche o snapshot financeiro (#1): valor_bruto, custo_total, margem.
--
-- Preserva: bloqueio de módulo 'condicional' desligado (0034) e desconto Pix da
-- config (0031). SECURITY INVOKER, atômico. Idempotente/reversível.
--
-- Como reverter: restaurar a versão de 0034 (sem a resolução de funcionario_id).
-- ─────────────────────────────────────────────────────────────────────────────

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
  v_custo_total numeric := 0;
  v_funcionario_id uuid;
  v_item jsonb;
  v_ci record;
  v_qv numeric;
  v_qd numeric;
begin
  select * into v_cond from public.condicionais where id = p_condicional_id;
  if v_cond is null then
    raise exception 'Condicional não encontrado';
  end if;

  -- #4: módulo desligado → nada de converter (bloqueio no banco).
  if not public.fn_modulo_ativo(v_cond.organization_id, 'condicional') then
    raise exception 'O módulo "condicional" está desativado nas configurações da empresa'
      using errcode = 'check_violation';
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

  -- COGS da venda convertida (custo dos itens vendidos).
  select coalesce(
    sum(coalesce((e->>'custo_unitario')::numeric, 0) * (e->>'quantidade_vendida')::numeric),
    0
  )
  into v_custo_total
  from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) e;

  -- #3: resolve o funcionário pelo nome do responsável (ativo, mesma empresa).
  if coalesce(trim(v_cond.responsavel), '') <> '' then
    select id into v_funcionario_id
      from public.funcionarios
      where organization_id = v_cond.organization_id
        and ativo = true
        and lower(trim(nome)) = lower(trim(v_cond.responsavel))
      order by created_at
      limit 1;
  end if;

  insert into public.vendas (
    cliente_id, responsavel, funcionario_id, forma_pagamento, subtotal, desconto_pix,
    pix_desconto_pct, desconto, total, valor_liquido, status, observacao,
    valor_bruto, taxa_valor, custo_total, margem
  ) values (
    v_cond.cliente_id, v_cond.responsavel, v_funcionario_id, p_forma_pagamento, v_bruto, v_desc_pix,
    case when p_forma_pagamento = 'pix' then v_pix_pct else 0 end,
    0, v_total, v_total, 'concluida', 'Convertido de condicional',
    v_total, 0, v_custo_total, v_total - v_custo_total
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
    jsonb_build_object(
      'venda_id', v_venda_id, 'total', v_total, 'funcionario_id', v_funcionario_id
    )
  );

  return v_venda_id;
end;
$$;
