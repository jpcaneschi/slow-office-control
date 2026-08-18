-- ─────────────────────────────────────────────────────────────────────────────
-- PROVA: devolução de venda SEM DUPLO ESTORNO. Rode no STAGING.
-- Cobre a Área #8 (migration 0039): devolver_itens_venda idempotente por
-- p_idempotency_key — retry/duplo-envio da mesma requisição não estorna 2x.
--
-- Pré-requisito: conta owner. Troque COLE_O_UUID pelo seu user_id
-- (select auth.uid() logado, ou o id em organization_members).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── (1) Devolução idempotente: mesma chave não estorna duas vezes ─────────────
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_O_UUID', 'role', 'authenticated')::text, true);

  -- Produto simples com estoque 10.
  insert into public.produtos (nome, preco, custo, estoque, status, tem_variacoes)
  values ('Produto devolução', 100, 50, 10, 'ativo', false)
  returning id as prod \gset

  -- Venda concluída com 1 item (2 unidades).
  insert into public.vendas (status, total, subtotal)
  values ('concluida', 200, 200) returning id as venda \gset

  insert into public.venda_itens
    (venda_id, produto_id, quantidade, preco_unitario, custo_unitario, total_item)
  values (:'venda', :'prod', 2, 100, 50, 200)
  returning id as item \gset

  -- Devolve 2 unidades com a chave 'k-1' → estoque deve ir de 10 para 12.
  select public.devolver_itens_venda(
    :'venda',
    jsonb_build_array(jsonb_build_object('venda_item_id', :'item', 'quantidade', 2)),
    null,
    'k-1'
  );

  -- REENVIO com a MESMA chave 'k-1' → deve ser no-op (estoque continua 12).
  select public.devolver_itens_venda(
    :'venda',
    jsonb_build_array(jsonb_build_object('venda_item_id', :'item', 'quantidade', 2)),
    null,
    'k-1'
  );

  select estoque as estoque_final from public.produtos where id = :'prod';
  -- Esperado: 12 (NÃO 14).

  select count(*) as movimentos_devolucao
    from public.estoque_movimentacoes
    where referencia_id = :'venda' and tipo = 'devolucao';
  -- Esperado: 1 (o reenvio não gerou outro movimento).

  select count(*) as linhas_devolucao
    from public.venda_devolucoes where venda_id = :'venda';
  -- Esperado: 1.
rollback;

-- ── (2) Isolamento: notificacoes agora é escopada por empresa (RLS) ───────────
-- Antes de 0039 a policy era using(true) (vazava entre empresas). Agora só
-- retorna as da própria organização. Rode com dois usuários de orgs diferentes:
--   set local role authenticated; (org A)  → select count(*) from notificacoes;
--   set local role authenticated; (org B)  → não deve ver as de A.
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_O_UUID', 'role', 'authenticated')::text, true);

  insert into public.notificacoes (chave, tipo, titulo)
  values ('teste_iso:' || gen_random_uuid()::text, 'estoque', 'Teste isolamento')
  returning id as notif \gset

  select organization_id = public.current_org_id() as org_correta
    from public.notificacoes where id = :'notif';
  -- Esperado: true (default current_org_id preencheu a empresa).
rollback;
