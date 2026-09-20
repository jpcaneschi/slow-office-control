-- Gestão operacional: data real da venda, arquivamento seguro e crédito livre.
-- Todas as rotinas abaixo continuam limitadas à organização da sessão.

alter table public.vendas
  add column if not exists data_venda date,
  add column if not exists registrado_em timestamptz;

update public.vendas
set data_venda = coalesce(data_venda,(created_at at time zone 'America/Sao_Paulo')::date),
    registrado_em = coalesce(registrado_em,created_at)
where data_venda is null or registrado_em is null;

alter table public.vendas
  alter column data_venda set default ((now() at time zone 'America/Sao_Paulo')::date),
  alter column data_venda set not null,
  alter column registrado_em set default now(),
  alter column registrado_em set not null;

create index if not exists idx_vendas_org_data_venda
  on public.vendas (organization_id, data_venda desc);

alter table public.condicionais
  add column if not exists arquivado_em timestamptz,
  add column if not exists arquivado_por uuid,
  add column if not exists motivo_arquivamento text;

alter table public.promissorias
  drop constraint if exists promissorias_parcelas_check;
alter table public.promissorias
  add constraint promissorias_parcelas_check check (parcelas > 0);

create or replace function public.fn_valida_promissoria()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(new.parcelas, 0) <= 0 then
    raise exception 'Informe uma quantidade de parcelas válida';
  end if;
  if coalesce(new.valor_total, 0) <= 0 then
    raise exception 'Informe um valor total válido';
  end if;
  return new;
end;
$$;

-- A configuração permanece para compatibilidade, mas deixa de limitar o crédito.
update public.configuracoes
set parcela_minima = 0,
    promissoria_prazo_meses = greatest(promissoria_prazo_meses, 9999)
where lower(trim(nome_operacao)) = 'slow office';

create or replace function public.definir_data_venda(
  p_venda_id uuid,
  p_data_venda date
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid := public.current_org_id();
begin
  if public.current_papel() not in ('owner','gerente','caixa','financeiro') then
    raise exception 'Seu perfil não tem permissão para alterar a data da venda';
  end if;
  if p_data_venda is null or p_data_venda > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'Informe uma data de venda válida';
  end if;

  update public.vendas
     set data_venda = p_data_venda,
         -- Compatibilidade: relatórios legados filtram created_at. O instante
         -- real do cadastro permanece imutável em registrado_em.
         created_at = (p_data_venda::timestamp + time '12:00') at time zone 'America/Sao_Paulo',
         updated_at = now()
   where id = p_venda_id and organization_id = v_org;
  if not found then raise exception 'Venda não encontrada nesta empresa'; end if;

  perform public.log_auditoria(
    'venda_data_alterada','vendas',p_venda_id,
    jsonb_build_object('data_venda',p_data_venda)
  );
end;
$$;

create or replace function public.cancelar_promissoria_seguro(
  p_promissoria_id uuid,
  p_motivo text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid := public.current_org_id();
  v_prom public.promissorias%rowtype;
  v_status_venda text;
begin
  if public.current_papel() not in ('owner','gerente','financeiro') then
    raise exception 'Seu perfil não tem permissão para cancelar promissórias';
  end if;
  if coalesce(trim(p_motivo),'') = '' then raise exception 'Informe o motivo do cancelamento'; end if;

  select * into v_prom from public.promissorias
   where id=p_promissoria_id and organization_id=v_org for update;
  if not found then raise exception 'Promissória não encontrada nesta empresa'; end if;
  if v_prom.status='cancelado' then return; end if;
  if exists (select 1 from public.promissoria_pagamentos where promissoria_id=v_prom.id and organization_id=v_org) then
    raise exception 'Promissória com recebimentos não pode ser cancelada; estorne os recebimentos primeiro';
  end if;
  if v_prom.venda_id is not null then
    select status into v_status_venda from public.vendas
     where id=v_prom.venda_id and organization_id=v_org;
    if coalesce(v_status_venda,'') <> 'cancelada' then
      raise exception 'Promissória vinculada a uma venda ativa não pode ser cancelada isoladamente';
    end if;
  end if;

  update public.promissorias
     set status='cancelado',
         observacao=concat_ws(E'\n',nullif(observacao,''),'Cancelada: '||trim(p_motivo)),
         updated_at=now()
   where id=v_prom.id;
  perform public.log_auditoria('promissoria_cancelada','promissorias',v_prom.id,
    jsonb_build_object('motivo',trim(p_motivo),'venda_id',v_prom.venda_id));
end;
$$;

create or replace function public.arquivar_condicional_seguro(
  p_condicional_id uuid,
  p_motivo text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid := public.current_org_id();
  v_cond public.condicionais%rowtype;
  v_item record;
begin
  if public.current_papel() not in ('owner','gerente') then
    raise exception 'Seu perfil não tem permissão para arquivar condicionais';
  end if;
  if coalesce(trim(p_motivo),'') = '' then raise exception 'Informe o motivo do arquivamento'; end if;

  select * into v_cond from public.condicionais
   where id=p_condicional_id and organization_id=v_org for update;
  if not found then raise exception 'Condicional não encontrado nesta empresa'; end if;
  if v_cond.arquivado_em is not null then return; end if;
  if v_cond.venda_id is not null then
    raise exception 'Condicional convertido em venda não pode ser arquivado';
  end if;

  if v_cond.status='aberto' then
    for v_item in
      select * from public.condicional_itens
       where condicional_id=v_cond.id and organization_id=v_org
         and status='em_aberto'
    loop
      perform public.registrar_movimentacao(
        v_item.produto_id,'retorno_condicional',v_item.quantidade,
        'Arquivamento de condicional: '||trim(p_motivo),null,
        v_cond.id,v_item.variacao_id,
        'arquiva-condicional-'||v_cond.id::text||'-'||v_item.id::text
      );
      update public.condicional_itens set status='devolvido' where id=v_item.id;
    end loop;
  end if;

  update public.condicionais
     set status='arquivado', arquivado_em=now(), arquivado_por=auth.uid(),
         motivo_arquivamento=trim(p_motivo),
         data_retorno=coalesce(data_retorno,(now() at time zone 'America/Sao_Paulo')::date)
   where id=v_cond.id;
  perform public.log_auditoria('condicional_arquivado','condicionais',v_cond.id,
    jsonb_build_object('motivo',trim(p_motivo),'status_anterior',v_cond.status));
end;
$$;

create or replace function public.arquivar_cliente_seguro(p_cliente_id uuid)
returns void language plpgsql security invoker set search_path=public as $$
declare v_org uuid:=public.current_org_id();
begin
  if public.current_papel() not in ('owner','gerente') then raise exception 'Sem permissão para arquivar clientes'; end if;
  update public.clientes set status='inativo',updated_at=now()
   where id=p_cliente_id and organization_id=v_org;
  if not found then raise exception 'Cliente não encontrado nesta empresa'; end if;
  perform public.log_auditoria('cliente_arquivado','clientes',p_cliente_id,'{}'::jsonb);
end; $$;

create or replace function public.arquivar_produto_seguro(p_produto_id uuid)
returns void language plpgsql security invoker set search_path=public as $$
declare v_org uuid:=public.current_org_id();
begin
  if public.current_papel() not in ('owner','gerente') then raise exception 'Sem permissão para arquivar produtos'; end if;
  update public.produtos set status='inativo'
   where id=p_produto_id and organization_id=v_org;
  if not found then raise exception 'Produto não encontrado nesta empresa'; end if;
  perform public.log_auditoria('produto_arquivado','produtos',p_produto_id,'{}'::jsonb);
end; $$;

revoke all on function public.definir_data_venda(uuid,date) from public;
revoke all on function public.cancelar_promissoria_seguro(uuid,text) from public;
revoke all on function public.arquivar_condicional_seguro(uuid,text) from public;
revoke all on function public.arquivar_cliente_seguro(uuid) from public;
revoke all on function public.arquivar_produto_seguro(uuid) from public;
grant execute on function public.definir_data_venda(uuid,date) to authenticated;
grant execute on function public.cancelar_promissoria_seguro(uuid,text) to authenticated;
grant execute on function public.arquivar_condicional_seguro(uuid,text) to authenticated;
grant execute on function public.arquivar_cliente_seguro(uuid) to authenticated;
grant execute on function public.arquivar_produto_seguro(uuid) to authenticated;
