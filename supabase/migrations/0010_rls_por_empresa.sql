-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 3.3 — RLS por EMPRESA (organization) nas tabelas operacionais.
-- Troca o isolamento de "user_id = auth.uid()" para
-- "organization_id ∈ empresas de que o usuário é membro".
-- profiles continua por id = auth.uid() (não muda).
--
-- Pré-requisitos: 0009 já rodado (organization_id preenchido em tudo) e o
-- app da Fase 3.4 no ar (cadastro cria empresa+membership pra novos usuários).
-- Idempotente: pode rodar de novo.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array[
    'clientes','produtos','vendas','venda_itens','condicionais',
    'condicional_itens','promissorias','despesas','estoque_movimentacoes',
    'eventos','notificacoes','configuracoes','tatuagem_atendimentos',
    'despesas_recorrentes'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "tenant_isolation" on public.%I', t);
    execute format('drop policy if exists "org_isolation" on public.%I', t);
    execute format(
      'create policy "org_isolation" on public.%I for all to authenticated '
      || 'using (organization_id in (select organization_id from public.organization_members where user_id = auth.uid())) '
      || 'with check (organization_id in (select organization_id from public.organization_members where user_id = auth.uid()))',
      t
    );
  end loop;
end $$;
