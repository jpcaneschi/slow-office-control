-- ─────────────────────────────────────────────────────────────────────────────
-- Correção final P0 — #4 Módulos opcionais como feature flags DE VERDADE
--
-- Problema: o bloqueio de módulo desligado era só client-side (menu escondido +
-- redirect no RouteGuard) e, no banco, o trigger fn_bloqueia_modulo (0033) só
-- barrava INSERT em 3 tabelas. Resultado: com o módulo desligado ainda dava para
-- EDITAR registros do módulo e converter condicional em venda via RPC.
--
-- Esta migration move a fronteira real para o banco (SECURITY DEFINER / triggers),
-- que vale para qualquer cliente — o app é uma SPA que fala direto com o Postgres,
-- então o Next não tem sessão de servidor; quem enforce é o banco + RLS.
--
-- O que muda:
--   1) fn_modulo_ativo(org, modulo): fonte única do "este módulo está ligado?".
--   2) fn_bloqueia_modulo passa a barrar INSERT **e UPDATE** (antes só INSERT),
--      cobrindo tatuagem_atendimentos, atendimentos_servico, servicos e
--      condicionais. Leitura (SELECT) continua liberada → histórico preservado.
--   3) converter_condicional_venda() recusa quando o módulo 'condicional' está
--      desligado, com mensagem clara (antes ela operava mesmo desligado).
--
-- Auditoria do toggle: já é automática — fn_auditoria (0028) registra o UPDATE de
-- configuracoes com antes/depois, incluindo modulos_ativos. Nada a fazer aqui.
--
-- Segura/idempotente/reversível. Preserva dados (nada de drop/truncate). Reativar
-- o módulo volta tudo ao normal (o bloqueio é só enquanto está desligado).
--
-- Como reverter (se preciso): recriar os triggers como "before insert" (só INSERT),
-- remover os triggers de public.servicos, e restaurar converter_condicional_venda
-- da migration 0031 (sem o bloco de checagem de módulo). fn_modulo_ativo pode
-- ficar (é inócua se não usada).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── (1) Fonte única: o módulo está ativo para a empresa? ─────────────────────
-- Sem config, ou com modulos_ativos NULL, considera LIGADO (não trava por falta
-- de configuração) — mesma semântica permissiva do trigger original.
create or replace function public.fn_modulo_ativo(p_org uuid, p_mod text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p_mod = any(modulos_ativos)
       from public.configuracoes
      where organization_id = p_org
      order by created_at
      limit 1),
    true
  );
$$;

-- ── (2) Trigger de bloqueio: agora em INSERT **e** UPDATE ─────────────────────
-- (fn_bloqueia_modulo já existe da 0033; funciona igual em UPDATE porque só lê
--  NEW.organization_id e o nome do módulo em TG_ARGV[0]. Recriamos abaixo por
--  clareza/idempotência.)
create or replace function public.fn_bloqueia_modulo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mod text := TG_ARGV[0];
begin
  if not public.fn_modulo_ativo(NEW.organization_id, v_mod) then
    raise exception 'O módulo "%" está desativado nas configurações da empresa', v_mod
      using errcode = 'check_violation';
  end if;
  return NEW;
end;
$$;

do $$
begin
  -- Tatuagem
  drop trigger if exists trg_modulo on public.tatuagem_atendimentos;
  create trigger trg_modulo before insert or update on public.tatuagem_atendimentos
    for each row execute function public.fn_bloqueia_modulo('tatuagem');

  -- Serviços: atendimentos (lançamentos) e o catálogo de serviços
  drop trigger if exists trg_modulo on public.atendimentos_servico;
  create trigger trg_modulo before insert or update on public.atendimentos_servico
    for each row execute function public.fn_bloqueia_modulo('servicos');

  drop trigger if exists trg_modulo on public.servicos;
  create trigger trg_modulo before insert or update on public.servicos
    for each row execute function public.fn_bloqueia_modulo('servicos');

  -- Condicional
  drop trigger if exists trg_modulo on public.condicionais;
  create trigger trg_modulo before insert or update on public.condicionais
    for each row execute function public.fn_bloqueia_modulo('condicional');
end $$;

-- ── (3) RPC de conversão recusa com o módulo 'condicional' desligado ──────────
-- Recria converter_condicional_venda (base: 0031) apenas ADICIONANDO a checagem
-- de módulo logo após carregar o condicional. Todo o resto é idêntico à 0031.
drop function if exists public.converter_condicional_venda(uuid, text, jsonb);

create or replace function public.converter_condicional_venda(
  p_condicional_id uuid,
  p_forma_pagamento text,
  p_itens jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cond record;
  v_venda_id uuid;
  v_bruto numeric := 0;
  v_pix_pct numeric;
  v_desc_pix numeric;
  v_total numeric;
  v_item jsonb;
  v_ci record;
  v_qv numeric;
  v_qd numeric;
begin
  select * into v_cond from public.condicionais where id = p_condicional_id;
  if v_cond is null then
    raise exception 'Condicional não encontrado';
  end if;

  -- #4: módulo desligado → nada de converter (bloqueio no banco, não só no front).
  if not public.fn_modulo_ativo(v_cond.organization_id, 'condicional') then
    raise exception 'O módulo "condicional" está desativado nas configurações da empresa'
      using errcode = 'check_violation';
  end if;

  if v_cond.status <> 'aberto' then
    raise exception 'Este condicional já foi finalizado';
  end if;

  select coalesce(
    sum((e->>'quantidade_vendida')::numeric * (e->>'preco_unitario')::numeric), 0
  )
  into v_bruto
  from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) e;

  if v_bruto <= 0 then
    raise exception 'Nada foi marcado como vendido. Use "Recolher tudo" se o cliente devolveu tudo.';
  end if;

  -- Mesmo motor de precificação do PDV: desconto Pix vem da config.
  select coalesce(pix_desconto, 5) into v_pix_pct
    from public.configuracoes order by created_at limit 1;
  v_pix_pct := coalesce(v_pix_pct, 5);
  v_desc_pix := case when p_forma_pagamento = 'pix'
                     then round(v_bruto * v_pix_pct / 100.0, 2) else 0 end;
  v_total := v_bruto - v_desc_pix;

  insert into public.vendas (
    cliente_id, responsavel, forma_pagamento, subtotal, desconto_pix,
    pix_desconto_pct, desconto, total, valor_liquido, status, observacao
  ) values (
    v_cond.cliente_id, v_cond.responsavel, p_forma_pagamento, v_bruto, v_desc_pix,
    case when p_forma_pagamento = 'pix' then v_pix_pct else 0 end,
    0, v_total, v_total, 'concluida', 'Convertido de condicional'
  ) returning id into v_venda_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb))
  loop
    v_qv := coalesce((v_item->>'quantidade_vendida')::numeric, 0);
    v_qd := coalesce((v_item->>'quantidade_devolvida')::numeric, 0);

    select * into v_ci from public.condicional_itens
      where id = (v_item->>'condicional_item_id')::uuid
        and condicional_id = p_condicional_id;
    if not found then
      raise exception 'Item do condicional não encontrado';
    end if;
    if v_qv + v_qd <> v_ci.quantidade then
      raise exception 'Item %: vendido (%) + devolvido (%) deve somar a quantidade enviada (%)',
        v_ci.produto_id, v_qv, v_qd, v_ci.quantidade;
    end if;

    if v_qv > 0 then
      insert into public.venda_itens (
        venda_id, produto_id, variacao_id, quantidade, preco_unitario, total_item, custo_unitario
      ) values (
        v_venda_id, v_ci.produto_id, v_ci.variacao_id, v_qv,
        (v_item->>'preco_unitario')::numeric,
        v_qv * (v_item->>'preco_unitario')::numeric,
        coalesce((v_item->>'custo_unitario')::numeric, 0)
      );
    end if;

    if v_qd > 0 then
      perform public.registrar_movimentacao(
        v_ci.produto_id, 'retorno_condicional', v_qd, 'Retorno de condicional',
        null, p_condicional_id, v_ci.variacao_id
      );
    end if;

    update public.condicional_itens
      set status = case when v_qd = 0 then 'vendido'
                        when v_qv = 0 then 'devolvido'
                        else 'parcial' end
      where id = v_ci.id;
  end loop;

  update public.condicionais
    set status = 'finalizado',
        data_retorno = (now() at time zone 'America/Sao_Paulo')::date
    where id = p_condicional_id;

  perform public.log_auditoria(
    'condicional_convertido', 'condicionais', p_condicional_id,
    jsonb_build_object('venda_id', v_venda_id, 'total', v_total)
  );

  return v_venda_id;
end;
$$;
