-- Bonificação sobre lucro: valor oficial do mês anterior é distribuído entre
-- todos os pagamentos do mês seguinte, junto com o salário. Vales continuam
-- descontos independentes na(s) parcela(s) programada(s).

create or replace function public.agenda_operacao_mes(p_competencia date default current_date)
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
security invoker
stable
set search_path = public
as $$
with params as (
  select public.current_org_id() org,
         date_trunc('month',coalesce(p_competencia,current_date))::date ini,
         (date_trunc('month',coalesce(p_competencia,current_date))+interval '1 month')::date fim
),
vendas_mes as (
  select 'venda-'||v.id::text id,
         v.created_at::date data,
         case when v.forma_pagamento in ('promissoria','misto') then 'venda_prazo' else 'venda' end tipo,
         case
           when c.nome is not null then 'Venda • '||c.nome
           else 'Venda • '||coalesce(v.responsavel,'Sem responsável')
         end titulo,
         coalesce(string_agg(vi.quantidade::text||'x '||pr.nome||coalesce(' ['||pv.tamanho||']',''), ' · ' order by vi.created_at),'Venda sem itens')
           || case when v.forma_pagamento='promissoria' then ' · Promissória'
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
despesas_mes as (
  select 'desp-'||d.id::text id,
         case when d.status='pago' then coalesce(d.data_pagamento,d.data) else coalesce(d.data_vencimento,d.data) end data,
         case when lower(d.categoria) like '%mercadoria%' or lower(d.descricao) like '%compra%' then 'compra' else 'despesa' end tipo,
         d.descricao titulo,
         d.categoria||case when d.status='pago' then ' · pago' else ' · pendente' end detalhe,
         d.valor,
         d.status,
         '/dashboard/financeiro'::text href
    from public.despesas d
    join params x on x.org=d.organization_id
   where d.status<>'cancelado'
     and date_trunc('month',coalesce(d.competencia,d.data_vencimento,d.data)::timestamp)::date=x.ini
),
recorrentes_pendentes as (
  select 'rec-'||r.id::text||'-'||x.ini::text id,
         (x.ini + (least(greatest(r.dia_vencimento,1),extract(day from (x.fim-1))::int)-1)*interval '1 day')::date data,
         'conta'::text tipo,
         r.descricao titulo,
         r.categoria||' · conta recorrente' detalhe,
         r.valor,
         'pendente'::text status,
         '/dashboard/financeiro'::text href
    from public.despesas_recorrentes r
    join params x on x.org=r.organization_id
   where r.ativo=true
     and not exists (
       select 1 from public.despesas d
        where d.organization_id=x.org and d.despesa_recorrente_id=r.id and d.competencia=x.ini and d.status<>'cancelado'
     )
),
folha_base as (
  select f.id funcionario_id,f.nome,f.salario_fixo,a.data_pagamento,a.parcela_numero,a.total_parcelas,x.ini,
         case
           when a.parcela_numero<a.total_parcelas then floor(f.salario_fixo*100/a.total_parcelas)/100
           else f.salario_fixo-(floor(f.salario_fixo*100/a.total_parcelas)/100)*(a.total_parcelas-1)
         end
         + case
             when a.parcela_numero<a.total_parcelas then
               floor(coalesce((select sum(c.valor) from public.comissoes_fechadas c where c.organization_id=x.org and c.funcionario_id=f.id and c.competencia_pagamento=x.ini),0)*100/a.total_parcelas)/100
             else
               coalesce((select sum(c.valor) from public.comissoes_fechadas c where c.organization_id=x.org and c.funcionario_id=f.id and c.competencia_pagamento=x.ini),0)
               - (floor(coalesce((select sum(c.valor) from public.comissoes_fechadas c where c.organization_id=x.org and c.funcionario_id=f.id and c.competencia_pagamento=x.ini),0)*100/a.total_parcelas)/100)*(a.total_parcelas-1)
           end
         - coalesce((select sum(vd.valor) from public.vale_descontos vd where vd.organization_id=x.org and vd.funcionario_id=f.id and vd.competencia=x.ini and vd.parcela_pagamento=a.parcela_numero and vd.status<>'cancelado'),0) base_valor
    from public.funcionarios f
    join params x on x.org=f.organization_id
    cross join lateral public.agenda_pagamentos_funcionario(f.id,x.ini) a
   where f.ativo is not false
),
folha_calc as (
  select b.*,
         pg.id pagamento_id,pg.valor_liquido pago,pg.data_pagamento data_real,
         coalesce(sum(case when pg.id is not null then b.base_valor-pg.valor_liquido else 0 end)
           over(partition by b.funcionario_id order by b.parcela_numero rows between unbounded preceding and 1 preceding),0) ajuste_anterior
    from folha_base b
    left join public.pagamentos_funcionario pg
      on pg.funcionario_id=b.funcionario_id and pg.organization_id=public.current_org_id()
     and pg.periodo_inicio=b.ini and pg.parcela_numero=b.parcela_numero
),
folha_mes as (
  select 'folha-'||funcionario_id::text||'-'||parcela_numero::text||'-'||ini::text id,
         coalesce(data_real,data_pagamento) data,
         'folha'::text tipo,
         nome||' • pagamento '||parcela_numero||'/'||total_parcelas titulo,
         case when pagamento_id is not null then 'Pago em '||to_char(data_real,'DD/MM/YYYY') else 'Pagamento previsto' end detalhe,
         case when pagamento_id is not null then pago else greatest(base_valor+ajuste_anterior,0) end valor,
         case when pagamento_id is not null then 'pago' when data_pagamento<current_date then 'atrasado' else 'pendente' end status,
         '/dashboard/funcionarios'::text href
    from folha_calc
),
prom_base as (
  select p.id,p.valor_total,p.parcelas,p.status,p.cliente_id,c.nome cliente,
         coalesce(p.data_primeira_parcela,p.data_vencimento) primeira,
         coalesce((select sum(pp.valor) from public.promissoria_pagamentos pp where pp.promissoria_id=p.id),0) total_pago
    from public.promissorias p
    join params x on x.org=p.organization_id
    left join public.clientes c on c.id=p.cliente_id
   where p.status<>'cancelado' and coalesce(p.data_primeira_parcela,p.data_vencimento) is not null
),
prom_parcelas as (
  select b.*,g.n,
         (
           date_trunc('month', b.primeira::timestamp + (g.n-1)*interval '1 month')
           + (least(extract(day from b.primeira)::int,
                    extract(day from (date_trunc('month',b.primeira::timestamp+(g.n-1)*interval '1 month')+interval '1 month - 1 day'))::int)-1)*interval '1 day'
         )::date venc,
         (floor(b.valor_total*100/b.parcelas)
          + case when g.n <= mod(round(b.valor_total*100)::int,b.parcelas) then 1 else 0 end)/100.0 parcela_valor
    from prom_base b
    cross join lateral generate_series(1,b.parcelas) g(n)
),
prom_calc as (
  select p.*,
         coalesce(sum(parcela_valor) over(partition by id order by n rows between unbounded preceding and 1 preceding),0) anteriores
    from prom_parcelas p
),
prom_mes as (
  select 'prom-'||id::text||'-'||n::text id,
         venc data,
         'promissoria'::text tipo,
         coalesce(cliente,'Cliente')||' • parcela '||n||'/'||parcelas titulo,
         'Promissória · a receber' detalhe,
         greatest(parcela_valor-least(parcela_valor,greatest(total_pago-anteriores,0)),0) valor,
         case
           when greatest(parcela_valor-least(parcela_valor,greatest(total_pago-anteriores,0)),0)<=0.009 then 'pago'
           when greatest(total_pago-anteriores,0)>0 then 'parcial'
           when venc<current_date then 'atrasado'
           else 'pendente'
         end status,
         '/dashboard/promissorias'::text href
    from prom_calc p
    join params x on venc>=x.ini and venc<x.fim
),
recebimentos_prom as (
  select 'recprom-'||pp.id::text id,pp.data,'recebimento'::text tipo,
         'Recebido • '||coalesce(c.nome,'Cliente') titulo,
         'Pagamento de promissória' detalhe,pp.valor,'recebido'::text status,'/dashboard/promissorias'::text href
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
