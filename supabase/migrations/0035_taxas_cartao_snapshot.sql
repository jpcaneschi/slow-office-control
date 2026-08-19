-- ─────────────────────────────────────────────────────────────────────────────
-- Correção final P0 — #1 Taxas de cartão + cálculo financeiro correto
--
-- Bug: vendas.taxa é só um % (0013). A venda no cartão guardava valor_liquido,
-- mas a TAXA em R$ nunca era lançada como despesa e o Financeiro somava `total`
-- cheio como receita → resultado inflado (ex.: R$349 em vez de R$339).
--
-- Esta migration:
--   1) taxas_cartao: config de taxas por organização (para o CRUD nas Configs).
--   2) Snapshot IMUTÁVEL na venda: valor_bruto, taxa_valor, valor_liquido (já
--      existia), custo_total (COGS), margem, taxa_regra_id. Congelado na venda —
--      alterar a config depois NÃO mexe em venda antiga.
--   3) despesas.venda_id: liga a despesa da taxa à venda que a gerou.
--   4) registrar_taxa_venda()/estornar_taxa_venda(): SECURITY DEFINER e
--      IDEMPOTENTES — lançam/estornam a taxa como despesa (categoria
--      'Taxa de cartão') sem depender do papel do caixa e sem duplicar.
--   5) criar_venda(): calcula o snapshot no BACKEND (não confia no front) e lança
--      a taxa 1x. cancelar_venda(): estorna a taxa (sem duplicidade).
--
-- Decisão de produto: a taxa vira uma LINHA em `despesas` (o Financeiro já soma
-- despesas → o resultado se corrige sozinho e a taxa aparece na lista).
--
-- Segura/idempotente/reversível. Preserva dados (só add column / create if not
-- exists / create or replace). NÃO altera a assinatura de criar_venda/cancelar_
-- venda (o PDV atual continua chamando igual; a UI de taxa vem depois).
--
-- Como reverter: restaurar criar_venda (0021) e cancelar_venda (0026); as colunas
-- e a tabela taxas_cartao podem ficar (inócuas). Para limpar taxas lançadas:
--   delete from despesas where categoria = 'Taxa de cartão';
-- ─────────────────────────────────────────────────────────────────────────────

-- ── (1) Config de taxas por organização ──────────────────────────────────────
create table if not exists public.taxas_cartao (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id()
    references public.organizations (id) on delete cascade,
  operadora text,                       -- adquirente/maquininha (ex.: "Stone")
  tipo text not null default 'credito', -- 'debito' | 'credito'
  bandeira text,                        -- nullable (vale p/ todas se null)
  parcelas_min int not null default 1,
  parcelas_max int not null default 1,
  taxa_percentual numeric(6, 3) not null default 0,
  taxa_fixa numeric(12, 2) not null default 0,
  taxa_antecipacao numeric(6, 3) not null default 0,
  permite_ajuste_manual_pdv boolean not null default true,
  vigencia_inicio date,
  vigencia_fim date,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists taxas_cartao_org_idx
  on public.taxas_cartao (organization_id);

alter table public.taxas_cartao enable row level security;

-- RLS por organização (mesmo padrão das demais tabelas de negócio).
drop policy if exists "taxas_cartao_all" on public.taxas_cartao;
create policy "taxas_cartao_all" on public.taxas_cartao for all to authenticated
  using (organization_id = public.current_org_id())
  with check (organization_id = public.current_org_id());

-- ── (2) Snapshot imutável do pagamento na venda ──────────────────────────────
alter table public.vendas
  add column if not exists valor_bruto   numeric(12, 2),
  add column if not exists taxa_valor    numeric(12, 2) not null default 0,
  add column if not exists custo_total   numeric(12, 2) not null default 0,
  add column if not exists margem        numeric(12, 2),
  add column if not exists taxa_regra_id uuid references public.taxas_cartao (id);
-- Observação: `taxa` (%, da 0013) segue como taxa_percentual; `valor_liquido`
-- (0013) segue como o líquido. Adicionamos taxa_valor (R$) e o COGS/margem.

-- ── (3) Liga a despesa da taxa à venda ───────────────────────────────────────
alter table public.despesas
  add column if not exists venda_id uuid references public.vendas (id) on delete set null;

create index if not exists despesas_venda_idx on public.despesas (venda_id);

-- No máx. 1 despesa de taxa por venda (garante idempotência do lançamento).
create unique index if not exists despesas_taxa_por_venda_uidx
  on public.despesas (venda_id) where categoria = 'Taxa de cartão';

-- ── (4) Lançar / estornar a taxa como despesa (definer, idempotente) ─────────
create or replace function public.registrar_taxa_venda(p_venda_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  select id, organization_id, taxa_valor, forma_pagamento, created_at, parcelas
    into v
    from public.vendas
    where id = p_venda_id;

  if v is null then
    return;
  end if;
  if coalesce(v.taxa_valor, 0) <= 0 then
    return; -- sem taxa (ex.: dinheiro/pix) → nada a lançar
  end if;

  -- Idempotente: se já existe a despesa da taxa desta venda, não duplica.
  if exists (
    select 1 from public.despesas
      where venda_id = p_venda_id and categoria = 'Taxa de cartão'
  ) then
    return;
  end if;

  insert into public.despesas (
    organization_id, user_id, venda_id, descricao, categoria, valor, data,
    responsavel, observacao
  ) values (
    v.organization_id, auth.uid(), p_venda_id,
    'Taxa de cartão (venda ' || left(p_venda_id::text, 8) || ', '
      || coalesce(v.parcelas, 1) || 'x)',
    'Taxa de cartão',
    v.taxa_valor,
    (v.created_at at time zone 'America/Sao_Paulo')::date,
    null,
    'Lançada automaticamente pela venda no cartão.'
  );
end;
$$;

create or replace function public.estornar_taxa_venda(p_venda_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Estorna sem duplicidade: remove a despesa da taxa (idempotente — no-op se
  -- não houver). O trigger de auditoria (0028) registra o DELETE com o "antes".
  delete from public.despesas
    where venda_id = p_venda_id and categoria = 'Taxa de cartão';
end;
$$;

-- ── (5) criar_venda(): snapshot no backend + lança a taxa 1x ──────────────────
create or replace function public.criar_venda(
  p_cliente_id uuid,
  p_responsavel text,
  p_funcionario_id uuid,
  p_forma_pagamento text,
  p_desconto_pix numeric,
  p_parcelas int,
  p_taxa numeric,
  p_valor_liquido numeric,
  p_valor_recebido numeric,
  p_troco numeric,
  p_subtotal numeric,
  p_desconto numeric,
  p_total numeric,
  p_observacao text,
  p_itens jsonb,
  p_gera_promissoria boolean,
  p_promissoria_valor numeric,
  p_promissoria_parcelas int,
  p_promissoria_vencimento date,
  p_promissoria_obs text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_venda_id uuid;
  v_item jsonb;
  v_prod uuid;
  v_var uuid;
  v_qtd numeric;
  v_taxa_pct numeric := coalesce(p_taxa, 0);
  v_bruto numeric := coalesce(p_total, 0);
  v_taxa_valor numeric := 0;
  v_liquido numeric;
  v_custo_total numeric := 0;
begin
  -- Snapshot financeiro calculado NO BACKEND (não confia no valor do front).
  -- Taxa em R$ só no cartão; líquido = bruto − taxa.
  if p_forma_pagamento = 'cartao' and v_taxa_pct > 0 then
    v_taxa_valor := round(v_bruto * v_taxa_pct / 100.0, 2);
  end if;
  v_liquido := v_bruto - v_taxa_valor;

  -- COGS = soma do custo dos itens (autoritativo, a partir dos itens enviados).
  select coalesce(
    sum(coalesce((e->>'custo_unitario')::numeric, 0) * (e->>'quantidade')::numeric),
    0
  )
  into v_custo_total
  from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) e;

  -- Cria a venda (organization_id vem do default current_org_id()).
  insert into public.vendas (
    cliente_id, responsavel, funcionario_id, forma_pagamento, desconto_pix,
    parcelas, taxa, valor_liquido, valor_recebido, troco, subtotal, desconto,
    total, observacao, status,
    valor_bruto, taxa_valor, custo_total, margem
  ) values (
    p_cliente_id, p_responsavel, p_funcionario_id, p_forma_pagamento, p_desconto_pix,
    coalesce(p_parcelas, 1), v_taxa_pct, v_liquido, p_valor_recebido,
    p_troco, p_subtotal, coalesce(p_desconto, 0), v_bruto, p_observacao, 'concluida',
    v_bruto, v_taxa_valor, v_custo_total, v_liquido - v_custo_total
  ) returning id into v_venda_id;

  -- Itens + baixa de estoque (via registrar_movimentacao, atômico e valida empresa).
  for v_item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb))
  loop
    v_prod := (v_item->>'produto_id')::uuid;
    v_var := nullif(v_item->>'variacao_id', '')::uuid;
    v_qtd := (v_item->>'quantidade')::numeric;

    insert into public.venda_itens (
      venda_id, produto_id, variacao_id, quantidade, preco_unitario, total_item, custo_unitario
    ) values (
      v_venda_id, v_prod, v_var, v_qtd,
      (v_item->>'preco_unitario')::numeric,
      v_qtd * (v_item->>'preco_unitario')::numeric,
      coalesce((v_item->>'custo_unitario')::numeric, 0)
    );

    perform public.registrar_movimentacao(
      v_prod, 'venda', v_qtd, 'Venda', null, v_venda_id, v_var
    );
  end loop;

  -- Lança a taxa do cartão como despesa (1x, idempotente, via definer).
  perform public.registrar_taxa_venda(v_venda_id);

  -- Promissória (fiado / misto)
  if p_gera_promissoria then
    insert into public.promissorias (
      cliente_id, valor_total, parcelas, status, observacao, data_vencimento, venda_id
    ) values (
      p_cliente_id, p_promissoria_valor, coalesce(p_promissoria_parcelas, 1),
      'em_aberto', p_promissoria_obs, p_promissoria_vencimento, v_venda_id
    );
  end if;

  -- Auditoria
  perform public.log_auditoria(
    'venda_criada', 'vendas', v_venda_id,
    jsonb_build_object(
      'total', v_bruto,
      'forma_pagamento', p_forma_pagamento,
      'parcelas', coalesce(p_parcelas, 1),
      'taxa_percentual', v_taxa_pct,
      'taxa_valor', v_taxa_valor,
      'valor_liquido', v_liquido,
      'custo_total', v_custo_total,
      'margem', v_liquido - v_custo_total,
      'itens', jsonb_array_length(coalesce(p_itens, '[]'::jsonb))
    )
  );

  return v_venda_id;
end;
$$;

-- ── (5b) cancelar_venda(): estorna a taxa sem duplicidade ─────────────────────
create or replace function public.cancelar_venda(
  p_venda_id uuid,
  p_motivo text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text;
  v_vi record;
begin
  if public.current_papel() not in ('owner', 'gerente') then
    raise exception 'Seu perfil não tem permissão para cancelar vendas';
  end if;

  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo do cancelamento';
  end if;

  select status into v_status from public.vendas where id = p_venda_id for update;
  if v_status is null then
    raise exception 'Venda não encontrada';
  end if;
  if v_status <> 'concluida' then
    return; -- já cancelada/estornada — no-op
  end if;

  for v_vi in
    select * from public.venda_itens where venda_id = p_venda_id and quantidade > 0
  loop
    perform public.registrar_movimentacao(
      v_vi.produto_id, 'cancelamento', v_vi.quantidade, 'Cancelamento de venda',
      p_motivo, p_venda_id, v_vi.variacao_id,
      'cancel-' || p_venda_id::text || '-' || v_vi.id::text
    );
  end loop;

  update public.promissorias
    set status = 'cancelado'
    where venda_id = p_venda_id and status <> 'cancelado';

  -- Estorna a taxa do cartão lançada em despesas (idempotente).
  perform public.estornar_taxa_venda(p_venda_id);

  update public.vendas
    set status = 'cancelada',
        motivo_cancelamento = p_motivo,
        cancelada_em = now(),
        cancelada_por = auth.uid()
    where id = p_venda_id;

  perform public.log_auditoria(
    'venda_cancelada', 'vendas', p_venda_id,
    jsonb_build_object('motivo', p_motivo)
  );
end;
$$;
