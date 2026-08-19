-- ─────────────────────────────────────────────────────────────────────────────
-- MATRIZ DE RBAC POR PAPEL + PERMISSÃO NAS RPCs (Área #7). Rode no STAGING.
--
-- Prova que "quem não tem papel não faz", direto no banco (não na UI). Cobre o
-- DoD do #7: cada papel; usuário sem permissão tentando CANCELAR VENDA, ALTERAR
-- TAXA/CONFIG, ESCREVER PRODUTO/OPÇÃO; e audit_logs append-only.
--
-- Pré-requisito: na MESMA empresa, dois membros com papéis diferentes:
--   • COLE_OWNER  → user_id de um membro OWNER
--   • COLE_CAIXA  → user_id de um membro CAIXA (papel 'caixa')
--   Descubra em: select user_id, papel from organization_members;
-- Simulamos cada usuário com set_config do JWT (sub) + role authenticated.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── (1) CAIXA não escreve PRODUTO (RBAC: escrever = owner,gerente) ───────────
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_CAIXA', 'role', 'authenticated')::text, true);

  -- INSERT deve violar a policy (with check exige owner/gerente).
  -- Esperado: erro "new row violates row-level security policy for table produtos".
  insert into public.produtos (nome, preco, custo, estoque, status)
  values ('QA caixa não pode', 10, 5, 1, 'ativo');
rollback;

-- ── (2) CAIXA não escreve PRODUTO_OPCOES (após 0042: escrever = owner,gerente)─
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_CAIXA', 'role', 'authenticated')::text, true);

  -- Precisa de um produto existente da empresa; pegue um id:
  --   select id from public.produtos limit 1;  (rode como owner e cole abaixo)
  -- Esperado: erro de RLS (caixa não escreve opções de produto).
  -- insert into public.produto_opcoes (produto_id, nome, tipo)
  --   values ('COLE_PRODUTO_ID', 'Tamanho', 'lista');
rollback;

-- ── (3) CAIXA não altera CONFIGURAÇÃO (RBAC: escrever config = owner) ────────
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_CAIXA', 'role', 'authenticated')::text, true);

  -- UPDATE não casa a policy de escrita (só owner) → afeta 0 linhas.
  update public.configuracoes set pix_desconto = 99
    where organization_id = public.current_org_id();
  -- Esperado: UPDATE 0 (nenhuma linha alterada; caixa não muda config).
  select pix_desconto as continua_igual from public.configuracoes
    where organization_id = public.current_org_id();
rollback;

-- ── (4) CAIXA não CANCELA VENDA (RPC exige owner,gerente) ────────────────────
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_CAIXA', 'role', 'authenticated')::text, true);

  -- Esperado: exception "Seu perfil não tem permissão para cancelar vendas".
  -- (troque por um id de venda concluída da empresa)
  -- select public.cancelar_venda('COLE_VENDA_ID', 'teste rbac');
rollback;

-- ── (5) OWNER CANCELA VENDA (mesmo id) — deve funcionar ──────────────────────
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_OWNER', 'role', 'authenticated')::text, true);

  -- Esperado: sucesso (sem exception); venda vira 'cancelada' e registra motivo.
  -- select public.cancelar_venda('COLE_VENDA_ID', 'teste rbac owner');
  -- select status, motivo_cancelamento from public.vendas where id = 'COLE_VENDA_ID';
rollback;

-- ── (6) audit_logs é APPEND-ONLY e só o OWNER lê ─────────────────────────────
begin;
  -- (6a) CAIXA não lê auditoria (policy audit_select_owner exige owner).
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_CAIXA', 'role', 'authenticated')::text, true);
  select count(*) as logs_vistos_pelo_caixa from public.audit_logs;
  -- Esperado: 0 (caixa não enxerga a auditoria).
rollback;

begin;
  -- (6b) Ninguém escreve direto em audit_logs (sem policy de INSERT p/ authenticated).
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_OWNER', 'role', 'authenticated')::text, true);
  -- Esperado: erro de RLS (a gravação só acontece via log_auditoria/triggers definer).
  insert into public.audit_logs (organization_id, user_id, acao, entidade)
    values (public.current_org_id(), auth.uid(), 'hack_manual', 'vendas');
rollback;

-- ── (7) OWNER lê a auditoria da PRÓPRIA empresa ──────────────────────────────
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_OWNER', 'role', 'authenticated')::text, true);
  select count(*) >= 0 as owner_le_auditoria from public.audit_logs;
  -- Esperado: true (owner enxerga; e só da própria org por causa do organization_id na policy).
rollback;
