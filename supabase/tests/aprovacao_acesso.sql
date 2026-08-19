-- TESTE STAGING — conta pendente não cria empresa; conta aprovada entra.
-- Não deixa resíduos (todo o bloco termina em rollback).

begin;

select set_config(
  'test.owner',
  coalesce((
    select m.user_id::text
    from public.organization_members m
    where m.papel = 'owner'
    order by m.created_at
    limit 1
  ), ''),
  false
);
select set_config(
  'test.org',
  coalesce((
    select m.organization_id::text
    from public.organization_members m
    where m.user_id = nullif(current_setting('test.owner', true), '')::uuid
    limit 1
  ), ''),
  false
);

do $$
declare
  v_org uuid;
begin
  if nullif(current_setting('test.owner', true), '') is null then
    raise notice '[APROVACAO] SKIP: staging sem owner.';
    return;
  end if;

  insert into public.access_requests (user_id, email, status)
  values (
    current_setting('test.owner', true)::uuid,
    'qa-owner@nexo.invalid',
    'pendente'
  )
  on conflict (user_id) do update set status = 'pendente';

  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', current_setting('test.owner', true),
      'role', 'authenticated',
      'email', 'qa-owner@nexo.invalid'
    )::text,
    true
  );
  execute 'set local role authenticated';
  if public.current_org_id() is not null then
    raise exception '[APROVACAO] FALHA: conta pendente ainda obteve organization_id pelo banco.';
  end if;
  raise notice '[APROVACAO] OK: conta pendente sem acesso ao tenant no banco.';

  begin
    perform public.garantir_empresa('QA BLOQUEADA');
    raise exception 'PENDENTE_ENTROU';
  exception when others then
    if sqlerrm = 'PENDENTE_ENTROU' then
      raise exception '[APROVACAO] FALHA: conta pendente entrou.';
    else
      raise notice '[APROVACAO] OK: conta pendente bloqueada (%).', sqlerrm;
    end if;
  end;
  reset role;

  update public.access_requests
    set status = 'aprovado', decided_at = now()
    where user_id = current_setting('test.owner', true)::uuid;

  execute 'set local role authenticated';
  v_org := public.garantir_empresa('QA APROVADA');

  if public.current_org_id() is distinct from current_setting('test.org', true)::uuid then
    raise exception '[APROVACAO] FALHA: conta aprovada sem tenant correto no banco.';
  end if;
  reset role;

  if v_org = current_setting('test.org', true)::uuid then
    raise notice '[APROVACAO] OK: conta aprovada acessa a empresa correta.';
  else
    raise exception '[APROVACAO] FALHA: organização inesperada (%).', v_org;
  end if;
end;
$$;

rollback;
