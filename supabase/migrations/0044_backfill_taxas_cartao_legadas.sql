-- ─────────────────────────────────────────────────────────────────────────────
-- Repara snapshots e despesas de taxas de cartão de vendas anteriores à 0035.
--
-- A 0035 passou a calcular corretamente as vendas novas, mas as vendas antigas
-- continuaram com taxa (%) preenchida e taxa_valor = 0. Por isso o Financeiro
-- não enxergava o custo da maquininha dessas vendas.
--
-- Esta migration é idempotente:
--   • só preenche snapshots ainda ausentes;
--   • o índice despesas_taxa_por_venda_uidx impede duplicidade;
--   • registrar_taxa_venda() também verifica se a despesa já existe;
--   • vendas canceladas recebem o snapshot histórico, mas não geram despesa.
-- ─────────────────────────────────────────────────────────────────────────────

-- Permite que o reparo executado pela migration atribua a despesa ao usuário
-- original da venda quando não existe uma sessão autenticada (auth.uid null).
create or replace function public.registrar_taxa_venda(p_venda_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  select id, organization_id, user_id, taxa_valor, forma_pagamento, created_at,
         parcelas
    into v
    from public.vendas
    where id = p_venda_id;

  if not found then
    return;
  end if;

  -- Uma chamada feita por usuário só pode alcançar a própria empresa. O ramo
  -- auth.uid() is null é necessário para o backfill executado pela migration.
  if auth.uid() is not null
     and v.organization_id is distinct from public.current_org_id() then
    raise exception 'Venda nao pertence a empresa atual';
  end if;

  if v.forma_pagamento is distinct from 'cartao'
     or coalesce(v.taxa_valor, 0) <= 0 then
    return;
  end if;

  if exists (
    select 1
      from public.despesas
      where venda_id = p_venda_id
        and categoria = 'Taxa de cartão'
  ) then
    return;
  end if;

  insert into public.despesas (
    organization_id, user_id, venda_id, descricao, categoria, valor, data,
    responsavel, observacao
  ) values (
    v.organization_id, coalesce(auth.uid(), v.user_id), p_venda_id,
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

-- A versão da 0035 podia ser chamada diretamente por qualquer autenticado. O
-- estorno continua sendo usado por cancelar_venda(), mas agora valida empresa e
-- papel também quando alguém tenta invocar a RPC isoladamente.
create or replace function public.estornar_taxa_venda(p_venda_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select organization_id
    into v_org
    from public.vendas
    where id = p_venda_id;

  if not found then
    return;
  end if;

  if auth.uid() is not null then
    if v_org is distinct from public.current_org_id() then
      raise exception 'Venda nao pertence a empresa atual';
    end if;
    if public.current_papel() not in ('owner', 'gerente') then
      raise exception 'Seu perfil nao tem permissao para estornar taxa de venda';
    end if;
  end if;

  delete from public.despesas
    where venda_id = p_venda_id
      and categoria = 'Taxa de cartão';
end;
$$;

-- Congela o snapshot financeiro que faltava nas vendas antigas. custo_total é
-- recalculado a partir dos itens já gravados, exatamente como nas vendas novas.
with custos as (
  select
    vi.venda_id,
    coalesce(sum(vi.quantidade * coalesce(vi.custo_unitario, 0)), 0) as total
  from public.venda_itens vi
  group by vi.venda_id
)
update public.vendas v
set
  valor_bruto = coalesce(v.valor_bruto, v.total, 0),
  taxa_valor = round(coalesce(v.total, 0) * coalesce(v.taxa, 0) / 100.0, 2),
  valor_liquido = coalesce(v.total, 0)
    - round(coalesce(v.total, 0) * coalesce(v.taxa, 0) / 100.0, 2),
  custo_total = coalesce(c.total, 0),
  margem = coalesce(v.total, 0)
    - round(coalesce(v.total, 0) * coalesce(v.taxa, 0) / 100.0, 2)
    - coalesce(c.total, 0)
from custos c
where c.venda_id = v.id
  and v.forma_pagamento = 'cartao'
  and coalesce(v.taxa, 0) > 0
  and coalesce(v.taxa_valor, 0) = 0;

-- Também cobre, sem depender da existência de itens, uma eventual venda antiga
-- sem linhas em venda_itens (o custo fica zero).
update public.vendas v
set
  valor_bruto = coalesce(v.valor_bruto, v.total, 0),
  taxa_valor = round(coalesce(v.total, 0) * coalesce(v.taxa, 0) / 100.0, 2),
  valor_liquido = coalesce(v.total, 0)
    - round(coalesce(v.total, 0) * coalesce(v.taxa, 0) / 100.0, 2),
  custo_total = 0,
  margem = coalesce(v.total, 0)
    - round(coalesce(v.total, 0) * coalesce(v.taxa, 0) / 100.0, 2)
where v.forma_pagamento = 'cartao'
  and coalesce(v.taxa, 0) > 0
  and coalesce(v.taxa_valor, 0) = 0;

-- Lança somente as despesas das vendas efetivamente concluídas. A função e o
-- índice único tornam este bloco seguro para reexecução.
do $$
declare
  v_venda_id uuid;
begin
  for v_venda_id in
    select v.id
    from public.vendas v
    where v.forma_pagamento = 'cartao'
      and v.status = 'concluida'
      and coalesce(v.taxa_valor, 0) > 0
      and not exists (
        select 1
        from public.despesas d
        where d.venda_id = v.id
          and d.categoria = 'Taxa de cartão'
      )
  loop
    perform public.registrar_taxa_venda(v_venda_id);
  end loop;
end;
$$;
