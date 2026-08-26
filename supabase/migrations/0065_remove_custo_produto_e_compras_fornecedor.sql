-- 0065 — Mercadoria passa a ser reconhecida somente por compras/boletos de fornecedor.
-- Não remove colunas legadas de custo: preserva histórico e compatibilidade.
-- Novas operações deixam de alimentar custo/margem por item.

alter table public.despesas
  add column if not exists fornecedor text,
  add column if not exists compra_grupo_id uuid,
  add column if not exists parcela_numero integer,
  add column if not exists total_parcelas integer;

create index if not exists despesas_org_compra_grupo_idx
  on public.despesas (organization_id, compra_grupo_id)
  where compra_grupo_id is not null;

alter table public.despesas drop constraint if exists despesas_parcela_compra_ck;
alter table public.despesas
  add constraint despesas_parcela_compra_ck check (
    (compra_grupo_id is null and parcela_numero is null and total_parcelas is null)
    or
    (compra_grupo_id is not null and parcela_numero between 1 and total_parcelas and total_parcelas >= 1)
  );

create or replace function public.registrar_compra_fornecedor(
  p_fornecedor text,
  p_descricao text,
  p_valor_total numeric,
  p_parcelas integer default 1,
  p_primeiro_vencimento date default current_date,
  p_observacao text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid := public.current_org_id();
  v_grupo uuid := gen_random_uuid();
  v_qtd integer := greatest(1, coalesce(p_parcelas, 1));
  v_centavos bigint;
  v_base bigint;
  v_resto bigint;
  v_i integer;
  v_valor numeric;
  v_venc date;
  v_dia integer := extract(day from coalesce(p_primeiro_vencimento, current_date))::integer;
begin
  if public.current_papel() not in ('owner','gerente','financeiro') then
    raise exception 'Sem permissão para cadastrar compra de fornecedor';
  end if;
  if v_org is null then raise exception 'Empresa não identificada'; end if;
  if coalesce(trim(p_fornecedor), '') = '' then raise exception 'Informe o fornecedor'; end if;
  if coalesce(p_valor_total, 0) <= 0 then raise exception 'Informe um valor total válido'; end if;
  if v_qtd > 60 then raise exception 'O parcelamento não pode exceder 60 parcelas'; end if;

  v_centavos := round(p_valor_total * 100)::bigint;
  v_base := v_centavos / v_qtd;
  v_resto := mod(v_centavos, v_qtd);

  for v_i in 1..v_qtd loop
    v_venc := (
      date_trunc('month', coalesce(p_primeiro_vencimento, current_date)::timestamp + (v_i - 1) * interval '1 month')
      + (least(
          v_dia,
          extract(day from (date_trunc('month', coalesce(p_primeiro_vencimento, current_date)::timestamp + (v_i - 1) * interval '1 month') + interval '1 month - 1 day'))::integer
        ) - 1) * interval '1 day'
    )::date;
    v_valor := (v_base + case when v_i <= v_resto then 1 else 0 end)::numeric / 100.0;

    insert into public.despesas (
      organization_id, descricao, categoria, valor, data, status,
      data_vencimento, data_pagamento, competencia, observacao,
      fornecedor, compra_grupo_id, parcela_numero, total_parcelas
    ) values (
      v_org,
      coalesce(nullif(trim(p_descricao), ''), 'Compra de mercadoria') ||
        case when v_qtd > 1 then ' • ' || v_i || '/' || v_qtd else '' end,
      'Compra de mercadoria', v_valor, v_venc, 'pendente',
      v_venc, null, date_trunc('month', v_venc)::date, nullif(trim(p_observacao), ''),
      trim(p_fornecedor), v_grupo, v_i, v_qtd
    );
  end loop;

  perform public.log_auditoria(
    'compra_fornecedor_criada', 'despesas', v_grupo,
    jsonb_build_object('fornecedor', trim(p_fornecedor), 'valor_total', p_valor_total, 'parcelas', v_qtd)
  );
  return v_grupo;
end;
$$;

revoke all on function public.registrar_compra_fornecedor(text,text,numeric,integer,date,text) from public;
grant execute on function public.registrar_compra_fornecedor(text,text,numeric,integer,date,text) to authenticated;

-- PDV atual: usa somente preço do produto para a venda. Compra/fornecedor não é
-- inferida a partir do item vendido e entra apenas pelo Financeiro.
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
  if p_idempotency_key is not null then
    select id into v_existente from public.vendas where idempotency_key = p_idempotency_key;
    if v_existente is not null then return v_existente; end if;
  end if;

  select coalesce(pix_desconto, 5), coalesce(max_parcelas, 6),
         coalesce(parcela_minima, 0), coalesce(promissoria_prazo_meses, 4)
    into v_pix_pct, v_max_parc, v_parc_min, v_prom_max
    from public.configuracoes order by created_at limit 1;
  v_pix_pct := coalesce(v_pix_pct, 5);
  v_max_parc := coalesce(v_max_parc, 6);
  v_parc_min := coalesce(v_parc_min, 0);
  v_prom_max := coalesce(v_prom_max, 4);

  select coalesce(sum((e->>'quantidade')::numeric * (e->>'preco_unitario')::numeric), 0)
    into v_subtotal from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) e;
  if v_subtotal <= 0 then raise exception 'A venda precisa de ao menos um item com valor'; end if;

  v_desc_manual := greatest(0, coalesce(p_desconto, 0));
  v_desc_pix := case when p_forma_pagamento = 'pix' then round(v_subtotal * v_pix_pct / 100.0, 2) else 0 end;
  v_total := greatest(0, round(v_subtotal - v_desc_manual - v_desc_pix, 2));

  if p_forma_pagamento = 'dinheiro' then
    if v_entrada < v_total then raise exception 'Valor recebido é menor que o total'; end if;
    v_troco := round(v_entrada - v_total, 2);
  elsif p_forma_pagamento = 'cartao' then
    if coalesce(p_parcelas, 1) < 1 or coalesce(p_parcelas, 1) > v_max_parc then raise exception 'Parcelas do cartão fora do limite'; end if;
    if coalesce(p_taxa, 0) < 0 or coalesce(p_taxa, 0) > 100 then raise exception 'Taxa do cartão inválida'; end if;
  elsif p_forma_pagamento = 'promissoria' then
    if p_cliente_id is null then raise exception 'Venda no fiado exige um cliente identificado'; end if;
    if v_prom_parc > v_prom_max then raise exception 'Prazo da promissória acima do máximo'; end if;
    if round(v_total / v_prom_parc, 2) < v_parc_min then raise exception 'Parcela abaixo da mínima configurada'; end if;
    v_prom_valor := v_total;
  elsif p_forma_pagamento = 'misto' then
    if p_cliente_id is null then raise exception 'Venda mista exige um cliente identificado'; end if;
    if v_entrada <= 0 or v_entrada >= v_total then raise exception 'Informe uma entrada válida para a venda mista'; end if;
    v_prom_valor := round(v_total - v_entrada, 2);
    if v_prom_parc > v_prom_max then raise exception 'Prazo do fiado acima do máximo'; end if;
    if round(v_prom_valor / v_prom_parc, 2) < v_parc_min then raise exception 'Parcela do fiado abaixo da mínima configurada'; end if;
  end if;

  v_liquido := case when p_forma_pagamento = 'cartao'
    then round(v_total * (1 - coalesce(p_taxa, 0) / 100.0), 2) else v_total end;

  insert into public.vendas (
    cliente_id, responsavel, funcionario_id, forma_pagamento, desconto_pix,
    pix_desconto_pct, parcelas, taxa, valor_liquido, valor_recebido, troco,
    entrada_forma, subtotal, desconto, total, observacao, status, idempotency_key,
    custo_total, margem
  ) values (
    p_cliente_id, p_responsavel, p_funcionario_id, p_forma_pagamento, v_desc_pix,
    case when p_forma_pagamento = 'pix' then v_pix_pct else 0 end,
    case when p_forma_pagamento = 'cartao' then coalesce(p_parcelas, 1) else 1 end,
    case when p_forma_pagamento = 'cartao' then coalesce(p_taxa, 0) else 0 end,
    v_liquido,
    case when p_forma_pagamento in ('dinheiro','misto') then v_entrada else null end,
    v_troco, case when p_forma_pagamento = 'misto' then p_entrada_forma else null end,
    v_subtotal, v_desc_manual, v_total, p_observacao, 'concluida', p_idempotency_key,
    0, null
  ) returning id into v_venda_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    insert into public.venda_itens (
      venda_id, produto_id, variacao_id, quantidade, preco_unitario, total_item
    ) values (
      v_venda_id, (v_item->>'produto_id')::uuid, nullif(v_item->>'variacao_id','')::uuid,
      (v_item->>'quantidade')::numeric, (v_item->>'preco_unitario')::numeric,
      (v_item->>'quantidade')::numeric * (v_item->>'preco_unitario')::numeric
    );
    perform public.registrar_movimentacao(
      (v_item->>'produto_id')::uuid, 'venda', (v_item->>'quantidade')::numeric,
      'Venda', null, v_venda_id, nullif(v_item->>'variacao_id','')::uuid,
      'venda-' || v_venda_id::text || '-' || coalesce(v_item->>'variacao_id', v_item->>'produto_id')
    );
  end loop;

  if v_gera then
    insert into public.promissorias (cliente_id, valor_total, parcelas, status, observacao, data_vencimento, venda_id)
    values (p_cliente_id, v_prom_valor, v_prom_parc, 'em_aberto', p_promissoria_obs, p_promissoria_vencimento, v_venda_id);
  end if;

  perform public.log_auditoria('venda_criada','vendas',v_venda_id,
    jsonb_build_object('total',v_total,'forma_pagamento',p_forma_pagamento,'itens',jsonb_array_length(coalesce(p_itens,'[]'::jsonb))));
  return v_venda_id;
end;
$$;

-- Compatibilidade com a assinatura antiga: delega para o motor atual e ignora
-- snapshots antigos enviados pelo cliente.
create or replace function public.criar_venda(
  p_cliente_id uuid, p_responsavel text, p_funcionario_id uuid, p_forma_pagamento text,
  p_desconto_pix numeric, p_parcelas integer, p_taxa numeric, p_valor_liquido numeric,
  p_valor_recebido numeric, p_troco numeric, p_subtotal numeric, p_desconto numeric,
  p_total numeric, p_observacao text, p_itens jsonb, p_gera_promissoria boolean,
  p_promissoria_valor numeric, p_promissoria_parcelas integer,
  p_promissoria_vencimento date, p_promissoria_obs text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
begin
  return public.criar_venda(
    p_cliente_id, p_responsavel, p_funcionario_id, p_forma_pagamento,
    coalesce(p_parcelas,1), coalesce(p_taxa,0), p_valor_recebido,
    coalesce(p_desconto,0), p_observacao, p_itens,
    coalesce(p_promissoria_parcelas,1), p_promissoria_vencimento,
    p_promissoria_obs, null, null
  );
end;
$$;

create or replace function public.criar_venda_multiforma(
  p_cliente_id uuid,
  p_responsavel text,
  p_funcionario_id uuid,
  p_desconto numeric,
  p_observacao text,
  p_itens jsonb,
  p_pagamentos jsonb,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_venda_id uuid;
  v_pagamento jsonb;
  v_total_pagamentos numeric;
  v_total_venda numeric;
  v_taxa_total numeric := 0;
  v_max_parcelas int := 1;
begin
  if jsonb_typeof(coalesce(p_pagamentos,'[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_pagamentos,'[]'::jsonb)) < 2 then
    raise exception 'Informe pelo menos duas formas de pagamento';
  end if;
  select coalesce(sum((p->>'valor')::numeric),0) into v_total_pagamentos from jsonb_array_elements(p_pagamentos) p;
  if exists (
    select 1 from jsonb_array_elements(p_pagamentos) p
    where coalesce(p->>'forma','') not in ('pix','dinheiro','cartao')
       or coalesce((p->>'valor')::numeric,0) <= 0
       or coalesce((p->>'taxa_percentual')::numeric,0) < 0
       or coalesce((p->>'taxa_percentual')::numeric,0) > 100
       or coalesce((p->>'parcelas')::int,1) < 1
  ) then raise exception 'Uma das formas de pagamento é inválida'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_pagamentos) p group by p->>'forma' having count(*) > 1
  ) then raise exception 'Não repita a mesma forma de pagamento'; end if;

  v_venda_id := public.criar_venda(
    p_cliente_id, p_responsavel, p_funcionario_id, 'dinheiro', 1, 0,
    v_total_pagamentos, p_desconto, p_observacao, p_itens,
    null, null, null, null, p_idempotency_key
  );
  select total into v_total_venda from public.vendas where id=v_venda_id and organization_id=public.current_org_id();
  if abs(coalesce(v_total_pagamentos,0)-coalesce(v_total_venda,0)) > 0.009 then
    raise exception 'A soma dos pagamentos deve ser igual ao total da venda';
  end if;

  if not exists (select 1 from public.venda_pagamentos where venda_id=v_venda_id) then
    for v_pagamento in select * from jsonb_array_elements(p_pagamentos) loop
      insert into public.venda_pagamentos(venda_id,forma,valor,parcelas,taxa_percentual,taxa_valor)
      values (
        v_venda_id, v_pagamento->>'forma', (v_pagamento->>'valor')::numeric,
        coalesce((v_pagamento->>'parcelas')::int,1),
        case when v_pagamento->>'forma'='cartao' then coalesce((v_pagamento->>'taxa_percentual')::numeric,0) else 0 end,
        case when v_pagamento->>'forma'='cartao' then round((v_pagamento->>'valor')::numeric * coalesce((v_pagamento->>'taxa_percentual')::numeric,0)/100.0,2) else 0 end
      );
    end loop;
  end if;
  select coalesce(sum(taxa_valor),0),coalesce(max(parcelas),1) into v_taxa_total,v_max_parcelas
    from public.venda_pagamentos where venda_id=v_venda_id;
  update public.vendas set
    forma_pagamento='multiplo', parcelas=v_max_parcelas,
    taxa=case when v_total_venda>0 then round(v_taxa_total/v_total_venda*100,3) else 0 end,
    taxa_valor=v_taxa_total, valor_bruto=v_total_venda,
    valor_liquido=v_total_venda-v_taxa_total, valor_recebido=v_total_pagamentos,
    troco=null, custo_total=0, margem=null
  where id=v_venda_id;
  perform public.registrar_taxa_venda(v_venda_id);
  return v_venda_id;
end;
$$;

create or replace function public.converter_condicional_venda(
  p_condicional_id uuid, p_forma_pagamento text, p_itens jsonb
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
  v_funcionario_id uuid;
  v_item jsonb;
  v_ci record;
  v_qv numeric;
  v_qd numeric;
begin
  select * into v_cond from public.condicionais where id=p_condicional_id;
  if v_cond is null then raise exception 'Condicional não encontrado'; end if;
  if not public.fn_modulo_ativo(v_cond.organization_id,'condicional') then raise exception 'O módulo condicional está desativado'; end if;
  if v_cond.status <> 'aberto' then raise exception 'Este condicional já foi finalizado'; end if;

  select coalesce(sum((e->>'quantidade_vendida')::numeric*(e->>'preco_unitario')::numeric),0)
    into v_bruto from jsonb_array_elements(coalesce(p_itens,'[]'::jsonb)) e;
  if v_bruto <= 0 then raise exception 'Nada foi marcado como vendido'; end if;
  select coalesce(pix_desconto,5) into v_pix_pct from public.configuracoes order by created_at limit 1;
  v_pix_pct := coalesce(v_pix_pct,5);
  v_desc_pix := case when p_forma_pagamento='pix' then round(v_bruto*v_pix_pct/100.0,2) else 0 end;
  v_total := v_bruto-v_desc_pix;

  if coalesce(trim(v_cond.responsavel),'') <> '' then
    select id into v_funcionario_id from public.funcionarios
     where organization_id=v_cond.organization_id and ativo=true
       and lower(trim(nome))=lower(trim(v_cond.responsavel))
     order by created_at limit 1;
  end if;

  insert into public.vendas(
    cliente_id,responsavel,funcionario_id,forma_pagamento,subtotal,desconto_pix,
    pix_desconto_pct,desconto,total,valor_liquido,status,observacao,
    valor_bruto,taxa_valor,custo_total,margem
  ) values (
    v_cond.cliente_id,v_cond.responsavel,v_funcionario_id,p_forma_pagamento,v_bruto,v_desc_pix,
    case when p_forma_pagamento='pix' then v_pix_pct else 0 end,
    0,v_total,v_total,'concluida','Convertido de condicional',v_total,0,0,null
  ) returning id into v_venda_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_itens,'[]'::jsonb)) loop
    v_qv := coalesce((v_item->>'quantidade_vendida')::numeric,0);
    v_qd := coalesce((v_item->>'quantidade_devolvida')::numeric,0);
    select * into v_ci from public.condicional_itens
      where id=(v_item->>'condicional_item_id')::uuid and condicional_id=p_condicional_id;
    if not found then raise exception 'Item do condicional não encontrado'; end if;
    if v_qv+v_qd <> v_ci.quantidade then raise exception 'Vendido + devolvido deve somar a quantidade enviada'; end if;
    if v_qv > 0 then
      insert into public.venda_itens(venda_id,produto_id,variacao_id,quantidade,preco_unitario,total_item)
      values(v_venda_id,v_ci.produto_id,v_ci.variacao_id,v_qv,(v_item->>'preco_unitario')::numeric,v_qv*(v_item->>'preco_unitario')::numeric);
    end if;
    if v_qd > 0 then
      perform public.registrar_movimentacao(v_ci.produto_id,'retorno_condicional',v_qd,'Retorno de condicional',null,p_condicional_id,v_ci.variacao_id);
    end if;
    update public.condicional_itens set status=case when v_qd=0 then 'vendido' when v_qv=0 then 'devolvido' else 'parcial' end where id=v_ci.id;
  end loop;
  update public.condicionais set status='finalizado',data_retorno=(now() at time zone 'America/Sao_Paulo')::date,venda_id=v_venda_id where id=p_condicional_id;
  perform public.log_auditoria('condicional_convertido','condicionais',p_condicional_id,jsonb_build_object('venda_id',v_venda_id,'total',v_total,'funcionario_id',v_funcionario_id));
  return v_venda_id;
end;
$$;

create or replace function public.devolver_itens_venda(
  p_venda_id uuid, p_itens jsonb, p_motivo text default null, p_idempotency_key text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text;
  v_item jsonb;
  v_vi record;
  v_qtd numeric;
  v_valor numeric;
  v_total_dev numeric := 0;
begin
  select status into v_status from public.vendas where id=p_venda_id for update;
  if v_status is null then raise exception 'Venda não encontrada'; end if;
  if p_idempotency_key is not null and exists(select 1 from public.venda_devolucoes where idempotency_key=p_idempotency_key) then return; end if;
  if v_status <> 'concluida' then raise exception 'Só é possível devolver itens de uma venda concluída'; end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_itens,'[]'::jsonb)) loop
    v_qtd := (v_item->>'quantidade')::numeric;
    if v_qtd is null or v_qtd <= 0 then continue; end if;
    select * into v_vi from public.venda_itens where id=(v_item->>'venda_item_id')::uuid and venda_id=p_venda_id;
    if not found then raise exception 'Item da venda não encontrado'; end if;
    if v_qtd > v_vi.quantidade then raise exception 'Quantidade a devolver maior que a vendida'; end if;
    v_valor := v_qtd*v_vi.preco_unitario;
    v_total_dev := v_total_dev+v_valor;
    insert into public.venda_devolucoes(venda_id,produto_id,variacao_id,quantidade,valor,motivo,idempotency_key)
    values(p_venda_id,v_vi.produto_id,v_vi.variacao_id,v_qtd,v_valor,p_motivo,p_idempotency_key);
    perform public.registrar_movimentacao(
      v_vi.produto_id,'devolucao',v_qtd,'Devolução de venda',null,p_venda_id,v_vi.variacao_id,
      case when p_idempotency_key is not null then 'devol-'||p_idempotency_key||'-'||v_vi.id::text else null end
    );
    update public.venda_itens set quantidade=quantidade-v_qtd,total_item=(quantidade-v_qtd)*preco_unitario where id=v_vi.id;
  end loop;
  if v_total_dev > 0 then
    update public.vendas set total=greatest(0,total-v_total_dev),subtotal=greatest(0,coalesce(subtotal,0)-v_total_dev) where id=p_venda_id;
    if not exists(select 1 from public.venda_itens where venda_id=p_venda_id and quantidade>0) then
      update public.vendas set status='cancelada' where id=p_venda_id;
    end if;
    perform public.log_auditoria('venda_devolucao','vendas',p_venda_id,jsonb_build_object('valor',v_total_dev));
  end if;
end;
$$;
