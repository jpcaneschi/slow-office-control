-- ─────────────────────────────────────────────────────────────────────────────
-- Fase b.4.1 — Movimentações de estoque com histórico + RPC atômico
-- Adiciona colunas de histórico em estoque_movimentacoes e cria a função
-- registrar_movimentacao(), que registra a movimentação (com estoque
-- anterior/posterior) e atualiza o estoque do produto de forma ATÔMICA,
-- com trava de linha (evita corrida) e bloqueio de estoque negativo.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.estoque_movimentacoes
  add column if not exists quantidade_anterior numeric(12, 2),
  add column if not exists quantidade_posterior numeric(12, 2),
  add column if not exists motivo text,
  add column if not exists referencia_id uuid;

create or replace function public.registrar_movimentacao(
  p_produto_id uuid,
  p_tipo text,
  p_quantidade numeric,
  p_motivo text default null,
  p_observacao text default null,
  p_referencia_id uuid default null
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
  -- Trava a linha do produto (respeita RLS: só o dono/empresa acessa).
  select coalesce(estoque, 0) into v_anterior
  from public.produtos where id = p_produto_id for update;

  if v_anterior is null then
    raise exception 'Produto não encontrado ou sem acesso';
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
    (produto_id, tipo, quantidade, quantidade_anterior, quantidade_posterior, motivo, observacao, referencia_id)
  values
    (p_produto_id, p_tipo, v_qtd, v_anterior, v_posterior, p_motivo, p_observacao, p_referencia_id);

  update public.produtos set estoque = v_posterior where id = p_produto_id;
end;
$$;
