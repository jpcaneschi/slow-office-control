-- ─────────────────────────────────────────────────────────────────────────────
-- Contas recorrentes: lançamento mensal rastreável e idempotente.
--
-- Antes a tela reconhecia uma conta lançada apenas por descrição + mês. Duas
-- contas com o mesmo nome se confundiam e dois cliques simultâneos podiam gerar
-- despesa duplicada. A partir daqui cada despesa aponta para seu modelo e para a
-- competência mensal, com unicidade garantida no banco.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.despesas
  add column if not exists despesa_recorrente_id uuid
    references public.despesas_recorrentes (id) on delete set null,
  add column if not exists competencia date;

create unique index if not exists despesas_recorrente_competencia_uidx
  on public.despesas (despesa_recorrente_id, competencia)
  where despesa_recorrente_id is not null and competencia is not null;

create or replace function public.lancar_despesa_recorrente(
  p_recorrente_id uuid,
  p_competencia date default current_date
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_rec record;
  v_mes date;
  v_ultimo_dia int;
  v_data date;
  v_id uuid;
begin
  select *
    into v_rec
    from public.despesas_recorrentes
    where id = p_recorrente_id
      and ativo = true;

  if not found then
    raise exception 'Conta recorrente nao encontrada ou inativa';
  end if;

  v_mes := date_trunc('month', coalesce(p_competencia, current_date))::date;
  v_ultimo_dia := extract(day from (v_mes + interval '1 month - 1 day'))::int;
  v_data := (
    v_mes
    + (least(greatest(coalesce(v_rec.dia_vencimento, 1), 1), v_ultimo_dia) - 1)
      * interval '1 day'
  )::date;

  insert into public.despesas (
    organization_id, user_id, despesa_recorrente_id, competencia,
    descricao, categoria, valor, data, responsavel, observacao
  ) values (
    v_rec.organization_id, auth.uid(), v_rec.id, v_mes,
    v_rec.descricao, v_rec.categoria, v_rec.valor, v_data, null,
    'Conta recorrente'
  )
  on conflict (despesa_recorrente_id, competencia)
    where despesa_recorrente_id is not null and competencia is not null
  do nothing
  returning id into v_id;

  -- Em reexecução, devolve a despesa já existente sem gerar UPDATE/auditoria.
  if v_id is null then
    select d.id
      into v_id
      from public.despesas d
      where d.despesa_recorrente_id = v_rec.id
        and d.competencia = v_mes;
  end if;

  return v_id;
end;
$$;
