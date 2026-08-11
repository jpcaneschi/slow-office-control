-- ─────────────────────────────────────────────────────────────────────────────
-- Fase (robustez) — Venda ATÔMICA + Auditoria
--
-- #1 criar_venda(): cria venda + itens + baixa de estoque + promissória numa
--    ÚNICA transação (tudo ou nada). É SECURITY INVOKER (respeita o RLS por
--    papel nos inserts diretos) e usa registrar_movimentacao (SECURITY DEFINER)
--    para o estoque — assim o caixa vende sem escrita direta em produtos.
--
-- #6 log_auditoria(): registra "quem fez o quê" em audit_logs. É SECURITY
--    DEFINER e define user_id = auth.uid() e organization_id = current_org_id()
--    por dentro — o autor NÃO pode ser forjado. audit_logs: só o dono lê;
--    ninguém escreve direto (só via esta função).
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── #6 Auditoria: função de log + RLS do audit_logs ──────────────────────────
create or replace function public.log_auditoria(
  p_acao text,
  p_entidade text default null,
  p_registro_id uuid default null,
  p_dados jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (organization_id, user_id, acao, entidade, registro_id, dados)
  values (public.current_org_id(), auth.uid(), p_acao, p_entidade, p_registro_id, p_dados);
end;
$$;

alter table public.audit_logs enable row level security;
-- Remove a política antiga aberta (qualquer membro lia/escrevia).
drop policy if exists "audit_all" on public.audit_logs;
drop policy if exists "audit_select_owner" on public.audit_logs;
-- Só o dono LÊ a auditoria da própria empresa.
create policy "audit_select_owner" on public.audit_logs for select to authenticated
  using (organization_id = public.current_org_id() and public.current_papel() = 'owner');
-- Sem policy de INSERT para authenticated: quem grava é log_auditoria (definer).

-- ── #1 Venda atômica ─────────────────────────────────────────────────────────
create or replace function public.criar_venda(
  p_cliente_id uuid,
  p_responsavel text,
  p_funcionario_id uuid,
  p_forma_pagamento text,
  p_desconto_pix numeric,
  p_parcelas int,
  p_taxa numeric,
  p_valor_liquido numeric,
  p_valor_recebido numeric,
  p_troco numeric,
  p_subtotal numeric,
  p_desconto numeric,
  p_total numeric,
  p_observacao text,
  p_itens jsonb,
  p_gera_promissoria boolean,
  p_promissoria_valor numeric,
  p_promissoria_parcelas int,
  p_promissoria_vencimento date,
  p_promissoria_obs text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_venda_id uuid;
  v_item jsonb;
  v_prod uuid;
  v_var uuid;
  v_qtd numeric;
begin
  -- Cria a venda (organization_id vem do default current_org_id()).
  insert into public.vendas (
    cliente_id, responsavel, funcionario_id, forma_pagamento, desconto_pix,
    parcelas, taxa, valor_liquido, valor_recebido, troco, subtotal, desconto,
    total, observacao, status
  ) values (
    p_cliente_id, p_responsavel, p_funcionario_id, p_forma_pagamento, p_desconto_pix,
    coalesce(p_parcelas, 1), coalesce(p_taxa, 0), p_valor_liquido, p_valor_recebido,
    p_troco, p_subtotal, coalesce(p_desconto, 0), p_total, p_observacao, 'concluida'
  ) returning id into v_venda_id;

  -- Itens + baixa de estoque (via registrar_movimentacao, que é atômico e valida empresa).
  for v_item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb))
  loop
    v_prod := (v_item->>'produto_id')::uuid;
    v_var := nullif(v_item->>'variacao_id', '')::uuid;
    v_qtd := (v_item->>'quantidade')::numeric;

    insert into public.venda_itens (
      venda_id, produto_id, variacao_id, quantidade, preco_unitario, total_item, custo_unitario
    ) values (
      v_venda_id, v_prod, v_var, v_qtd,
      (v_item->>'preco_unitario')::numeric,
      v_qtd * (v_item->>'preco_unitario')::numeric,
      coalesce((v_item->>'custo_unitario')::numeric, 0)
    );

    perform public.registrar_movimentacao(
      v_prod, 'venda', v_qtd, 'Venda', null, v_venda_id, v_var
    );
  end loop;

  -- Promissória (fiado / misto)
  if p_gera_promissoria then
    insert into public.promissorias (
      cliente_id, valor_total, parcelas, status, observacao, data_vencimento, venda_id
    ) values (
      p_cliente_id, p_promissoria_valor, coalesce(p_promissoria_parcelas, 1),
      'em_aberto', p_promissoria_obs, p_promissoria_vencimento, v_venda_id
    );
  end if;

  -- Auditoria
  perform public.log_auditoria(
    'venda_criada', 'vendas', v_venda_id,
    jsonb_build_object(
      'total', p_total,
      'forma_pagamento', p_forma_pagamento,
      'itens', jsonb_array_length(coalesce(p_itens, '[]'::jsonb))
    )
  );

  return v_venda_id;
end;
$$;
