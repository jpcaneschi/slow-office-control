-- 0075 — Corrige regressão da agenda e padroniza datas comerciais em America/Sao_Paulo.
-- Aditiva em dados: não altera vendas, estoque, clientes, despesas ou pagamentos.

-- Preserva a implementação completa atual da agenda como base e cria uma camada
-- limpa para corrigir vendas por data local, folha zerada e status de atraso.
alter function public.agenda_operacao_mes(date)
  rename to agenda_operacao_mes_legacy_0075;

create function public.agenda_operacao_mes(p_competencia date default current_date)
returns table(
  id text,
  data date,
  tipo text,
  titulo text,
  detalhe text,
  valor numeric,
  status text,
  href text
)
language sql
stable
set search_path = public
as $$
with params as (
  select public.current_org_id() org,
         date_trunc('month',coalesce(p_competencia,(now() at time zone 'America/Sao_Paulo')::date))::date ini,
         (date_trunc('month',coalesce(p_competencia,(now() at time zone 'America/Sao_Paulo')::date))+interval '1 month')::date fim,
         (now() at time zone 'America/Sao_Paulo')::date hoje
),
vendas_locais as (
  select 'venda-'||v.id::text id,
         (v.created_at at time zone 'America/Sao_Paulo')::date data,
         case when v.forma_pagamento in ('promissoria','misto') then 'venda_prazo' else 'venda' end tipo,
         case when c.nome is not null then 'Venda • '||c.nome else 'Venda • '||coalesce(v.responsavel,'Sem responsável') end titulo,
         coalesce(
           string_agg(
             vi.quantidade::text||'x '||pr.nome||coalesce(' ['||pv.tamanho||']',''),
             ' · ' order by vi.created_at
           ),
           'Venda sem itens'
         )
         || case
              when v.forma_pagamento='promissoria' then ' · Promissória'
              when v.forma_pagamento='misto' then ' · Entrada + promissória'
              else ' · '||initcap(v.forma_pagamento)
            end detalhe,
         v.total valor,
         case when v.forma_pagamento in ('promissoria','misto') then 'a_receber' else 'recebido' end status,
         '/dashboard/vendas'::text href
    from public.vendas v
    join params x on x.org=v.organization_id
    left join public.clientes c on c.id=v.cliente_id
    left join public.venda_itens vi on vi.venda_id=v.id
    left join public.produtos pr on pr.id=vi.produto_id
    left join public.produto_variacoes pv on pv.id=vi.variacao_id
   where v.status='concluida'
     and (v.created_at at time zone 'America/Sao_Paulo')::date>=x.ini
     and (v.created_at at time zone 'America/Sao_Paulo')::date<x.fim
   group by v.id,c.nome
),
restante as (
  select a.id,
         a.data,
         a.tipo,
         a.titulo,
         a.detalhe,
         a.valor,
         case
           when a.status in ('pendente','atrasado') and a.data < x.hoje then 'atrasado'
           when a.status='atrasado' and a.data >= x.hoje then 'pendente'
           else a.status
         end status,
         a.href
    from params x
    cross join lateral public.agenda_operacao_mes_legacy_0075(x.ini) a
   where a.tipo not in ('venda','venda_prazo')
     and not (a.tipo='folha' and coalesce(a.valor,0)<=0.009)
)
select * from vendas_locais
union all
select * from restante
order by data,tipo,titulo;
$$;

revoke all on function public.agenda_operacao_mes(date) from public;
grant execute on function public.agenda_operacao_mes(date) to authenticated;

-- Períodos da Dashboard: data da venda sempre em horário comercial de São Paulo.
create or replace function public.resumo_operacao_periodo(
  p_inicio date,
  p_fim date
)
returns table(
  vendas_periodo numeric,
  entradas_vendas numeric,
  recebimentos_promissorias numeric,
  receita_servicos numeric,
  entradas_recebidas numeric,
  despesas_pagas numeric,
  movimentacao_periodo numeric
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_org uuid:=public.current_org_id();
  v_inicio date:=coalesce(p_inicio,(now() at time zone 'America/Sao_Paulo')::date);
  v_fim date:=coalesce(p_fim,coalesce(p_inicio,(now() at time zone 'America/Sao_Paulo')::date));
  v_entradas numeric:=0;
  v_prom numeric:=0;
  v_serv numeric:=0;
  v_desp numeric:=0;
begin
  if v_fim<v_inicio then
    raise exception 'A data final não pode ser anterior à data inicial';
  end if;

  select coalesce(sum(case
    when v.forma_pagamento='promissoria' then 0
    when v.forma_pagamento='misto' then greatest(0,least(v.total,coalesce(v.valor_recebido,0)))
    else v.total end),0)
    into v_entradas
    from public.vendas v
   where v.organization_id=v_org
     and v.status='concluida'
     and (v.created_at at time zone 'America/Sao_Paulo')::date between v_inicio and v_fim;

  select coalesce(sum(pp.valor),0)
    into v_prom
    from public.promissoria_pagamentos pp
    join public.promissorias p on p.id=pp.promissoria_id
   where p.organization_id=v_org
     and p.status<>'cancelado'
     and pp.data between v_inicio and v_fim;

  select coalesce(sum(a.valor*coalesce(a.percentual_loja,0)/100.0),0)
    into v_serv
    from public.atendimentos_servico a
   where a.organization_id=v_org
     and a.data between v_inicio and v_fim;

  select coalesce(sum(d.valor),0)
    into v_desp
    from public.despesas d
   where d.organization_id=v_org
     and d.status='pago'
     and coalesce(d.data_pagamento,d.data) between v_inicio and v_fim;

  v_desp:=v_desp
    +coalesce((select sum(p.valor_liquido)
                 from public.pagamentos_funcionario p
                where p.organization_id=v_org
                  and p.data_pagamento between v_inicio and v_fim),0)
    +coalesce((select sum(v.valor)
                 from public.vales v
                where v.organization_id=v_org
                  and v.data between v_inicio and v_fim),0);

  vendas_periodo:=v_entradas+v_prom;
  entradas_vendas:=v_entradas;
  recebimentos_promissorias:=v_prom;
  receita_servicos:=v_serv;
  entradas_recebidas:=v_entradas+v_prom+v_serv;
  despesas_pagas:=v_desp;
  movimentacao_periodo:=entradas_recebidas+despesas_pagas;
  return next;
end;
$$;

revoke all on function public.resumo_operacao_periodo(date,date) from public;
grant execute on function public.resumo_operacao_periodo(date,date) to authenticated;

-- Resumo mensal: mantém a regra financeira existente, corrigindo apenas o recorte
-- temporal das vendas para o horário local e tornando contas a receber robustas.
create or replace function public.resumo_financeiro_mes(p_competencia date default current_date)
returns table(
  vendas_contratadas numeric,
  receita_vendas numeric,
  receita_promissorias numeric,
  receita_servicos numeric,
  faturamento_recebido numeric,
  despesas_previstas numeric,
  despesas_pagas numeric,
  despesas_pendentes numeric,
  folha_prevista numeric,
  contas_receber numeric,
  resultado_projetado numeric,
  movimentacao_mes numeric
)
language plpgsql
stable
set search_path = public
as $$
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
     and f.ativo is not false;

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
$$;

revoke all on function public.resumo_financeiro_mes(date) from public;
grant execute on function public.resumo_financeiro_mes(date) to authenticated;

-- Fechamento da comissão respeita a virada do mês no horário da loja.
create or replace function public.fechar_comissoes_lucro_mes(p_competencia date)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_inicio date := date_trunc('month', p_competencia)::date;
  v_comp_pag date := (date_trunc('month', p_competencia) + interval '1 month')::date;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_lucro numeric := 0;
  v_func record;
  v_inseridos int := 0;
begin
  if public.current_papel() not in ('owner','gerente','financeiro') then
    raise exception 'Sem permissão para fechar comissão';
  end if;

  if v_inicio >= date_trunc('month',v_hoje)::date then
    raise exception 'A competência só pode ser fechada após o término do mês';
  end if;

  select greatest(0, coalesce(r.resultado_projetado, 0))
    into v_lucro
    from public.resumo_financeiro_mes(v_inicio) r;

  v_lucro := coalesce(v_lucro, 0);

  for v_func in
    select id, comissao_percentual
      from public.funcionarios
     where organization_id = public.current_org_id()
       and ativo
       and comissao_base = 'lucro_loja'
       and coalesce(comissao_percentual, 0) > 0
  loop
    insert into public.comissoes_fechadas(
      funcionario_id,
      competencia_origem,
      competencia_pagamento,
      base_tipo,
      base_valor,
      percentual,
      valor
    ) values (
      v_func.id,
      v_inicio,
      v_comp_pag,
      'lucro_loja',
      v_lucro,
      v_func.comissao_percentual,
      round(v_lucro * (v_func.comissao_percentual / 100.0), 2)
    ) on conflict (organization_id, funcionario_id, competencia_origem) do nothing;

    if found then v_inseridos := v_inseridos + 1; end if;
  end loop;

  return v_inseridos;
end;
$$;
