-- TESTE STAGING — lançamento mensal idempotente de conta recorrente (0045).
-- Não precisa preencher UUID. Tudo fica dentro de begin/rollback.

begin;

select set_config(
  'test.user',
  coalesce((
    select m.user_id::text
    from public.organization_members m
    join public.subscriptions s on s.organization_id = m.organization_id
    where m.papel = 'owner'
      and public.fn_assinatura_permite_acesso(m.organization_id)
    limit 1
  ), ''),
  false
);

do $$
declare
  v_rec uuid;
  v_primeira uuid;
  v_segunda uuid;
  v_qtd int;
begin
  if nullif(current_setting('test.user', true), '') is null then
    raise notice '[RECORRENTE] SKIP: nenhum owner com assinatura válida.';
    return;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', current_setting('test.user', true),
      'role', 'authenticated'
    )::text,
    true
  );
  execute 'set local role authenticated';

  insert into public.despesas_recorrentes (
    descricao, categoria, valor, dia_vencimento
  ) values (
    'QA aluguel idempotente', 'Aluguel', 1234.56, 31
  ) returning id into v_rec;

  v_primeira := public.lancar_despesa_recorrente(v_rec, date '2026-02-01');
  v_segunda := public.lancar_despesa_recorrente(v_rec, date '2026-02-20');

  select count(*)
    into v_qtd
    from public.despesas
    where despesa_recorrente_id = v_rec
      and competencia = date '2026-02-01';

  if v_qtd = 1 and v_primeira = v_segunda then
    raise notice '[RECORRENTE] OK: dois lançamentos retornaram a mesma despesa e existe 1 linha.';
  else
    raise notice '[RECORRENTE] FALHA: qtd=%, primeira=%, segunda=%.',
      v_qtd, v_primeira, v_segunda;
  end if;

  if (select data from public.despesas where id = v_primeira) = date '2026-02-28' then
    raise notice '[RECORRENTE] OK: vencimento dia 31 foi ajustado para 28/02.';
  else
    raise notice '[RECORRENTE] FALHA: ajuste do último dia do mês incorreto.';
  end if;

  reset role;
end;
$$;

rollback;
