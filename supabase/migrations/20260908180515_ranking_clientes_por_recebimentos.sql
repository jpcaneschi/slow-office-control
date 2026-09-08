-- Ranking de clientes pelo caixa efetivamente recebido no período.
-- Vendas em promissória só entram conforme os pagamentos registrados, evitando
-- que o valor total financiado antecipe a posição do cliente no ranking.

create index if not exists vendas_org_created_cliente_concluida_idx
  on public.vendas (organization_id, created_at, cliente_id)
  where status = 'concluida' and cliente_id is not null;

create index if not exists promissoria_pagamentos_org_data_prom_idx
  on public.promissoria_pagamentos (organization_id, data, promissoria_id);

create or replace function public.ranking_clientes_recebimentos_periodo(
  p_inicio date,
  p_fim date,
  p_limite integer default 200
)
returns table(
  cliente_id uuid,
  cliente_nome text,
  recebido_vendas numeric,
  recebido_promissorias numeric,
  total_recebido numeric,
  ultimo_recebimento date
)
language plpgsql
security invoker
stable
set search_path = public
as $$
declare
  v_org uuid := public.current_org_id();
begin
  if v_org is null then
    raise exception 'Empresa não identificada';
  end if;
  if public.current_papel() not in ('owner','gerente','caixa','financeiro') then
    raise exception 'Sem permissão para visualizar o ranking de clientes';
  end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio then
    raise exception 'Período inválido';
  end if;
  if p_fim - p_inicio > 3660 then
    raise exception 'O período máximo é de dez anos';
  end if;

  return query
  with recebimentos as (
    select
      v.cliente_id as recebimento_cliente_id,
      case
        when v.forma_pagamento = 'promissoria' then 0::numeric
        when v.forma_pagamento = 'misto'
          then greatest(0, least(v.total, coalesce(v.valor_recebido, 0)))
        else v.total
      end::numeric as valor_venda,
      0::numeric as valor_promissoria,
      (v.created_at at time zone 'America/Sao_Paulo')::date as data_recebimento
    from public.vendas v
    where v.organization_id = v_org
      and v.status = 'concluida'
      and v.cliente_id is not null
      and v.created_at >= (p_inicio::timestamp at time zone 'America/Sao_Paulo')
      and v.created_at < ((p_fim + 1)::timestamp at time zone 'America/Sao_Paulo')

    union all

    select
      p.cliente_id as recebimento_cliente_id,
      0::numeric as valor_venda,
      pp.valor::numeric as valor_promissoria,
      pp.data as data_recebimento
    from public.promissoria_pagamentos pp
    join public.promissorias p
      on p.id = pp.promissoria_id
     and p.organization_id = pp.organization_id
    where pp.organization_id = v_org
      and p.organization_id = v_org
      and p.status <> 'cancelado'
      and p.cliente_id is not null
      and pp.data between p_inicio and p_fim
  ), consolidados as (
    select
      r.recebimento_cliente_id,
      round(sum(r.valor_venda), 2)::numeric as soma_vendas,
      round(sum(r.valor_promissoria), 2)::numeric as soma_promissorias,
      round(sum(r.valor_venda + r.valor_promissoria), 2)::numeric as soma_total,
      max(r.data_recebimento) as data_ultimo_recebimento
    from recebimentos r
    where r.valor_venda + r.valor_promissoria > 0
    group by r.recebimento_cliente_id
  )
  select
    c.id,
    c.nome,
    cr.soma_vendas,
    cr.soma_promissorias,
    cr.soma_total,
    cr.data_ultimo_recebimento
  from consolidados cr
  join public.clientes c
    on c.id = cr.recebimento_cliente_id
   and c.organization_id = v_org
  order by cr.soma_total desc, c.nome
  limit least(greatest(coalesce(p_limite, 200), 1), 200);
end;
$$;

revoke all on function public.ranking_clientes_recebimentos_periodo(date,date,integer)
  from public, anon;
grant execute on function public.ranking_clientes_recebimentos_periodo(date,date,integer)
  to authenticated;
