-- TESTE STAGING — administração de acessos e plano manual.
-- Não deixa resíduos: todo o bloco termina em rollback.

begin;

select set_config(
  'test.admin',
  coalesce((select user_id::text from public.platform_admins order by created_at limit 1), ''),
  false
);
select set_config(
  'test.cliente',
  coalesce((
    select m.user_id::text
    from public.organization_members m
    order by (m.user_id = nullif(current_setting('test.admin', true), '')::uuid), m.created_at
    limit 1
  ), ''),
  false
);
select set_config(
  'test.pedido',
  coalesce((
    select r.id::text
    from public.access_requests r
    where r.user_id = nullif(current_setting('test.cliente', true), '')::uuid
    limit 1
  ), ''),
  false
);

do $$
declare
  v_cliente uuid;
  v_pedido uuid;
  v_org uuid;
  v_qtd integer;
begin
  if nullif(current_setting('test.admin', true), '') is null
     or nullif(current_setting('test.cliente', true), '') is null
     or nullif(current_setting('test.pedido', true), '') is null then
    raise notice '[ADMIN_CLIENTES] SKIP: staging sem dados QA suficientes.';
    return;
  end if;

  v_cliente := current_setting('test.cliente', true)::uuid;
  v_pedido := current_setting('test.pedido', true)::uuid;

  select organization_id into v_org
  from public.organization_members
  where user_id = v_cliente
  order by created_at
  limit 1;

  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', current_setting('test.admin', true),
      'role', 'authenticated'
    )::text,
    true
  );
  execute 'set local role authenticated';

  select count(*) into v_qtd from public.admin_listar_acessos();
  if v_qtd < 1 then
    raise exception '[ADMIN_CLIENTES] FALHA: administrador não listou os acessos.';
  end if;

  perform public.admin_decidir_acesso(v_pedido, 'aprovado');
  perform public.admin_definir_assinatura(v_cliente, 'Master', 'ativa');
  reset role;

  if not exists (
    select 1
    from public.access_requests
    where id = v_pedido and status = 'aprovado'
  ) then
    raise exception '[ADMIN_CLIENTES] FALHA: aprovação não foi persistida.';
  end if;

  if not exists (
    select 1
    from public.subscriptions
    where organization_id = v_org
      and plano = 'Master'
      and status = 'ativa'
      and provider = 'manual'
  ) then
    raise exception '[ADMIN_CLIENTES] FALHA: plano Master não foi ativado.';
  end if;

  raise notice '[ADMIN_CLIENTES] OK: listagem, aprovação e plano Master protegidos.';
end;
$$;

rollback;
