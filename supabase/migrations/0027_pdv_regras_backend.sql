-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 2 P0 — #2 Regras do PDV validadas no BACKEND + snapshot + idempotência
--
-- criar_venda passa a:
--   • RECALCULAR subtotal, desconto Pix (da config) e total no servidor
--     (ignora o total enviado pelo cliente → não dá para burlar);
--   • REJEITAR: dinheiro com recebido < total; cartão com parcelas acima do
--     máximo da org ou taxa fora de 0–100; promissória/misto sem cliente,
--     abaixo da parcela mínima ou acima do prazo; misto cujo (entrada+fiado)
--     não fecha com o total;
--   • guardar SNAPSHOT (taxa, parcelas, valor líquido, % Pix aplicado, forma da
--     entrada no misto);
--   • ser IDEMPOTENTE por chave (mesma venda clicada 2× não duplica).
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.vendas
  add column if not exists idempotency_key text,
  add column if not exists entrada_forma text,
  add column if not exists pix_desconto_pct numeric(6, 2);

create unique index if not exists vendas_idem_uq
  on public.vendas (idempotency_key)
  where idempotency_key is not null;

drop function if exists public.criar_venda(uuid, text, uuid, text, numeric, int, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, jsonb, boolean, numeric, int, date, text);

create or replace function public.criar_venda(
  p_cliente_id uuid,
  p_responsavel text,
  p_funcionario_id uuid,
  p_forma_pagamento text,
  p_parcelas int,
  p_taxa numeric,
  p_valor_recebido numeric,
  p_desconto numeric,
  p_observacao text,
  p_itens jsonb,
  p_promissoria_parcelas int,
  p_promissoria_vencimento date,
  p_promissoria_obs text,
  p_entrada_forma text default null,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_existente uuid;
  v_pix_pct numeric;
  v_max_parc int;
  v_parc_min numeric;
  v_prom_max int;
  v_subtotal numeric;
  v_desc_manual numeric;
  v_desc_pix numeric;
  v_total numeric;
  v_troco numeric := null;
  v_liquido numeric;
  v_gera boolean := p_forma_pagamento in ('promissoria', 'misto');
  v_prom_valor numeric := 0;
  v_prom_parc int := greatest(1, coalesce(p_promissoria_parcelas, 1));
  v_entrada numeric := coalesce(p_valor_recebido, 0);
  v_venda_id uuid;
  v_item jsonb;
begin
  -- Idempotência: mesma chave → devolve a venda já criada (no-op).
  if p_idempotency_key is not null then
    select id into v_existente from public.vendas where idempotency_key = p_idempotency_key;
    if v_existente is not null then
      return v_existente;
    end if;
  end if;

  -- Config da empresa (fonte única de regras).
  select coalesce(pix_desconto, 5), coalesce(max_parcelas, 6),
         coalesce(parcela_minima, 0), coalesce(promissoria_prazo_meses, 4)
    into v_pix_pct, v_max_parc, v_parc_min, v_prom_max
    from public.configuracoes order by created_at limit 1;
  v_pix_pct := coalesce(v_pix_pct, 5);
  v_max_parc := coalesce(v_max_parc, 6);
  v_parc_min := coalesce(v_parc_min, 0);
  v_prom_max := coalesce(v_prom_max, 4);

  -- Recalcula subtotal/total no SERVIDOR (não confia no cliente).
  select coalesce(sum((e->>'quantidade')::numeric * (e->>'preco_unitario')::numeric), 0)
    into v_subtotal
    from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) e;

  if v_subtotal <= 0 then
    raise exception 'A venda precisa de ao menos um item com valor';
  end if;

  v_desc_manual := greatest(0, coalesce(p_desconto, 0));
  v_desc_pix := case when p_forma_pagamento = 'pix'
                     then round(v_subtotal * v_pix_pct / 100.0, 2) else 0 end;
  v_total := round(v_subtotal - v_desc_manual - v_desc_pix, 2);
  if v_total < 0 then v_total := 0; end if;

  -- ── Validações por forma de pagamento ──────────────────────────────────────
  if p_forma_pagamento = 'dinheiro' then
    if v_entrada < v_total then
      raise exception 'Valor recebido (R$ %) é menor que o total (R$ %)', v_entrada, v_total;
    end if;
    v_troco := round(v_entrada - v_total, 2);

  elsif p_forma_pagamento = 'cartao' then
    if coalesce(p_parcelas, 1) < 1 or coalesce(p_parcelas, 1) > v_max_parc then
      raise exception 'Parcelas do cartão fora do limite (máximo % configurado)', v_max_parc;
    end if;
    if coalesce(p_taxa, 0) < 0 or coalesce(p_taxa, 0) > 100 then
      raise exception 'Taxa do cartão inválida (0 a 100)';
    end if;

  elsif p_forma_pagamento = 'promissoria' then
    if p_cliente_id is null then
      raise exception 'Venda no fiado exige um cliente identificado';
    end if;
    if v_prom_parc > v_prom_max then
      raise exception 'Prazo da promissória acima do máximo (% meses)', v_prom_max;
    end if;
    if round(v_total / v_prom_parc, 2) < v_parc_min then
      raise exception 'Parcela (R$ %) abaixo da mínima (R$ %)', round(v_total / v_prom_parc, 2), v_parc_min;
    end if;
    v_prom_valor := v_total;

  elsif p_forma_pagamento = 'misto' then
    if p_cliente_id is null then
      raise exception 'Venda mista exige um cliente identificado';
    end if;
    if v_entrada <= 0 then
      raise exception 'Informe o valor da entrada (pago agora) no misto';
    end if;
    if v_entrada >= v_total then
      raise exception 'No misto a entrada deve ser menor que o total (senão é venda à vista)';
    end if;
    v_prom_valor := round(v_total - v_entrada, 2);
    if v_prom_parc > v_prom_max then
      raise exception 'Prazo do fiado acima do máximo (% meses)', v_prom_max;
    end if;
    if round(v_prom_valor / v_prom_parc, 2) < v_parc_min then
      raise exception 'Parcela do fiado (R$ %) abaixo da mínima (R$ %)', round(v_prom_valor / v_prom_parc, 2), v_parc_min;
    end if;
  end if;

  v_liquido := case when p_forma_pagamento = 'cartao'
                    then round(v_total * (1 - coalesce(p_taxa, 0) / 100.0), 2)
                    else v_total end;

  -- ── Cria a venda (valores do SERVIDOR) ─────────────────────────────────────
  insert into public.vendas (
    cliente_id, responsavel, funcionario_id, forma_pagamento, desconto_pix,
    pix_desconto_pct, parcelas, taxa, valor_liquido, valor_recebido, troco,
    entrada_forma, subtotal, desconto, total, observacao, status, idempotency_key
  ) values (
    p_cliente_id, p_responsavel, p_funcionario_id, p_forma_pagamento, v_desc_pix,
    case when p_forma_pagamento = 'pix' then v_pix_pct else 0 end,
    case when p_forma_pagamento = 'cartao' then coalesce(p_parcelas, 1) else 1 end,
    case when p_forma_pagamento = 'cartao' then coalesce(p_taxa, 0) else 0 end,
    v_liquido,
    case when p_forma_pagamento in ('dinheiro', 'misto') then v_entrada else null end,
    v_troco,
    case when p_forma_pagamento = 'misto' then p_entrada_forma else null end,
    v_subtotal, v_desc_manual, v_total, p_observacao, 'concluida', p_idempotency_key
  ) returning id into v_venda_id;

  -- Itens + baixa de estoque (idempotente por item).
  for v_item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb))
  loop
    insert into public.venda_itens (
      venda_id, produto_id, variacao_id, quantidade, preco_unitario, total_item, custo_unitario
    ) values (
      v_venda_id, (v_item->>'produto_id')::uuid, nullif(v_item->>'variacao_id', '')::uuid,
      (v_item->>'quantidade')::numeric, (v_item->>'preco_unitario')::numeric,
      (v_item->>'quantidade')::numeric * (v_item->>'preco_unitario')::numeric,
      coalesce((v_item->>'custo_unitario')::numeric, 0)
    );

    perform public.registrar_movimentacao(
      (v_item->>'produto_id')::uuid, 'venda', (v_item->>'quantidade')::numeric,
      'Venda', null, v_venda_id, nullif(v_item->>'variacao_id', '')::uuid,
      'venda-' || v_venda_id::text || '-' || coalesce(v_item->>'variacao_id', v_item->>'produto_id')
    );
  end loop;

  -- Promissória (fiado/misto) com o valor do SERVIDOR.
  if v_gera then
    insert into public.promissorias (
      cliente_id, valor_total, parcelas, status, observacao, data_vencimento, venda_id
    ) values (
      p_cliente_id, v_prom_valor, v_prom_parc, 'em_aberto', p_promissoria_obs,
      p_promissoria_vencimento, v_venda_id
    );
  end if;

  perform public.log_auditoria(
    'venda_criada', 'vendas', v_venda_id,
    jsonb_build_object('total', v_total, 'forma_pagamento', p_forma_pagamento,
                       'itens', jsonb_array_length(coalesce(p_itens, '[]'::jsonb)))
  );

  return v_venda_id;
end;
$$;
