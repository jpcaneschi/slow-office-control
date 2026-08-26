-- A venda já aparece via venda_itens. Na timeline, não repetimos a baixa de
-- estoque gerada pela mesma venda/condicional; mantemos entradas, ajustes,
-- devoluções, cancelamentos e retornos de condicional.
create or replace function public.timeline_produto(p_produto_id uuid)
returns table(
  id text,
  data timestamptz,
  tipo text,
  titulo text,
  detalhe text,
  valor numeric,
  quantidade numeric,
  href text
)
language sql
stable
security invoker
set search_path = public
as $$
  with cfg as (select public.current_org_id() as org), eventos as (
    select
      'mov:' || m.id::text as id,
      m.created_at as data,
      'estoque'::text as tipo,
      case m.tipo
        when 'entrada' then 'Entrada no estoque'
        when 'cancelamento' then 'Estoque devolvido por cancelamento'
        when 'devolucao' then 'Devolução ao estoque'
        when 'retorno_condicional' then 'Retorno de condicional'
        when 'estoque_inicial' then 'Estoque inicial'
        when 'importacao' then 'Entrada por importação'
        when 'ajuste_positivo' then 'Ajuste positivo de estoque'
        when 'saida' then 'Saída manual de estoque'
        else 'Movimentação de estoque'
      end as titulo,
      concat_ws(' · ', nullif(m.motivo,''), nullif(m.observacao,'')) as detalhe,
      null::numeric as valor,
      coalesce(m.quantidade,0)::numeric as quantidade,
      case
        when m.referencia_id is not null and m.tipo in ('cancelamento','devolucao')
          then '/dashboard/vendas/' || m.referencia_id::text
        else '/dashboard/produtos/' || p_produto_id::text
      end as href
    from public.estoque_movimentacoes m, cfg
    where m.organization_id = cfg.org
      and m.produto_id = p_produto_id
      and m.tipo not in ('venda','condicional')

    union all

    select
      'itemvenda:' || vi.id::text,
      v.created_at,
      case when v.status = 'cancelada' then 'cancelamento' else 'venda' end,
      case when v.status = 'cancelada' then 'Venda cancelada' else 'Produto vendido' end,
      concat_ws(' · ', nullif(v.responsavel,''), nullif(v.forma_pagamento,''), v.status),
      coalesce(vi.total_item, vi.preco_unitario * vi.quantidade),
      coalesce(vi.quantidade,0)::numeric,
      '/dashboard/vendas/' || v.id::text
    from public.venda_itens vi
    join public.vendas v on v.id = vi.venda_id and v.organization_id = vi.organization_id
    cross join cfg
    where vi.organization_id = cfg.org and vi.produto_id = p_produto_id

    union all

    select
      'itemcond:' || ci.id::text,
      c.created_at,
      'condicional',
      'Produto enviado em condicional',
      concat_ws(' · ', nullif(c.responsavel,''), c.status, case when c.data_limite is not null then 'retorno até ' || to_char(c.data_limite,'DD/MM/YYYY') else null end),
      coalesce(ci.preco_unitario * ci.quantidade,0),
      coalesce(ci.quantidade,0)::numeric,
      '/dashboard/condicional'
    from public.condicional_itens ci
    join public.condicionais c on c.id = ci.condicional_id and c.organization_id = ci.organization_id
    cross join cfg
    where ci.organization_id = cfg.org and ci.produto_id = p_produto_id
  )
  select e.id, e.data, e.tipo, e.titulo, coalesce(e.detalhe,''), e.valor, e.quantidade, e.href
  from eventos e
  where e.data is not null
  order by e.data desc, e.id desc;
$$;
