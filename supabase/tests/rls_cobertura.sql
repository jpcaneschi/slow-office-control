-- ─────────────────────────────────────────────────────────────────────────────
-- AUDITORIA DE COBERTURA (Área #7) — rode no SQL Editor do Supabase.
-- Para cada tabela de negócio: RLS ligado? tem organization_id? quantas policies?
-- Esperado: rls_ligado = true em TODAS; tem_org_id = true nas operacionais.
-- Inclui as tabelas novas das áreas #1/#5/#8 (taxas_cartao, produto_opcoes) e
-- um detector de policy PERMISSIVA ABERTA (using true) — que seria vazamento.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── (1) Cobertura por tabela ─────────────────────────────────────────────────
select
  c.relname as tabela,
  c.relrowsecurity as rls_ligado,
  exists (
    select 1 from information_schema.columns col
    where col.table_schema = 'public'
      and col.table_name = c.relname
      and col.column_name = 'organization_id'
  ) as tem_org_id,
  (select count(*) from pg_policies p
     where p.schemaname = 'public' and p.tablename = c.relname) as qtd_policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'clientes','produtos','produto_variacoes','produto_opcoes','vendas','venda_pagamentos','parcelas',
    'venda_itens','venda_devolucoes','condicionais','condicional_itens',
    'promissorias','promissoria_pagamentos','despesas','despesas_recorrentes',
    'estoque_movimentacoes','eventos','notificacoes','configuracoes',
    'tatuagem_atendimentos','funcionarios','vales','servicos',
    'atendimentos_servico','taxas_cartao','organization_members',
    'organization_invites','subscriptions','audit_logs','access_requests',
    'platform_admins'
  )
order by rls_ligado asc, tem_org_id asc, tabela;
-- Esperado: nenhuma linha com rls_ligado = false.

-- ── (2) Nenhuma tabela de negócio com RLS DESLIGADO (deve vir vazio) ──────────
select c.relname as tabela_sem_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and c.relrowsecurity = false
  and c.relname in (
    'clientes','produtos','produto_variacoes','produto_opcoes','vendas','parcelas',
    'venda_itens','venda_devolucoes','condicionais','condicional_itens',
    'promissorias','promissoria_pagamentos','despesas','despesas_recorrentes',
    'estoque_movimentacoes','eventos','notificacoes','configuracoes',
    'tatuagem_atendimentos','funcionarios','vales','servicos',
    'atendimentos_servico','taxas_cartao','audit_logs','access_requests',
    'platform_admins'
  );
-- Esperado: 0 linhas.

-- ── (3) Detector de policy PERMISSIVA ABERTA (using true / check true) ────────
-- Uma policy `using(true)` numa tabela de negócio deixaria vazar entre empresas.
-- audit_logs/subscriptions são exceção (regra própria), então não entram aqui.
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'clientes','produtos','produto_variacoes','produto_opcoes','vendas','parcelas',
    'venda_itens','venda_devolucoes','condicionais','condicional_itens',
    'promissorias','promissoria_pagamentos','despesas','despesas_recorrentes',
    'estoque_movimentacoes','eventos','notificacoes','configuracoes',
    'tatuagem_atendimentos','funcionarios','vales','servicos',
    'atendimentos_servico','taxas_cartao'
  )
  and (coalesce(qual, '') in ('true', '(true)')
       or coalesce(with_check, '') in ('true', '(true)'));
-- Esperado: 0 linhas (nenhuma policy aberta).

-- ── (4) Toda policy de negócio amarra organization_id à sessão ───────────────
-- Lista policies cujo predicado NÃO menciona organization_id → suspeitas.
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'clientes','produtos','produto_variacoes','produto_opcoes','vendas','parcelas',
    'venda_itens','venda_devolucoes','condicionais','condicional_itens',
    'promissorias','promissoria_pagamentos','despesas','despesas_recorrentes',
    'estoque_movimentacoes','eventos','notificacoes','configuracoes',
    'tatuagem_atendimentos','funcionarios','vales','servicos',
    'atendimentos_servico','taxas_cartao'
  )
  and coalesce(qual, '') not ilike '%organization_id%'
  and coalesce(with_check, '') not ilike '%organization_id%';
-- Esperado: 0 linhas (todas escopam por organization_id).
