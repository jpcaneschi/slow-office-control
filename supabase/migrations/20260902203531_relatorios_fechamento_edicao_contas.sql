-- Relatórios financeiros por período, fechamento imutável e edição explícita
-- de contas. A migração é aditiva: não altera vendas, clientes, produtos,
-- estoque, pagamentos nem despesas existentes.

create table if not exists public.fechamentos_financeiros (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id()
    references public.organizations(id) on delete cascade,
  periodo_inicio date not null,
  periodo_fim date not null,
  tipo text not null check (tipo in ('diario','semanal','mensal','personalizado')),
  fechado_em date not null,
  vendas_brutas numeric(14,2) not null default 0,
  vendas_quantidade bigint not null default 0,
  entradas_vendas numeric(14,2) not null default 0,
  recebimentos_promissorias numeric(14,2) not null default 0,
  receita_servicos numeric(14,2) not null default 0,
  entradas_total numeric(14,2) not null default 0,
  despesas_operacionais_pagas numeric(14,2) not null default 0,
  compras_pagas numeric(14,2) not null default 0,
  folha_vales_pagos numeric(14,2) not null default 0,
  saidas_total numeric(14,2) not null default 0,
  resultado_caixa numeric(14,2) not null default 0,
  despesas_pendentes numeric(14,2) not null default 0,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint fechamentos_periodo_valido check (periodo_inicio <= periodo_fim),
  constraint fechamentos_unico_por_periodo
    unique (organization_id, periodo_inicio, periodo_fim)
);

create index if not exists fechamentos_financeiros_org_periodo_idx
  on public.fechamentos_financeiros (organization_id, periodo_inicio desc, periodo_fim desc);

alter table public.fechamentos_financeiros enable row level security;

drop policy if exists fechamentos_financeiros_select on public.fechamentos_financeiros;
create policy fechamentos_financeiros_select
  on public.fechamentos_financeiros
  for select to authenticated
  using (
    organization_id = public.current_org_id()
    and public.current_papel() = any(array['owner','gerente','financeiro'])
  );

drop policy if exists fechamentos_financeiros_insert on public.fechamentos_financeiros;
create policy fechamentos_financeiros_insert
  on public.fechamentos_financeiros
  for insert to authenticated
  with check (
    organization_id = public.current_org_id()
    and created_by = auth.uid()
    and public.current_papel() = any(array['owner','gerente','financeiro'])
  );

-- Fechamentos são snapshots históricos. Não há policy de UPDATE ou DELETE.
revoke all on table public.fechamentos_financeiros from public, anon;
grant select, insert on table public.fechamentos_financeiros to authenticated;

create or replace function public.relatorio_financeiro_periodo(
  p_inicio date,
  p_fim date
)
returns table(
  vendas_brutas numeric,
  vendas_quantidade bigint,
  entradas_vendas numeric,
  recebimentos_promissorias numeric,
  receita_servicos numeric,
  entradas_total numeric,
  despesas_operacionais_pagas numeric,
  compras_pagas numeric,
  folha_vales_pagos numeric,
  saidas_total numeric,
  resultado_caixa numeric,
  despesas_pendentes numeric
)
language plpgsql
security invoker
stable
set search_path = public
as $$
declare
  v_org uuid := public.current_org_id();
  v_inicio date := p_inicio;
  v_fim date := p_fim;
  v_recorrentes_pendentes numeric := 0;
begin
  if v_org is null then
    raise exception 'Empresa não identificada';
  end if;
  if public.current_papel() not in ('owner','gerente','financeiro') then
    raise exception 'Sem permissão para visualizar relatórios financeiros';
  end if;
  if v_inicio is null or v_fim is null or v_fim < v_inicio then
    raise exception 'Período inválido';
  end if;
  if v_fim - v_inicio > 3660 then
    raise exception 'O período máximo é de dez anos';
  end if;

  select coalesce(sum(v.total),0), count(*)
    into vendas_brutas, vendas_quantidade
    from public.vendas v
   where v.organization_id = v_org
     and v.status = 'concluida'
     and (v.created_at at time zone 'America/Sao_Paulo')::date
       between v_inicio and v_fim;

  select coalesce(sum(
    case
      when v.forma_pagamento = 'promissoria' then 0
      when v.forma_pagamento = 'misto'
        then greatest(0, least(v.total, coalesce(v.valor_recebido,0)))
      else v.total
    end
  ),0)
    into entradas_vendas
    from public.vendas v
   where v.organization_id = v_org
     and v.status = 'concluida'
     and (v.created_at at time zone 'America/Sao_Paulo')::date
       between v_inicio and v_fim;

  select coalesce(sum(pp.valor),0)
    into recebimentos_promissorias
    from public.promissoria_pagamentos pp
    join public.promissorias p on p.id = pp.promissoria_id
   where p.organization_id = v_org
     and p.status <> 'cancelado'
     and pp.data between v_inicio and v_fim;

  select coalesce(sum(a.valor * coalesce(a.percentual_loja,0) / 100.0),0)
    into receita_servicos
    from public.atendimentos_servico a
   where a.organization_id = v_org
     and a.data between v_inicio and v_fim;

  select coalesce(sum(d.valor),0)
    into compras_pagas
    from public.despesas d
   where d.organization_id = v_org
     and d.status = 'pago'
     and coalesce(d.data_pagamento,d.data) between v_inicio and v_fim
     and (
       d.compra_grupo_id is not null
       or lower(coalesce(d.categoria,'')) in ('fornecedor','compra de mercadoria')
       or lower(coalesce(d.categoria,'')) like '%mercadoria%'
     );

  select coalesce(sum(d.valor),0)
    into despesas_operacionais_pagas
    from public.despesas d
   where d.organization_id = v_org
     and d.status = 'pago'
     and coalesce(d.data_pagamento,d.data) between v_inicio and v_fim
     and not (
       d.compra_grupo_id is not null
       or lower(coalesce(d.categoria,'')) in ('fornecedor','compra de mercadoria')
       or lower(coalesce(d.categoria,'')) like '%mercadoria%'
     );

  select
    coalesce((
      select sum(p.valor_liquido)
        from public.pagamentos_funcionario p
       where p.organization_id = v_org
         and p.data_pagamento between v_inicio and v_fim
    ),0)
    + coalesce((
      select sum(v.valor)
        from public.vales v
       where v.organization_id = v_org
         and v.data between v_inicio and v_fim
    ),0)
    into folha_vales_pagos;

  select coalesce(sum(d.valor),0)
    into despesas_pendentes
    from public.despesas d
   where d.organization_id = v_org
     and d.status = 'pendente'
     and coalesce(d.data_vencimento,d.data) between v_inicio and v_fim;

  -- Inclui contas recorrentes ainda não materializadas no mês, sem duplicar
  -- uma ocorrência já cadastrada como pendente ou paga.
  select coalesce(sum(r.valor),0)
    into v_recorrentes_pendentes
    from generate_series(
      date_trunc('month',v_inicio::timestamp)::date,
      date_trunc('month',v_fim::timestamp)::date,
      interval '1 month'
    ) as gs(mes)
    join public.despesas_recorrentes r
      on r.organization_id = v_org and r.ativo = true
   where (
      mes::date
      + (least(
          greatest(coalesce(r.dia_vencimento,1),1),
          extract(day from (mes + interval '1 month - 1 day'))::int
        ) - 1) * interval '1 day'
    )::date between v_inicio and v_fim
     and not exists (
       select 1
         from public.despesas d
        where d.organization_id = v_org
          and d.despesa_recorrente_id = r.id
          and d.competencia = mes::date
          and d.status <> 'cancelado'
     );

  despesas_pendentes := despesas_pendentes + v_recorrentes_pendentes;
  entradas_total := entradas_vendas + recebimentos_promissorias + receita_servicos;
  saidas_total := despesas_operacionais_pagas + compras_pagas + folha_vales_pagos;
  resultado_caixa := entradas_total - saidas_total;
  return next;
end;
$$;

revoke all on function public.relatorio_financeiro_periodo(date,date) from public, anon;
grant execute on function public.relatorio_financeiro_periodo(date,date) to authenticated;

create or replace function public.relatorio_movimentos_periodo(
  p_inicio date,
  p_fim date
)
returns table(
  id text,
  data date,
  natureza text,
  tipo text,
  descricao text,
  detalhe text,
  forma_pagamento text,
  valor numeric,
  status text
)
language sql
security invoker
stable
set search_path = public
as $$
with acesso as (
  select public.current_org_id() org
   where public.current_papel() in ('owner','gerente','financeiro')
     and p_inicio is not null
     and p_fim is not null
     and p_inicio <= p_fim
),
vendas_base as (
  select
    v.id,
    (v.created_at at time zone 'America/Sao_Paulo')::date data,
    v.total,
    v.forma_pagamento,
    v.entrada_forma,
    v.valor_recebido,
    coalesce(c.nome,coalesce(v.responsavel,'Consumidor')) cliente,
    coalesce(
      string_agg(
        vi.quantidade::text || 'x ' || pr.nome
        || case
             when pv.tamanho is not null or pv.cor is not null
             then ' (' || concat_ws(' / ',pv.tamanho,pv.cor) || ')'
             else ''
           end,
        ' · ' order by vi.created_at
      ),
      'Venda sem itens'
    ) itens
  from public.vendas v
  join acesso a on a.org = v.organization_id
  left join public.clientes c on c.id = v.cliente_id
  left join public.venda_itens vi on vi.venda_id = v.id
  left join public.produtos pr on pr.id = vi.produto_id
  left join public.produto_variacoes pv on pv.id = vi.variacao_id
  where v.status = 'concluida'
    and (v.created_at at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
  group by v.id,c.nome
),
vendas_informativas as (
  select
    'venda-' || v.id::text id,
    v.data,
    'venda'::text natureza,
    'venda'::text tipo,
    'Venda para ' || v.cliente descricao,
    v.itens detalhe,
    coalesce(v.forma_pagamento,'não informado') forma_pagamento,
    v.total valor,
    'concluida'::text status
  from vendas_base v
),
entradas_multiforma as (
  select
    'vpg-' || vp.id::text id,
    vb.data,
    'entrada'::text natureza,
    'recebimento_venda'::text tipo,
    'Recebimento de venda'::text descricao,
    vb.itens detalhe,
    vp.forma forma_pagamento,
    vp.valor,
    'recebido'::text status
  from vendas_base vb
  join public.venda_pagamentos vp on vp.venda_id = vb.id
  where vb.forma_pagamento = 'multiplo'
),
entradas_venda_simples as (
  select
    'receita-venda-' || vb.id::text id,
    vb.data,
    'entrada'::text natureza,
    'recebimento_venda'::text tipo,
    'Recebimento de venda'::text descricao,
    vb.itens detalhe,
    case
      when vb.forma_pagamento = 'misto' then coalesce(vb.entrada_forma,'não informado')
      else coalesce(vb.forma_pagamento,'não informado')
    end forma_pagamento,
    case
      when vb.forma_pagamento = 'misto'
        then greatest(0,least(vb.total,coalesce(vb.valor_recebido,0)))
      else vb.total
    end valor,
    'recebido'::text status
  from vendas_base vb
  where vb.forma_pagamento <> 'promissoria'
    and (
      vb.forma_pagamento <> 'multiplo'
      or not exists (select 1 from public.venda_pagamentos vp where vp.venda_id = vb.id)
    )
),
recebimentos_promissorias as (
  select
    'prom-pg-' || pp.id::text id,
    pp.data,
    'entrada'::text natureza,
    'recebimento_promissoria'::text tipo,
    'Recebimento de promissória'::text descricao,
    coalesce(c.nome,'Cliente não informado') detalhe,
    coalesce(pp.forma_pagamento,'não informado') forma_pagamento,
    pp.valor,
    'recebido'::text status
  from public.promissoria_pagamentos pp
  join public.promissorias p on p.id = pp.promissoria_id
  join acesso a on a.org = p.organization_id
  left join public.clientes c on c.id = p.cliente_id
  where p.status <> 'cancelado'
    and pp.data between p_inicio and p_fim
),
receitas_servicos as (
  select
    'servico-' || s.id::text id,
    s.data,
    'entrada'::text natureza,
    'servico'::text tipo,
    coalesce(nullif(s.descricao,''),'Serviço realizado') descricao,
    coalesce(c.nome,coalesce(s.profissional_nome,'Cliente não informado')) detalhe,
    'não informado'::text forma_pagamento,
    round(s.valor * coalesce(s.percentual_loja,0) / 100.0,2) valor,
    'recebido'::text status
  from public.atendimentos_servico s
  join acesso a on a.org = s.organization_id
  left join public.clientes c on c.id = s.cliente_id
  where s.data between p_inicio and p_fim
    and round(s.valor * coalesce(s.percentual_loja,0) / 100.0,2) <> 0
),
saidas_despesas as (
  select
    'desp-' || d.id::text id,
    coalesce(d.data_pagamento,d.data) data,
    'saida'::text natureza,
    case
      when d.compra_grupo_id is not null
        or lower(coalesce(d.categoria,'')) in ('fornecedor','compra de mercadoria')
        or lower(coalesce(d.categoria,'')) like '%mercadoria%'
      then 'compra'
      else 'despesa'
    end tipo,
    d.descricao,
    coalesce(nullif(d.fornecedor,''),coalesce(nullif(d.observacao,''),d.categoria)) detalhe,
    'não informado'::text forma_pagamento,
    d.valor,
    'pago'::text status
  from public.despesas d
  join acesso a on a.org = d.organization_id
  where d.status = 'pago'
    and coalesce(d.data_pagamento,d.data) between p_inicio and p_fim
),
saidas_folha as (
  select
    'folha-' || p.id::text id,
    p.data_pagamento data,
    'saida'::text natureza,
    'folha'::text tipo,
    'Pagamento de equipe'::text descricao,
    coalesce(f.nome,'Funcionário') detalhe,
    'não informado'::text forma_pagamento,
    p.valor_liquido valor,
    'pago'::text status
  from public.pagamentos_funcionario p
  join acesso a on a.org = p.organization_id
  left join public.funcionarios f on f.id = p.funcionario_id
  where p.data_pagamento between p_inicio and p_fim
),
saidas_vales as (
  select
    'vale-' || v.id::text id,
    v.data,
    'saida'::text natureza,
    'vale'::text tipo,
    'Vale / adiantamento'::text descricao,
    coalesce(f.nome,coalesce(v.observacao,'Funcionário')) detalhe,
    'não informado'::text forma_pagamento,
    v.valor,
    'pago'::text status
  from public.vales v
  join acesso a on a.org = v.organization_id
  left join public.funcionarios f on f.id = v.funcionario_id
  where v.data between p_inicio and p_fim
)
select * from vendas_informativas
union all select * from entradas_multiforma
union all select * from entradas_venda_simples where valor > 0
union all select * from recebimentos_promissorias
union all select * from receitas_servicos
union all select * from saidas_despesas
union all select * from saidas_folha
union all select * from saidas_vales
order by data,natureza,tipo,descricao,id;
$$;

revoke all on function public.relatorio_movimentos_periodo(date,date) from public, anon;
grant execute on function public.relatorio_movimentos_periodo(date,date) to authenticated;

create or replace function public.relatorio_meses_ano(p_ano integer)
returns table(
  mes date,
  entradas_total numeric,
  saidas_total numeric,
  resultado_caixa numeric,
  vendas_brutas numeric,
  vendas_quantidade bigint
)
language plpgsql
security invoker
stable
set search_path = public
as $$
begin
  if p_ano is null or p_ano < 2000 or p_ano > 2100 then
    raise exception 'Ano inválido';
  end if;
  if public.current_papel() not in ('owner','gerente','financeiro') then
    raise exception 'Sem permissão para visualizar relatórios financeiros';
  end if;

  return query
  select
    g.mes::date,
    r.entradas_total,
    r.saidas_total,
    r.resultado_caixa,
    r.vendas_brutas,
    r.vendas_quantidade
  from generate_series(
    make_date(p_ano,1,1)::timestamp,
    make_date(p_ano,12,1)::timestamp,
    interval '1 month'
  ) g(mes)
  cross join lateral public.relatorio_financeiro_periodo(
    g.mes::date,
    (g.mes + interval '1 month - 1 day')::date
  ) r
  order by g.mes;
end;
$$;

revoke all on function public.relatorio_meses_ano(integer) from public, anon;
grant execute on function public.relatorio_meses_ano(integer) to authenticated;

create or replace function public.fechar_periodo_financeiro(
  p_inicio date,
  p_fim date,
  p_fechado_em date default ((now() at time zone 'America/Sao_Paulo')::date)
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid := public.current_org_id();
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_tipo text;
  v_resumo record;
  v_id uuid;
begin
  if v_org is null then raise exception 'Empresa não identificada'; end if;
  if public.current_papel() not in ('owner','gerente','financeiro') then
    raise exception 'Sem permissão para fechar o período';
  end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio then
    raise exception 'Período inválido';
  end if;
  if p_fim > v_hoje then
    raise exception 'Não é possível fechar um período futuro';
  end if;
  if p_fechado_em is null or p_fechado_em < p_fim or p_fechado_em > v_hoje then
    raise exception 'A data de fechamento deve estar entre o fim do período e hoje';
  end if;

  v_tipo := case
    when p_inicio = p_fim then 'diario'
    when p_fim - p_inicio = 6 then 'semanal'
    when p_inicio = date_trunc('month',p_inicio::timestamp)::date
      and p_fim = (date_trunc('month',p_inicio::timestamp) + interval '1 month - 1 day')::date
      then 'mensal'
    else 'personalizado'
  end;

  select * into v_resumo
    from public.relatorio_financeiro_periodo(p_inicio,p_fim);

  insert into public.fechamentos_financeiros (
    organization_id,periodo_inicio,periodo_fim,tipo,fechado_em,
    vendas_brutas,vendas_quantidade,entradas_vendas,
    recebimentos_promissorias,receita_servicos,entradas_total,
    despesas_operacionais_pagas,compras_pagas,folha_vales_pagos,
    saidas_total,resultado_caixa,despesas_pendentes,created_by
  ) values (
    v_org,p_inicio,p_fim,v_tipo,p_fechado_em,
    v_resumo.vendas_brutas,v_resumo.vendas_quantidade,v_resumo.entradas_vendas,
    v_resumo.recebimentos_promissorias,v_resumo.receita_servicos,v_resumo.entradas_total,
    v_resumo.despesas_operacionais_pagas,v_resumo.compras_pagas,v_resumo.folha_vales_pagos,
    v_resumo.saidas_total,v_resumo.resultado_caixa,v_resumo.despesas_pendentes,auth.uid()
  )
  on conflict (organization_id,periodo_inicio,periodo_fim) do nothing
  returning id into v_id;

  if v_id is null then
    select f.id into v_id
      from public.fechamentos_financeiros f
     where f.organization_id = v_org
       and f.periodo_inicio = p_inicio
       and f.periodo_fim = p_fim;
    return v_id;
  end if;

  perform public.log_auditoria(
    'periodo_financeiro_fechado',
    'fechamentos_financeiros',
    v_id,
    jsonb_build_object(
      'periodo_inicio',p_inicio,
      'periodo_fim',p_fim,
      'fechado_em',p_fechado_em,
      'resultado_caixa',v_resumo.resultado_caixa
    )
  );
  return v_id;
end;
$$;

revoke all on function public.fechar_periodo_financeiro(date,date,date) from public, anon;
grant execute on function public.fechar_periodo_financeiro(date,date,date) to authenticated;

create or replace function public.salvar_conta_financeira(
  p_despesa_id uuid,
  p_recorrente_id uuid,
  p_competencia date,
  p_descricao text,
  p_categoria text,
  p_valor numeric,
  p_data_vencimento date,
  p_status text,
  p_data_pagamento date,
  p_observacao text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid := public.current_org_id();
  v_despesa record;
  v_recorrente record;
  v_competencia date;
  v_id uuid;
  v_status_anterior text;
begin
  if v_org is null then raise exception 'Empresa não identificada'; end if;
  if public.current_papel() not in ('owner','gerente','financeiro') then
    raise exception 'Sem permissão para editar contas';
  end if;
  if coalesce(trim(p_descricao),'') = '' or length(trim(p_descricao)) > 180 then
    raise exception 'Informe uma descrição válida';
  end if;
  if coalesce(trim(p_categoria),'') = '' or length(trim(p_categoria)) > 100 then
    raise exception 'Informe uma categoria válida';
  end if;
  if coalesce(p_valor,0) <= 0 then raise exception 'Informe um valor válido'; end if;
  if p_data_vencimento is null then raise exception 'Informe o vencimento'; end if;
  if p_status not in ('pendente','pago') then raise exception 'Status inválido'; end if;
  if p_status = 'pago' and p_data_pagamento is null then
    raise exception 'Informe a data do pagamento';
  end if;

  if p_despesa_id is not null then
    select d.* into v_despesa
      from public.despesas d
     where d.id = p_despesa_id
       and d.organization_id = v_org
     for update;

    if not found then raise exception 'Conta não encontrada nesta empresa'; end if;
    if v_despesa.status = 'cancelado' then raise exception 'Conta cancelada não pode ser editada'; end if;
    if v_despesa.venda_id is not null then
      raise exception 'Esta despesa é vinculada automaticamente a uma venda';
    end if;
    v_status_anterior := v_despesa.status;

    update public.despesas
       set descricao = trim(p_descricao),
           categoria = trim(p_categoria),
           valor = round(p_valor,2),
           data = p_data_vencimento,
           data_vencimento = p_data_vencimento,
           competencia = date_trunc('month',p_data_vencimento::timestamp)::date,
           status = p_status,
           data_pagamento = case when p_status = 'pago' then p_data_pagamento else null end,
           observacao = nullif(trim(p_observacao),'')
     where id = p_despesa_id
       and organization_id = v_org
     returning id into v_id;
  elsif p_recorrente_id is not null then
    select r.* into v_recorrente
      from public.despesas_recorrentes r
     where r.id = p_recorrente_id
       and r.organization_id = v_org
       and r.ativo = true
     for update;

    if not found then raise exception 'Conta recorrente não encontrada nesta empresa'; end if;
    v_competencia := date_trunc(
      'month',coalesce(p_competencia,p_data_vencimento)::timestamp
    )::date;

    insert into public.despesas (
      organization_id,user_id,despesa_recorrente_id,competencia,
      descricao,categoria,valor,data,data_vencimento,data_pagamento,
      status,responsavel,observacao
    ) values (
      v_org,auth.uid(),p_recorrente_id,v_competencia,
      trim(p_descricao),trim(p_categoria),round(p_valor,2),
      p_data_vencimento,p_data_vencimento,
      case when p_status = 'pago' then p_data_pagamento else null end,
      p_status,null,nullif(trim(p_observacao),'')
    )
    on conflict (despesa_recorrente_id,competencia)
      where despesa_recorrente_id is not null and competencia is not null
    do update set
      descricao = excluded.descricao,
      categoria = excluded.categoria,
      valor = excluded.valor,
      data = excluded.data,
      data_vencimento = excluded.data_vencimento,
      data_pagamento = excluded.data_pagamento,
      status = excluded.status,
      observacao = excluded.observacao
    returning id into v_id;
  else
    raise exception 'Conta não identificada';
  end if;

  perform public.log_auditoria(
    'conta_financeira_editada',
    'despesas',
    v_id,
    jsonb_build_object(
      'status_anterior',v_status_anterior,
      'status_novo',p_status,
      'valor_novo',round(p_valor,2),
      'vencimento',p_data_vencimento
    )
  );
  return v_id;
end;
$$;

revoke all on function public.salvar_conta_financeira(uuid,uuid,date,text,text,numeric,date,text,date,text) from public, anon;
grant execute on function public.salvar_conta_financeira(uuid,uuid,date,text,text,numeric,date,text,date,text) to authenticated;
