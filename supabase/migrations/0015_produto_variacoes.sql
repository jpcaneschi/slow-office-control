-- ─────────────────────────────────────────────────────────────────────────────
-- Fase (variações) 1/3 — Fundação da grade de produtos (tamanho/cor)
--
-- Um produto pode OU NÃO ter variações (produtos.tem_variacoes). Quando tem:
--   • o estoque passa a viver em produto_variacoes.estoque (cada grade);
--   • a venda escolhe a variação; a movimentação de estoque age na variação;
--   • preço/custo da variação são OPCIONAIS (null = herda do produto).
-- Quando não tem, tudo continua exatamente como hoje (estoque no produto).
--
-- Backward-compatible: produtos existentes ficam com tem_variacoes = false.
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Flag no produto
alter table public.produtos
  add column if not exists tem_variacoes boolean not null default false;

-- 2) Tabela de variações (grade)
create table if not exists public.produto_variacoes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) default public.current_org_id(),
  produto_id uuid not null references public.produtos (id) on delete cascade,
  tamanho text,
  cor text,
  sku text,
  preco numeric(12, 2),
  custo numeric(12, 2),
  estoque numeric(12, 2) not null default 0,
  status text not null default 'ativo',
  created_at timestamptz not null default now()
);

create index if not exists produto_variacoes_produto_idx
  on public.produto_variacoes (produto_id);
create index if not exists produto_variacoes_org_idx
  on public.produto_variacoes (organization_id);

-- 3) Ligações para venda e movimentação de estoque
alter table public.venda_itens
  add column if not exists variacao_id uuid references public.produto_variacoes (id);
alter table public.estoque_movimentacoes
  add column if not exists variacao_id uuid references public.produto_variacoes (id);

-- 4) RLS por organização (mesmo padrão das demais operacionais)
alter table public.produto_variacoes enable row level security;
drop policy if exists "org_isolation" on public.produto_variacoes;
create policy "org_isolation" on public.produto_variacoes for all to authenticated
  using (organization_id in (select organization_id from public.organization_members where user_id = auth.uid()))
  with check (organization_id in (select organization_id from public.organization_members where user_id = auth.uid()));

-- 5) RPC de movimentação passa a aceitar variação (p_variacao_id).
--    Se p_variacao_id vier, trava/atualiza a VARIAÇÃO; senão, o PRODUTO (como antes).
--    Dropa a assinatura antiga para evitar overload ambíguo.
drop function if exists public.registrar_movimentacao(uuid, text, numeric, text, text, uuid);

create or replace function public.registrar_movimentacao(
  p_produto_id uuid,
  p_tipo text,
  p_quantidade numeric,
  p_motivo text default null,
  p_observacao text default null,
  p_referencia_id uuid default null,
  p_variacao_id uuid default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_anterior numeric;
  v_qtd numeric := abs(coalesce(p_quantidade, 0));
  v_posterior numeric;
  v_soma boolean;
begin
  -- Trava a linha do alvo (variação, se informada; senão o produto).
  if p_variacao_id is not null then
    select coalesce(estoque, 0) into v_anterior
    from public.produto_variacoes where id = p_variacao_id for update;
  else
    select coalesce(estoque, 0) into v_anterior
    from public.produtos where id = p_produto_id for update;
  end if;

  if v_anterior is null then
    raise exception 'Produto/variação não encontrado ou sem acesso';
  end if;

  -- Tipos que SOMAM ao estoque; os demais subtraem.
  v_soma := p_tipo in (
    'entrada','cancelamento','devolucao','retorno_condicional',
    'estoque_inicial','importacao','ajuste_positivo'
  );

  v_posterior := case when v_soma then v_anterior + v_qtd else v_anterior - v_qtd end;

  if v_posterior < 0 then
    raise exception 'Estoque insuficiente (atual: %, saída: %)', v_anterior, v_qtd;
  end if;

  insert into public.estoque_movimentacoes
    (produto_id, variacao_id, tipo, quantidade, quantidade_anterior, quantidade_posterior, motivo, observacao, referencia_id)
  values
    (p_produto_id, p_variacao_id, p_tipo, v_qtd, v_anterior, v_posterior, p_motivo, p_observacao, p_referencia_id);

  if p_variacao_id is not null then
    update public.produto_variacoes set estoque = v_posterior where id = p_variacao_id;
  else
    update public.produtos set estoque = v_posterior where id = p_produto_id;
  end if;
end;
$$;
