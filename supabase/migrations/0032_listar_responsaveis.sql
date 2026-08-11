-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 3 P1 — #13 Unificar "responsáveis" com Funcionários
--
-- Funcionários passam a ser a fonte dos "responsáveis" (venda/despesa/condicional).
-- Mas funcionarios tem dados sensíveis (salário/comissão) que o CAIXA não pode
-- ver (RLS). listar_responsaveis() é SECURITY DEFINER e devolve SÓ id+nome dos
-- ativos da empresa — assim qualquer papel monta o seletor sem vazar salário.
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.listar_responsaveis()
returns table (id uuid, nome text)
language sql
stable
security definer
set search_path = public
as $$
  select id, nome
  from public.funcionarios
  where organization_id = public.current_org_id()
    and ativo is not false
  order by nome
$$;
