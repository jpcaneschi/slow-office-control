-- Corrige a criação para respeitar o constraint valor_total > 0.
-- Nenhuma linha de negócio é alterada; somente a definição da RPC é substituída.

create or replace function public.salvar_promissoria_detalhada(
  p_promissoria_id uuid,
  p_cliente_id uuid,
  p_valor_base numeric,
  p_entrada_valor numeric,
  p_acrescimo_tipo text,
  p_acrescimo_input numeric,
  p_parcelas integer,
  p_data_primeira date,
  p_observacao text,
  p_itens jsonb,
  p_entrada_forma text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid := public.current_org_id();
  v_id uuid;
  v_item jsonb;
  v_prod record;
  v_change record;
  v_qtd integer;
  v_preco numeric;
  v_preco_original numeric;
  v_preco_original_antigo numeric;
  v_desconto_tipo text;
  v_desconto_tipo_antigo text;
  v_desconto_input numeric;
  v_desconto_valor numeric;
  v_desconto_valor_antigo numeric;
  v_desconto_pct numeric;
  v_desconto_pct_antigo numeric;
  v_base numeric := 0;
  v_desconto_total numeric := 0;
  v_acrescimo numeric := 0;
  v_pct numeric := 0;
  v_total numeric := 0;
  v_entrada numeric := greatest(coalesce(p_entrada_valor, 0), 0);
  v_pago_parcelas numeric := 0;
  v_entrada_antiga numeric := 0;
  v_pago_total numeric := 0;
  v_estoque numeric;
  v_novo_estoque numeric;
  v_delta integer;
  v_entrada_id uuid;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if public.current_papel() not in ('owner','gerente','caixa','financeiro') then
    raise exception 'Seu perfil não tem permissão para salvar promissórias';
  end if;
  if v_org is null then raise exception 'Empresa não identificada'; end if;
  if p_cliente_id is null then raise exception 'Selecione um cliente'; end if;
  if not exists (
    select 1 from public.clientes
     where id=p_cliente_id and organization_id=v_org
  ) then
    raise exception 'Cliente não encontrado nesta empresa';
  end if;
  if coalesce(p_parcelas,0) <= 0 then raise exception 'Informe a quantidade de parcelas'; end if;
  if p_data_primeira is null then raise exception 'Informe a data da primeira parcela'; end if;
  if p_acrescimo_tipo is not null and p_acrescimo_tipo not in ('percentual','valor') then
    raise exception 'Tipo de acréscimo inválido';
  end if;
  if nullif(p_entrada_forma,'') is not null and p_entrada_forma not in ('pix','dinheiro','cartao') then
    raise exception 'Forma da entrada inválida';
  end if;

  if coalesce(p_idempotency_key,'') <> '' then
    select promissoria_id into v_id
      from public.promissoria_operacoes
     where organization_id=v_org and idempotency_key=p_idempotency_key;
    if v_id is not null then return v_id; end if;
  end if;

  if p_promissoria_id is null then
    insert into public.promissorias(
      cliente_id, valor_total, parcelas, status, observacao,
      data_vencimento, data_primeira_parcela, organization_id, user_id
    ) values (
      p_cliente_id, greatest(coalesce(p_valor_base,0),0.01), p_parcelas, 'em_aberto',
      nullif(trim(coalesce(p_observacao,'')),''), p_data_primeira, p_data_primeira,
      v_org, auth.uid()
    ) returning id into v_id;
  else
    select id into v_id
      from public.promissorias
     where id=p_promissoria_id and organization_id=v_org and status not in ('cancelado','pago')
     for update;
    if v_id is null then raise exception 'Promissória não encontrada ou não editável'; end if;
  end if;

  select coalesce(sum(valor) filter (where tipo='parcela'),0),
         coalesce(sum(valor) filter (where tipo='entrada'),0),
         coalesce(sum(valor),0)
    into v_pago_parcelas, v_entrada_antiga, v_pago_total
    from public.promissoria_pagamentos
   where promissoria_id=v_id and organization_id=v_org;

  select id into v_entrada_id
    from public.promissoria_pagamentos
   where promissoria_id=v_id and organization_id=v_org and tipo='entrada'
   order by created_at
   limit 1;

  if v_pago_parcelas > 0.005 and abs(v_entrada-v_entrada_antiga) > 0.005 then
    raise exception 'A entrada não pode ser alterada depois que parcelas já foram recebidas';
  end if;

  create temporary table if not exists tmp_promissoria_itens (
    produto_id uuid not null,
    variacao_id uuid,
    quantidade integer not null,
    preco_original numeric not null,
    desconto_tipo text,
    desconto_valor numeric not null,
    desconto_percentual numeric not null,
    preco_unitario numeric not null
  ) on commit drop;
  truncate table tmp_promissoria_itens;

  for v_item in select * from jsonb_array_elements(coalesce(p_itens,'[]'::jsonb))
  loop
    v_qtd := coalesce(nullif(v_item->>'quantidade','')::integer,1);
    if v_qtd <= 0 then raise exception 'A quantidade do produto deve ser maior que zero'; end if;

    select max(coalesce(pi.preco_original,pi.preco_unitario)), max(pi.desconto_tipo),
           max(pi.desconto_valor), max(pi.desconto_percentual)
      into v_preco_original_antigo, v_desconto_tipo_antigo,
           v_desconto_valor_antigo, v_desconto_pct_antigo
      from public.promissoria_itens pi
     where pi.organization_id=v_org and pi.promissoria_id=v_id
       and pi.produto_id=(v_item->>'produto_id')::uuid
       and pi.variacao_id is not distinct from nullif(v_item->>'variacao_id','')::uuid;

    if nullif(v_item->>'variacao_id','') is not null then
      select p.id produto_id,pv.id variacao_id,coalesce(pv.preco,p.preco) preco
        into v_prod
        from public.produto_variacoes pv
        join public.produtos p on p.id=pv.produto_id
       where pv.id=(v_item->>'variacao_id')::uuid
         and p.id=(v_item->>'produto_id')::uuid
         and pv.organization_id=v_org
         and p.organization_id=v_org;
    else
      select p.id produto_id,null::uuid variacao_id,p.preco preco
        into v_prod
        from public.produtos p
       where p.id=(v_item->>'produto_id')::uuid and p.organization_id=v_org;
    end if;
    if v_prod.produto_id is null then raise exception 'Produto da promissória não encontrado'; end if;

    if v_item ? 'preco_original' then
      v_preco_original := greatest(
        coalesce(nullif(v_item->>'preco_original','')::numeric, v_prod.preco, 0),
        0
      );
      v_desconto_tipo := nullif(v_item->>'desconto_tipo','');
      v_desconto_input := greatest(coalesce(nullif(v_item->>'desconto_input','')::numeric,0),0);
    elsif v_preco_original_antigo is not null then
      -- Durante uma publicação gradual, clientes antigos continuam preservando o snapshot salvo.
      v_preco_original := v_preco_original_antigo;
      v_desconto_tipo := v_desconto_tipo_antigo;
      v_desconto_input := case
        when v_desconto_tipo_antigo='percentual' then coalesce(v_desconto_pct_antigo,0)
        else coalesce(v_desconto_valor_antigo,0)
      end;
    else
      v_preco_original := greatest(coalesce(v_prod.preco,0),0);
      v_desconto_tipo := null;
      v_desconto_input := 0;
    end if;

    if v_preco_original <= 0 then raise exception 'Informe um valor unitário maior que zero'; end if;
    if v_desconto_tipo is not null and v_desconto_tipo not in ('percentual','valor') then
      raise exception 'Tipo de desconto inválido';
    end if;

    if v_desconto_tipo='percentual' then
      if v_desconto_input > 100 then raise exception 'O desconto percentual não pode ultrapassar 100 por cento'; end if;
      v_desconto_pct := v_desconto_input;
      v_desconto_valor := round(v_preco_original*v_desconto_pct/100.0,2);
    elsif v_desconto_tipo='valor' then
      if v_desconto_input > v_preco_original then
        raise exception 'O desconto em reais não pode ser maior que o valor unitário';
      end if;
      v_desconto_valor := v_desconto_input;
      v_desconto_pct := round(v_desconto_valor/v_preco_original*100.0,4);
    else
      v_desconto_valor := 0;
      v_desconto_pct := 0;
    end if;
    v_preco := round(v_preco_original-v_desconto_valor,2);

    insert into tmp_promissoria_itens(
      produto_id,variacao_id,quantidade,preco_original,desconto_tipo,
      desconto_valor,desconto_percentual,preco_unitario
    ) values (
      v_prod.produto_id,v_prod.variacao_id,v_qtd,v_preco_original,
      case when v_desconto_valor>0 then v_desconto_tipo else null end,
      v_desconto_valor,v_desconto_pct,v_preco
    );
  end loop;

  for v_change in
    with antigos as (
      select produto_id,variacao_id,sum(quantidade)::int qtd
        from public.promissoria_itens
       where organization_id=v_org and promissoria_id=v_id
       group by produto_id,variacao_id
    ), novos as (
      select produto_id,variacao_id,sum(quantidade)::int qtd
        from tmp_promissoria_itens
       group by produto_id,variacao_id
    )
    select coalesce(n.produto_id,a.produto_id) produto_id,
           coalesce(n.variacao_id,a.variacao_id) variacao_id,
           coalesce(a.qtd,0)::int qtd_antiga,
           coalesce(n.qtd,0)::int qtd_nova
      from antigos a
      full join novos n
        on n.produto_id=a.produto_id
       and n.variacao_id is not distinct from a.variacao_id
     order by (coalesce(n.variacao_id,a.variacao_id) is not null),
              coalesce(n.produto_id,a.produto_id),
              coalesce(n.variacao_id,a.variacao_id)
  loop
    v_delta := v_change.qtd_nova-v_change.qtd_antiga;
    if v_delta=0 then continue; end if;

    if v_change.variacao_id is not null then
      select estoque into v_estoque
        from public.produto_variacoes
       where id=v_change.variacao_id and organization_id=v_org
       for update;
      if v_estoque is null then raise exception 'Variação da promissória não encontrada'; end if;
      v_novo_estoque := v_estoque-v_delta;
      if v_novo_estoque<0 then raise exception 'Estoque insuficiente para a variação selecionada'; end if;
      update public.produto_variacoes
         set estoque=v_novo_estoque
       where id=v_change.variacao_id and organization_id=v_org;
    else
      select estoque into v_estoque
        from public.produtos
       where id=v_change.produto_id and organization_id=v_org
       for update;
      if v_estoque is null then raise exception 'Produto da promissória não encontrado'; end if;
      v_novo_estoque := v_estoque-v_delta;
      if v_novo_estoque<0 then raise exception 'Estoque insuficiente para o produto selecionado'; end if;
      update public.produtos
         set estoque=v_novo_estoque
       where id=v_change.produto_id and organization_id=v_org;
    end if;

    insert into public.estoque_movimentacoes(
      produto_id,variacao_id,tipo,quantidade,observacao,motivo,referencia_id,
      organization_id,user_id,quantidade_anterior,quantidade_posterior
    ) values (
      v_change.produto_id,v_change.variacao_id,
      case when v_delta>0 then 'saida' else 'entrada' end,
      abs(v_delta),'Alteração de produto em promissória','Promissória',v_id,
      v_org,auth.uid(),v_estoque,v_novo_estoque
    );
  end loop;

  delete from public.promissoria_itens
   where organization_id=v_org and promissoria_id=v_id;
  insert into public.promissoria_itens(
    organization_id,promissoria_id,produto_id,variacao_id,quantidade,
    preco_original,desconto_tipo,desconto_valor,desconto_percentual,preco_unitario
  )
  select v_org,v_id,produto_id,variacao_id,quantidade,
         preco_original,desconto_tipo,desconto_valor,desconto_percentual,preco_unitario
    from tmp_promissoria_itens;

  select coalesce(sum(quantidade*preco_unitario),0),
         coalesce(sum(quantidade*desconto_valor),0)
    into v_base,v_desconto_total
    from tmp_promissoria_itens;
  if not exists(select 1 from tmp_promissoria_itens) then
    v_base := greatest(coalesce(p_valor_base,0),0);
  end if;
  if v_base<=0 then raise exception 'Informe um produto ou um valor base válido'; end if;

  if p_acrescimo_tipo='percentual' then
    v_pct := greatest(coalesce(p_acrescimo_input,0),0);
    v_acrescimo := round(v_base*v_pct/100.0,2);
  elsif p_acrescimo_tipo='valor' then
    v_acrescimo := greatest(coalesce(p_acrescimo_input,0),0);
    v_pct := case when v_base>0 then round(v_acrescimo/v_base*100.0,4) else 0 end;
  end if;
  v_total := round(v_base+v_acrescimo,2);
  if v_entrada>v_total then raise exception 'Entrada maior que o valor total'; end if;
  if v_total<v_pago_total-0.005 then raise exception 'O novo total não pode ser menor que o valor já recebido'; end if;

  if v_pago_parcelas<=0.005 then
    if v_entrada_id is not null and v_entrada>0 then
      update public.promissoria_pagamentos
         set valor=v_entrada,
             forma_pagamento=coalesce(nullif(p_entrada_forma,''),forma_pagamento),
             observacao='Entrada da promissória'
       where id=v_entrada_id and promissoria_id=v_id and organization_id=v_org;
    elsif v_entrada_id is not null and v_entrada<=0 then
      delete from public.promissoria_pagamentos
       where id=v_entrada_id and promissoria_id=v_id and organization_id=v_org;
    elsif v_entrada_id is null and v_entrada>0 then
      insert into public.promissoria_pagamentos(
        organization_id,promissoria_id,valor,data,forma_pagamento,observacao,tipo,idempotency_key
      ) values (
        v_org,v_id,v_entrada,v_hoje,nullif(p_entrada_forma,''),
        'Entrada da promissória','entrada',
        case when coalesce(p_idempotency_key,'')<>'' then p_idempotency_key||':entrada' else null end
      ) on conflict (idempotency_key) where idempotency_key is not null do nothing;
    end if;
  end if;

  select coalesce(sum(valor),0) into v_pago_total
    from public.promissoria_pagamentos
   where promissoria_id=v_id and organization_id=v_org;

  update public.promissorias set
    cliente_id=p_cliente_id,
    valor_produtos=v_base,
    entrada_valor=v_entrada,
    acrescimo_tipo=case when v_acrescimo>0 then p_acrescimo_tipo else null end,
    acrescimo_valor=v_acrescimo,
    acrescimo_percentual=v_pct,
    valor_total=v_total,
    parcelas=p_parcelas,
    data_vencimento=p_data_primeira,
    data_primeira_parcela=p_data_primeira,
    observacao=nullif(trim(coalesce(p_observacao,'')),''),
    status=case when v_pago_total>=v_total-0.005 then 'pago' else 'em_aberto' end,
    updated_at=now()
  where id=v_id and organization_id=v_org;

  if coalesce(p_idempotency_key,'')<>'' then
    insert into public.promissoria_operacoes(organization_id,idempotency_key,promissoria_id)
    values(v_org,p_idempotency_key,v_id)
    on conflict (organization_id,idempotency_key) do nothing;
  end if;

  perform public.log_auditoria(
    'promissoria_salvar','promissorias',v_id,
    jsonb_build_object(
      'valor_produtos',v_base,'desconto_produtos',v_desconto_total,
      'entrada',v_entrada,'acrescimo',v_acrescimo,'total',v_total,
      'parcelas',p_parcelas,'itens',jsonb_array_length(coalesce(p_itens,'[]'::jsonb))
    )
  );
  return v_id;
end;
$$;

revoke all on function public.salvar_promissoria_detalhada(uuid,uuid,numeric,numeric,text,numeric,integer,date,text,jsonb,text,text) from public;
grant execute on function public.salvar_promissoria_detalhada(uuid,uuid,numeric,numeric,text,numeric,integer,date,text,jsonb,text,text) to authenticated;

