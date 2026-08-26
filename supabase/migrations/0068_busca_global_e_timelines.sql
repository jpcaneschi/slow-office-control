-- Busca global escalável e timelines cronológicas.
-- Tudo usa SECURITY INVOKER + current_org_id(), preservando RLS e isolamento por empresa.

create or replace function public.busca_global(
  p_termo text,
  p_limite integer default 40
)
returns table(
  id text,
  tipo text,
  categoria text,
  titulo text,
  subtitulo text,
  href text,
  relevancia integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with cfg as (
    select
      public.current_org_id() as org,
      trim(coalesce(p_termo, '')) as termo,
      '%' || trim(coalesce(p_termo, '')) || '%' as q,
      least(80, greatest(1, coalesce(p_limite, 40))) as limite
  ), resultados as (
    select
      c.id::text as id,
      'cliente'::text as tipo,
      'Clientes'::text as categoria,
      c.nome::text as titulo,
      concat_ws(' · ', nullif(c.telefone,''), case when c.cpf is not null and c.cpf <> '' then 'CPF ' || c.cpf else null end)::text as subtitulo,
      ('/dashboard/clientes/' || c.id::text)::text as href,
      case when lower(c.nome) like lower((select termo from cfg)) || '%' then 120 else 100 end as relevancia
    from public.clientes c, cfg
    where cfg.termo <> ''
      and c.organization_id = cfg.org
      and (
        c.nome ilike cfg.q
        or coalesce(c.telefone,'') ilike cfg.q
        or coalesce(c.cpf,'') ilike cfg.q
      )

    union all

    select
      p.id::text,
      'produto',
      'Produtos',
      p.nome,
      concat_ws(' · ', nullif(p.marca,''), nullif(p.categoria,''), 'R$ ' || replace(to_char(coalesce(p.preco,0), 'FM999999990D00'), '.', ',')),
      '/dashboard/produtos/' || p.id::text,
      case when lower(p.nome) like lower((select termo from cfg)) || '%' then 115 else 95 end
    from public.produtos p, cfg
    where cfg.termo <> ''
      and p.organization_id = cfg.org
      and (
        p.nome ilike cfg.q
        or coalesce(p.marca,'') ilike cfg.q
        or coalesce(p.categoria,'') ilike cfg.q
        or exists (
          select 1
          from public.produto_variacoes pv
          where pv.organization_id = cfg.org
            and pv.produto_id = p.id
            and (
              coalesce(pv.sku,'') ilike cfg.q
              or coalesce(pv.codigo_barras,'') ilike cfg.q
              or coalesce(pv.tamanho,'') ilike cfg.q
              or coalesce(pv.cor,'') ilike cfg.q
            )
        )
      )

    union all

    select
      v.id::text,
      'venda',
      'Vendas',
      'Venda · ' || coalesce(c.nome, v.responsavel, 'Cliente avulso'),
      concat('R$ ', replace(to_char(coalesce(v.total,0), 'FM999999990D00'), '.', ','), ' · ', to_char(v.created_at at time zone 'America/Sao_Paulo','DD/MM/YYYY'), ' · ', v.status),
      '/dashboard/vendas/' || v.id::text,
      90
    from public.vendas v
    left join public.clientes c on c.id = v.cliente_id and c.organization_id = v.organization_id
    cross join cfg
    where cfg.termo <> ''
      and v.organization_id = cfg.org
      and (
        v.id::text ilike cfg.q
        or coalesce(v.responsavel,'') ilike cfg.q
        or coalesce(c.nome,'') ilike cfg.q
        or coalesce(c.telefone,'') ilike cfg.q
      )

    union all

    select
      pr.id::text,
      'promissoria',
      'Promissórias',
      'Promissória · ' || coalesce(c.nome, 'Cliente'),
      concat('R$ ', replace(to_char(coalesce(pr.valor_total,0), 'FM999999990D00'), '.', ','), ' · ', pr.status, case when pr.data_vencimento is not null then ' · vence ' || to_char(pr.data_vencimento,'DD/MM/YYYY') else '' end),
      '/dashboard/promissorias',
      80
    from public.promissorias pr
    left join public.clientes c on c.id = pr.cliente_id and c.organization_id = pr.organization_id
    cross join cfg
    where cfg.termo <> ''
      and pr.organization_id = cfg.org
      and (
        pr.id::text ilike cfg.q
        or coalesce(c.nome,'') ilike cfg.q
        or coalesce(c.telefone,'') ilike cfg.q
      )

    union all

    select
      d.id::text,
      'despesa',
      'Financeiro',
      coalesce(nullif(d.fornecedor,''), d.descricao),
      concat('R$ ', replace(to_char(coalesce(d.valor,0), 'FM999999990D00'), '.', ','), ' · ', d.status, case when d.data_vencimento is not null then ' · ' || to_char(d.data_vencimento,'DD/MM/YYYY') else '' end),
      '/dashboard/financeiro',
      75
    from public.despesas d, cfg
    where cfg.termo <> ''
      and d.organization_id = cfg.org
      and (
        coalesce(d.fornecedor,'') ilike cfg.q
        or coalesce(d.descricao,'') ilike cfg.q
        or coalesce(d.observacao,'') ilike cfg.q
      )

    union all

    select
      f.id::text,
      'funcionario',
      'Funcionários',
      f.nome,
      concat_ws(' · ', nullif(f.telefone,''), case when f.ativo then 'Ativo' else 'Inativo' end),
      '/dashboard/funcionarios',
      70
    from public.funcionarios f, cfg
    where cfg.termo <> ''
      and f.organization_id = cfg.org
      and (
        f.nome ilike cfg.q
        or coalesce(f.telefone,'') ilike cfg.q
      )
  )
  select r.id, r.tipo, r.categoria, r.titulo, coalesce(r.subtitulo,''), r.href, r.relevancia
  from resultados r
  order by r.relevancia desc, r.titulo
  limit (select limite from cfg);
$$;

create or replace function public.timeline_cliente(p_cliente_id uuid)
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
      'venda:' || v.id::text as id,
      v.created_at as data,
      case when v.status = 'cancelada' then 'cancelamento' else 'venda' end as tipo,
      case when v.status = 'cancelada' then 'Venda cancelada' else 'Compra realizada' end as titulo,
      concat_ws(' · ', nullif(v.forma_pagamento,''), nullif(v.responsavel,''), v.status) as detalhe,
      coalesce(v.total,0)::numeric as valor,
      null::numeric as quantidade,
      '/dashboard/vendas/' || v.id::text as href
    from public.vendas v, cfg
    where v.organization_id = cfg.org and v.cliente_id = p_cliente_id

    union all

    select
      'vpag:' || vp.id::text,
      vp.created_at,
      'pagamento',
      'Pagamento da venda',
      concat(vp.forma, case when coalesce(vp.parcelas,1) > 1 then ' · ' || vp.parcelas || 'x' else '' end),
      coalesce(vp.valor,0),
      null::numeric,
      '/dashboard/vendas/' || v.id::text
    from public.venda_pagamentos vp
    join public.vendas v on v.id = vp.venda_id and v.organization_id = vp.organization_id
    cross join cfg
    where vp.organization_id = cfg.org and v.cliente_id = p_cliente_id

    union all

    select
      'prom:' || p.id::text,
      p.created_at,
      'promissoria',
      'Promissória criada',
      concat(p.status, case when p.data_vencimento is not null then ' · 1º venc. ' || to_char(p.data_vencimento,'DD/MM/YYYY') else '' end),
      coalesce(p.valor_total,0),
      null::numeric,
      '/dashboard/promissorias'
    from public.promissorias p, cfg
    where p.organization_id = cfg.org and p.cliente_id = p_cliente_id

    union all

    select
      'prompag:' || pp.id::text,
      coalesce(pp.created_at, pp.data::timestamp at time zone 'America/Sao_Paulo'),
      'recebimento',
      'Pagamento de promissória',
      concat_ws(' · ', nullif(pp.forma_pagamento,''), nullif(pp.observacao,'')),
      coalesce(pp.valor,0),
      null::numeric,
      '/dashboard/promissorias'
    from public.promissoria_pagamentos pp
    join public.promissorias p on p.id = pp.promissoria_id and p.organization_id = pp.organization_id
    cross join cfg
    where pp.organization_id = cfg.org and p.cliente_id = p_cliente_id

    union all

    select
      'cond:' || c.id::text,
      c.created_at,
      'condicional',
      'Condicional enviada',
      concat(c.status, case when c.data_limite is not null then ' · retorno até ' || to_char(c.data_limite,'DD/MM/YYYY') else '' end),
      null::numeric,
      null::numeric,
      '/dashboard/condicional'
    from public.condicionais c, cfg
    where c.organization_id = cfg.org and c.cliente_id = p_cliente_id

    union all

    select
      'condret:' || c.id::text,
      c.data_retorno::timestamp at time zone 'America/Sao_Paulo',
      'retorno',
      'Condicional retornou',
      coalesce(c.observacao, c.status),
      null::numeric,
      null::numeric,
      '/dashboard/condicional'
    from public.condicionais c, cfg
    where c.organization_id = cfg.org and c.cliente_id = p_cliente_id and c.data_retorno is not null

    union all

    select
      'serv:' || s.id::text,
      s.data::timestamp at time zone 'America/Sao_Paulo',
      'servico',
      coalesce(nullif(s.descricao,''), 'Serviço'),
      'Atendimento realizado',
      coalesce(s.valor,0),
      null::numeric,
      '/dashboard/servicos'
    from public.atendimentos_servico s, cfg
    where s.organization_id = cfg.org and s.cliente_id = p_cliente_id
  )
  select e.id, e.data, e.tipo, e.titulo, coalesce(e.detalhe,''), e.valor, e.quantidade, e.href
  from eventos e
  where e.data is not null
  order by e.data desc, e.id desc;
$$;

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
        when 'venda' then 'Baixa por venda'
        when 'cancelamento' then 'Estoque devolvido por cancelamento'
        when 'devolucao' then 'Devolução ao estoque'
        when 'condicional' then 'Saída em condicional'
        when 'retorno_condicional' then 'Retorno de condicional'
        else 'Movimentação de estoque'
      end as titulo,
      concat_ws(' · ', nullif(m.motivo,''), nullif(m.observacao,'')) as detalhe,
      null::numeric as valor,
      coalesce(m.quantidade,0)::numeric as quantidade,
      case when m.referencia_id is not null and m.tipo in ('venda','cancelamento','devolucao') then '/dashboard/vendas/' || m.referencia_id::text else '/dashboard/produtos/' || p_produto_id::text end as href
    from public.estoque_movimentacoes m, cfg
    where m.organization_id = cfg.org and m.produto_id = p_produto_id

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
