-- ─────────────────────────────────────────────────────────────────────────────
-- AUDITORIA DE COBERTURA — rode no SQL Editor do Supabase.
-- Mostra, para cada tabela de negócio: se o RLS está LIGADO, se tem
-- organization_id e quantas policies existem. O esperado é rls_ligado = true
-- em TODAS e tem_org_id = true nas operacionais.
-- ─────────────────────────────────────────────────────────────────────────────

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
    'clientes','produtos','produto_variacoes','vendas','venda_itens',
    'venda_devolucoes','condicionais','condicional_itens','promissorias',
    'promissoria_pagamentos','despesas','despesas_recorrentes',
    'estoque_movimentacoes','eventos','notificacoes','configuracoes',
    'tatuagem_atendimentos','funcionarios','vales','servicos',
    'atendimentos_servico','organization_members','organization_invites',
    'subscriptions','audit_logs'
  )
order by rls_ligado asc, tabela;
