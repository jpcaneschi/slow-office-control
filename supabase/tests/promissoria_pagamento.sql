-- ─────────────────────────────────────────────────────────────────────────────
-- PROVA: pagamento de promissória seguro no servidor. Rode no STAGING.
-- Cobre a Área #2 (migration 0036): valida saldo, idempotência, bloqueia
-- cancelada, checa papel.
--
-- Pré-requisito: conta owner. Troque COLE_O_UUID pelo user_id e COLE_O_CLIENTE
-- por um id de cliente (select id from clientes limit 1;).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── (1) Não deixa pagar MAIS que o saldo ─────────────────────────────────────
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_O_UUID', 'role', 'authenticated')::text, true);

  insert into public.promissorias (cliente_id, valor_total, parcelas, status)
  values ('COLE_O_CLIENTE', 400, 1, 'em_aberto') returning id as prom \gset

  -- Pagamento parcial de 100 → saldo deve virar 300.
  select public.registrar_pagamento_promissoria(:'prom', 100, null, null, gen_random_uuid()::text) as saldo_apos_100;
  -- Esperado: 300

  -- Tentar pagar 400 (a mais que o saldo 300) → deve dar ERRO:
  -- select public.registrar_pagamento_promissoria(:'prom', 400, null, null, gen_random_uuid()::text);
rollback;

-- ── (2) Idempotência: mesma chave não duplica ────────────────────────────────
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_O_UUID', 'role', 'authenticated')::text, true);

  insert into public.promissorias (cliente_id, valor_total, parcelas, status)
  values ('COLE_O_CLIENTE', 400, 1, 'em_aberto') returning id as prom \gset

  select public.registrar_pagamento_promissoria(:'prom', 100, null, null, 'chave-fixa-1') as saldo_1;
  select public.registrar_pagamento_promissoria(:'prom', 100, null, null, 'chave-fixa-1') as saldo_2_reenvio;
  -- Esperado: saldo_1 = 300 e saldo_2_reenvio = 300 (NÃO 200).

  select count(*) as qtd_pagamentos
    from public.promissoria_pagamentos where promissoria_id = :'prom';
  -- Esperado: 1 (o reenvio não inseriu de novo)
rollback;

-- ── (3) Promissória cancelada NÃO aceita pagamento ───────────────────────────
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_O_UUID', 'role', 'authenticated')::text, true);

  insert into public.promissorias (cliente_id, valor_total, parcelas, status)
  values ('COLE_O_CLIENTE', 400, 1, 'cancelado') returning id as prom \gset

  -- Esperado: ERRO 'Promissória cancelada não aceita pagamento'
  -- select public.registrar_pagamento_promissoria(:'prom', 100, null, null, gen_random_uuid()::text);
rollback;

-- ── (4) Quita ao zerar o saldo ───────────────────────────────────────────────
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_O_UUID', 'role', 'authenticated')::text, true);

  insert into public.promissorias (cliente_id, valor_total, parcelas, status)
  values ('COLE_O_CLIENTE', 200, 1, 'em_aberto') returning id as prom \gset

  select public.registrar_pagamento_promissoria(:'prom', 200, null, null, gen_random_uuid()::text) as saldo_final;
  -- Esperado: 0
  select status from public.promissorias where id = :'prom';
  -- Esperado: 'pago'
rollback;

-- ── (5) Servidor rejeita promissória fora da regra da config ─────────────────
-- Requer parcela_minima > 0 na config (ex.: 300). Ajuste antes se necessário:
--   update configuracoes set parcela_minima = 300 where organization_id = current_org_id();
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_O_UUID', 'role', 'authenticated')::text, true);

  -- R$110 em 1x, com parcela mínima R$300 → deve dar ERRO (parcela abaixo da mínima):
  -- insert into public.promissorias (cliente_id, valor_total, parcelas, status)
  -- values ('COLE_O_CLIENTE', 110, 1, 'em_aberto');

  -- Prazo acima do máximo (ex.: 12x com máx 4) → deve dar ERRO:
  -- insert into public.promissorias (cliente_id, valor_total, parcelas, status)
  -- values ('COLE_O_CLIENTE', 4800, 12, 'em_aberto');
rollback;
