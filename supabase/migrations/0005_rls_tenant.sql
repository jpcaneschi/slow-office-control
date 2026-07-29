-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 2.3 — RLS (isolamento por empresa)
-- Cada usuário autenticado só acessa as linhas onde user_id = auth.uid()
-- (profiles usa id = auth.uid()). Remove TODAS as políticas antigas antes,
-- inclusive as abertas 'using(true)', pra não sobrar brecha.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Garante RLS ligado em todas as tabelas
do $$
declare t text;
begin
  foreach t in array array[
    'clientes','produtos','vendas','venda_itens','condicionais',
    'condicional_itens','promissorias','despesas','estoque_movimentacoes',
    'eventos','notificacoes','configuracoes','profiles'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- 2) Remove QUALQUER política existente nessas tabelas (limpa brechas antigas)
do $$
declare r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename = any(array[
        'clientes','produtos','vendas','venda_itens','condicionais',
        'condicional_itens','promissorias','despesas','estoque_movimentacoes',
        'eventos','notificacoes','configuracoes','profiles'
      ])
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- 3) Cria a política de isolamento por dono em cada tabela de dados
do $$
declare t text;
begin
  foreach t in array array[
    'clientes','produtos','vendas','venda_itens','condicionais',
    'condicional_itens','promissorias','despesas','estoque_movimentacoes',
    'eventos','notificacoes','configuracoes'
  ] loop
    execute format(
      'create policy "tenant_isolation" on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t
    );
  end loop;
end $$;

-- 4) profiles: o dono é a própria linha (id = usuário)
create policy "profiles_owner"
  on public.profiles
  for all
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
