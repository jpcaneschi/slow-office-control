-- 0064 — Fonte única para resumo por período e comissão sobre resultado mensal.
-- Aditiva: não altera vendas, estoque, clientes ou histórico existente.

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
  v_org uuid := public.current_org_id();
  v_inicio date := coalesce(p_inicio, current_date);
  v_fim date := coalesce(p_fim, coalesce(p_inicio, current_date));
  v_fim_exclusivo date;
  v_vendas numeric := 0;
  v_entradas_vendas numeric := 0;
  v_prom numeric := 0;
  v_servicos numeric := 0;
  v_despesas numeric := 0;
begin
  if v_fim < v_inicio then
    raise exception 'A data final não pode ser anterior à data inicial';
  end if;

  v_fim_exclusivo := v_fim + 1;

  -- Valor integral dos pedidos vendidos no período, inclusive vendas a prazo.
  select coalesce(sum(v.total), 0)
    into v_vendas
    from public.vendas v
   where v.organization_id = v_org
     and v.status = 'concluida'
     and v.created_at >= v_inicio::timestamptz
     and v.created_at < v_fim_exclusivo::timestamptz;

  -- Dinheiro reconhecido no momento da venda: à vista = total; misto = entrada;
  -- promissória integral = zero até o recebimento ser registrado.
  select coalesce(sum(
    case
      when v.forma_pagamento = 'promissoria' then 0
      when v.forma_pagamento = 'misto' then greatest(0, least(v.total, coalesce(v.valor_recebido, 0)))
      else v.total
    end
  ), 0)
    into v_entradas_vendas
    from public.vendas v
   where v.organization_id = v_org
     and v.status = 'concluida'
     and v.created_at >= v_inicio::timestamptz
     and v.created_at < v_fim_exclusivo::timestamptz;

  select coalesce(sum(pp.valor), 0)
    into v_prom
    from public.promissoria_pagamentos pp
    join public.promissorias p on p.id = pp.promissoria_id
   where p.organization_id = v_org
     and p.status <> 'cancelado'
     and pp.data >= v_inicio
     and pp.data < v_fim_exclusivo;

  select coalesce(sum(a.valor * coalesce(a.percentual_loja, 0) / 100.0), 0)
    into v_servicos
    from public.atendimentos_servico a
   where a.organization_id = v_org
     and a.data >= v_inicio
     and a.data < v_fim_exclusivo;

  -- Saídas efetivamente pagas no período.
  select coalesce(sum(d.valor), 0)
    into v_despesas
    from public.despesas d
   where d.organization_id = v_org
     and d.status = 'pago'
     and coalesce(d.data_pagamento, d.data) >= v_inicio
     and coalesce(d.data_pagamento, d.data) < v_fim_exclusivo;

  v_despesas := v_despesas
    + coalesce((
        select sum(p.valor_liquido)
          from public.pagamentos_funcionario p
         where p.organization_id = v_org
           and p.data_pagamento >= v_inicio
           and p.data_pagamento < v_fim_exclusivo
      ), 0)
    + coalesce((
        select sum(v.valor)
          from public.vales v
         where v.organization_id = v_org
           and v.data >= v_inicio
           and v.data < v_fim_exclusivo
      ), 0);

  vendas_periodo := v_vendas;
  entradas_vendas := v_entradas_vendas;
  recebimentos_promissorias := v_prom;
  receita_servicos := v_servicos;
  entradas_recebidas := v_entradas_vendas + v_prom + v_servicos;
  despesas_pagas := v_despesas;
  movimentacao_periodo := entradas_recebidas + despesas_pagas;
  return next;
end;
$$;

revoke all on function public.resumo_operacao_periodo(date,date) from public;
grant execute on function public.resumo_operacao_periodo(date,date) to authenticated;

-- Comissão sobre lucro passa a usar EXATAMENTE a mesma regra mensal do Financeiro.
-- Não subtrai mais custo unitário das peças, porque compras/fornecedores já são
-- despesas da operação e descontar os dois geraria custo em duplicidade.
create or replace function public.fechar_comissoes_lucro_mes(p_competencia date)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_inicio date := date_trunc('month', p_competencia)::date;
  v_comp_pag date := (date_trunc('month', p_competencia) + interval '1 month')::date;
  v_lucro numeric := 0;
  v_func record;
  v_inseridos int := 0;
begin
  if public.current_papel() not in ('owner','gerente','financeiro') then
    raise exception 'Sem permissão para fechar comissão';
  end if;

  if v_inicio >= date_trunc('month', current_date)::date then
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
      funcionario_id, competencia_origem, competencia_pagamento,
      base_tipo, base_valor, percentual, valor
    ) values (
      v_func.id, v_inicio, v_comp_pag,
      'lucro_loja', v_lucro, v_func.comissao_percentual,
      round(v_lucro * (v_func.comissao_percentual / 100.0), 2)
    ) on conflict (organization_id, funcionario_id, competencia_origem) do nothing;

    if found then v_inseridos := v_inseridos + 1; end if;
  end loop;

  return v_inseridos;
end;
$$;