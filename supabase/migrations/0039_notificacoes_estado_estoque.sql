-- ─────────────────────────────────────────────────────────────────────────────
-- Correção final P1 — #8 Estoque, busca e notificações
--
-- Duas correções de banco (as de front/lib estão em lib/estoque-utils.ts,
-- lib/busca.ts e lib/notificacoes.ts):
--
-- 1) NOTIFICAÇÕES com ESTADO real (ativa/resolvida) + isolamento por empresa.
--    • A tabela `notificacoes` (0003) nasceu SEM organization_id e com RLS
--      `using(true)` — ou seja, toda empresa enxergava as notificações de todas.
--      Além do vazamento, isso impedia marcar como "resolvida" com segurança
--      (a sincronização de uma empresa não pode mexer no alerta de outra).
--    • Agora: organization_id (default current_org_id) + RLS por empresa, e as
--      colunas `resolvida`/`resolvida_em`. Quando a condição que gerou o alerta
--      deixa de valer (estoque reposto, promissória quitada), a notificação NÃO
--      é apagada — vira "resolvida" e some dos contadores de alertas ativos.
--
-- 2) DEVOLUÇÃO de venda IDEMPOTENTE (sem duplo estorno).
--    • `cancelar_venda` (0026) já é idempotente (chave por item).
--    • `devolver_itens_venda` (0024) NÃO passava idempotency_key ao
--      `registrar_movimentacao`: um retry/duplo-envio da mesma requisição
--      estornava o estoque duas vezes. Agora a RPC aceita `p_idempotency_key`,
--      é no-op se a chave já foi registrada e propaga uma chave por item ao
--      ledger.
--
-- Segurança: organization_id + RLS + índice (padrão 0015/0038). Idempotente
-- (roda 2x sem erro), aditiva e reversível.
--
-- #7 (segurança multiempresa) deve REVALIDAR esta tabela: notificacoes passou a
-- ter isolamento por empresa — expandir supabase/tests/rls_*.sql.
--
-- Como reverter:
--   drop policy if exists "org_isolation" on public.notificacoes;
--   create policy "notificacoes_acesso_total" on public.notificacoes
--     for all to anon, authenticated using (true) with check (true);
--   alter table public.notificacoes drop column if exists resolvida;
--   alter table public.notificacoes drop column if exists resolvida_em;
--   alter table public.notificacoes drop column if exists organization_id;
--   alter table public.venda_devolucoes drop column if exists idempotency_key;
--   -- e recriar devolver_itens_venda com a assinatura de 3 argumentos (0024).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) Notificações: organization_id + estado (resolvida) ─────────────────────
alter table public.notificacoes
  add column if not exists organization_id uuid
    references public.organizations (id) default public.current_org_id();
alter table public.notificacoes
  add column if not exists resolvida boolean not null default false;
alter table public.notificacoes
  add column if not exists resolvida_em timestamptz;

-- Backfill do organization_id a partir da entidade referenciada na `chave`
-- (formato: '<prefixo>:<entidade_id>[:<data>]'). Só preenche onde ainda é null;
-- linhas cujo prefixo não bate ou cuja entidade não existe mais ficam null
-- (invisíveis sob a nova RLS; como a entidade sumiu, a mesma chave não volta a
-- ser inserida, então não há conflito de unicidade).
update public.notificacoes n set organization_id = p.organization_id
  from public.produtos p
  where n.organization_id is null
    and n.chave like 'estoque_baixo:%'
    and p.id = nullif(split_part(n.chave, ':', 2), '')::uuid;

update public.notificacoes n set organization_id = pr.organization_id
  from public.promissorias pr
  where n.organization_id is null
    and (n.chave like 'prom_vencida:%' or n.chave like 'prom_vencer:%')
    and pr.id = nullif(split_part(n.chave, ':', 2), '')::uuid;

update public.notificacoes n set organization_id = c.organization_id
  from public.condicionais c
  where n.organization_id is null
    and n.chave like 'cond_atrasada:%'
    and c.id = nullif(split_part(n.chave, ':', 2), '')::uuid;

update public.notificacoes n set organization_id = e.organization_id
  from public.eventos e
  where n.organization_id is null
    and (n.chave like 'evento_vencido:%' or n.chave like 'evento_hoje:%')
    and e.id = nullif(split_part(n.chave, ':', 2), '')::uuid;

update public.notificacoes n set organization_id = cl.organization_id
  from public.clientes cl
  where n.organization_id is null
    and n.chave like 'aniversario:%'
    and cl.id = nullif(split_part(n.chave, ':', 2), '')::uuid;

create index if not exists notificacoes_org_idx
  on public.notificacoes (organization_id);
create index if not exists notificacoes_resolvida_idx
  on public.notificacoes (resolvida);

-- RLS por empresa (substitui o `using(true)` de 0003).
alter table public.notificacoes enable row level security;
drop policy if exists "notificacoes_acesso_total" on public.notificacoes;
drop policy if exists "org_isolation" on public.notificacoes;
create policy "org_isolation" on public.notificacoes for all to authenticated
  using (organization_id in (select organization_id from public.organization_members where user_id = auth.uid()))
  with check (organization_id in (select organization_id from public.organization_members where user_id = auth.uid()));

-- ── 2) Devolução idempotente (sem duplo estorno) ──────────────────────────────
alter table public.venda_devolucoes
  add column if not exists idempotency_key text;

-- Não-único: uma devolução com vários itens grava N linhas com a MESMA chave.
-- A idempotência real vem do lock da venda + do check abaixo (e o ledger tem a
-- sua própria chave única por item).
create index if not exists venda_devolucoes_idem_idx
  on public.venda_devolucoes (idempotency_key)
  where idempotency_key is not null;

-- Recria a RPC com a chave de idempotência (dropa a assinatura de 3 args p/ não
-- deixar overload ambíguo).
drop function if exists public.devolver_itens_venda(uuid, jsonb, text);

create or replace function public.devolver_itens_venda(
  p_venda_id uuid,
  p_itens jsonb,          -- [{venda_item_id, quantidade}]
  p_motivo text default null,
  p_idempotency_key text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status text;
  v_item jsonb;
  v_vi record;
  v_qtd numeric;
  v_valor numeric;
  v_total_dev numeric := 0;
begin
  -- Trava a venda: serializa devoluções concorrentes da mesma venda e torna o
  -- check de idempotência abaixo confiável (sem duplo estorno em retry/corrida).
  select status into v_status from public.vendas where id = p_venda_id for update;
  if v_status is null then
    raise exception 'Venda não encontrada';
  end if;

  -- Idempotência: se esta operação de devolução já foi registrada, não repete
  -- (protege contra retry/duplo-envio da MESMA requisição → sem duplo estorno).
  if p_idempotency_key is not null and exists (
    select 1 from public.venda_devolucoes where idempotency_key = p_idempotency_key
  ) then
    return;
  end if;

  if v_status <> 'concluida' then
    raise exception 'Só é possível devolver itens de uma venda concluída';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb))
  loop
    v_qtd := (v_item->>'quantidade')::numeric;
    if v_qtd is null or v_qtd <= 0 then
      continue;
    end if;

    select * into v_vi from public.venda_itens
      where id = (v_item->>'venda_item_id')::uuid and venda_id = p_venda_id;
    if not found then
      raise exception 'Item da venda não encontrado';
    end if;
    if v_qtd > v_vi.quantidade then
      raise exception 'Quantidade a devolver maior que a vendida';
    end if;

    v_valor := v_qtd * v_vi.preco_unitario;
    v_total_dev := v_total_dev + v_valor;

    insert into public.venda_devolucoes
      (venda_id, produto_id, variacao_id, quantidade, valor, custo_unitario, motivo, idempotency_key)
    values
      (p_venda_id, v_vi.produto_id, v_vi.variacao_id, v_qtd, v_valor, v_vi.custo_unitario, p_motivo, p_idempotency_key);

    perform public.registrar_movimentacao(
      v_vi.produto_id, 'devolucao', v_qtd, 'Devolução de venda', null, p_venda_id, v_vi.variacao_id,
      case when p_idempotency_key is not null
           then 'devol-' || p_idempotency_key || '-' || v_vi.id::text
           else null end
    );

    update public.venda_itens
      set quantidade = quantidade - v_qtd,
          total_item = (quantidade - v_qtd) * preco_unitario
      where id = v_vi.id;
  end loop;

  if v_total_dev > 0 then
    update public.vendas
      set total = greatest(0, total - v_total_dev),
          subtotal = greatest(0, coalesce(subtotal, 0) - v_total_dev)
      where id = p_venda_id;

    if not exists (
      select 1 from public.venda_itens where venda_id = p_venda_id and quantidade > 0
    ) then
      update public.vendas set status = 'cancelada' where id = p_venda_id;
    end if;

    perform public.log_auditoria(
      'venda_devolucao', 'vendas', p_venda_id,
      jsonb_build_object('valor', v_total_dev)
    );
  end if;
end;
$$;
