-- Regras flexíveis de folha por funcionário e vale mensal idempotente.

alter table public.funcionarios
  add column if not exists telefone text,
  add column if not exists comissao_base text not null default 'vendas_funcionario',
  add column if not exists frequencia_pagamento text not null default 'mensal',
  add column if not exists dia_pagamento int not null default 5,
  add column if not exists vale_recorrente_valor numeric(12, 2) not null default 0,
  add column if not exists vale_recorrente_dia int not null default 5,
  add column if not exists vale_recorrente_ativo boolean not null default false;

do $$ begin
  alter table public.funcionarios add constraint chk_func_comissao_base
    check (comissao_base in ('vendas_funcionario','faturamento_loja','lucro_loja'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.funcionarios add constraint chk_func_frequencia_pagamento
    check (frequencia_pagamento in ('semanal','quinzenal','mensal'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.funcionarios add constraint chk_func_dia_pagamento
    check (dia_pagamento between 1 and 31);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.funcionarios add constraint chk_func_vale_recorrente
    check (vale_recorrente_valor >= 0 and vale_recorrente_dia between 1 and 31);
exception when duplicate_object then null; end $$;

alter table public.vales
  add column if not exists origem text not null default 'manual',
  add column if not exists competencia date;

do $$ begin
  alter table public.vales add constraint chk_vale_origem
    check (origem in ('manual','recorrente'));
exception when duplicate_object then null; end $$;

create unique index if not exists vales_recorrentes_competencia_uidx
  on public.vales(funcionario_id, competencia)
  where origem = 'recorrente';

create or replace function public.gerar_vales_recorrentes(
  p_competencia date default current_date
)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_func record;
  v_inicio date := date_trunc('month', p_competencia)::date;
  v_ultimo_dia int;
  v_data date;
  v_inseridos int := 0;
begin
  v_ultimo_dia := extract(day from (v_inicio + interval '1 month - 1 day'))::int;

  for v_func in
    select id, vale_recorrente_valor, vale_recorrente_dia
    from public.funcionarios
    where organization_id = public.current_org_id()
      and ativo
      and vale_recorrente_ativo
      and vale_recorrente_valor > 0
  loop
    v_data := v_inicio + (least(v_func.vale_recorrente_dia, v_ultimo_dia) - 1);
    insert into public.vales (
      funcionario_id, valor, data, observacao, origem, competencia
    ) values (
      v_func.id,
      v_func.vale_recorrente_valor,
      v_data,
      'Vale mensal recorrente',
      'recorrente',
      v_inicio
    ) on conflict do nothing;
    if found then v_inseridos := v_inseridos + 1; end if;
  end loop;

  return v_inseridos;
end;
$$;

revoke all on function public.gerar_vales_recorrentes(date) from public;
grant execute on function public.gerar_vales_recorrentes(date) to authenticated;
