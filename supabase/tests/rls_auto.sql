-- ─────────────────────────────────────────────────────────────────────────────
-- TESTE AUTOMÁTICO de RLS/RBAC (Área #7) — rode INTEIRO no SQL Editor (STAGING).
--
-- Diferente dos outros arquivos: NÃO precisa colar UUID nenhum. Ele descobre
-- sozinho (empresa de teste, owner, caixa, uma venda, um produto, uma 2ª empresa),
-- simula cada usuário e imprime um relatório PASS/FAIL na aba "Messages".
--
-- Como ler o resultado: abra a aba **Messages** (não a grade de resultados) e
-- procure as linhas [COBERTURA]/[ISOLAMENTO]/[TAMPERING]/[RBAC]. O esperado é
-- tudo "OK". "SKIP" = o staging não tem o dado necessário (ex.: nenhum caixa
-- cadastrado, ou só uma empresa) — aí aquele ponto não pôde ser provado.
--
-- Segurança: nenhuma escrita é mantida (todo insert/update de teste é desfeito).
-- Rode em STAGING, nunca no Supabase compartilhado/produção.
-- Pré-requisito: aplicar antes a migration 0042 (o teste de produto_opcoes
-- espera o RBAC novo).
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══ 0) AUTODESCOBERTA (roda como postgres, enxerga tudo) ════════════════════
-- Empresa de teste: de preferência uma que TENHA um caixa (p/ provar bloqueio).
select set_config('test.org', coalesce(
  (select organization_id::text from public.organization_members where papel = 'caixa' limit 1),
  (select organization_id::text from public.organization_members limit 1), ''), false);

select set_config('test.owner', coalesce(
  (select user_id::text from public.organization_members
   where organization_id = nullif(current_setting('test.org', true), '')::uuid
     and papel = 'owner' limit 1), ''), false);

select set_config('test.caixa', coalesce(
  (select user_id::text from public.organization_members
   where organization_id = nullif(current_setting('test.org', true), '')::uuid
     and papel = 'caixa' limit 1), ''), false);

-- Usuário A (isolamento) = o owner da empresa de teste (ou qualquer membro dela).
select set_config('test.user_a', coalesce(
  nullif(current_setting('test.owner', true), ''),
  (select user_id::text from public.organization_members
   where organization_id = nullif(current_setting('test.org', true), '')::uuid limit 1), ''), false);

-- Segunda empresa, diferente (p/ tentativa de escrita cruzada).
select set_config('test.org_b', coalesce(
  (select organization_id::text from public.organization_members
   where organization_id <> nullif(current_setting('test.org', true), '')::uuid limit 1), ''), false);

-- Uma venda concluída e um produto da empresa de teste (p/ testes de RBAC).
select set_config('test.venda', coalesce(
  (select id::text from public.vendas
   where organization_id = nullif(current_setting('test.org', true), '')::uuid
     and status = 'concluida' limit 1), ''), false);

select set_config('test.produto', coalesce(
  (select id::text from public.produtos
   where organization_id = nullif(current_setting('test.org', true), '')::uuid limit 1), ''), false);

-- Mostra o que foi escolhido (confira se caixa/venda/org_b não vieram vazios).
select
  nullif(current_setting('test.org', true), '')     as org_teste,
  nullif(current_setting('test.owner', true), '')    as owner_uid,
  nullif(current_setting('test.caixa', true), '')    as caixa_uid,
  nullif(current_setting('test.user_a', true), '')   as user_a_isolamento,
  nullif(current_setting('test.org_b', true), '')    as org_b_diferente,
  nullif(current_setting('test.venda', true), '')    as venda_concluida,
  nullif(current_setting('test.produto', true), '')  as produto;

-- ═══ 1) COBERTURA (RLS ligado, sem policy aberta, tudo escopa organization_id) ═
do $$
declare
  v_tabelas text[] := array[
    'clientes','produtos','produto_variacoes','produto_opcoes','vendas','venda_pagamentos','parcelas',
    'venda_itens','venda_devolucoes','condicionais','condicional_itens',
    'promissorias','promissoria_pagamentos','despesas','despesas_recorrentes',
    'estoque_movimentacoes','eventos','notificacoes','configuracoes',
    'tatuagem_atendimentos','funcionarios','vales','servicos',
    'atendimentos_servico','taxas_cartao'];
  v_sem_rls text; v_abertas text; v_sem_org text;
begin
  select string_agg(c.relname, ', ') into v_sem_rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and c.relrowsecurity = false and c.relname = any(v_tabelas);
  if v_sem_rls is null then raise notice '[COBERTURA] OK: RLS ligado em todas as tabelas de negócio.';
  else raise exception '[COBERTURA] FALHA: RLS DESLIGADO em: %', v_sem_rls; end if;

  select string_agg(tablename || '.' || policyname, ', ') into v_abertas
  from pg_policies where schemaname = 'public' and tablename = any(v_tabelas)
    and (coalesce(qual, '') in ('true', '(true)') or coalesce(with_check, '') in ('true', '(true)'));
  if v_abertas is null then raise notice '[COBERTURA] OK: nenhuma policy aberta (using true).';
  else raise exception '[COBERTURA] FALHA: policy ABERTA (vaza entre empresas): %', v_abertas; end if;

  select string_agg(tablename || '.' || policyname, ', ') into v_sem_org
  from pg_policies where schemaname = 'public' and tablename = any(v_tabelas)
    and coalesce(qual, '') not ilike '%organization_id%'
    and coalesce(with_check, '') not ilike '%organization_id%';
  if v_sem_org is null then raise notice '[COBERTURA] OK: toda policy escopa organization_id.';
  else raise notice '[COBERTURA] ATENÇÃO: policy sem organization_id: %', v_sem_org; end if;
end $$;

-- ═══ 2) ISOLAMENTO — usuário A não enxerga NADA de outra empresa ═════════════
do $$
declare v_org uuid; v_cross bigint := 0; c bigint; msg text := '';
begin
  if nullif(current_setting('test.user_a', true), '') is null then
    raise notice '[ISOLAMENTO] SKIP: nenhum membro encontrado no staging.'; return;
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.user_a', true), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_org := public.current_org_id();

  begin
    execute 'select count(*) from public.produtos     where organization_id <> public.current_org_id()' into c; v_cross := v_cross + c; msg := msg || format('produtos=%s ', c);
    execute 'select count(*) from public.clientes     where organization_id <> public.current_org_id()' into c; v_cross := v_cross + c; msg := msg || format('clientes=%s ', c);
    execute 'select count(*) from public.vendas       where organization_id <> public.current_org_id()' into c; v_cross := v_cross + c; msg := msg || format('vendas=%s ', c);
    execute 'select count(*) from public.funcionarios where organization_id <> public.current_org_id()' into c; v_cross := v_cross + c; msg := msg || format('funcionarios=%s ', c);
    execute 'select count(*) from public.vales        where organization_id <> public.current_org_id()' into c; v_cross := v_cross + c; msg := msg || format('vales=%s ', c);
    execute 'select count(*) from public.taxas_cartao where organization_id <> public.current_org_id()' into c; v_cross := v_cross + c; msg := msg || format('taxas=%s ', c);
    execute 'select count(*) from public.promissorias where organization_id <> public.current_org_id()' into c; v_cross := v_cross + c; msg := msg || format('promissorias=%s ', c);
  exception when others then
    raise notice '[ISOLAMENTO] ERRO ao contar (%): %', sqlerrm, msg;
    reset role; return;
  end;

  reset role;
  raise notice '[ISOLAMENTO] Usuário A → empresa %.', v_org;
  if v_cross = 0 then raise notice '[ISOLAMENTO] OK: 0 linhas de outra empresa (%).', trim(msg);
  else raise exception '[ISOLAMENTO] FALHA: A viu % linha(s) de outra empresa (%).', v_cross, trim(msg); end if;
end $$;

-- ═══ 3) TAMPERING — A tenta ESCREVER na empresa B (deve ser bloqueado) ═══════
do $$
begin
  if nullif(current_setting('test.org_b', true), '') is null then
    raise notice '[TAMPERING] SKIP: só existe uma empresa no staging.'; return;
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.user_a', true), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute format('insert into public.clientes (nome, organization_id) values (%L, %L)',
                   'QA INTRUSO', current_setting('test.org_b', true));
    raise exception 'INSERIU_EM_B';                       -- se chegou aqui, força desfazer
  exception when others then
    if sqlerrm = 'INSERIU_EM_B' then
      raise exception '[TAMPERING] FALHA: A inseriu cliente na empresa B! (desfeito)';
    else
      raise notice '[TAMPERING] OK: A bloqueado ao escrever na empresa B (%).', sqlerrm;
    end if;
  end;

  -- A não pode se adicionar como membro da empresa B sem convite/RPC.
  begin
    execute format(
      'insert into public.organization_members (organization_id, user_id, papel) values (%L, %L, %L)',
      current_setting('test.org_b', true), current_setting('test.user_a', true), 'owner'
    );
    raise exception 'AUTO_CONVITE_PASSOU';
  exception when others then
    if sqlerrm = 'AUTO_CONVITE_PASSOU' then
      raise exception '[TAMPERING] FALHA: A entrou na empresa B sem convite! (desfeito)';
    else
      raise notice '[TAMPERING] OK: autoentrada em empresa B bloqueada (%).', sqlerrm;
    end if;
  end;
  reset role;
end $$;

-- ═══ 4) RBAC — CAIXA não faz o que é de owner/gerente ════════════════════════
do $$
declare n int;
begin
  if nullif(current_setting('test.caixa', true), '') is null then
    raise notice '[RBAC] SKIP: nenhum membro CAIXA na empresa de teste — não dá p/ provar bloqueio de papel. Cadastre um caixa no staging e rode de novo.';
    return;
  end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.caixa', true), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  raise notice '[RBAC] Papel simulado = %.', public.current_papel();

  -- (4a) caixa NÃO altera configuração (escrever config = só owner)
  begin
    execute 'update public.configuracoes set pix_desconto = pix_desconto where organization_id = public.current_org_id()';
    get diagnostics n = row_count;
    if n > 0 then raise exception 'CFG_ALTEROU'; end if;
    raise notice '[RBAC] OK: caixa não altera configuração (0 linhas).';
  exception when others then
    if sqlerrm = 'CFG_ALTEROU' then
      raise exception '[RBAC] FALHA: caixa alterou % linha(s) de config! (desfeito)', n;
    else
      raise notice '[RBAC] OK: caixa bloqueado em config (%).', sqlerrm;
    end if;
  end;

  -- (4b) caixa NÃO altera produto (escrever produto = owner,gerente)
  if nullif(current_setting('test.produto', true), '') is not null then
    begin
      execute format('update public.produtos set nome = nome where id = %L', current_setting('test.produto', true));
      get diagnostics n = row_count;
      if n > 0 then raise exception 'PROD_ALTEROU'; end if;
      raise notice '[RBAC] OK: caixa não altera produto (0 linhas).';
    exception when others then
      if sqlerrm = 'PROD_ALTEROU' then
        raise exception '[RBAC] FALHA: caixa alterou produto! (desfeito)';
      else
        raise notice '[RBAC] OK: caixa bloqueado em produto (%).', sqlerrm;
      end if;
    end;
  else raise notice '[RBAC] SKIP produto: sem produto no staging.'; end if;

  -- (4c) caixa NÃO cancela venda (RPC exige owner/gerente)
  if nullif(current_setting('test.venda', true), '') is not null then
    begin
      perform public.cancelar_venda(current_setting('test.venda', true)::uuid, 'teste rbac auto');
      raise exception 'CANCELOU';
    exception when others then
      if sqlerrm = 'CANCELOU' then
        raise exception '[RBAC] FALHA: caixa cancelou venda! (desfeito)';
      else
        raise notice '[RBAC] OK: caixa bloqueado ao cancelar venda (%).', sqlerrm;
      end if;
    end;

    -- (4c.1) caixa também NÃO contorna cancelar_venda chamando o estorno direto.
    begin
      perform public.estornar_taxa_venda(current_setting('test.venda', true)::uuid);
      raise exception 'ESTORNOU_TAXA_DIRETO';
    exception when others then
      if sqlerrm = 'ESTORNOU_TAXA_DIRETO' then
        raise exception '[RBAC] FALHA: caixa chamou estornar_taxa_venda diretamente! (desfeito)';
      else
        raise notice '[RBAC] OK: caixa bloqueado no estorno direto de taxa (%).', sqlerrm;
      end if;
    end;
  else raise notice '[RBAC] SKIP cancelar: sem venda concluída no staging.'; end if;

  -- (4d) caixa NÃO lê a auditoria (audit_select_owner = só owner)
  begin
    execute 'select count(*) from public.audit_logs' into n;
    if n = 0 then raise notice '[RBAC] OK: caixa não lê audit_logs (0 visíveis).';
    else raise exception '[RBAC] FALHA: caixa leu % registros de auditoria!', n; end if;
  exception when others then
    raise notice '[RBAC] OK: caixa bloqueado ao ler auditoria (%).', sqlerrm;
  end;

  -- (4e) ninguém insere DIRETO em audit_logs (append-only via definer)
  begin
    execute 'insert into public.audit_logs (organization_id, user_id, acao, entidade) '
         || 'values (public.current_org_id(), auth.uid(), ''hack_manual'', ''vendas'')';
    raise exception 'AUDIT_INSERIU';
  exception when others then
    if sqlerrm = 'AUDIT_INSERIU' then
      raise exception '[RBAC] FALHA: insert manual em audit_logs passou! (desfeito)';
    else
      raise notice '[RBAC] OK: audit_logs bloqueia insert manual (%).', sqlerrm;
    end if;
  end;

  reset role;
end $$;

-- ═══ FIM. Leia a aba "Messages": tudo deve estar OK (SKIP = faltou dado). ═════
