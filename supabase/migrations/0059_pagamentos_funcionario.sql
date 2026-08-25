-- Registro do pagamento efetivamente realizado ao funcionário.
-- Mantém snapshot do valor e do período sem alterar vales, vendas ou histórico existente.

create table if not exists public.pagamentos_funcionario (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_org_id(),
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  periodo_inicio date not null,
  periodo_fim date not null,
  data_pagamento date not null default current_date,
  valor_liquido numeric(12,2) not null,
  observacao text,
  created_at timestamptz not null default now()
);

create index if not exists pagamentos_funcionario_org_idx
  on public.pagamentos_funcionario(organization_id, data_pagamento desc);
create index if not exists pagamentos_funcionario_func_idx
  on public.pagamentos_funcionario(funcionario_id, periodo_inicio, periodo_fim);
create unique index if not exists pagamentos_funcionario_periodo_uidx
  on public.pagamentos_funcionario(organization_id, funcionario_id, periodo_inicio, periodo_fim);

do $$ begin
  alter table public.pagamentos_funcionario add constraint chk_pag_func_periodo
    check (periodo_fim >= periodo_inicio);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.pagamentos_funcionario add constraint chk_pag_func_valor
    check (valor_liquido >= 0);
exception when duplicate_object then null; end $$;

alter table public.pagamentos_funcionario enable row level security;

drop policy if exists "rbac_select" on public.pagamentos_funcionario;
drop policy if exists "rbac_insert" on public.pagamentos_funcionario;
drop policy if exists "rbac_update" on public.pagamentos_funcionario;
drop policy if exists "rbac_delete" on public.pagamentos_funcionario;

create policy "rbac_select" on public.pagamentos_funcionario
for select to authenticated
using (
  organization_id = public.current_org_id()
  and public.current_papel() = any(array['owner','gerente','financeiro'])
);

create policy "rbac_insert" on public.pagamentos_funcionario
for insert to authenticated
with check (
  organization_id = public.current_org_id()
  and public.current_papel() = any(array['owner','gerente','financeiro'])
);

create policy "rbac_update" on public.pagamentos_funcionario
for update to authenticated
using (
  organization_id = public.current_org_id()
  and public.current_papel() = any(array['owner','gerente','financeiro'])
)
with check (
  organization_id = public.current_org_id()
  and public.current_papel() = any(array['owner','gerente','financeiro'])
);

create policy "rbac_delete" on public.pagamentos_funcionario
for delete to authenticated
using (
  organization_id = public.current_org_id()
  and public.current_papel() = 'owner'
);

create or replace function public.registrar_pagamento_funcionario(
  p_funcionario_id uuid,
  p_periodo_inicio date,
  p_periodo_fim date,
  p_data_pagamento date,
  p_valor_liquido numeric,
  p_observacao text default null
)
returns public.pagamentos_funcionario
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_reg public.pagamentos_funcionario%rowtype;
begin
  if public.current_papel() not in ('owner','gerente','financeiro') then
    raise exception 'Sem permissão para registrar pagamento de funcionário';
  end if;
  if p_periodo_fim < p_periodo_inicio then raise exception 'Período inválido'; end if;
  if p_valor_liquido < 0 then raise exception 'Valor líquido inválido'; end if;
  if not exists (
    select 1 from public.funcionarios
    where id = p_funcionario_id and organization_id = public.current_org_id()
  ) then raise exception 'Funcionário não encontrado nesta empresa'; end if;

  insert into public.pagamentos_funcionario(
    funcionario_id, periodo_inicio, periodo_fim, data_pagamento, valor_liquido, observacao
  ) values (
    p_funcionario_id, p_periodo_inicio, p_periodo_fim, p_data_pagamento, p_valor_liquido, nullif(trim(p_observacao), '')
  )
  on conflict (organization_id, funcionario_id, periodo_inicio, periodo_fim)
  do update set
    data_pagamento = excluded.data_pagamento,
    valor_liquido = excluded.valor_liquido,
    observacao = excluded.observacao
  returning * into v_reg;

  return v_reg;
end;
$$;

revoke all on function public.registrar_pagamento_funcionario(uuid,date,date,date,numeric,text) from public;
grant execute on function public.registrar_pagamento_funcionario(uuid,date,date,date,numeric,text) to authenticated;