-- Fechamento mensal da comissão baseada no lucro da loja.
-- O lucro de uma competência é congelado e pago na competência seguinte.
-- Migration aditiva e idempotente: não altera registros antigos de vendas/folha.

create table if not exists public.comissoes_fechadas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_org_id(),
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  competencia_origem date not null,
  competencia_pagamento date not null,
  base_tipo text not null default 'lucro_loja',
  base_valor numeric(14,2) not null default 0,
  percentual numeric(6,2) not null default 0,
  valor numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists comissoes_fechadas_org_func_comp_uidx
  on public.comissoes_fechadas(organization_id, funcionario_id, competencia_origem);
create index if not exists comissoes_fechadas_pagamento_idx
  on public.comissoes_fechadas(organization_id, competencia_pagamento, funcionario_id);

do $$ begin
  alter table public.comissoes_fechadas add constraint chk_comissao_fechada_base
    check (base_tipo = 'lucro_loja');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.comissoes_fechadas add constraint chk_comissao_fechada_valores
    check (base_valor >= 0 and percentual between 0 and 100 and valor >= 0);
exception when duplicate_object then null; end $$;

alter table public.comissoes_fechadas enable row level security;

drop policy if exists "rbac_select" on public.comissoes_fechadas;
drop policy if exists "rbac_insert" on public.comissoes_fechadas;
drop policy if exists "rbac_update" on public.comissoes_fechadas;
drop policy if exists "rbac_delete" on public.comissoes_fechadas;

create policy "rbac_select" on public.comissoes_fechadas
for select to authenticated
using (
  organization_id = public.current_org_id()
  and public.current_papel() = any(array['owner','gerente','financeiro'])
);

create policy "rbac_insert" on public.comissoes_fechadas
for insert to authenticated
with check (
  organization_id = public.current_org_id()
  and public.current_papel() = any(array['owner','gerente','financeiro'])
);

create policy "rbac_update" on public.comissoes_fechadas
for update to authenticated
using (
  organization_id = public.current_org_id()
  and public.current_papel() = any(array['owner','gerente','financeiro'])
)
with check (
  organization_id = public.current_org_id()
  and public.current_papel() = any(array['owner','gerente','financeiro'])
);

create policy "rbac_delete" on public.comissoes_fechadas
for delete to authenticated
using (
  organization_id = public.current_org_id()
  and public.current_papel() = 'owner'
);

create or replace function public.fechar_comissoes_lucro_mes(p_competencia date)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inicio date := date_trunc('month', p_competencia)::date;
  v_fim date := (date_trunc('month', p_competencia) + interval '1 month')::date;
  v_comp_pag date := (date_trunc('month', p_competencia) + interval '1 month')::date;
  v_receita_vendas numeric := 0;
  v_receita_servicos numeric := 0;
  v_custo_produtos numeric := 0;
  v_despesas numeric := 0;
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

  select coalesce(sum(v.total), 0)
    into v_receita_vendas
  from public.vendas v
  where v.organization_id = public.current_org_id()
    and v.status = 'concluida'
    and v.created_at >= v_inicio::timestamptz
    and v.created_at < v_fim::timestamptz;

  select coalesce(sum(coalesce(vi.quantidade,0) * coalesce(vi.custo_unitario,0)), 0)
    into v_custo_produtos
  from public.venda_itens vi
  join public.vendas v on v.id = vi.venda_id
  where v.organization_id = public.current_org_id()
    and v.status = 'concluida'
    and v.created_at >= v_inicio::timestamptz
    and v.created_at < v_fim::timestamptz;

  select coalesce(sum(d.valor), 0)
    into v_despesas
  from public.despesas d
  where d.organization_id = public.current_org_id()
    and d.data >= v_inicio
    and d.data < v_fim;

  select coalesce(sum(a.valor * (coalesce(a.percentual_loja,0) / 100.0)), 0)
    into v_receita_servicos
  from public.atendimentos_servico a
  where a.organization_id = public.current_org_id()
    and a.data >= v_inicio
    and a.data < v_fim;

  v_lucro := greatest(0, v_receita_vendas + v_receita_servicos - v_custo_produtos - v_despesas);

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

revoke all on function public.fechar_comissoes_lucro_mes(date) from public;
grant execute on function public.fechar_comissoes_lucro_mes(date) to authenticated;