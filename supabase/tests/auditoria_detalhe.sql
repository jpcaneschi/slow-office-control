-- ─────────────────────────────────────────────────────────────────────────────
-- PROVA: Auditoria detalhada (Área #12, migration 0041). Rode no STAGING.
-- Cobre: (1) UPDATE gera diff `alteracoes` só dos campos que mudaram, com
-- antes/depois; (2) segredos são REDIGIDOS no log; (3) configuração não gera
-- log vazio; (4) tabelas novas (taxas_cartao) passaram a ser auditadas.
--
-- Pré-requisito: conta owner. Troque COLE_O_UUID pelo seu user_id
-- (o id em organization_members / select auth.uid() logado).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── (1) UPDATE em configuração → diff antes/depois por campo ─────────────────
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_O_UUID', 'role', 'authenticated')::text, true);

  -- Estado inicial conhecido.
  update public.configuracoes
    set pix_desconto = 5, max_parcelas = 6
    where organization_id = public.current_org_id();

  -- Muda só o desconto Pix.
  update public.configuracoes
    set pix_desconto = 8
    where organization_id = public.current_org_id();

  -- O último log de configuração deve trazer alteracoes = { pix_desconto: {antes:5, depois:8} }.
  select
    (dados -> 'alteracoes' -> 'pix_desconto' ->> 'antes') as antes,
    (dados -> 'alteracoes' -> 'pix_desconto' ->> 'depois') as depois,
    (dados -> 'alteracoes' ? 'max_parcelas') as inclui_inalterado
  from public.audit_logs
  where acao = 'update_configuracoes'
  order by created_at desc
  limit 1;
  -- Esperado: antes=5, depois=8, inclui_inalterado=false (só campos que mudaram).
rollback;

-- ── (2) Redação de segredos: fn_auditoria_redigir troca o valor ──────────────
begin;
  select public.fn_auditoria_redigir(
    jsonb_build_object(
      'nome', 'Fulano',
      'senha', 'super-secreta',
      'api_key', 'sk-123',
      'token', 'abc',
      'pix_desconto', 5
    )
  ) as redigido;
  -- Esperado: {"nome":"Fulano","senha":"[REDIGIDO]","api_key":"[REDIGIDO]",
  --            "token":"[REDIGIDO]","pix_desconto":5}
  --  → só os campos sensíveis viram "[REDIGIDO]"; os demais ficam intactos.
rollback;

-- ── (3) INSERT/UPDATE de taxa de cartão passa a ser auditado ─────────────────
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_O_UUID', 'role', 'authenticated')::text, true);

  insert into public.taxas_cartao (operadora, tipo, taxa_percentual)
  values ('Stone', 'credito', 3.5) returning id as taxa \gset

  select count(*) as logs_insert
    from public.audit_logs
    where acao = 'insert_taxas_cartao' and registro_id = :'taxa';
  -- Esperado: 1 (a tabela nova entrou na cobertura do trigger).

  update public.taxas_cartao set taxa_percentual = 4.0 where id = :'taxa';

  select (dados -> 'alteracoes' -> 'taxa_percentual' ->> 'depois') as nova_taxa
    from public.audit_logs
    where acao = 'update_taxas_cartao' and registro_id = :'taxa'
    order by created_at desc limit 1;
  -- Esperado: nova_taxa = 4.0 (diff campo a campo também nas taxas).
rollback;

-- ── (4) UPDATE sem mudança real NÃO gera log ─────────────────────────────────
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_O_UUID', 'role', 'authenticated')::text, true);

  select count(*) as antes
    from public.audit_logs where acao = 'update_configuracoes' \gset

  -- Re-grava os mesmos valores → to_jsonb(OLD)=to_jsonb(NEW) → trigger retorna sem logar.
  update public.configuracoes
    set pix_desconto = pix_desconto
    where organization_id = public.current_org_id();

  select count(*) = :antes as sem_log_extra
    from public.audit_logs where acao = 'update_configuracoes';
  -- Esperado: true (nenhum log a mais para update no-op).
rollback;
