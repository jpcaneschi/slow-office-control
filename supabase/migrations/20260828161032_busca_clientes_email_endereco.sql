-- Amplia a busca de clientes para os dados de contato importados.
-- SECURITY INVOKER + current_org_id() mantêm RLS e isolamento por empresa.

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
      concat_ws(
        ' · ',
        nullif(c.telefone,''),
        nullif(c.email,''),
        case when c.cpf is not null and c.cpf <> '' then 'CPF ' || c.cpf else null end,
        nullif(c.endereco,'')
      )::text as subtitulo,
      ('/dashboard/clientes/' || c.id::text)::text as href,
      case
        when lower(c.nome) like lower((select termo from cfg)) || '%' then 120
        when lower(coalesce(c.email,'')) like lower((select termo from cfg)) || '%' then 115
        else 100
      end as relevancia
    from public.clientes c, cfg
    where cfg.termo <> ''
      and c.organization_id = cfg.org
      and (
        c.nome ilike cfg.q
        or coalesce(c.telefone,'') ilike cfg.q
        or coalesce(c.cpf,'') ilike cfg.q
        or coalesce(c.email,'') ilike cfg.q
        or coalesce(c.endereco,'') ilike cfg.q
        or coalesce(c.observacoes,'') ilike cfg.q
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
