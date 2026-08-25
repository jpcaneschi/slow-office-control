-- Oculta linhas de folha sem valor, preservando o cadastro do funcionário.
alter function public.agenda_operacao_mes(date) rename to agenda_operacao_mes_base;

create or replace function public.agenda_operacao_mes(p_competencia date default current_date)
returns table(
  id text,
  data date,
  tipo text,
  titulo text,
  detalhe text,
  valor numeric,
  status text,
  href text
)
language sql
security invoker
stable
set search_path = public
as $$
  select a.id,a.data,a.tipo,a.titulo,a.detalhe,a.valor,a.status,a.href
    from public.agenda_operacao_mes_base(p_competencia) a
   where not (a.tipo = 'folha' and coalesce(a.valor,0) <= 0.009)
   order by a.data,a.tipo,a.titulo;
$$;

revoke all on function public.agenda_operacao_mes(date) from public;
grant execute on function public.agenda_operacao_mes(date) to authenticated;
