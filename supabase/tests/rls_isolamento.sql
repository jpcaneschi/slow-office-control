-- ─────────────────────────────────────────────────────────────────────────────
-- PROVA DE ISOLAMENTO ENTRE EMPRESAS (RLS) — rode no SQL Editor do Supabase.
--
-- Pré-requisito: DUAS contas em EMPRESAS DIFERENTES (ex.: jv.coutiinho e uma
-- conta que criou a PRÓPRIA loja — não entrou por convite).
--   1) Descubra os user_id:   select id, email from auth.users;
--   2) Troque COLE_O_UUID_A e COLE_O_UUID_B pelos ids reais (mantenha as aspas).
--   3) Rode cada bloco. O resultado esperado está no comentário.
--
-- Como funciona: "set local role authenticated" faz o RLS valer (o editor roda
-- como postgres, que normalmente ignora RLS). set_config injeta o JWT do usuário
-- simulado, então auth.uid()/current_org_id() respondem como aquele usuário.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── (1) Usuário A só enxerga a PRÓPRIA empresa ───────────────────────────────
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_O_UUID_A', 'role', 'authenticated')::text, true);

  select current_org_id()                          as empresa_de_A;
  select count(*)                                   as produtos_visiveis_A from public.produtos;
  -- Esperado 0: A não pode ver produtos de outra empresa.
  select count(*) as produtos_de_outra_org_para_A
    from public.produtos where organization_id <> current_org_id();
rollback;

-- ── (2) Usuário B só enxerga a PRÓPRIA empresa ───────────────────────────────
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_O_UUID_B', 'role', 'authenticated')::text, true);

  select current_org_id()                          as empresa_de_B;
  select count(*)                                   as produtos_visiveis_B from public.produtos;
  -- Esperado 0:
  select count(*) as produtos_de_outra_org_para_B
    from public.produtos where organization_id <> current_org_id();
rollback;

-- ── (3) Escrita cruzada bloqueada ────────────────────────────────────────────
-- Rode como B e copie um id de produto da empresa de B:
--   (dentro de um begin com o claim de B)  select id from public.produtos limit 1;
-- Depois, como A, tente alterar esse produto de B — deve dizer "UPDATE 0":
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_O_UUID_A', 'role', 'authenticated')::text, true);

  update public.produtos set nome = nome
    where id = 'COLE_UM_ID_DE_PRODUTO_DA_ORG_B';
  -- Resultado esperado: UPDATE 0  (RLS impede A de tocar em dado de B).
rollback;

-- ── (4) Tentativa de burlar organization_id em INSERT ────────────────────────
-- A tenta inserir um cliente forçando a empresa de B — deve FALHAR no WITH CHECK.
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_O_UUID_A', 'role', 'authenticated')::text, true);

  -- Descomente e troque pelo id da empresa de B para ver o erro de policy:
  -- insert into public.clientes (nome, organization_id)
  --   values ('QA TESTE INTRUSO', 'COLE_O_ORG_ID_DE_B');
  -- Resultado esperado: erro "new row violates row-level security policy".
rollback;

-- ── (5) Tabelas SENSÍVEIS novas: A não vê nada de outra empresa ───────────────
-- Salários (funcionarios), adiantamentos (vales) e taxas de cartão são os dados
-- mais críticos p/ vazar. Áreas #1/#3 adicionaram/mexeram nelas → revalidar aqui.
begin;
  set local role authenticated;
  select set_config('request.jwt.claims',
    json_build_object('sub', 'COLE_O_UUID_A', 'role', 'authenticated')::text, true);

  select count(*) as funcionarios_de_outra_org
    from public.funcionarios where organization_id <> current_org_id();
  select count(*) as vales_de_outra_org
    from public.vales where organization_id <> current_org_id();
  select count(*) as taxas_de_outra_org
    from public.taxas_cartao where organization_id <> current_org_id();
  select count(*) as promissorias_de_outra_org
    from public.promissorias where organization_id <> current_org_id();
  -- Esperado: 0 em TODAS (a RLS filtra por empresa antes do <> avaliar).
rollback;
