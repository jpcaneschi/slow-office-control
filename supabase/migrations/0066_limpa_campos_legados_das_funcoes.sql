-- 0066 — As funções operacionais deixam de mencionar os campos legados de custo/margem.
-- As colunas antigas permanecem no schema apenas para preservar o histórico.

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
  v_gera boolean := p_forma_pagamento in ('promissoria','misto');
  v_prom_valor numeric := 0;
  v_prom_parc int := greatest(1,coalesce(p_promissoria_parcelas,1));
  v_entrada numeric := coalesce(p_valor_recebido,0);
  v_venda_id uuid;
  v_item jsonb;
begin
  if p_idempotency_key is not null then
    select id into v_existente from public.vendas where idempotency_key=p_idempotency_key;
    if v_existente is not null then return v_existente; end if;
  end if;

  select coalesce(pix_desconto,5),coalesce(max_parcelas,6),coalesce(parcela_minima,0),coalesce(promissoria_prazo_meses,4)
    into v_pix_pct,v_max_parc,v_parc_min,v_prom_max
    from public.configuracoes order by created_at limit 1;
  v_pix_pct:=coalesce(v_pix_pct,5);
  v_max_parc:=coalesce(v_max_parc,6);
  v_parc_min:=coalesce(v_parc_min,0);
  v_prom_max:=coalesce(v_prom_max,4);

  select coalesce(sum((e->>'quantidade')::numeric*(e->>'preco_unitario')::numeric),0)
    into v_subtotal from jsonb_array_elements(coalesce(p_itens,'[]'::jsonb)) e;
  if v_subtotal<=0 then raise exception 'A venda precisa de ao menos um item com valor'; end if;

  v_desc_manual:=greatest(0,coalesce(p_desconto,0));
  v_desc_pix:=case when p_forma_pagamento='pix' then round(v_subtotal*v_pix_pct/100.0,2) else 0 end;
  v_total:=greatest(0,round(v_subtotal-v_desc_manual-v_desc_pix,2));

  if p_forma_pagamento='dinheiro' then
    if v_entrada<v_total then raise exception 'Valor recebido é menor que o total'; end if;
    v_troco:=round(v_entrada-v_total,2);
  elsif p_forma_pagamento='cartao' then
    if coalesce(p_parcelas,1)<1 or coalesce(p_parcelas,1)>v_max_parc then raise exception 'Parcelas do cartão fora do limite'; end if;
    if coalesce(p_taxa,0)<0 or coalesce(p_taxa,0)>100 then raise exception 'Taxa do cartão inválida'; end if;
  elsif p_forma_pagamento='promissoria' then
    if p_cliente_id is null then raise exception 'Venda no fiado exige um cliente identificado'; end if;
    if v_prom_parc>v_prom_max then raise exception 'Prazo da promissória acima do máximo'; end if;
    if round(v_total/v_prom_parc,2)<v_parc_min then raise exception 'Parcela abaixo da mínima configurada'; end if;
    v_prom_valor:=v_total;
  elsif p_forma_pagamento='misto' then
    if p_cliente_id is null then raise exception 'Venda mista exige um cliente identificado'; end if;
    if v_entrada<=0 or v_entrada>=v_total then raise exception 'Informe uma entrada válida para a venda mista'; end if;
    v_prom_valor:=round(v_total-v_entrada,2);
    if v_prom_parc>v_prom_max then raise exception 'Prazo do fiado acima do máximo'; end if;
    if round(v_prom_valor/v_prom_parc,2)<v_parc_min then raise exception 'Parcela do fiado abaixo da mínima configurada'; end if;
  end if;

  v_liquido:=case when p_forma_pagamento='cartao'
    then round(v_total*(1-coalesce(p_taxa,0)/100.0),2) else v_total end;

  insert into public.vendas(
    cliente_id,responsavel,funcionario_id,forma_pagamento,desconto_pix,pix_desconto_pct,
    parcelas,taxa,valor_liquido,valor_recebido,troco,entrada_forma,subtotal,desconto,total,
    observacao,status,idempotency_key
  ) values (
    p_cliente_id,p_responsavel,p_funcionario_id,p_forma_pagamento,v_desc_pix,
    case when p_forma_pagamento='pix' then v_pix_pct else 0 end,
    case when p_forma_pagamento='cartao' then coalesce(p_parcelas,1) else 1 end,
    case when p_forma_pagamento='cartao' then coalesce(p_taxa,0) else 0 end,
    v_liquido,case when p_forma_pagamento in ('dinheiro','misto') then v_entrada else null end,
    v_troco,case when p_forma_pagamento='misto' then p_entrada_forma else null end,
    v_subtotal,v_desc_manual,v_total,p_observacao,'concluida',p_idempotency_key
  ) returning id into v_venda_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_itens,'[]'::jsonb)) loop
    insert into public.venda_itens(venda_id,produto_id,variacao_id,quantidade,preco_unitario,total_item)
    values(
      v_venda_id,(v_item->>'produto_id')::uuid,nullif(v_item->>'variacao_id','')::uuid,
      (v_item->>'quantidade')::numeric,(v_item->>'preco_unitario')::numeric,
      (v_item->>'quantidade')::numeric*(v_item->>'preco_unitario')::numeric
    );
    perform public.registrar_movimentacao(
      (v_item->>'produto_id')::uuid,'venda',(v_item->>'quantidade')::numeric,'Venda',null,
      v_venda_id,nullif(v_item->>'variacao_id','')::uuid,
      'venda-'||v_venda_id::text||'-'||coalesce(v_item->>'variacao_id',v_item->>'produto_id')
    );
  end loop;

  if v_gera then
    insert into public.promissorias(cliente_id,valor_total,parcelas,status,observacao,data_vencimento,venda_id)
    values(p_cliente_id,v_prom_valor,v_prom_parc,'em_aberto',p_promissoria_obs,p_promissoria_vencimento,v_venda_id);
  end if;

  perform public.log_auditoria('venda_criada','vendas',v_venda_id,
    jsonb_build_object('total',v_total,'forma_pagamento',p_forma_pagamento,'itens',jsonb_array_length(coalesce(p_itens,'[]'::jsonb))));
  return v_venda_id;
end;
$$;

create or replace function public.criar_venda_multiforma(
  p_cliente_id uuid,p_responsavel text,p_funcionario_id uuid,p_desconto numeric,
  p_observacao text,p_itens jsonb,p_pagamentos jsonb,p_idempotency_key text default null
)
returns uuid
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_venda_id uuid;
  v_pagamento jsonb;
  v_total_pagamentos numeric;
  v_total_venda numeric;
  v_taxa_total numeric:=0;
  v_max_parcelas int:=1;
begin
  if jsonb_typeof(coalesce(p_pagamentos,'[]'::jsonb))<>'array'
     or jsonb_array_length(coalesce(p_pagamentos,'[]'::jsonb))<2 then
    raise exception 'Informe pelo menos duas formas de pagamento';
  end if;
  select coalesce(sum((p->>'valor')::numeric),0) into v_total_pagamentos
    from jsonb_array_elements(p_pagamentos) p;
  if exists(
    select 1 from jsonb_array_elements(p_pagamentos) p
    where coalesce(p->>'forma','') not in ('pix','dinheiro','cartao')
      or coalesce((p->>'valor')::numeric,0)<=0
      or coalesce((p->>'taxa_percentual')::numeric,0)<0
      or coalesce((p->>'taxa_percentual')::numeric,0)>100
      or coalesce((p->>'parcelas')::int,1)<1
  ) then raise exception 'Uma das formas de pagamento é inválida'; end if;
  if exists(select 1 from jsonb_array_elements(p_pagamentos) p group by p->>'forma' having count(*)>1) then
    raise exception 'Não repita a mesma forma de pagamento';
  end if;

  v_venda_id:=public.criar_venda(
    p_cliente_id,p_responsavel,p_funcionario_id,'dinheiro',1,0,v_total_pagamentos,
    p_desconto,p_observacao,p_itens,null,null,null,null,p_idempotency_key
  );
  select total into v_total_venda from public.vendas
    where id=v_venda_id and organization_id=public.current_org_id();
  if abs(coalesce(v_total_pagamentos,0)-coalesce(v_total_venda,0))>0.009 then
    raise exception 'A soma dos pagamentos deve ser igual ao total da venda';
  end if;

  if not exists(select 1 from public.venda_pagamentos where venda_id=v_venda_id) then
    for v_pagamento in select * from jsonb_array_elements(p_pagamentos) loop
      insert into public.venda_pagamentos(venda_id,forma,valor,parcelas,taxa_percentual,taxa_valor)
      values(
        v_venda_id,v_pagamento->>'forma',(v_pagamento->>'valor')::numeric,
        coalesce((v_pagamento->>'parcelas')::int,1),
        case when v_pagamento->>'forma'='cartao' then coalesce((v_pagamento->>'taxa_percentual')::numeric,0) else 0 end,
        case when v_pagamento->>'forma'='cartao' then round((v_pagamento->>'valor')::numeric*coalesce((v_pagamento->>'taxa_percentual')::numeric,0)/100.0,2) else 0 end
      );
    end loop;
  end if;
  select coalesce(sum(taxa_valor),0),coalesce(max(parcelas),1)
    into v_taxa_total,v_max_parcelas from public.venda_pagamentos where venda_id=v_venda_id;
  update public.vendas set
    forma_pagamento='multiplo',parcelas=v_max_parcelas,
    taxa=case when v_total_venda>0 then round(v_taxa_total/v_total_venda*100,3) else 0 end,
    taxa_valor=v_taxa_total,valor_bruto=v_total_venda,
    valor_liquido=v_total_venda-v_taxa_total,valor_recebido=v_total_pagamentos,troco=null
  where id=v_venda_id;
  perform public.registrar_taxa_venda(v_venda_id);
  return v_venda_id;
end;
$$;

create or replace function public.converter_condicional_venda(
  p_condicional_id uuid,p_forma_pagamento text,p_itens jsonb
)
returns uuid
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_cond record;
  v_venda_id uuid;
  v_bruto numeric:=0;
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
  if v_cond.status<>'aberto' then raise exception 'Este condicional já foi finalizado'; end if;

  select coalesce(sum((e->>'quantidade_vendida')::numeric*(e->>'preco_unitario')::numeric),0)
    into v_bruto from jsonb_array_elements(coalesce(p_itens,'[]'::jsonb)) e;
  if v_bruto<=0 then raise exception 'Nada foi marcado como vendido'; end if;
  select coalesce(pix_desconto,5) into v_pix_pct from public.configuracoes order by created_at limit 1;
  v_pix_pct:=coalesce(v_pix_pct,5);
  v_desc_pix:=case when p_forma_pagamento='pix' then round(v_bruto*v_pix_pct/100.0,2) else 0 end;
  v_total:=v_bruto-v_desc_pix;

  if coalesce(trim(v_cond.responsavel),'')<>'' then
    select id into v_funcionario_id from public.funcionarios
    where organization_id=v_cond.organization_id and ativo=true
      and lower(trim(nome))=lower(trim(v_cond.responsavel))
    order by created_at limit 1;
  end if;

  insert into public.vendas(
    cliente_id,responsavel,funcionario_id,forma_pagamento,subtotal,desconto_pix,
    pix_desconto_pct,desconto,total,valor_liquido,status,observacao,valor_bruto,taxa_valor
  ) values(
    v_cond.cliente_id,v_cond.responsavel,v_funcionario_id,p_forma_pagamento,v_bruto,v_desc_pix,
    case when p_forma_pagamento='pix' then v_pix_pct else 0 end,
    0,v_total,v_total,'concluida','Convertido de condicional',v_total,0
  ) returning id into v_venda_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_itens,'[]'::jsonb)) loop
    v_qv:=coalesce((v_item->>'quantidade_vendida')::numeric,0);
    v_qd:=coalesce((v_item->>'quantidade_devolvida')::numeric,0);
    select * into v_ci from public.condicional_itens
      where id=(v_item->>'condicional_item_id')::uuid and condicional_id=p_condicional_id;
    if not found then raise exception 'Item do condicional não encontrado'; end if;
    if v_qv+v_qd<>v_ci.quantidade then raise exception 'Vendido + devolvido deve somar a quantidade enviada'; end if;
    if v_qv>0 then
      insert into public.venda_itens(venda_id,produto_id,variacao_id,quantidade,preco_unitario,total_item)
      values(v_venda_id,v_ci.produto_id,v_ci.variacao_id,v_qv,(v_item->>'preco_unitario')::numeric,v_qv*(v_item->>'preco_unitario')::numeric);
    end if;
    if v_qd>0 then
      perform public.registrar_movimentacao(v_ci.produto_id,'retorno_condicional',v_qd,'Retorno de condicional',null,p_condicional_id,v_ci.variacao_id);
    end if;
    update public.condicional_itens
      set status=case when v_qd=0 then 'vendido' when v_qv=0 then 'devolvido' else 'parcial' end
      where id=v_ci.id;
  end loop;

  update public.condicionais set
    status='finalizado',data_retorno=(now() at time zone 'America/Sao_Paulo')::date,venda_id=v_venda_id
  where id=p_condicional_id;
  perform public.log_auditoria('condicional_convertido','condicionais',p_condicional_id,
    jsonb_build_object('venda_id',v_venda_id,'total',v_total,'funcionario_id',v_funcionario_id));
  return v_venda_id;
end;
$$;
