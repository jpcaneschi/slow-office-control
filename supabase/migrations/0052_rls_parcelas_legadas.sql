-- Fecha as policies históricas abertas da tabela `parcelas`.
--
-- Essa tabela existe apenas em alguns bancos antigos e não possui
-- organization_id próprio. O tenant é derivado da venda relacionada. Em uma
-- instalação nova a migration vira no-op, por isso pode rodar em todos os
-- ambientes na mesma ordem.

do $$
begin
  if to_regclass('public.parcelas') is null then
    return;
  end if;

  execute 'alter table public.parcelas enable row level security';

  execute 'drop policy if exists parcelas_select on public.parcelas';
  execute 'drop policy if exists parcelas_insert on public.parcelas';
  execute 'drop policy if exists parcelas_update on public.parcelas';
  execute 'drop policy if exists parcelas_delete on public.parcelas';
  execute 'drop policy if exists rbac_select on public.parcelas';
  execute 'drop policy if exists rbac_insert on public.parcelas';
  execute 'drop policy if exists rbac_update on public.parcelas';
  execute 'drop policy if exists rbac_delete on public.parcelas';

  execute $policy$
    create policy rbac_select on public.parcelas
    for select to authenticated
    using (
      public.current_papel() = any (array['owner','gerente','caixa','financeiro'])
      and exists (
        select 1
        from public.vendas v
        where v.id = parcelas.venda_id
          and v.organization_id = public.current_org_id()
      )
    )
  $policy$;

  execute $policy$
    create policy rbac_insert on public.parcelas
    for insert to authenticated
    with check (
      public.current_papel() = any (array['owner','gerente','caixa'])
      and exists (
        select 1
        from public.vendas v
        where v.id = parcelas.venda_id
          and v.organization_id = public.current_org_id()
      )
    )
  $policy$;

  execute $policy$
    create policy rbac_update on public.parcelas
    for update to authenticated
    using (
      public.current_papel() = any (array['owner','gerente','caixa'])
      and exists (
        select 1
        from public.vendas v
        where v.id = parcelas.venda_id
          and v.organization_id = public.current_org_id()
      )
    )
    with check (
      public.current_papel() = any (array['owner','gerente','caixa'])
      and exists (
        select 1
        from public.vendas v
        where v.id = parcelas.venda_id
          and v.organization_id = public.current_org_id()
      )
    )
  $policy$;

  execute $policy$
    create policy rbac_delete on public.parcelas
    for delete to authenticated
    using (
      public.current_papel() = any (array['owner','gerente','caixa'])
      and exists (
        select 1
        from public.vendas v
        where v.id = parcelas.venda_id
          and v.organization_id = public.current_org_id()
      )
    )
  $policy$;

  execute 'revoke all on table public.parcelas from public';
  execute 'revoke all on table public.parcelas from anon';
  execute 'grant select, insert, update, delete on table public.parcelas to authenticated';
end;
$$;
