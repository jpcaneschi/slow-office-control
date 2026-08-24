-- Cronograma de promissórias sem quebrar registros e RPCs existentes.
-- data_vencimento continua disponível para calendário/notificações legadas;
-- data_primeira_parcela explicita o início do plano mensal.

alter table public.promissorias
  add column if not exists data_primeira_parcela date;

update public.promissorias
set data_primeira_parcela = data_vencimento
where data_primeira_parcela is null
  and data_vencimento is not null;

create or replace function public.fn_sincroniza_datas_promissoria()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.data_primeira_parcela is null then
    new.data_primeira_parcela := new.data_vencimento;
  end if;

  if new.data_vencimento is null then
    new.data_vencimento := new.data_primeira_parcela;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sincroniza_datas_promissoria on public.promissorias;
create trigger trg_sincroniza_datas_promissoria
before insert or update of data_primeira_parcela, data_vencimento
on public.promissorias
for each row execute function public.fn_sincroniza_datas_promissoria();

comment on column public.promissorias.data_primeira_parcela is
  'Data da primeira parcela; as demais vencem mensalmente no mesmo dia, com ajuste para o último dia do mês.';
