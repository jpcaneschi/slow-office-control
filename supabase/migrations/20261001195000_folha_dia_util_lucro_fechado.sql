-- Agenda opt-in por funcionário; preserva datas e pagamentos históricos.
alter table public.funcionarios
  add column if not exists ajustar_dia_util boolean not null default false,
  add column if not exists feriados_pagamento date[] not null default '{}',
  add column if not exists primeira_competencia_pagamento date;
comment on column public.funcionarios.feriados_pagamento is 'Feriados locais e móveis, além dos feriados nacionais fixos automáticos.';
comment on column public.funcionarios.primeira_competencia_pagamento is 'Primeiro mês em que há folha a pagar; não altera pagamentos históricos.';
create or replace function public.proximo_dia_util_pagamento(p_data date,p_feriados date[] default '{}')
returns date language plpgsql immutable security invoker set search_path=public as $$
declare v_data date:=p_data; v_i int:=0;
begin
 if v_data is null then raise exception 'Data de pagamento obrigatória'; end if;
 while extract(dow from v_data) in (0,6)
    or to_char(v_data,'MM-DD')=any(array['01-01','04-21','05-01','09-07','10-12','11-02','11-15','11-20','12-25'])
    or v_data=any(coalesce(p_feriados,'{}'::date[])) loop
  v_data:=v_data+1; v_i:=v_i+1;
  if v_i>=366 then raise exception 'Confira o calendário de feriados'; end if;
 end loop;
 return v_data;
end $$;
revoke all on function public.proximo_dia_util_pagamento(date,date[]) from public,anon;
grant execute on function public.proximo_dia_util_pagamento(date,date[]) to authenticated;
CREATE OR REPLACE FUNCTION public.agenda_pagamentos_funcionario(p_funcionario_id uuid, p_competencia date)
 RETURNS TABLE(competencia date, data_pagamento date, parcela_numero integer, total_parcelas integer)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_freq text;
  v_ajustar boolean;
  v_feriados date[];
  v_primeiro date;
  v_dia1 int;
  v_dia2 int;
  v_semana int;
  v_inicio date := date_trunc('month', p_competencia)::date;
  v_fim date := (date_trunc('month', p_competencia) + interval '1 month')::date;
  v_ultimo int;
  v_data1 date;
  v_data2 date;
  v_datas date[] := array[]::date[];
  v_data date;
  v_total int;
  v_i int;
begin
  select frequencia_pagamento, dia_pagamento, dia_pagamento_2, dia_semana_pagamento, ajustar_dia_util, feriados_pagamento, primeira_competencia_pagamento
    into v_freq, v_dia1, v_dia2, v_semana, v_ajustar, v_feriados, v_primeiro
  from public.funcionarios
  where id = p_funcionario_id
    and organization_id = public.current_org_id();

  if not found then
    raise exception 'Funcionário não encontrado nesta empresa';
  end if;

  if v_primeiro is not null and v_inicio < date_trunc('month',v_primeiro)::date then return; end if;

  v_ultimo := extract(day from (v_fim - interval '1 day'))::int;

  if v_freq = 'quinzenal' then
    v_dia1 := least(greatest(coalesce(v_dia1, 15), 1), greatest(v_ultimo - 1, 1));
    v_dia2 := least(greatest(coalesce(v_dia2, 30), v_dia1 + 1), v_ultimo);
    v_data1 := v_inicio + (v_dia1 - 1);
    v_data2 := v_inicio + (v_dia2 - 1);
    v_datas := array[v_data1, v_data2];
  elsif v_freq = 'semanal' then
    for v_data in
      select d::date
      from generate_series(v_inicio, v_fim - interval '1 day', interval '1 day') d
      where extract(dow from d)::int = coalesce(v_semana, 5)
      order by d
    loop
      v_datas := array_append(v_datas, v_data);
    end loop;
  else
    v_dia1 := least(greatest(coalesce(v_dia1, 5), 1), v_ultimo);
    v_datas := array[v_inicio + (v_dia1 - 1)];
  end if;

  v_total := coalesce(array_length(v_datas, 1), 0);
  if v_total = 0 then
    raise exception 'Não foi possível montar a agenda de pagamentos';
  end if;

  for v_i in 1..v_total loop
    competencia := v_inicio;
    data_pagamento := case when v_ajustar then public.proximo_dia_util_pagamento(v_datas[v_i],v_feriados) else v_datas[v_i] end;
    parcela_numero := v_i;
    total_parcelas := v_total;
    return next;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.resumo_financeiro_mes(p_competencia date DEFAULT CURRENT_DATE)
 RETURNS TABLE(vendas_contratadas numeric, receita_vendas numeric, receita_promissorias numeric, receita_servicos numeric, faturamento_recebido numeric, despesas_previstas numeric, despesas_pagas numeric, despesas_pendentes numeric, folha_prevista numeric, contas_receber numeric, resultado_projetado numeric, movimentacao_mes numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid := public.current_org_id();
  v_inicio date := date_trunc('month', coalesce(p_competencia,(now() at time zone 'America/Sao_Paulo')::date))::date;
  v_fim date := (date_trunc('month', coalesce(p_competencia,(now() at time zone 'America/Sao_Paulo')::date)) + interval '1 month')::date;
  v_vendas numeric := 0;
  v_receita_vendas numeric := 0;
  v_receita_prom numeric := 0;
  v_receita_serv numeric := 0;
  v_rec_prev numeric := 0;
  v_avulsa_prev numeric := 0;
  v_folha_prev numeric := 0;
  v_desp_pagas numeric := 0;
  v_rec_pendente numeric := 0;
  v_avulsa_pendente numeric := 0;
  v_folha_pendente numeric := 0;
  v_contas_receber numeric := 0;
begin
  select coalesce(sum(v.total),0)
    into v_vendas
    from public.vendas v
   where v.organization_id = v_org
     and v.status = 'concluida'
     and (v.created_at at time zone 'America/Sao_Paulo')::date >= v_inicio
     and (v.created_at at time zone 'America/Sao_Paulo')::date < v_fim;

  select coalesce(sum(
    case
      when v.forma_pagamento = 'promissoria' then 0
      when v.forma_pagamento = 'misto' then greatest(0, least(v.total, coalesce(v.valor_recebido,0)))
      else v.total
    end
  ),0)
    into v_receita_vendas
    from public.vendas v
   where v.organization_id = v_org
     and v.status = 'concluida'
     and (v.created_at at time zone 'America/Sao_Paulo')::date >= v_inicio
     and (v.created_at at time zone 'America/Sao_Paulo')::date < v_fim;

  select coalesce(sum(pp.valor),0)
    into v_receita_prom
    from public.promissoria_pagamentos pp
    join public.promissorias p on p.id = pp.promissoria_id
   where p.organization_id = v_org
     and pp.data >= v_inicio
     and pp.data < v_fim
     and p.status <> 'cancelado';

  select coalesce(sum(a.valor * coalesce(a.percentual_loja,0) / 100.0),0)
    into v_receita_serv
    from public.atendimentos_servico a
   where a.organization_id = v_org
     and a.data >= v_inicio
     and a.data < v_fim;

  select coalesce(sum(r.valor),0)
    into v_rec_prev
    from public.despesas_recorrentes r
   where r.organization_id = v_org
     and r.ativo = true;

  select coalesce(sum(d.valor),0)
    into v_avulsa_prev
    from public.despesas d
   where d.organization_id = v_org
     and d.despesa_recorrente_id is null
     and d.status <> 'cancelado'
     and date_trunc('month', coalesce(d.competencia, d.data_vencimento, d.data)::timestamp)::date = v_inicio;

  select coalesce(sum(f.salario_fixo),0)
       + coalesce((select sum(c.valor)
                     from public.comissoes_fechadas c
                    where c.organization_id=v_org
                      and c.competencia_pagamento=v_inicio),0)
    into v_folha_prev
    from public.funcionarios f
   where f.organization_id = v_org
     and f.ativo is not false
     and (f.primeira_competencia_pagamento is null or f.primeira_competencia_pagamento <= v_inicio);

  select coalesce(sum(d.valor),0)
    into v_desp_pagas
    from public.despesas d
   where d.organization_id = v_org
     and d.status = 'pago'
     and coalesce(d.data_pagamento,d.data) >= v_inicio
     and coalesce(d.data_pagamento,d.data) < v_fim;

  v_desp_pagas := v_desp_pagas
    + coalesce((select sum(p.valor_liquido)
                  from public.pagamentos_funcionario p
                 where p.organization_id=v_org
                   and p.data_pagamento>=v_inicio
                   and p.data_pagamento<v_fim),0)
    + coalesce((select sum(v.valor)
                  from public.vales v
                 where v.organization_id=v_org
                   and v.data>=v_inicio
                   and v.data<v_fim),0);

  select coalesce(sum(r.valor),0)
    into v_rec_pendente
    from public.despesas_recorrentes r
   where r.organization_id = v_org
     and r.ativo = true
     and not exists (
       select 1
         from public.despesas d
        where d.organization_id=v_org
          and d.despesa_recorrente_id=r.id
          and d.competencia=v_inicio
          and d.status='pago'
     );

  select coalesce(sum(d.valor),0)
    into v_avulsa_pendente
    from public.despesas d
   where d.organization_id=v_org
     and d.despesa_recorrente_id is null
     and d.status='pendente'
     and date_trunc('month', coalesce(d.competencia,d.data_vencimento,d.data)::timestamp)::date=v_inicio;

  v_folha_pendente := greatest(
    0,
    v_folha_prev
    - coalesce((select sum(p.valor_liquido)
                  from public.pagamentos_funcionario p
                 where p.organization_id=v_org
                   and p.periodo_inicio=v_inicio
                   and p.periodo_fim=(v_fim-1)),0)
    - coalesce((select sum(v.valor)
                  from public.vales v
                 where v.organization_id=v_org
                   and date_trunc('month',coalesce(v.competencia,v.data)::timestamp)::date=v_inicio),0)
  );

  select coalesce(sum(greatest(p.valor_total - coalesce(pg.pago,0),0)),0)
    into v_contas_receber
    from public.promissorias p
    left join (
      select promissoria_id,sum(valor) pago
        from public.promissoria_pagamentos
       group by promissoria_id
    ) pg on pg.promissoria_id=p.id
   where p.organization_id=v_org
     and p.status not in ('pago','quitada','cancelado');

  vendas_contratadas := v_vendas;
  receita_vendas := v_receita_vendas;
  receita_promissorias := v_receita_prom;
  receita_servicos := v_receita_serv;
  faturamento_recebido := v_receita_vendas + v_receita_prom + v_receita_serv;
  folha_prevista := v_folha_prev;
  despesas_previstas := v_rec_prev + v_avulsa_prev + v_folha_prev;
  despesas_pagas := v_desp_pagas;
  despesas_pendentes := v_rec_pendente + v_avulsa_pendente + v_folha_pendente;
  contas_receber := v_contas_receber;
  resultado_projetado := faturamento_recebido - despesas_previstas;
  movimentacao_mes := faturamento_recebido + despesas_pagas;
  return next;
end;
$function$;

-- Comissão imutável calculada sobre o fechamento financeiro real:
-- vendas integrais + serviços da loja - saídas efetivamente pagas. Sem custo unitário.
create or replace function public.fechar_comissoes_lucro_mes(p_competencia date)
returns integer language plpgsql security invoker set search_path=public as $$
declare
 v_inicio date:=date_trunc('month',p_competencia)::date;
 v_comp_pag date:=(date_trunc('month',p_competencia)+interval '1 month')::date;
 v_hoje date:=(now() at time zone 'America/Sao_Paulo')::date;
 v_fechamento public.fechamentos_financeiros%rowtype;
 v_func record; v_lucro numeric; v_inseridos int:=0;
begin
 if public.current_papel() not in ('owner','gerente','financeiro') then raise exception 'Sem permissão para fechar comissão'; end if;
 if v_inicio is null or v_inicio>=date_trunc('month',v_hoje)::date then raise exception 'A competência só pode ser fechada após o término do mês'; end if;
 select * into v_fechamento from public.fechamentos_financeiros
  where organization_id=public.current_org_id() and periodo_inicio=v_inicio and periodo_fim=(v_comp_pag-1);
 if not found then
  perform public.fechar_periodo_financeiro(v_inicio,v_comp_pag-1);
  select * into strict v_fechamento from public.fechamentos_financeiros
   where organization_id=public.current_org_id() and periodo_inicio=v_inicio and periodo_fim=(v_comp_pag-1);
 end if;
 v_lucro:=greatest(0,v_fechamento.vendas_brutas+v_fechamento.receita_servicos-v_fechamento.saidas_total);
 for v_func in select id,comissao_percentual from public.funcionarios
   where organization_id=public.current_org_id() and ativo and comissao_base='lucro_loja' and comissao_percentual>0
     and (primeira_competencia_pagamento is null or primeira_competencia_pagamento<=v_comp_pag)
 loop
  insert into public.comissoes_fechadas(funcionario_id,competencia_origem,competencia_pagamento,base_tipo,base_valor,percentual,valor)
   values(v_func.id,v_inicio,v_comp_pag,'lucro_loja',v_lucro,v_func.comissao_percentual,round(v_lucro*v_func.comissao_percentual/100,2))
   on conflict(organization_id,funcionario_id,competencia_origem) do nothing;
  if found then v_inseridos:=v_inseridos+1; end if;
 end loop;
 if v_inseridos>0 then
  perform public.log_auditoria('comissoes_lucro_fechadas','fechamentos_financeiros',v_fechamento.id,
   jsonb_build_object('competencia_origem',v_inicio,'competencia_pagamento',v_comp_pag,'base_lucro',v_lucro,'regra','Vendas integrais + serviços - despesas pagas','quantidade',v_inseridos));
 end if;
 return v_inseridos;
end $$;
revoke all on function public.fechar_comissoes_lucro_mes(date) from public,anon;
grant execute on function public.fechar_comissoes_lucro_mes(date) to authenticated;

