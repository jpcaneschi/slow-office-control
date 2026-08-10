-- ─────────────────────────────────────────────────────────────────────────────
-- Fase (segurança) — RLS POR PAPEL nas tabelas operacionais
--
-- Antes: qualquer membro da empresa podia ler/escrever tudo (org_isolation).
-- Agora: cada comando (select/insert/update/delete) é liberado só para os
-- papéis certos, no banco — fecha a brecha da camada de app.
--
-- Ponto crítico do estoque: a venda do CAIXA precisa baixar estoque, mas o
-- caixa NÃO pode editar o catálogo (produtos). Solução: registrar_movimentacao
-- vira SECURITY DEFINER (roda com privilégio elevado) e valida a empresa por
-- dentro — é o único caminho para mexer no estoque. Assim o caixa vende sem ter
-- permissão de escrita direta em produtos/produto_variacoes.
--
-- Depende de current_org_id() (0009) e current_papel() (0016). Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) registrar_movimentacao: SECURITY DEFINER + validação de empresa ───────
drop function if exists public.registrar_movimentacao(uuid, text, numeric, text, text, uuid);
drop function if exists public.registrar_movimentacao(uuid, text, numeric, text, text, uuid, uuid);

create or replace function public.registrar_movimentacao(
  p_produto_id uuid,
  p_tipo text,
  p_quantidade numeric,
  p_motivo text default null,
  p_observacao text default null,
  p_referencia_id uuid default null,
  p_variacao_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_anterior numeric;
  v_qtd numeric := abs(coalesce(p_quantidade, 0));
  v_posterior numeric;
  v_soma boolean;
begin
  -- Trava a linha do alvo (variação, se informada; senão o produto) e lê a empresa.
  if p_variacao_id is not null then
    select coalesce(estoque, 0), organization_id
      into v_anterior, v_org
      from public.produto_variacoes where id = p_variacao_id for update;
  else
    select coalesce(estoque, 0), organization_id
      into v_anterior, v_org
      from public.produtos where id = p_produto_id for update;
  end if;

  if v_org is null then
    raise exception 'Produto/variação não encontrado';
  end if;

  -- Validação de empresa: só mexe no estoque da PRÓPRIA empresa do usuário.
  if v_org <> public.current_org_id() then
    raise exception 'Sem acesso a este produto';
  end if;

  -- Tipos que SOMAM ao estoque; os demais subtraem.
  v_soma := p_tipo in (
    'entrada','cancelamento','devolucao','retorno_condicional',
    'estoque_inicial','importacao','ajuste_positivo'
  );

  v_posterior := case when v_soma then v_anterior + v_qtd else v_anterior - v_qtd end;

  if v_posterior < 0 then
    raise exception 'Estoque insuficiente (atual: %, saída: %)', v_anterior, v_qtd;
  end if;

  insert into public.estoque_movimentacoes
    (produto_id, variacao_id, tipo, quantidade, quantidade_anterior, quantidade_posterior, motivo, observacao, referencia_id, organization_id)
  values
    (p_produto_id, p_variacao_id, p_tipo, v_qtd, v_anterior, v_posterior, p_motivo, p_observacao, p_referencia_id, v_org);

  if p_variacao_id is not null then
    update public.produto_variacoes set estoque = v_posterior where id = p_variacao_id;
  else
    update public.produtos set estoque = v_posterior where id = p_produto_id;
  end if;
end;
$$;

-- ── 2) Políticas por papel (SELECT / INSERT / UPDATE / DELETE) ────────────────
-- Matriz: (tabela, papéis que LEEM, papéis que ESCREVEM).
do $$
declare r record;
begin
  for r in
    select * from (values
      ('clientes',             'owner,gerente,caixa,financeiro', 'owner,gerente,caixa,financeiro'),
      ('produtos',             'owner,gerente,caixa,financeiro', 'owner,gerente'),
      ('produto_variacoes',    'owner,gerente,caixa,financeiro', 'owner,gerente'),
      ('vendas',               'owner,gerente,caixa,financeiro', 'owner,gerente,caixa'),
      ('venda_itens',          'owner,gerente,caixa,financeiro', 'owner,gerente,caixa'),
      ('condicionais',         'owner,gerente,caixa',            'owner,gerente,caixa'),
      ('condicional_itens',    'owner,gerente,caixa',            'owner,gerente,caixa'),
      ('promissorias',         'owner,gerente,caixa,financeiro', 'owner,gerente,caixa,financeiro'),
      ('despesas',             'owner,gerente,financeiro',       'owner,gerente,financeiro'),
      ('despesas_recorrentes', 'owner,gerente,financeiro',       'owner,gerente,financeiro'),
      ('estoque_movimentacoes','owner,gerente',                  'owner,gerente'),
      ('eventos',              'owner,gerente,caixa,financeiro', 'owner,gerente,caixa,financeiro'),
      ('notificacoes',         'owner,gerente,caixa,financeiro', 'owner,gerente,caixa,financeiro'),
      ('configuracoes',        'owner,gerente,caixa,financeiro', 'owner'),
      ('tatuagem_atendimentos','owner,gerente,financeiro',       'owner,gerente')
    ) as t(tabela, sel, wr)
  loop
    execute format('alter table public.%I enable row level security', r.tabela);
    execute format('drop policy if exists "org_isolation" on public.%I', r.tabela);
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
