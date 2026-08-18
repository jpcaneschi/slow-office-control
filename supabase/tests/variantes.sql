-- ─────────────────────────────────────────────────────────────────────────────
-- PROVA: variantes configuráveis (Área #5, migration 0038).
-- Rode no SQL Editor do STAGING. Cobre: backfill sem perda de estoque,
-- unicidade da combinação por produto e unicidade de SKU por organização.
--
-- Pré-requisito: troque COLE_O_UUID pelo user_id de uma conta dona
-- (select id, email from auth.users;).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── (1) Backfill: tamanho/cor legados viram opções + atributos, sem perder estoque
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_O_UUID', 'role', 'authenticated')::text, true);

  -- Produto com grade + 2 variações no MODELO LEGADO (atributos vazio).
  insert into public.produtos (nome, preco, custo, estoque, status, tem_variacoes)
    values ('Camiseta Backfill', 100, 50, 0, 'ativo', true)
    returning id as produto_id \gset

  insert into public.produto_variacoes (produto_id, tamanho, cor, estoque)
    values (:'produto_id', 'P', 'Off White', 7),
           (:'produto_id', 'M', 'Preto', 5);

  -- Simula o backfill da migration (idempotente): opções + atributos.
  insert into public.produto_opcoes
    (organization_id, produto_id, nome, tipo, obrigatorio, ordem, valores_permitidos)
  select g.organization_id, g.produto_id, 'Tamanho', 'lista', g.todos_tem, 0, g.valores
  from (
    select pv.organization_id, pv.produto_id,
      bool_and(pv.tamanho is not null and pv.tamanho <> '') as todos_tem,
      count(*) filter (where pv.tamanho is not null and pv.tamanho <> '') as n,
      coalesce(jsonb_agg(distinct pv.tamanho) filter
        (where pv.tamanho is not null and pv.tamanho <> ''), '[]'::jsonb) as valores
    from public.produto_variacoes pv where pv.produto_id = :'produto_id'
    group by pv.organization_id, pv.produto_id
  ) g
  where g.n > 0
    and not exists (select 1 from public.produto_opcoes po
                    where po.produto_id = g.produto_id and lower(po.nome) = 'tamanho');

  update public.produto_variacoes pv
  set atributos = '{}'::jsonb
    || case when pv.tamanho is not null and pv.tamanho <> ''
            then jsonb_build_object('Tamanho', pv.tamanho) else '{}'::jsonb end
    || case when pv.cor is not null and pv.cor <> ''
            then jsonb_build_object('Cor', pv.cor) else '{}'::jsonb end
  where pv.produto_id = :'produto_id'
    and (pv.atributos is null or pv.atributos = '{}'::jsonb);

  -- Estoque preservado: total ainda é 12 (7 + 5).
  select coalesce(sum(estoque),0) as estoque_total, count(*) as qtd_variacoes
    from public.produto_variacoes where produto_id = :'produto_id';
  -- Esperado: estoque_total = 12, qtd_variacoes = 2

  -- Atributos preenchidos corretamente.
  select atributos->>'Tamanho' as tam, atributos->>'Cor' as cor, estoque
    from public.produto_variacoes where produto_id = :'produto_id' order by estoque desc;
  -- Esperado: (P, Off White, 7) e (M, Preto, 5)
rollback;

-- ── (2) Unicidade: combinação duplicada por produto é BLOQUEADA ───────────────
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_O_UUID', 'role', 'authenticated')::text, true);

  insert into public.produtos (nome, preco, custo, estoque, status, tem_variacoes)
    values ('Tenis Numeracao', 200, 100, 0, 'ativo', true)
    returning id as produto_id \gset

  insert into public.produto_variacoes (produto_id, atributos, estoque)
    values (:'produto_id', '{"Numeração":"40"}'::jsonb, 3);

  -- Inserir a MESMA combinação deve falhar (unique index produto_variacoes_combo_uidx).
  -- Esperado: ERRO de violação de unicidade.
  insert into public.produto_variacoes (produto_id, atributos, estoque)
    values (:'produto_id', '{"Numeração":"40"}'::jsonb, 9);
rollback;

-- ── (3) White ≠ Off White ≠ Branco (combinações distintas são aceitas) ─────────
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_O_UUID', 'role', 'authenticated')::text, true);

  insert into public.produtos (nome, preco, custo, estoque, status, tem_variacoes)
    values ('Camiseta Cores', 80, 40, 0, 'ativo', true)
    returning id as produto_id \gset

  insert into public.produto_variacoes (produto_id, atributos, estoque)
    values (:'produto_id', '{"Cor":"White"}'::jsonb, 1),
           (:'produto_id', '{"Cor":"Off White"}'::jsonb, 1),
           (:'produto_id', '{"Cor":"Branco"}'::jsonb, 1);

  select count(*) as qtd from public.produto_variacoes where produto_id = :'produto_id';
  -- Esperado: qtd = 3 (as três cores coexistem)
rollback;

-- ── (4) Unicidade de SKU por organização (quando preenchido) ──────────────────
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_O_UUID', 'role', 'authenticated')::text, true);

  insert into public.produtos (nome, preco, custo, estoque, status, tem_variacoes)
    values ('Produto SKU A', 10, 5, 0, 'ativo', true)
    returning id as pa \gset
  insert into public.produtos (nome, preco, custo, estoque, status, tem_variacoes)
    values ('Produto SKU B', 10, 5, 0, 'ativo', true)
    returning id as pb \gset

  insert into public.produto_variacoes (produto_id, atributos, sku, estoque)
    values (:'pa', '{"Tamanho":"P"}'::jsonb, 'SKU-123', 1);

  -- Mesmo SKU em outra variação (outro produto) na MESMA org deve falhar.
  -- Esperado: ERRO de unicidade (produto_variacoes_sku_org_uidx).
  insert into public.produto_variacoes (produto_id, atributos, sku, estoque)
    values (:'pb', '{"Tamanho":"M"}'::jsonb, 'SKU-123', 1);
rollback;
