-- 0072 — Dashboard/Agenda alinhados ao recebimento real de promissórias e ganhos de serviços.

create or replace function public.resumo_operacao_periodo(p_inicio date,p_fim date)
returns table(
  vendas_periodo numeric,
  entradas_vendas numeric,
  recebimentos_promissorias numeric,
  receita_servicos numeric,
  entradas_recebidas numeric,
  despesas_pagas numeric,
  movimentacao_periodo numeric
)
language plpgsql stable set search_path=public
as $$
declare
  v_org uuid:=public.current_org_id();
  v_inicio date:=coalesce(p_inicio,current_date);
  v_fim date:=coalesce(p_fim,coalesce(p_inicio,current_date));
  v_fx date;
  v_entradas numeric:=0;
  v_prom numeric:=0;
  v_serv numeric:=0;
  v_desp numeric:=0;
begin
  if v_fim<v_inicio then raise exception 'A data final não pode ser anterior à data inicial'; end if;
  v_fx:=v_fim+1;

  select coalesce(sum(case
    when v.forma_pagamento='promissoria' then 0
    when v.forma_pagamento='misto' then greatest(0,least(v.total,coalesce(v.valor_recebido,0)))
    else v.total end),0)
    into v_entradas
    from public.vendas v
   where v.organization_id=v_org and v.status='concluida'
     and v.created_at>=v_inicio::timestamptz and v.created_at<v_fx::timestamptz;

  select coalesce(sum(pp.valor),0) into v_prom
    from public.promissoria_pagamentos pp
    join public.promissorias p on p.id=pp.promissoria_id
   where p.organization_id=v_org and p.status<>'cancelado'
     and pp.data>=v_inicio and pp.data<v_fx;

  select coalesce(sum(a.valor*coalesce(a.percentual_loja,0)/100.0),0) into v_serv
    from public.atendimentos_servico a
   where a.organization_id=v_org and a.data>=v_inicio and a.data<v_fx;

  select coalesce(sum(d.valor),0) into v_desp
    from public.despesas d
   where d.organization_id=v_org and d.status='pago'
     and coalesce(d.data_pagamento,d.data)>=v_inicio
     and coalesce(d.data_pagamento,d.data)<v_fx;

  v_desp:=v_desp
    +coalesce((select sum(p.valor_liquido) from public.pagamentos_funcionario p where p.organization_id=v_org and p.data_pagamento>=v_inicio and p.data_pagamento<v_fx),0)
    +coalesce((select sum(v.valor) from public.vales v where v.organization_id=v_org and v.data>=v_inicio and v.data<v_fx),0);

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

create or replace function public.agenda_promissorias_mes(p_competencia date default current_date)
returns table(id text,data date,tipo text,titulo text,detalhe text,valor numeric,status text,href text)
language sql security invoker stable set search_path=public
as $$
with x as (
  select public.current_org_id() org,
         date_trunc('month',coalesce(p_competencia,current_date))::date ini,
         (date_trunc('month',coalesce(p_competencia,current_date))+interval '1 month')::date fim
), b as (
  select p.id,p.parcelas,p.status,c.nome cliente,
         coalesce(p.data_primeira_parcela,p.data_vencimento) primeira,
         greatest(p.valor_total-coalesce(p.entrada_valor,0),0) saldo_inicial,
         coalesce((select sum(pp.valor) from public.promissoria_pagamentos pp where pp.promissoria_id=p.id and pp.tipo='parcela'),0) pago_parcelas,
         coalesce((select string_agg(pi.quantidade::text||'x '||pr.nome,' · ' order by pi.created_at)
                     from public.promissoria_itens pi join public.produtos pr on pr.id=pi.produto_id
                    where pi.promissoria_id=p.id),'Sem produto vinculado') produtos
    from public.promissorias p
    join x on x.org=p.organization_id
    left join public.clientes c on c.id=p.cliente_id
   where p.status<>'cancelado' and coalesce(p.data_primeira_parcela,p.data_vencimento) is not null
), ps as (
  select b.*,g.n,
         (date_trunc('month',b.primeira::timestamp+(g.n-1)*interval '1 month')
          +(least(extract(day from b.primeira)::int,
                  extract(day from(date_trunc('month',b.primeira::timestamp+(g.n-1)*interval '1 month')+interval '1 month - 1 day'))::int)-1)*interval '1 day')::date venc,
         (floor(b.saldo_inicial*100/b.parcelas)
          +case when g.n<=mod(round(b.saldo_inicial*100)::int,b.parcelas) then 1 else 0 end)/100.0 parcela_valor
    from b cross join lateral generate_series(1,b.parcelas) g(n)
), pc as (
  select ps.*,
         coalesce(sum(parcela_valor) over(partition by id order by n rows between unbounded preceding and 1 preceding),0) anteriores
    from ps
)
select 'prom-'||id::text||'-'||n::text,
       venc,
       'promissoria',
       coalesce(cliente,'Cliente')||' • parcela '||n||'/'||parcelas,
       produtos||' · a receber',
       greatest(parcela_valor-least(parcela_valor,greatest(pago_parcelas-anteriores,0)),0),
       case
         when greatest(parcela_valor-least(parcela_valor,greatest(pago_parcelas-anteriores,0)),0)<=0.009 then 'pago'
         when greatest(pago_parcelas-anteriores,0)>0 then 'parcial'
         when venc<current_date then 'atrasado'
         else 'pendente'
       end,
       '/dashboard/promissorias'
  from pc join x on venc>=x.ini and venc<x.fim;
$$;

revoke all on function public.agenda_promissorias_mes(date) from public;
grant execute on function public.agenda_promissorias_mes(date) to authenticated;

create or replace function public.agenda_operacao_mes(p_competencia date default current_date)
returns table(id text,data date,tipo text,titulo text,detalhe text,valor numeric,status text,href text)
language sql security invoker stable set search_path=public
as $$
with params as (
  select public.current_org_id() org,
         date_trunc('month',coalesce(p_competencia,current_date))::date ini,
         (date_trunc('month',coalesce(p_competencia,current_date))+interval '1 month')::date fim
),
vendas_mes as (
  select 'venda-'||v.id::text id,v.created_at::date data,
         case when v.forma_pagamento in ('promissoria','misto') then 'venda_prazo' else 'venda' end tipo,
         case when c.nome is not null then 'Venda • '||c.nome else 'Venda • '||coalesce(v.responsavel,'Sem responsável') end titulo,
         coalesce(string_agg(vi.quantidade::text||'x '||pr.nome||coalesce(' ['||pv.tamanho||']',''),' · ' order by vi.created_at),'Venda sem itens')
           ||case when v.forma_pagamento='promissoria' then ' · Promissória'
                  when v.forma_pagamento='misto' then ' · Entrada + promissória'
                  else ' · '||initcap(v.forma_pagamento) end detalhe,
         v.total valor,
         case when v.forma_pagamento in ('promissoria','misto') then 'a_receber' else 'recebido' end status,
         '/dashboard/vendas'::text href
    from public.vendas v
    join params x on x.org=v.organization_id
    left join public.clientes c on c.id=v.cliente_id
    left join public.venda_itens vi on vi.venda_id=v.id
    left join public.produtos pr on pr.id=vi.produto_id
    left join public.produto_variacoes pv on pv.id=vi.variacao_id
   where v.status='concluida' and v.created_at>=x.ini and v.created_at<x.fim
   group by v.id,c.nome
),
servicos_mes as (
  select 'serv-'||a.id::text id,a.data,'servico'::text tipo,
         'Serviço • '||coalesce(a.descricao,'Atendimento') titulo,
         coalesce(a.profissional_nome,'Profissional não informado')||' · '||trim(to_char(coalesce(a.percentual_loja,0),'FM999990D00'))||'% para a loja' detalhe,
         round(a.valor*coalesce(a.percentual_loja,0)/100.0,2) valor,
         'recebido'::text status,'/dashboard/servicos'::text href
    from public.atendimentos_servico a
    join params x on x.org=a.organization_id
   where a.data>=x.ini and a.data<x.fim
),
despesas_mes as (
  select 'desp-'||d.id::text id,
         case when d.status='pago' then coalesce(d.data_pagamento,d.data) else coalesce(d.data_vencimento,d.data) end data,
         case when lower(d.categoria) like '%mercadoria%' or lower(d.descricao) like '%compra%' then 'compra' else 'despesa' end tipo,
         d.descricao titulo,d.categoria||case when d.status='pago' then ' · pago' else ' · pendente' end detalhe,
         d.valor,d.status,'/dashboard/financeiro'::text href
    from public.despesas d
    join params x on x.org=d.organization_id
   where d.status<>'cancelado'
     and date_trunc('month',coalesce(d.competencia,d.data_vencimento,d.data)::timestamp)::date=x.ini
),
recorrentes_pendentes as (
  select 'rec-'||r.id::text||'-'||x.ini::text id,
         (x.ini+(least(greatest(r.dia_vencimento,1),extract(day from(x.fim-1))::int)-1)*interval '1 day')::date data,
         'conta'::text tipo,r.descricao titulo,r.categoria||' · conta recorrente' detalhe,r.valor,
         'pendente'::text status,'/dashboard/financeiro'::text href
    from public.despesas_recorrentes r
    join params x on x.org=r.organization_id
   where r.ativo=true
     and not exists(select 1 from public.despesas d where d.organization_id=x.org and d.despesa_recorrente_id=r.id and d.competencia=x.ini and d.status<>'cancelado')
),
folha_base as (
  select f.id funcionario_id,f.nome,f.salario_fixo,a.data_pagamento,a.parcela_numero,a.total_parcelas,x.ini,
         case when a.parcela_numero<a.total_parcelas then floor(f.salario_fixo*100/a.total_parcelas)/100
              else f.salario_fixo-(floor(f.salario_fixo*100/a.total_parcelas)/100)*(a.total_parcelas-1) end
         +case when a.parcela_numero<a.total_parcelas then
             floor(coalesce((select sum(c.valor) from public.comissoes_fechadas c where c.organization_id=x.org and c.funcionario_id=f.id and c.competencia_pagamento=x.ini),0)*100/a.total_parcelas)/100
           else coalesce((select sum(c.valor) from public.comissoes_fechadas c where c.organization_id=x.org and c.funcionario_id=f.id and c.competencia_pagamento=x.ini),0)
             -(floor(coalesce((select sum(c.valor) from public.comissoes_fechadas c where c.organization_id=x.org and c.funcionario_id=f.id and c.competencia_pagamento=x.ini),0)*100/a.total_parcelas)/100)*(a.total_parcelas-1) end
         -coalesce((select sum(vd.valor) from public.vale_descontos vd where vd.organization_id=x.org and vd.funcionario_id=f.id and vd.competencia=x.ini and vd.parcela_pagamento=a.parcela_numero and vd.status<>'cancelado'),0) base_valor
    from public.funcionarios f
    join params x on x.org=f.organization_id
    cross join lateral public.agenda_pagamentos_funcionario(f.id,x.ini) a
   where f.ativo is not false
),
folha_calc as (
  select b.*,pg.id pagamento_id,pg.valor_liquido pago,pg.data_pagamento data_real,
         coalesce(sum(case when pg.id is not null then b.base_valor-pg.valor_liquido else 0 end)
           over(partition by b.funcionario_id order by b.parcela_numero rows between unbounded preceding and 1 preceding),0) ajuste_anterior
    from folha_base b
    left join public.pagamentos_funcionario pg
      on pg.funcionario_id=b.funcionario_id and pg.organization_id=public.current_org_id()
     and pg.periodo_inicio=b.ini and pg.parcela_numero=b.parcela_numero
),
folha_mes as (
  select 'folha-'||funcionario_id::text||'-'||parcela_numero::text||'-'||ini::text id,
         coalesce(data_real,data_pagamento) data,'folha'::text tipo,
         nome||' • pagamento '||parcela_numero||'/'||total_parcelas titulo,
         case when pagamento_id is not null then 'Pago em '||to_char(data_real,'DD/MM/YYYY') else 'Pagamento previsto' end detalhe,
         case when pagamento_id is not null then pago else greatest(base_valor+ajuste_anterior,0) end valor,
         case when pagamento_id is not null then 'pago' when data_pagamento<current_date then 'atrasado' else 'pendente' end status,
         '/dashboard/funcionarios'::text href
    from folha_calc
),
prom_mes as (
  select ap.* from params x cross join lateral public.agenda_promissorias_mes(x.ini) ap
),
recebimentos_prom as (
  select 'recprom-'||pp.id::text id,pp.data,'recebimento'::text tipo,
         'Recebido • '||coalesce(c.nome,'Cliente') titulo,
         case when pp.tipo='entrada' then 'Entrada de promissória' else 'Pagamento de promissória' end detalhe,
         pp.valor,'recebido'::text status,'/dashboard/promissorias'::text href
    from public.promissoria_pagamentos pp
    join public.promissorias p on p.id=pp.promissoria_id
    join params x on x.org=p.organization_id
    left join public.clientes c on c.id=p.cliente_id
   where pp.data>=x.ini and pp.data<x.fim and p.status<>'cancelado'
),
condicionais_mes as (
  select 'cond-'||c.id::text id,c.data_limite data,'condicional'::text tipo,
         'Retorno de condicional' titulo,'Prazo de devolução' detalhe,null::numeric valor,
         'pendente'::text status,'/dashboard/condicional'::text href
    from public.condicionais c
    join params x on x.org=c.organization_id
   where c.status='aberto' and c.data_limite>=x.ini and c.data_limite<x.fim
)
select * from vendas_mes
union all select * from servicos_mes
union all select * from despesas_mes
union all select * from recorrentes_pendentes
union all select * from folha_mes
union all select * from prom_mes
union all select * from recebimentos_prom
union all select * from condicionais_mes
order by data,tipo,titulo;
$$;

revoke all on function public.agenda_operacao_mes(date) from public;
grant execute on function public.agenda_operacao_mes(date) to authenticated;
