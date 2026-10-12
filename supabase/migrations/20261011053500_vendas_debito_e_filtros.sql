-- Separa débito de crédito nas vendas e nos pagamentos divididos.
-- O valor legado `cartao` continua representando crédito para preservar o histórico.

alter table public.vendas drop constraint if exists vendas_forma_pagamento_check;
alter table public.vendas add constraint vendas_forma_pagamento_check
  check (forma_pagamento in ('pix','dinheiro','cartao','debito','promissoria','misto','multiplo'));

alter table public.venda_pagamentos drop constraint if exists venda_pagamentos_forma_check;
alter table public.venda_pagamentos add constraint venda_pagamentos_forma_check
  check (forma in ('pix','dinheiro','cartao','debito'));

create or replace function public.criar_venda_debito(
  p_cliente_id uuid,
  p_responsavel text,
  p_funcionario_id uuid,
  p_taxa numeric,
  p_desconto numeric,
  p_observacao text,
  p_itens jsonb,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_venda_id uuid;
begin
  -- Reutiliza a rotina atômica de crédito em 1x para manter estoque,
  -- descontos, idempotência e taxa; depois classifica corretamente como débito.
  v_venda_id := public.criar_venda(
    p_cliente_id, p_responsavel, p_funcionario_id, 'cartao', 1,
    coalesce(p_taxa, 0), null, p_desconto, p_observacao, p_itens,
    null, null, null, null, p_idempotency_key
  );

  update public.vendas
     set forma_pagamento = 'debito', parcelas = 1, updated_at = now()
   where id = v_venda_id
     and organization_id = public.current_org_id();

  perform public.log_auditoria(
    'venda_pagamento_classificado','vendas',v_venda_id,
    jsonb_build_object('forma_pagamento','debito')
  );
  return v_venda_id;
end;
$$;

revoke all on function public.criar_venda_debito(uuid,text,uuid,numeric,numeric,text,jsonb,text) from public;
revoke all on function public.criar_venda_debito(uuid,text,uuid,numeric,numeric,text,jsonb,text) from anon;
grant execute on function public.criar_venda_debito(uuid,text,uuid,numeric,numeric,text,jsonb,text) to authenticated;

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
    where coalesce(p->>'forma','') not in ('pix','dinheiro','cartao','debito')
      or coalesce((p->>'valor')::numeric,0)<=0
      or coalesce((p->>'taxa_percentual')::numeric,0)<0
      or coalesce((p->>'taxa_percentual')::numeric,0)>100
      or coalesce((p->>'parcelas')::int,1)<1
      or (p->>'forma'='debito' and coalesce((p->>'parcelas')::int,1)<>1)
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
        case when v_pagamento->>'forma'='cartao' then coalesce((v_pagamento->>'parcelas')::int,1) else 1 end,
        case when v_pagamento->>'forma' in ('cartao','debito') then coalesce((v_pagamento->>'taxa_percentual')::numeric,0) else 0 end,
        case when v_pagamento->>'forma' in ('cartao','debito') then round((v_pagamento->>'valor')::numeric*coalesce((v_pagamento->>'taxa_percentual')::numeric,0)/100.0,2) else 0 end
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

revoke all on function public.criar_venda_multiforma(uuid,text,uuid,numeric,text,jsonb,jsonb,text) from public;
revoke all on function public.criar_venda_multiforma(uuid,text,uuid,numeric,text,jsonb,jsonb,text) from anon;
grant execute on function public.criar_venda_multiforma(uuid,text,uuid,numeric,text,jsonb,jsonb,text) to authenticated;

