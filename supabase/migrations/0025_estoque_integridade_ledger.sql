-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 2 P0 — #3 Integridade de estoque/valores + #4 Ledger rastreável
--
-- #3: CHECK constraints no BANCO (4ª camada) — estoque/preço/custo nunca < 0;
--     percentuais entre 0 e 100; quantidade de item de venda > 0.
-- #4: estoque_movimentacoes ganha user_id (quem fez) e idempotency_key (evita
--     dupla baixa em clique duplo/retry). registrar_movimentacao grava auth.uid()
--     e vira idempotente quando recebe uma chave.
--
-- Pré-limpa valores inválidos existentes (clamp) antes de aplicar as constraints,
-- para a migration não falhar. Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Pré-limpeza (clamp de valores inválidos) ─────────────────────────────────
update public.produtos set estoque = 0 where estoque < 0;
update public.produtos set preco = 0 where preco < 0;
update public.produtos set custo = 0 where custo < 0;
update public.produto_variacoes set estoque = 0 where estoque < 0;
update public.produto_variacoes set preco = 0 where preco < 0;
update public.produto_variacoes set custo = 0 where custo < 0;
update public.funcionarios set comissao_percentual = least(100, greatest(0, comissao_percentual));
update public.servicos set percentual_loja = least(100, greatest(0, percentual_loja));
update public.atendimentos_servico set percentual_loja = least(100, greatest(0, percentual_loja));
update public.tatuagem_atendimentos set percentual = least(100, greatest(0, percentual));
update public.configuracoes set tatuagem_percentual = least(100, greatest(0, tatuagem_percentual))
  where tatuagem_percentual is not null;
update public.configuracoes set pix_desconto = least(100, greatest(0, pix_desconto))
  where pix_desconto is not null;

-- ── CHECK constraints (idempotentes via captura de duplicate_object) ──────────
do $$
begin
  begin alter table public.produtos add constraint chk_produtos_estoque check (estoque >= 0); exception when duplicate_object then null; end;
  begin alter table public.produtos add constraint chk_produtos_preco check (preco >= 0); exception when duplicate_object then null; end;
  begin alter table public.produtos add constraint chk_produtos_custo check (custo >= 0); exception when duplicate_object then null; end;

  begin alter table public.produto_variacoes add constraint chk_var_estoque check (estoque >= 0); exception when duplicate_object then null; end;
  begin alter table public.produto_variacoes add constraint chk_var_preco check (preco >= 0); exception when duplicate_object then null; end;
  begin alter table public.produto_variacoes add constraint chk_var_custo check (custo >= 0); exception when duplicate_object then null; end;

  begin alter table public.funcionarios add constraint chk_func_comissao check (comissao_percentual between 0 and 100); exception when duplicate_object then null; end;
  begin alter table public.servicos add constraint chk_serv_pct check (percentual_loja between 0 and 100); exception when duplicate_object then null; end;
  begin alter table public.atendimentos_servico add constraint chk_atsv_pct check (percentual_loja between 0 and 100); exception when duplicate_object then null; end;
  begin alter table public.tatuagem_atendimentos add constraint chk_tat_pct check (percentual between 0 and 100); exception when duplicate_object then null; end;
  begin alter table public.configuracoes add constraint chk_cfg_tat check (tatuagem_percentual is null or tatuagem_percentual between 0 and 100); exception when duplicate_object then null; end;
  begin alter table public.configuracoes add constraint chk_cfg_pix check (pix_desconto is null or pix_desconto between 0 and 100); exception when duplicate_object then null; end;

  begin alter table public.venda_itens add constraint chk_vi_qtd check (quantidade > 0); exception when duplicate_object then null; end;
end $$;

-- ── #4 Ledger: user_id + idempotência em estoque_movimentacoes ────────────────
alter table public.estoque_movimentacoes
  add column if not exists user_id uuid,
  add column if not exists idempotency_key text;

create unique index if not exists estoque_mov_idem_uq
  on public.estoque_movimentacoes (idempotency_key)
  where idempotency_key is not null;

-- ── registrar_movimentacao: grava autor + idempotência ───────────────────────
drop function if exists public.registrar_movimentacao(uuid, text, numeric, text, text, uuid, uuid);

create or replace function public.registrar_movimentacao(
  p_produto_id uuid,
  p_tipo text,
  p_quantidade numeric,
  p_motivo text default null,
  p_observacao text default null,
  p_referencia_id uuid default null,
  p_variacao_id uuid default null,
  p_idempotency_key text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_anterior numeric;
  v_qtd numeric := abs(coalesce(p_quantidade, 0));
  v_posterior numeric;
  v_soma boolean;
begin
  -- Idempotência: se já registramos esta chave, não aplica de novo.
  if p_idempotency_key is not null and exists (
    select 1 from public.estoque_movimentacoes where idempotency_key = p_idempotency_key
  ) then
    return;
  end if;

  if p_variacao_id is not null then
    select coalesce(estoque, 0), organization_id into v_anterior, v_org
    from public.produto_variacoes where id = p_variacao_id for update;
  else
    select coalesce(estoque, 0), organization_id into v_anterior, v_org
    from public.produtos where id = p_produto_id for update;
  end if;

  if v_org is null then
    raise exception 'Produto/variação não encontrado';
  end if;
  if v_org <> public.current_org_id() then
    raise exception 'Sem acesso a este produto';
  end if;

  v_soma := p_tipo in (
    'entrada','cancelamento','devolucao','retorno_condicional',
    'estoque_inicial','importacao','ajuste_positivo'
  );

  v_posterior := case when v_soma then v_anterior + v_qtd else v_anterior - v_qtd end;

  if v_posterior < 0 then
    raise exception 'Estoque insuficiente (atual: %, saída: %)', v_anterior, v_qtd;
  end if;

  insert into public.estoque_movimentacoes
    (produto_id, variacao_id, tipo, quantidade, quantidade_anterior, quantidade_posterior,
     motivo, observacao, referencia_id, organization_id, user_id, idempotency_key)
  values
    (p_produto_id, p_variacao_id, p_tipo, v_qtd, v_anterior, v_posterior,
     p_motivo, p_observacao, p_referencia_id, v_org, auth.uid(), p_idempotency_key);

  if p_variacao_id is not null then
    update public.produto_variacoes set estoque = v_posterior where id = p_variacao_id;
  else
    update public.produtos set estoque = v_posterior where id = p_produto_id;
  end if;
end;
$$;
