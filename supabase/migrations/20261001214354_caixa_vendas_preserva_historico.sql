-- Caixa lança a venda e define a data; não altera valores ou cancela histórico.
create or replace function public.fn_caixa_preserva_venda()
returns trigger language plpgsql security invoker set search_path=public as $$
declare v_permitidos text[]:=array['data_venda','created_at','updated_at'];
begin
 if public.current_papel()='caixa' then
  -- criar_venda_multiforma calcula o snapshot ainda na transação original.
  -- Depois que a venda foi confirmada, só a data de negócio pode ser corrigida.
  if old.registrado_em=now() then
   v_permitidos:=v_permitidos||array['forma_pagamento','parcelas','taxa','taxa_valor','valor_bruto','valor_liquido','valor_recebido','troco','custo_total','margem','taxa_regra_id'];
  end if;
  if (to_jsonb(new)-v_permitidos) is distinct from (to_jsonb(old)-v_permitidos) then
   raise exception 'Caixa não pode alterar os valores ou cancelar uma venda registrada';
  end if;
 end if;
 return new;
end $$;
revoke all on function public.fn_caixa_preserva_venda() from public,anon,authenticated;
drop trigger if exists caixa_preserva_venda on public.vendas;
create trigger caixa_preserva_venda before update on public.vendas for each row execute function public.fn_caixa_preserva_venda();
drop policy if exists caixa_itens_sem_edicao on public.venda_itens;
create policy caixa_itens_sem_edicao on public.venda_itens as restrictive for update to authenticated using(public.current_papel()<>'caixa') with check(public.current_papel()<>'caixa');
drop policy if exists caixa_pagamentos_sem_edicao on public.venda_pagamentos;
create policy caixa_pagamentos_sem_edicao on public.venda_pagamentos as restrictive for update to authenticated using(public.current_papel()<>'caixa') with check(public.current_papel()<>'caixa');
do $$ declare v_cmd text; begin
 foreach v_cmd in array array['insert','update','delete'] loop
  execute format('drop policy if exists caixa_taxas_sem_%s on public.taxas_cartao',v_cmd);
  if v_cmd='insert' then
   execute 'create policy caixa_taxas_sem_insert on public.taxas_cartao as restrictive for insert to authenticated with check(public.current_papel()<>''caixa'')';
  elsif v_cmd='update' then
   execute 'create policy caixa_taxas_sem_update on public.taxas_cartao as restrictive for update to authenticated using(public.current_papel()<>''caixa'') with check(public.current_papel()<>''caixa'')';
  else
   execute 'create policy caixa_taxas_sem_delete on public.taxas_cartao as restrictive for delete to authenticated using(public.current_papel()<>''caixa'')';
  end if;
 end loop;
end $$;
CREATE OR REPLACE FUNCTION public.registrar_taxa_venda(p_venda_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v record;
begin
  select id, organization_id, user_id, taxa_valor, forma_pagamento, created_at,
         parcelas
    into v
    from public.vendas
    where id = p_venda_id;

  if not found then return; end if;
  if auth.uid() is not null
     and v.organization_id is distinct from public.current_org_id() then
    raise exception 'Venda nao pertence a empresa atual';
  end if;
  if v.forma_pagamento not in ('cartao', 'multiplo')
     or coalesce(v.taxa_valor, 0) <= 0 then
    return;
  end if;
  if exists (
    select 1 from public.despesas
    where venda_id = p_venda_id and categoria = 'Taxa de cartão'
  ) then return; end if;

  insert into public.despesas (
    organization_id, user_id, venda_id, descricao, categoria, valor, data,
    responsavel, observacao
  ) values (
    v.organization_id, coalesce(auth.uid(), v.user_id), p_venda_id,
    case when v.forma_pagamento = 'multiplo'
      then 'Taxa de cartão (venda dividida ' || left(p_venda_id::text, 8) || ')'
      else 'Taxa de cartão (venda ' || left(p_venda_id::text, 8) || ', '
        || coalesce(v.parcelas, 1) || 'x)' end,
    'Taxa de cartão', v.taxa_valor,
    (v.created_at at time zone 'America/Sao_Paulo')::date,
    null, 'Lançada automaticamente pela venda.'
  );
end;
$function$;
