-- 0067 — Boletos de fornecedor com datas e valores livres.
-- Cada grupo é finito e independente de produto/estoque/preço.

create or replace function public.registrar_boletos_fornecedor(
  p_fornecedor text,
  p_descricao text,
  p_parcelas jsonb,
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
  v_total integer;
  v_item jsonb;
  v_indice integer := 0;
  v_data date;
  v_valor numeric;
begin
  if public.current_papel() not in ('owner','gerente','financeiro') then
    raise exception 'Sem permissão para cadastrar boletos de fornecedor';
  end if;
  if v_org is null then raise exception 'Empresa não identificada'; end if;
  if coalesce(trim(p_fornecedor), '') = '' then raise exception 'Informe o fornecedor'; end if;
  if jsonb_typeof(coalesce(p_parcelas, '[]'::jsonb)) <> 'array' then
    raise exception 'Parcelas inválidas';
  end if;

  v_total := jsonb_array_length(coalesce(p_parcelas, '[]'::jsonb));
  if v_total < 1 or v_total > 60 then
    raise exception 'Informe entre 1 e 60 boletos';
  end if;

  for v_item in select * from jsonb_array_elements(p_parcelas) loop
    v_indice := v_indice + 1;
    begin
      v_data := nullif(v_item->>'data','')::date;
      v_valor := nullif(v_item->>'valor','')::numeric;
    exception when others then
      raise exception 'Data ou valor inválido no boleto %', v_indice;
    end;

    if v_data is null then raise exception 'Informe a data do boleto %', v_indice; end if;
    if coalesce(v_valor,0) <= 0 then raise exception 'Informe o valor do boleto %', v_indice; end if;

    insert into public.despesas (
      organization_id, descricao, categoria, valor, data, status,
      data_vencimento, data_pagamento, competencia, observacao,
      fornecedor, compra_grupo_id, parcela_numero, total_parcelas
    ) values (
      v_org,
      coalesce(nullif(trim(p_descricao), ''), 'Boleto de fornecedor') ||
        case when v_total > 1 then ' • ' || v_indice || '/' || v_total else '' end,
      'Fornecedor',
      round(v_valor,2),
      v_data,
      'pendente',
      v_data,
      null,
      date_trunc('month', v_data)::date,
      nullif(trim(p_observacao), ''),
      trim(p_fornecedor),
      v_grupo,
      v_indice,
      v_total
    );
  end loop;

  perform public.log_auditoria(
    'boletos_fornecedor_criados', 'despesas', v_grupo,
    jsonb_build_object('fornecedor', trim(p_fornecedor), 'quantidade', v_total)
  );
  return v_grupo;
end;
$$;

revoke all on function public.registrar_boletos_fornecedor(text,text,jsonb,text) from public;
grant execute on function public.registrar_boletos_fornecedor(text,text,jsonb,text) to authenticated;
