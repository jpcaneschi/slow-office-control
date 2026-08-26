-- 0067 — Compras de fornecedor têm quantidade finita de boletos e cada boleto
-- pode ter uma data de vencimento independente. Não assume mensalidade/quinzena.

create or replace function public.registrar_compra_fornecedor_com_vencimentos(
  p_fornecedor text,
  p_descricao text,
  p_valor_total numeric,
  p_vencimentos jsonb,
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
  v_qtd integer;
  v_centavos bigint;
  v_base bigint;
  v_resto bigint;
  v_item record;
  v_venc date;
  v_valor numeric;
begin
  if public.current_papel() not in ('owner','gerente','financeiro') then
    raise exception 'Sem permissão para cadastrar compra de fornecedor';
  end if;
  if v_org is null then raise exception 'Empresa não identificada'; end if;
  if coalesce(trim(p_fornecedor), '') = '' then raise exception 'Informe o fornecedor'; end if;
  if coalesce(p_valor_total, 0) <= 0 then raise exception 'Informe um valor total válido'; end if;
  if jsonb_typeof(coalesce(p_vencimentos, '[]'::jsonb)) <> 'array' then
    raise exception 'Informe as datas dos boletos';
  end if;

  v_qtd := jsonb_array_length(coalesce(p_vencimentos, '[]'::jsonb));
  if v_qtd < 1 then raise exception 'Informe ao menos um boleto'; end if;
  if v_qtd > 60 then raise exception 'A compra não pode exceder 60 boletos'; end if;

  if exists (
    select 1
    from jsonb_array_elements_text(p_vencimentos) as x(valor)
    where coalesce(trim(valor), '') = ''
       or valor !~ '^\d{4}-\d{2}-\d{2}$'
  ) then
    raise exception 'Todas as datas dos boletos precisam ser válidas';
  end if;

  v_centavos := round(p_valor_total * 100)::bigint;
  v_base := v_centavos / v_qtd;
  v_resto := mod(v_centavos, v_qtd);

  for v_item in
    select ord::integer as numero, valor
    from jsonb_array_elements_text(p_vencimentos) with ordinality as x(valor, ord)
    order by ord
  loop
    begin
      v_venc := v_item.valor::date;
    exception when others then
      raise exception 'Data inválida no boleto %', v_item.numero;
    end;

    v_valor := (
      v_base + case when v_item.numero <= v_resto then 1 else 0 end
    )::numeric / 100.0;

    insert into public.despesas (
      organization_id, descricao, categoria, valor, data, status,
      data_vencimento, data_pagamento, competencia, observacao,
      fornecedor, compra_grupo_id, parcela_numero, total_parcelas
    ) values (
      v_org,
      coalesce(nullif(trim(p_descricao), ''), 'Compra de mercadoria') ||
        case when v_qtd > 1 then ' • boleto ' || v_item.numero || '/' || v_qtd else '' end,
      'Compra de mercadoria',
      v_valor,
      v_venc,
      'pendente',
      v_venc,
      null,
      date_trunc('month', v_venc)::date,
      nullif(trim(p_observacao), ''),
      trim(p_fornecedor),
      v_grupo,
      v_item.numero,
      v_qtd
    );
  end loop;

  perform public.log_auditoria(
    'compra_fornecedor_criada',
    'despesas',
    v_grupo,
    jsonb_build_object(
      'fornecedor', trim(p_fornecedor),
      'valor_total', p_valor_total,
      'boletos', v_qtd,
      'vencimentos', p_vencimentos
    )
  );

  return v_grupo;
end;
$$;

revoke all on function public.registrar_compra_fornecedor_com_vencimentos(text,text,numeric,jsonb,text) from public;
grant execute on function public.registrar_compra_fornecedor_com_vencimentos(text,text,numeric,jsonb,text) to authenticated;
