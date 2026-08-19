-- TESTE STAGING — assinatura/trial bloqueia dados no banco (0047).
-- Não precisa preencher UUID. Restaura tudo com rollback.

begin;

select set_config(
  'test.user',
  coalesce((
    select m.user_id::text
    from public.organization_members m
    where m.papel = 'owner'
    limit 1
  ), ''),
  false
);
select set_config(
  'test.org',
  coalesce((
    select m.organization_id::text
    from public.organization_members m
    where m.user_id = nullif(current_setting('test.user', true), '')::uuid
    order by m.created_at
    limit 1
  ), ''),
  false
);

do $$
declare
  v_atual uuid;
begin
  if nullif(current_setting('test.org', true), '') is null then
    raise notice '[ASSINATURA] SKIP: staging sem empresa/owner.';
    return;
  end if;

  -- Ativa e dentro da validade: current_org_id deve existir.
  update public.subscriptions
    set provider = 'qa', status = 'ativa', current_period_end = now() + interval '1 day'
    where organization_id = current_setting('test.org', true)::uuid;

  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', current_setting('test.user', true),
      'role', 'authenticated'
    )::text,
    true
  );
  execute 'set local role authenticated';
  v_atual := public.current_org_id();
  reset role;

  if v_atual = current_setting('test.org', true)::uuid then
    raise notice '[ASSINATURA] OK: plano ativo libera a empresa.';
  else
    raise notice '[ASSINATURA] FALHA: plano ativo não liberou a empresa.';
  end if;

  -- Cancelada: current_org_id vira NULL e as policies operacionais bloqueiam.
  update public.subscriptions
    set provider = 'qa', status = 'cancelada', current_period_end = null
    where organization_id = current_setting('test.org', true)::uuid;

  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', current_setting('test.user', true),
      'role', 'authenticated'
    )::text,
    true
  );
  execute 'set local role authenticated';
  v_atual := public.current_org_id();
  reset role;

  if v_atual is null then
    raise notice '[ASSINATURA] OK: plano cancelado bloqueia a empresa no banco.';
  else
    raise notice '[ASSINATURA] FALHA: plano cancelado ainda devolveu empresa %.', v_atual;
  end if;
end;
$$;

rollback;
