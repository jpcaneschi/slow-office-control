-- ─────────────────────────────────────────────────────────────────────────────
-- Correção final P0 — #2 Promissórias: pagamento seguro no servidor
--
-- Bugs (0023): registrar_pagamento_promissoria NÃO validava saldo (aceitava
-- pagar mais que o devido), NÃO tinha idempotência (duplo clique = pagamento
-- duplo), NÃO checava papel e ACEITAVA pagamento em promissória cancelada.
--
-- Esta migration reescreve a RPC para falhar no BACKEND (o front é só UX):
--   • bloqueia se a promissória está 'cancelado' (e se já 'pago');
--   • impede valor <= 0 e valor > saldo (com tolerância de centavo);
--   • idempotência via p_idempotency_key (índice único) — reenviar não duplica;
--   • checa papel (owner/gerente/caixa/financeiro);
--   • saldo = valor_total − pagamentos; quita ao zerar.
--
-- Segura/idempotente/reversível. Não apaga dados. A assinatura ganha 1 parâmetro
-- opcional (p_idempotency_key) — chamadas antigas seguem válidas (default null).
--
-- Como reverter: restaurar a versão de 0023 (drop da nova + create da antiga);
-- a coluna idempotency_key pode ficar (inócua).
-- ─────────────────────────────────────────────────────────────────────────────

-- Idempotência: chave única do pagamento (uma requisição = um pagamento).
alter table public.promissoria_pagamentos
  add column if not exists idempotency_key text;

create unique index if not exists promissoria_pagamentos_idemp_uidx
  on public.promissoria_pagamentos (idempotency_key)
  where idempotency_key is not null;

-- A assinatura muda (novo parâmetro) → dropa a versão antiga antes de recriar.
drop function if exists public.registrar_pagamento_promissoria(uuid, numeric, text, text);

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
  -- Papel: só quem opera caixa/financeiro recebe pagamento.
  if public.current_papel() not in ('owner', 'gerente', 'caixa', 'financeiro') then
    raise exception 'Seu perfil não tem permissão para registrar pagamentos';
  end if;

  -- Idempotência: se a chave já foi usada, é um reenvio → devolve o saldo atual
  -- sem inserir de novo (não duplica o pagamento).
  if p_idempotency_key is not null and exists (
    select 1 from public.promissoria_pagamentos where idempotency_key = p_idempotency_key
  ) then
    select coalesce(valor_total, 0) into v_total
      from public.promissorias where id = p_promissoria_id;
    select coalesce(sum(valor), 0) into v_pago
      from public.promissoria_pagamentos where promissoria_id = p_promissoria_id;
    return greatest(coalesce(v_total, 0) - v_pago, 0);
  end if;

  -- Trava a promissória (serializa pagamentos concorrentes).
  select valor_total, status into v_total, v_status
    from public.promissorias where id = p_promissoria_id for update;
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

  select coalesce(sum(valor), 0) into v_pago
    from public.promissoria_pagamentos where promissoria_id = p_promissoria_id;
  v_saldo := v_total - v_pago;

  -- Não deixa pagar mais que o saldo (tolerância de 1 centavo p/ arredondamento).
  if p_valor > v_saldo + 0.005 then
    raise exception 'Pagamento (%) maior que o saldo devedor (%)', p_valor, v_saldo;
  end if;

  insert into public.promissoria_pagamentos
    (promissoria_id, valor, forma_pagamento, observacao, idempotency_key)
  values (p_promissoria_id, p_valor, p_forma, p_obs, p_idempotency_key)
  on conflict (idempotency_key) do nothing;

  get diagnostics v_inseriu = row_count;
  if v_inseriu = 0 then
    -- Corrida: outra requisição com a mesma chave inseriu primeiro → no-op.
    return greatest(v_saldo, 0);
  end if;

  -- Recalcula e quita se zerou.
  select coalesce(sum(valor), 0) into v_pago
    from public.promissoria_pagamentos where promissoria_id = p_promissoria_id;
  v_saldo := v_total - v_pago;

  if v_saldo <= 0 then
    update public.promissorias set status = 'pago' where id = p_promissoria_id;
  end if;

  perform public.log_auditoria(
    'promissoria_pagamento', 'promissorias', p_promissoria_id,
    jsonb_build_object('valor', p_valor, 'saldo', greatest(v_saldo, 0))
  );

  return greatest(v_saldo, 0);
end;
$$;

-- ── Validação da promissória no servidor (prazo/parcela mínima da config) ─────
-- Trigger BEFORE INSERT: vale para a criação manual E para o criar_venda (que,
-- por ser atômico, faz a venda inteira reverter — "rejeitada sem efeitos
-- colaterais"). A config é a fonte única (promissoria_prazo_meses/parcela_minima).
create or replace function public.fn_valida_promissoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prazo_max int;
  v_parcela_min numeric;
  v_parcelas int := greatest(coalesce(NEW.parcelas, 1), 1);
begin
  select coalesce(promissoria_prazo_meses, 4), coalesce(parcela_minima, 0)
    into v_prazo_max, v_parcela_min
    from public.configuracoes
    where organization_id = NEW.organization_id
    order by created_at limit 1;

  -- Sem config: não trava (deixa passar como já era).
  if v_prazo_max is null then
    return NEW;
  end if;

  if v_parcelas > v_prazo_max then
    raise exception 'Prazo da promissória (% meses) acima do máximo da loja (% meses)',
      v_parcelas, v_prazo_max using errcode = 'check_violation';
  end if;

  if v_parcela_min > 0 and coalesce(NEW.valor_total, 0) > 0
     and (NEW.valor_total / v_parcelas) < v_parcela_min then
    raise exception 'Parcela (%) abaixo da mínima da loja (%)',
      round(NEW.valor_total / v_parcelas, 2), v_parcela_min
      using errcode = 'check_violation';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_valida_promissoria on public.promissorias;
create trigger trg_valida_promissoria before insert on public.promissorias
  for each row execute function public.fn_valida_promissoria();
