-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 2 P0 — #1 Cancelamento de venda atômico, seguro e reversível
--
-- Um único RPC transacional que:
--   • trava a venda (evita cancelamento duplo/concorrente) e é idempotente;
--   • exige MOTIVO;
--   • exige PERMISSÃO no backend (só owner/gerente);
--   • devolve o estoque de cada item na variação certa (idempotente por item);
--   • CANCELA as promissórias vinculadas (preserva histórico, não apaga);
--   • marca a venda como cancelada com motivo/usuário/quando;
--   • registra na auditoria.
-- Comissão, faturamento e contas a receber se revertem sozinhos: os cálculos
-- filtram status='concluida' e promissórias 'cancelado' saem do "em aberto".
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.vendas
  add column if not exists motivo_cancelamento text,
  add column if not exists cancelada_em timestamptz,
  add column if not exists cancelada_por uuid;

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
  -- Permissão no backend (não confiar só no front).
  if public.current_papel() not in ('owner', 'gerente') then
    raise exception 'Seu perfil não tem permissão para cancelar vendas';
  end if;

  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo do cancelamento';
  end if;

  -- Trava a venda: serializa e garante idempotência.
  select status into v_status from public.vendas where id = p_venda_id for update;
  if v_status is null then
    raise exception 'Venda não encontrada';
  end if;
  if v_status <> 'concluida' then
    return; -- já cancelada/estornada — no-op
  end if;

  -- Devolve o estoque de cada item ainda ativo (idempotente por item).
  for v_vi in
    select * from public.venda_itens where venda_id = p_venda_id and quantidade > 0
  loop
    perform public.registrar_movimentacao(
      v_vi.produto_id, 'cancelamento', v_vi.quantidade, 'Cancelamento de venda',
      p_motivo, p_venda_id, v_vi.variacao_id,
      'cancel-' || p_venda_id::text || '-' || v_vi.id::text
    );
  end loop;

  -- Cancela as promissórias vinculadas (preserva histórico).
  update public.promissorias
    set status = 'cancelado'
    where venda_id = p_venda_id and status <> 'cancelado';

  -- Marca a venda.
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
