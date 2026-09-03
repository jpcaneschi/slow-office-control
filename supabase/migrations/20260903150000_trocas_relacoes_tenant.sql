-- Endurece os INSERTs diretos: além do organization_id da sessão, todos os
-- relacionamentos informados precisam pertencer à mesma organização e venda.

drop policy if exists "trocas_insert_gestao" on public.venda_trocas;
create policy "trocas_insert_gestao"
  on public.venda_trocas for insert to authenticated
  with check (
    organization_id = (select public.current_org_id())
    and (select public.current_papel()) in ('owner', 'gerente')
    and exists (
      select 1
      from public.vendas v
      where v.id = venda_trocas.venda_id
        and v.organization_id = venda_trocas.organization_id
    )
  );

drop policy if exists "troca_itens_insert_gestao" on public.venda_troca_itens;
create policy "troca_itens_insert_gestao"
  on public.venda_troca_itens for insert to authenticated
  with check (
    organization_id = (select public.current_org_id())
    and (select public.current_papel()) in ('owner', 'gerente')
    and exists (
      select 1
      from public.venda_trocas t
      where t.id = venda_troca_itens.troca_id
        and t.organization_id = venda_troca_itens.organization_id
        and t.venda_id = venda_troca_itens.venda_id
    )
    and exists (
      select 1
      from public.vendas v
      where v.id = venda_troca_itens.venda_id
        and v.organization_id = venda_troca_itens.organization_id
    )
    and exists (
      select 1
      from public.produtos p
      where p.id = venda_troca_itens.produto_id
        and p.organization_id = venda_troca_itens.organization_id
    )
    and (
      venda_troca_itens.variacao_id is null
      or exists (
        select 1
        from public.produto_variacoes pv
        where pv.id = venda_troca_itens.variacao_id
          and pv.produto_id = venda_troca_itens.produto_id
          and pv.organization_id = venda_troca_itens.organization_id
      )
    )
    and (
      venda_troca_itens.venda_item_id is null
      or exists (
        select 1
        from public.venda_itens vi
        where vi.id = venda_troca_itens.venda_item_id
          and vi.venda_id = venda_troca_itens.venda_id
          and vi.organization_id = venda_troca_itens.organization_id
          and vi.produto_id = venda_troca_itens.produto_id
          and vi.variacao_id is not distinct from venda_troca_itens.variacao_id
      )
    )
  );
