-- Agenda real de pagamentos (mensal/quinzenal/semanal) e planejamento de desconto de vales.
-- Aditiva e compatível com registros antigos.

alter table public.funcionarios
  add column if not exists dia_pagamento_2 int not null default 30,
  add column if not exists dia_semana_pagamento int not null default 5;

do $$ begin
  alter table public.funcionarios add constraint chk_func_dia_pagamento_2
    check (dia_pagamento_2 between 1 and 31);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.funcionarios add constraint chk_func_dia_semana_pagamento
    check (dia_semana_pagamento between 0 and 6);
exception when duplicate_object then null; end $$;

-- Um mesmo mês agora pode ter várias parcelas de pagamento.
alter table public.pagamentos_funcionario
  add column if not exists parcela_numero int not null default 1,
  add column if not exists total_parcelas int not null default 1,
  add column if not exists data_prevista date;

update public.pagamentos_funcionario
set data_prevista = data_pagamento
where data_prevista is null;

do $$ begin
  alter table public.pagamentos_funcionario add constraint chk_pag_func_parcelas
    check (parcela_numero >= 1 and total_parcelas >= 1 and parcela_numero <= total_parcelas);
exception when duplicate_object then null; end $$;

drop index if exists public.pagamentos_funcionario_periodo_uidx;
create unique index if not exists pagamentos_funcionario_periodo_parcela_uidx
  on public.pagamentos_funcionario(
    organization_id, funcionario_id, periodo_inicio, periodo_fim, parcela_numero
  );

-- Configuração persistente do plano de desconto do vale.
alter table public.vales
  add column if not exists desconto_modo text not null default 'proximo_pagamento',
  add column if not exists desconto_parcelas int not null default 1,
  add column if not exists desconto_inicio date;

do $$ begin
  alter table public.vales add constraint chk_vale_desconto_modo
    check (desconto_modo in ('proximo_pagamento','pagamento_especifico','dividido'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.vales add constraint chk_vale_desconto_parcelas
    check (desconto_parcelas between 1 and 12);
exception when duplicate_object then null; end $$;

create table if not exists public.vale_descontos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_org_id(),
  vale_id uuid not null references public.vales(id) on delete cascade,
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  competencia date not null,
  parcela_pagamento int not null,
  data_prevista date not null,
  sequencia int not null,
  total_divisoes int not null,
  valor numeric(12,2) not null,
  status text not null default 'pendente',
  pagamento_funcionario_id uuid references public.pagamentos_funcionario(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists vale_descontos_vale_seq_uidx
  on public.vale_descontos(organization_id, vale_id, sequencia);
create index if not exists vale_descontos_agenda_idx
  on public.vale_descontos(organization_id, funcionario_id, competencia, parcela_pagamento);

do $$ begin
  alter table public.vale_descontos add constraint chk_vale_desconto_status
    check (status in ('pendente','aplicado','cancelado'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.vale_descontos add constraint chk_vale_desconto_valor
    check (valor > 0 and sequencia >= 1 and total_divisoes >= 1 and sequencia <= total_divisoes and parcela_pagamento >= 1);
exception when duplicate_object then null; end $$;

alter table public.vale_descontos enable row level security;

drop policy if exists "rbac_select" on public.vale_descontos;
drop policy if exists "rbac_insert" on public.vale_descontos;
drop policy if exists "rbac_update" on public.vale_descontos;
drop policy if exists "rbac_delete" on public.vale_descontos;

create policy "rbac_select" on public.vale_descontos
for select to authenticated
using (
  organization_id = public.current_org_id()
  and public.current_papel() = any(array['owner','gerente','financeiro'])
);

create policy "rbac_insert" on public.vale_descontos
for insert to authenticated
with check (
  organization_id = public.current_org_id()
  and public.current_papel() = any(array['owner','gerente','financeiro'])
);

create policy "rbac_update" on public.vale_descontos
for update to authenticated
using (
  organization_id = public.current_org_id()
  and public.current_papel() = any(array['owner','gerente','financeiro'])
)
with check (
  organization_id = public.current_org_id()
  and public.current_papel() = any(array['owner','gerente','financeiro'])
);

create policy "rbac_delete" on public.vale_descontos
for delete to authenticated
using (
  organization_id = public.current_org_id()
  and public.current_papel() = any(array['owner','gerente'])
);

-- Datas previstas de pagamento de um funcionário em uma competência mensal.
-- Mensal: 1 data. Quinzenal: 2 datas. Semanal: todas as ocorrências do dia da semana no mês.
create or replace function public.agenda_pagamentos_funcionario(
  p_funcionario_id uuid,
  p_competencia date
)
returns table(
  competencia date,
  data_pagamento date,
  parcela_numero int,
  total_parcelas int
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_freq text;
  v_dia1 int;
  v_dia2 int;
  v_semana int;
  v_inicio date := date_trunc('month', p_competencia)::date;
  v_fim date := (date_trunc('month', p_competencia) + interval '1 month')::date;
  v_ultimo int;
  v_data1 date;
  v_data2 date;
  v_datas date[] := array[]::date[];
  v_data date;
  v_total int;
  v_i int;
begin
  select frequencia_pagamento, dia_pagamento, dia_pagamento_2, dia_semana_pagamento
    into v_freq, v_dia1, v_dia2, v_semana
  from public.funcionarios
  where id = p_funcionario_id
    and organization_id = public.current_org_id();

  if not found then
    raise exception 'Funcionário não encontrado nesta empresa';
  end if;

  v_ultimo := extract(day from (v_fim - interval '1 day'))::int;

  if v_freq = 'quinzenal' then
    -- Mantém sempre duas datas distintas, inclusive em fevereiro.
    v_dia1 := least(greatest(coalesce(v_dia1, 15), 1), greatest(v_ultimo - 1, 1));
    v_dia2 := least(greatest(coalesce(v_dia2, 30), v_dia1 + 1), v_ultimo);
    v_data1 := v_inicio + (v_dia1 - 1);
    v_data2 := v_inicio + (v_dia2 - 1);
    v_datas := array[v_data1, v_data2];
  elsif v_freq = 'semanal' then
    for v_data in
      select d::date
      from generate_series(v_inicio, v_fim - interval '1 day', interval '1 day') d
      where extract(dow from d)::int = coalesce(v_semana, 5)
      order by d
    loop
      v_datas := array_append(v_datas, v_data);
    end loop;
  else
    v_dia1 := least(greatest(coalesce(v_dia1, 5), 1), v_ultimo);
    v_datas := array[v_inicio + (v_dia1 - 1)];
  end if;

  v_total := coalesce(array_length(v_datas, 1), 0);
  if v_total = 0 then
    raise exception 'Não foi possível montar a agenda de pagamentos';
  end if;

  for v_i in 1..v_total loop
    competencia := v_inicio;
    data_pagamento := v_datas[v_i];
    parcela_numero := v_i;
    total_parcelas := v_total;
    return next;
  end loop;
end;
$$;

revoke all on function public.agenda_pagamentos_funcionario(uuid,date) from public;
grant execute on function public.agenda_pagamentos_funcionario(uuid,date) to authenticated;

-- Planeja em qual(is) pagamento(s) o vale será descontado.
create or replace function public.planejar_desconto_vale(
  p_vale_id uuid,
  p_modo text default 'proximo_pagamento',
  p_data_inicio date default null,
  p_parcelas int default 1
)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_vale record;
  v_modo text := coalesce(p_modo, 'proximo_pagamento');
  v_qtd int;
  v_inicio_busca date;
  v_mes date;
  v_ag record;
  v_encontrados int := 0;
  v_base numeric(12,2);
  v_valor numeric(12,2);
  v_valor_item numeric(12,2);
  v_guard int := 0;
begin
  if public.current_papel() not in ('owner','gerente','financeiro') then
    raise exception 'Sem permissão para planejar desconto de vale';
  end if;

  select v.id, v.funcionario_id, v.valor, v.data
    into v_vale
  from public.vales v
  where v.id = p_vale_id
    and v.organization_id = public.current_org_id();

  if not found then raise exception 'Vale não encontrado nesta empresa'; end if;
  if v_modo not in ('proximo_pagamento','pagamento_especifico','dividido') then
    raise exception 'Modo de desconto inválido';
  end if;

  v_qtd := case
    when v_modo = 'dividido' then greatest(2, least(coalesce(p_parcelas, 2), 12))
    else 1
  end;
  v_inicio_busca := case
    when v_modo in ('pagamento_especifico','dividido') and p_data_inicio is not null then p_data_inicio
    else v_vale.data
  end;
  v_mes := date_trunc('month', v_inicio_busca)::date;
  v_valor := round(v_vale.valor::numeric, 2);
  v_base := trunc((v_valor * 100) / v_qtd) / 100;

  delete from public.vale_descontos
  where vale_id = p_vale_id
    and organization_id = public.current_org_id()
    and status = 'pendente';

  while v_encontrados < v_qtd and v_guard < 18 loop
    for v_ag in
      select *
      from public.agenda_pagamentos_funcionario(v_vale.funcionario_id, v_mes)
      order by data_pagamento
    loop
      if v_modo = 'pagamento_especifico' then
        if p_data_inicio is null or v_ag.data_pagamento <> p_data_inicio then
          continue;
        end if;
      elsif v_ag.data_pagamento < v_inicio_busca then
        continue;
      end if;

      v_encontrados := v_encontrados + 1;
      v_valor_item := case
        when v_encontrados = v_qtd then round(v_valor - (v_base * (v_qtd - 1)), 2)
        else v_base
      end;

      insert into public.vale_descontos(
        vale_id, funcionario_id, competencia, parcela_pagamento,
        data_prevista, sequencia, total_divisoes, valor
      ) values (
        v_vale.id, v_vale.funcionario_id, v_ag.competencia, v_ag.parcela_numero,
        v_ag.data_pagamento, v_encontrados, v_qtd, v_valor_item
      );

      exit when v_encontrados >= v_qtd;
      if v_modo = 'pagamento_especifico' then exit; end if;
    end loop;

    exit when v_encontrados >= v_qtd or v_modo = 'pagamento_especifico';
    v_mes := (v_mes + interval '1 month')::date;
    v_guard := v_guard + 1;
  end loop;

  if v_encontrados <> v_qtd then
    raise exception 'Não foi possível localizar os pagamentos escolhidos para este vale';
  end if;

  update public.vales
  set desconto_modo = v_modo,
      desconto_parcelas = v_qtd,
      desconto_inicio = case when v_modo = 'proximo_pagamento' then null else v_inicio_busca end
  where id = p_vale_id;

  return v_encontrados;
end;
$$;

revoke all on function public.planejar_desconto_vale(uuid,text,date,int) from public;
grant execute on function public.planejar_desconto_vale(uuid,text,date,int) to authenticated;

-- Registro atômico do vale + plano de desconto.
create or replace function public.registrar_vale_planejado(
  p_funcionario_id uuid,
  p_valor numeric,
  p_observacao text default null,
  p_modo text default 'proximo_pagamento',
  p_data_inicio date default null,
  p_parcelas int default 1
)
returns public.vales
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_reg public.vales%rowtype;
begin
  if public.current_papel() not in ('owner','gerente','financeiro') then
    raise exception 'Sem permissão para registrar vale';
  end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Valor de vale inválido'; end if;
  if not exists (
    select 1 from public.funcionarios
    where id = p_funcionario_id and organization_id = public.current_org_id()
  ) then raise exception 'Funcionário não encontrado nesta empresa'; end if;

  insert into public.vales(funcionario_id, valor, observacao, desconto_modo, desconto_parcelas, desconto_inicio)
  values (
    p_funcionario_id, round(p_valor,2), nullif(trim(p_observacao),''),
    coalesce(p_modo,'proximo_pagamento'),
    case when p_modo = 'dividido' then greatest(2, least(coalesce(p_parcelas,2),12)) else 1 end,
    p_data_inicio
  ) returning * into v_reg;

  perform public.planejar_desconto_vale(v_reg.id, p_modo, p_data_inicio, p_parcelas);
  return v_reg;
end;
$$;

revoke all on function public.registrar_vale_planejado(uuid,numeric,text,text,date,int) from public;
grant execute on function public.registrar_vale_planejado(uuid,numeric,text,text,date,int) to authenticated;

-- Mantém a RPC antiga funcionando com a nova chave (parcela 1/1).
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

  insert into public.pagamentos_funcionario(
    funcionario_id, periodo_inicio, periodo_fim, data_prevista, data_pagamento,
    parcela_numero, total_parcelas, valor_liquido, observacao
  ) values (
    p_funcionario_id, p_periodo_inicio, p_periodo_fim, p_data_pagamento, p_data_pagamento,
    1, 1, p_valor_liquido, nullif(trim(p_observacao),'')
  )
  on conflict (organization_id, funcionario_id, periodo_inicio, periodo_fim, parcela_numero)
  do update set
    data_prevista = excluded.data_prevista,
    data_pagamento = excluded.data_pagamento,
    total_parcelas = excluded.total_parcelas,
    valor_liquido = excluded.valor_liquido,
    observacao = excluded.observacao
  returning * into v_reg;

  return v_reg;
end;
$$;

-- Nova RPC para registrar uma parcela específica do pagamento mensal.
create or replace function public.registrar_pagamento_funcionario_parcela(
  p_funcionario_id uuid,
  p_competencia date,
  p_data_prevista date,
  p_parcela_numero int,
  p_total_parcelas int,
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
  v_inicio date := date_trunc('month', p_competencia)::date;
  v_fim date := (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date;
begin
  if public.current_papel() not in ('owner','gerente','financeiro') then
    raise exception 'Sem permissão para registrar pagamento de funcionário';
  end if;
  if p_valor_liquido < 0 then raise exception 'Valor líquido inválido'; end if;
  if p_parcela_numero < 1 or p_total_parcelas < 1 or p_parcela_numero > p_total_parcelas then
    raise exception 'Parcela de pagamento inválida';
  end if;
  if not exists (
    select 1 from public.funcionarios
    where id = p_funcionario_id and organization_id = public.current_org_id()
  ) then raise exception 'Funcionário não encontrado nesta empresa'; end if;

  insert into public.pagamentos_funcionario(
    funcionario_id, periodo_inicio, periodo_fim, data_prevista, data_pagamento,
    parcela_numero, total_parcelas, valor_liquido, observacao
  ) values (
    p_funcionario_id, v_inicio, v_fim, p_data_prevista, p_data_pagamento,
    p_parcela_numero, p_total_parcelas, round(p_valor_liquido,2), nullif(trim(p_observacao),'')
  )
  on conflict (organization_id, funcionario_id, periodo_inicio, periodo_fim, parcela_numero)
  do update set
    data_prevista = excluded.data_prevista,
    data_pagamento = excluded.data_pagamento,
    total_parcelas = excluded.total_parcelas,
    valor_liquido = excluded.valor_liquido,
    observacao = excluded.observacao
  returning * into v_reg;

  update public.vale_descontos
  set status = 'aplicado', pagamento_funcionario_id = v_reg.id
  where organization_id = public.current_org_id()
    and funcionario_id = p_funcionario_id
    and competencia = v_inicio
    and parcela_pagamento = p_parcela_numero
    and status = 'pendente';

  return v_reg;
end;
$$;

revoke all on function public.registrar_pagamento_funcionario_parcela(uuid,date,date,int,int,date,numeric,text) from public;
grant execute on function public.registrar_pagamento_funcionario_parcela(uuid,date,date,int,int,date,numeric,text) to authenticated;

-- Vale recorrente: ao ser criado, agenda automaticamente o desconto no próximo pagamento.
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
  v_vale_id uuid;
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
      funcionario_id, valor, data, observacao, origem, competencia,
      desconto_modo, desconto_parcelas
    ) values (
      v_func.id,
      v_func.vale_recorrente_valor,
      v_data,
      'Vale mensal recorrente',
      'recorrente',
      v_inicio,
      'proximo_pagamento',
      1
    ) on conflict do nothing
    returning id into v_vale_id;

    if v_vale_id is not null then
      perform public.planejar_desconto_vale(v_vale_id, 'proximo_pagamento', null, 1);
      v_inseridos := v_inseridos + 1;
    end if;
    v_vale_id := null;
  end loop;

  return v_inseridos;
end;
$$;
