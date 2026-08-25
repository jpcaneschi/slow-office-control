-- 0062_financeiro_recebido_e_agenda_operacao.sql
-- Modelo financeiro simples para a operação: venda/recebimento de um lado,
-- despesas pagas/pendentes do outro. Compra de estoque entra UMA vez como
-- despesa e o custo do item vendido não volta a ser descontado no Financeiro.

alter table public.despesas
  add column if not exists status text not null default 'pago',
  add column if not exists data_vencimento date,
  add column if not exists data_pagamento date;

update public.despesas
set data_vencimento = coalesce(data_vencimento, data),
    data_pagamento = case when status = 'pago' then coalesce(data_pagamento, data) else data_pagamento end
where data_vencimento is null
   or (status = 'pago' and data_pagamento is null);

do $$ begin
  alter table public.despesas add constraint despesas_status_check
    check (status in ('pendente','pago','cancelado'));
exception when duplicate_object then null; end $$;

create index if not exists despesas_org_status_vencimento_idx
  on public.despesas(organization_id, status, data_vencimento);

create or replace function public.marcar_despesa_paga(
  p_despesa_id uuid,
  p_data_pagamento date default current_date
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.despesas
     set status = 'pago',
         data_pagamento = coalesce(p_data_pagamento, current_date)
   where id = p_despesa_id
     and organization_id = public.current_org_id()
     and status <> 'cancelado'
  returning id into v_id;

  if v_id is null then
    raise exception 'Despesa não encontrada nesta empresa';
  end if;
  return v_id;
end;
$$;

revoke all on function public.marcar_despesa_paga(uuid,date) from public;
grant execute on function public.marcar_despesa_paga(uuid,date) to authenticated;

-- Mantém a RPC existente, mas passa a registrar vencimento e pagamento real.
create or replace function public.lancar_despesa_recorrente(
  p_recorrente_id uuid,
  p_competencia date default current_date
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_rec record;
  v_mes date;
  v_ultimo_dia int;
  v_vencimento date;
  v_id uuid;
begin
  select * into v_rec
    from public.despesas_recorrentes
   where id = p_recorrente_id
     and organization_id = public.current_org_id()
     and ativo = true;

  if not found then
    raise exception 'Conta recorrente não encontrada ou inativa';
  end if;

  v_mes := date_trunc('month', coalesce(p_competencia, current_date))::date;
  v_ultimo_dia := extract(day from (v_mes + interval '1 month - 1 day'))::int;
  v_vencimento := (
    v_mes + (least(greatest(coalesce(v_rec.dia_vencimento, 1), 1), v_ultimo_dia) - 1) * interval '1 day'
  )::date;

  insert into public.despesas (
    organization_id, user_id, despesa_recorrente_id, competencia,
    descricao, categoria, valor, data, data_vencimento, data_pagamento,
    status, responsavel, observacao
  ) values (
    v_rec.organization_id, auth.uid(), v_rec.id, v_mes,
    v_rec.descricao, v_rec.categoria, v_rec.valor, v_vencimento,
    v_vencimento, current_date, 'pago', null, 'Conta recorrente'
  )
  on conflict (despesa_recorrente_id, competencia)
    where despesa_recorrente_id is not null and competencia is not null
  do update set
    status = 'pago',
    data_pagamento = current_date,
    data_vencimento = excluded.data_vencimento,
    valor = excluded.valor,
    descricao = excluded.descricao,
    categoria = excluded.categoria
  returning id into v_id;

  return v_id;
end;
$$;

-- Fonte única do resumo mensal usado por Dashboard e Financeiro.
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
security invoker
stable
set search_path = public
as $$
declare
  v_org uuid := public.current_org_id();
  v_inicio date := date_trunc('month', coalesce(p_competencia, current_date))::date;
  v_fim date := (date_trunc('month', coalesce(p_competencia, current_date)) + interval '1 month')::date;
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
     and v.created_at >= v_inicio
     and v.created_at < v_fim;

  -- À vista/cartão/pix/dinheiro entram no mês da venda. No misto entra só a
  -- entrada; promissória inteira não entra até o cliente efetivamente pagar.
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
     and v.created_at >= v_inicio
     and v.created_at < v_fim;

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
       + coalesce((select sum(c.valor) from public.comissoes_fechadas c
                    where c.organization_id=v_org and c.competencia_pagamento=v_inicio),0)
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
    + coalesce((select sum(p.valor_liquido) from public.pagamentos_funcionario p
                 where p.organization_id=v_org
                   and p.data_pagamento>=v_inicio and p.data_pagamento<v_fim),0)
    + coalesce((select sum(v.valor) from public.vales v
                 where v.organization_id=v_org
                   and v.data>=v_inicio and v.data<v_fim),0);

  select coalesce(sum(r.valor),0)
    into v_rec_pendente
    from public.despesas_recorrentes r
   where r.organization_id = v_org
     and r.ativo = true
     and not exists (
       select 1 from public.despesas d
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
    - coalesce((select sum(p.valor_liquido) from public.pagamentos_funcionario p
                 where p.organization_id=v_org and p.periodo_inicio=v_inicio and p.periodo_fim=(v_fim-1)),0)
    - coalesce((select sum(v.valor) from public.vales v
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
     and p.status not in ('pago','cancelado');

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

-- Agenda automática compartilhada entre a tela Agenda e o calendário da Home.
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
         + case when a.parcela_numero=a.total_parcelas then coalesce((select sum(c.valor) from public.comissoes_fechadas c where c.organization_id=x.org and c.funcionario_id=f.id and c.competencia_pagamento=x.ini),0) else 0 end
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
