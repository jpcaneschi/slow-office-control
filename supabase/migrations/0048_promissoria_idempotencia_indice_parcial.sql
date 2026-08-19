-- Corrige a inferencia do indice parcial de idempotencia criado na 0036.
-- PostgreSQL exige que o ON CONFLICT repita o predicado do indice parcial.

create or replace function public.registrar_pagamento_promissoria(
  p_promissoria_id uuid,
  p_valor numeric,
  p_forma text default null,
  p_obs text default null,
  p_idempotency_key text default null
)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_total numeric;
  v_status text;
  v_pago numeric;
  v_saldo numeric;
  v_inseriu int;
begin
  if public.current_papel() not in ('owner', 'gerente', 'caixa', 'financeiro') then
    raise exception 'Seu perfil não tem permissão para registrar pagamentos';
  end if;

  if p_idempotency_key is not null and exists (
    select 1
    from public.promissoria_pagamentos
    where idempotency_key = p_idempotency_key
  ) then
    select coalesce(valor_total, 0)
      into v_total
      from public.promissorias
      where id = p_promissoria_id;

    select coalesce(sum(valor), 0)
      into v_pago
      from public.promissoria_pagamentos
      where promissoria_id = p_promissoria_id;

    return greatest(coalesce(v_total, 0) - v_pago, 0);
  end if;

  select valor_total, status
    into v_total, v_status
    from public.promissorias
    where id = p_promissoria_id
    for update;

  if v_total is null then
    raise exception 'Promissória não encontrada';
  end if;
  if v_status = 'cancelado' then
    raise exception 'Promissória cancelada não aceita pagamento';
  end if;
  if v_status = 'pago' then
    raise exception 'Promissória já está quitada';
  end if;
  if coalesce(p_valor, 0) <= 0 then
    raise exception 'Informe um valor de pagamento válido';
  end if;

  select coalesce(sum(valor), 0)
    into v_pago
    from public.promissoria_pagamentos
    where promissoria_id = p_promissoria_id;

  v_saldo := v_total - v_pago;
  if p_valor > v_saldo + 0.005 then
    raise exception 'Pagamento (%) maior que o saldo devedor (%)', p_valor, v_saldo;
  end if;

  insert into public.promissoria_pagamentos (
    promissoria_id,
    valor,
    forma_pagamento,
    observacao,
    idempotency_key
  ) values (
    p_promissoria_id,
    p_valor,
    p_forma,
    p_obs,
    p_idempotency_key
  )
  on conflict (idempotency_key)
    where idempotency_key is not null
    do nothing;

  get diagnostics v_inseriu = row_count;
  if v_inseriu = 0 then
    return greatest(v_saldo, 0);
  end if;

  select coalesce(sum(valor), 0)
    into v_pago
    from public.promissoria_pagamentos
    where promissoria_id = p_promissoria_id;

  v_saldo := v_total - v_pago;
  if v_saldo <= 0 then
    update public.promissorias
      set status = 'pago'
      where id = p_promissoria_id;
  end if;

  perform public.log_auditoria(
    'promissoria_pagamento',
    'promissorias',
    p_promissoria_id,
    jsonb_build_object('valor', p_valor, 'saldo', greatest(v_saldo, 0))
  );

  return greatest(v_saldo, 0);
end;
$$;
