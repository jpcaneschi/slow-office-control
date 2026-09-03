-- Ranking de clientes por período. A função respeita a organização da sessão
-- e considera somente vendas concluídas vinculadas a um cliente.

create index if not exists vendas_org_cliente_concluida_created_idx
  on public.vendas (organization_id, cliente_id, created_at desc)
  where status = 'concluida' and cliente_id is not null;

create or replace function public.ranking_clientes_periodo(
  p_inicio date,
  p_fim date,
  p_limite integer default 200
)
returns table(
  cliente_id uuid,
  cliente_nome text,
  total_gasto numeric,
  compras bigint,
  ticket_medio numeric,
  ultima_compra date
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
  select
    c.id,
    c.nome,
    round(sum(v.total), 2)::numeric,
    count(v.id)::bigint,
    round(avg(v.total), 2)::numeric,
    max((v.created_at at time zone 'America/Sao_Paulo')::date)
  from public.clientes c
  join public.vendas v
    on v.cliente_id = c.id
   and v.organization_id = c.organization_id
  where c.organization_id = v_org
    and v.status = 'concluida'
    and v.created_at >= (p_inicio::timestamp at time zone 'America/Sao_Paulo')
    and v.created_at < ((p_fim + 1)::timestamp at time zone 'America/Sao_Paulo')
  group by c.id, c.nome
  order by sum(v.total) desc, count(v.id) desc, c.nome
  limit least(greatest(coalesce(p_limite, 200), 1), 200);
end;
$$;

revoke all on function public.ranking_clientes_periodo(date,date,integer) from public, anon;
grant execute on function public.ranking_clientes_periodo(date,date,integer) to authenticated;
