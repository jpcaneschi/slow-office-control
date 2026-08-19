-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 3 P0 — #7 Segurança multiempresa (endurecimento pontual)
--
-- Achado da auditoria #7: produto_opcoes (0038) ficou com "org_isolation"
-- (QUALQUER membro da empresa lê/escreve), enquanto produtos/produto_variacoes
-- restringem ESCRITA a owner,gerente (RBAC do 0017). As opções de produto são
-- parte da definição do catálogo → devem seguir o MESMO papel que o produto.
-- Sem isso, um `caixa` conseguiria criar/editar definições de opção sem poder
-- editar o produto. Não era vazamento entre empresas (o org já estava certo),
-- mas era inconsistência de RBAC.
--
-- Alinha produto_opcoes à mesma matriz de produtos:
--   LER:      owner,gerente,caixa,financeiro
--   ESCREVER: owner,gerente
--
-- Idempotente (drop policy if exists + recria), aditivo, sem tocar em dados.
-- Reverter: dropar as rbac_* e recriar "org_isolation" como em 0038.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_sel text := 'owner,gerente,caixa,financeiro';
  v_wr  text := 'owner,gerente';
begin
  if to_regclass('public.produto_opcoes') is null then
    return;
  end if;

  alter table public.produto_opcoes enable row level security;

  -- Remove a policy antiga (qualquer membro) e quaisquer rbac_* anteriores.
  drop policy if exists "org_isolation" on public.produto_opcoes;
  drop policy if exists "rbac_select" on public.produto_opcoes;
  drop policy if exists "rbac_insert" on public.produto_opcoes;
  drop policy if exists "rbac_update" on public.produto_opcoes;
  drop policy if exists "rbac_delete" on public.produto_opcoes;

  execute format(
    'create policy "rbac_select" on public.produto_opcoes for select to authenticated '
    || 'using (organization_id = public.current_org_id() '
    || 'and public.current_papel() = any(string_to_array(%L, %L)))',
    v_sel, ','
  );
  execute format(
    'create policy "rbac_insert" on public.produto_opcoes for insert to authenticated '
    || 'with check (organization_id = public.current_org_id() '
    || 'and public.current_papel() = any(string_to_array(%L, %L)))',
    v_wr, ','
  );
  execute format(
    'create policy "rbac_update" on public.produto_opcoes for update to authenticated '
    || 'using (organization_id = public.current_org_id() '
    || 'and public.current_papel() = any(string_to_array(%L, %L))) '
    || 'with check (organization_id = public.current_org_id() '
    || 'and public.current_papel() = any(string_to_array(%L, %L)))',
    v_wr, ',', v_wr, ','
  );
  execute format(
    'create policy "rbac_delete" on public.produto_opcoes for delete to authenticated '
    || 'using (organization_id = public.current_org_id() '
    || 'and public.current_papel() = any(string_to_array(%L, %L)))',
    v_wr, ','
  );
end $$;
