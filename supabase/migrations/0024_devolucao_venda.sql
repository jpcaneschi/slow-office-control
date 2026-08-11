-- ─────────────────────────────────────────────────────────────────────────────
-- Fase (#2) — Devolução PARCIAL de venda
--
-- Devolve alguns itens (ou parte da quantidade) de uma venda concluída:
--   • volta o estoque (registrar_movimentacao 'devolucao');
--   • registra a devolução em venda_devolucoes (histórico);
--   • reduz a quantidade/total do item e o total/subtotal da venda — assim o
--     Financeiro (receita e COGS) reflete o valor LÍQUIDO sem tocar em código;
--   • se todos os itens zerarem, a venda vira 'cancelada'.
-- Tudo numa transação (RPC atômico). Idempotente.
--
-- Obs.: promissória vinculada (fiado) NÃO é ajustada automaticamente — ajuste o
-- saldo manualmente na tela de Promissórias se for o caso.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.venda_devolucoes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) default public.current_org_id(),
  venda_id uuid not null references public.vendas (id) on delete cascade,
  produto_id uuid,
  variacao_id uuid,
  quantidade numeric(12, 2) not null,
  valor numeric(12, 2) not null,
  custo_unitario numeric(12, 2),
  motivo text,
  created_at timestamptz not null default now()
);
create index if not exists venda_devolucoes_venda_idx on public.venda_devolucoes (venda_id);
create index if not exists venda_devolucoes_org_idx on public.venda_devolucoes (organization_id);

-- ── RLS por papel ────────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select * from (values
      ('venda_devolucoes', 'owner,gerente,caixa,financeiro', 'owner,gerente,caixa')
    ) as t(tabela, sel, wr)
  loop
    execute format('alter table public.%I enable row level security', r.tabela);
    execute format('drop policy if exists "rbac_select" on public.%I', r.tabela);
    execute format('drop policy if exists "rbac_insert" on public.%I', r.tabela);
    execute format('drop policy if exists "rbac_update" on public.%I', r.tabela);
    execute format('drop policy if exists "rbac_delete" on public.%I', r.tabela);
    execute format(
      'create policy "rbac_select" on public.%I for select to authenticated '
      || 'using (organization_id = public.current_org_id() '
      || 'and public.current_papel() = any(string_to_array(%L, %L)))',
      r.tabela, r.sel, ','
    );
    execute format(
      'create policy "rbac_insert" on public.%I for insert to authenticated '
      || 'with check (organization_id = public.current_org_id() '
      || 'and public.current_papel() = any(string_to_array(%L, %L)))',
      r.tabela, r.wr, ','
    );
    execute format(
      'create policy "rbac_update" on public.%I for update to authenticated '
      || 'using (organization_id = public.current_org_id() '
      || 'and public.current_papel() = any(string_to_array(%L, %L))) '
      || 'with check (organization_id = public.current_org_id() '
      || 'and public.current_papel() = any(string_to_array(%L, %L)))',
      r.tabela, r.wr, ',', r.wr, ','
    );
    execute format(
      'create policy "rbac_delete" on public.%I for delete to authenticated '
      || 'using (organization_id = public.current_org_id() '
      || 'and public.current_papel() = any(string_to_array(%L, %L)))',
      r.tabela, r.wr, ','
    );
  end loop;
end $$;

-- ── RPC: devolve itens de uma venda ──────────────────────────────────────────
create or replace function public.devolver_itens_venda(
  p_venda_id uuid,
  p_itens jsonb,          -- [{venda_item_id, quantidade}]
  p_motivo text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text;
  v_item jsonb;
  v_vi record;
  v_qtd numeric;
  v_valor numeric;
  v_total_dev numeric := 0;
begin
  select status into v_status from public.vendas where id = p_venda_id;
  if v_status is null then
    raise exception 'Venda não encontrada';
  end if;
  if v_status <> 'concluida' then
    raise exception 'Só é possível devolver itens de uma venda concluída';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb))
  loop
    v_qtd := (v_item->>'quantidade')::numeric;
    if v_qtd is null or v_qtd <= 0 then
      continue;
    end if;

    select * into v_vi from public.venda_itens
      where id = (v_item->>'venda_item_id')::uuid and venda_id = p_venda_id;
    if not found then
      raise exception 'Item da venda não encontrado';
    end if;
    if v_qtd > v_vi.quantidade then
      raise exception 'Quantidade a devolver maior que a vendida';
    end if;

    v_valor := v_qtd * v_vi.preco_unitario;
    v_total_dev := v_total_dev + v_valor;

    insert into public.venda_devolucoes
      (venda_id, produto_id, variacao_id, quantidade, valor, custo_unitario, motivo)
    values
      (p_venda_id, v_vi.produto_id, v_vi.variacao_id, v_qtd, v_valor, v_vi.custo_unitario, p_motivo);

    perform public.registrar_movimentacao(
      v_vi.produto_id, 'devolucao', v_qtd, 'Devolução de venda', null, p_venda_id, v_vi.variacao_id
    );

    update public.venda_itens
      set quantidade = quantidade - v_qtd,
          total_item = (quantidade - v_qtd) * preco_unitario
      where id = v_vi.id;
  end loop;

  if v_total_dev > 0 then
    update public.vendas
      set total = greatest(0, total - v_total_dev),
          subtotal = greatest(0, coalesce(subtotal, 0) - v_total_dev)
      where id = p_venda_id;

    -- Se não sobrou nenhum item, a venda foi totalmente devolvida.
    if not exists (
      select 1 from public.venda_itens where venda_id = p_venda_id and quantidade > 0
    ) then
      update public.vendas set status = 'cancelada' where id = p_venda_id;
    end if;

    perform public.log_auditoria(
      'venda_devolucao', 'vendas', p_venda_id,
      jsonb_build_object('valor', v_total_dev)
    );
  end if;
end;
$$;
