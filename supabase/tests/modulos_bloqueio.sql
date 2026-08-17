-- ─────────────────────────────────────────────────────────────────────────────
-- PROVA: módulo desligado é bloqueado NO BANCO — rode no SQL Editor do staging.
--
-- Cobre a Área #4 (migration 0034): com um módulo desligado em modulos_ativos,
-- o backend recusa INSERT e UPDATE nas tabelas do módulo e recusa a RPC
-- converter_condicional_venda — mesmo que o front seja burlado. Leitura (SELECT)
-- continua liberada (histórico preservado). Reativar volta ao normal.
--
-- Pré-requisito: UMA conta que criou a própria loja (dona). Troque COLE_O_UUID
-- pelo user_id real (select id, email from auth.users;). Rode bloco a bloco.
--
-- Como funciona: "set local role authenticated" + set_config do JWT fazem o RLS
-- e o auth.uid()/current_org_id() responderem como aquele usuário.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── (0) Estado inicial: garanta 'tatuagem' e 'condicional' LIGADOS ───────────
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_O_UUID', 'role', 'authenticated')::text, true);

  select current_org_id() as empresa;
  select modulos_ativos   as antes from public.configuracoes
    where organization_id = current_org_id() order by created_at limit 1;

  -- fn_modulo_ativo deve refletir a config:
  select public.fn_modulo_ativo(current_org_id(), 'tatuagem')   as tatuagem_ativa;   -- true
  select public.fn_modulo_ativo(current_org_id(), 'condicional') as condicional_ativa; -- true
rollback;

-- ── (1) DESLIGA 'tatuagem' e prova que INSERT é barrado ──────────────────────
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_O_UUID', 'role', 'authenticated')::text, true);

  update public.configuracoes
     set modulos_ativos = array['servicos','condicional']  -- sem 'tatuagem'
   where organization_id = current_org_id();

  select public.fn_modulo_ativo(current_org_id(), 'tatuagem') as deve_ser_false;

  -- Esperado: ERRO 'O módulo "tatuagem" está desativado...'
  -- (descomente para ver o erro; a transação será abortada)
  -- insert into public.tatuagem_atendimentos (organization_id, descricao, valor, data)
  -- values (current_org_id(), 'teste', 100, current_date);
rollback;  -- desfaz o toggle (não persiste o teste)

-- ── (2) UPDATE também é barrado com o módulo desligado ───────────────────────
-- Pegue um id existente de tatuagem_atendimentos (com o módulo ligado):
--   select id from public.tatuagem_atendimentos limit 1;
-- Depois, dentro de um begin, desligue 'tatuagem' e tente editar — deve dar ERRO.
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_O_UUID', 'role', 'authenticated')::text, true);

  update public.configuracoes
     set modulos_ativos = array['servicos','condicional']
   where organization_id = current_org_id();

  -- Esperado: ERRO de módulo desativado (troque COLE_O_ID por um id real):
  -- update public.tatuagem_atendimentos set descricao = descricao
  --   where id = 'COLE_O_ID';
rollback;

-- ── (3) SELECT continua liberado (histórico preservado) ──────────────────────
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_O_UUID', 'role', 'authenticated')::text, true);

  update public.configuracoes
     set modulos_ativos = array['servicos','condicional']
   where organization_id = current_org_id();

  -- Deve LISTAR normalmente, mesmo com o módulo desligado:
  select count(*) as tatuagens_visiveis_mesmo_desligado
    from public.tatuagem_atendimentos;
rollback;

-- ── (4) converter_condicional_venda recusa com 'condicional' desligado ───────
-- Pegue um condicional aberto (com o módulo ligado):
--   select id from public.condicionais where status = 'aberto' limit 1;
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_O_UUID', 'role', 'authenticated')::text, true);

  update public.configuracoes
     set modulos_ativos = array['tatuagem','servicos']  -- sem 'condicional'
   where organization_id = current_org_id();

  -- Esperado: ERRO 'O módulo "condicional" está desativado...'
  -- select public.converter_condicional_venda('COLE_O_COND_ID', 'dinheiro', '[]'::jsonb);
rollback;

-- ── (5) Reativar volta ao normal ─────────────────────────────────────────────
-- Depois dos testes, garanta os módulos que a loja usa ligados. Para a Slow,
-- 'tatuagem' deve terminar LIGADA (requisito da Área #4):
--   update public.configuracoes
--      set modulos_ativos = array['tatuagem','servicos','condicional']
--    where organization_id = current_org_id();
