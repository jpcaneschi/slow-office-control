-- Ledger de múltiplas formas de pagamento por venda.
-- A RPC envolve criar_venda existente na mesma transação, preservando estoque,
-- validações, auditoria e idempotência já consolidados.

create table if not exists public.venda_pagamentos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id()
    references public.organizations(id) on delete cascade,
  venda_id uuid not null references public.vendas(id) on delete cascade,
  forma text not null check (forma in ('pix', 'dinheiro', 'cartao')),
  valor numeric(12, 2) not null check (valor > 0),
  parcelas int not null default 1 check (parcelas >= 1),
  taxa_percentual numeric(6, 3) not null default 0
    check (taxa_percentual between 0 and 100),
  taxa_valor numeric(12, 2) not null default 0 check (taxa_valor >= 0),
  created_at timestamptz not null default now()
);

create index if not exists venda_pagamentos_org_idx
  on public.venda_pagamentos(organization_id);
create index if not exists venda_pagamentos_venda_idx
  on public.venda_pagamentos(venda_id);

-- A tabela de vendas já tinha uma trava com as formas anteriores. Ampliamos a
-- lista sem alterar nenhuma linha existente.
alter table public.vendas drop constraint if exists vendas_forma_pagamento_check;
alter table public.vendas add constraint vendas_forma_pagamento_check
  check (forma_pagamento in ('pix','dinheiro','cartao','promissoria','misto','multiplo'));

alter table public.venda_pagamentos enable row level security;

drop policy if exists venda_pagamentos_select on public.venda_pagamentos;
create policy venda_pagamentos_select on public.venda_pagamentos
for select to authenticated
using (
  organization_id = public.current_org_id()
  and public.current_papel() = any(array['owner','gerente','caixa','financeiro'])
);

drop policy if exists venda_pagamentos_write on public.venda_pagamentos;
create policy venda_pagamentos_write on public.venda_pagamentos
for all to authenticated
using (
  organization_id = public.current_org_id()
  and public.current_papel() = any(array['owner','gerente','caixa'])
)
with check (
  organization_id = public.current_org_id()
  and public.current_papel() = any(array['owner','gerente','caixa'])
);

-- Amplia a rotina segura já existente para reconhecer também a taxa
-- consolidada de uma venda dividida.
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

  if not found then return; end if;
  if auth.uid() is not null
     and v.organization_id is distinct from public.current_org_id() then
    raise exception 'Venda nao pertence a empresa atual';
  end if;
  if v.forma_pagamento not in ('cartao', 'multiplo')
     or coalesce(v.taxa_valor, 0) <= 0 then
    return;
  end if;
  if exists (
    select 1 from public.despesas
    where venda_id = p_venda_id and categoria = 'Taxa de cartão'
  ) then return; end if;

  insert into public.despesas (
    organization_id, user_id, venda_id, descricao, categoria, valor, data,
    responsavel, observacao
  ) values (
    v.organization_id, coalesce(auth.uid(), v.user_id), p_venda_id,
    case when v.forma_pagamento = 'multiplo'
      then 'Taxa de cartão (venda dividida ' || left(p_venda_id::text, 8) || ')'
      else 'Taxa de cartão (venda ' || left(p_venda_id::text, 8) || ', '
        || coalesce(v.parcelas, 1) || 'x)' end,
    'Taxa de cartão', v.taxa_valor,
    (v.created_at at time zone 'America/Sao_Paulo')::date,
    null, 'Lançada automaticamente pela venda.'
  );
end;
$$;

revoke all on function public.registrar_taxa_venda(uuid) from public;
revoke all on function public.registrar_taxa_venda(uuid) from anon;
grant execute on function public.registrar_taxa_venda(uuid) to authenticated;

create or replace function public.criar_venda_multiforma(
  p_cliente_id uuid,
  p_responsavel text,
  p_funcionario_id uuid,
  p_desconto numeric,
  p_observacao text,
  p_itens jsonb,
  p_pagamentos jsonb,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_venda_id uuid;
  v_pagamento jsonb;
  v_total_pagamentos numeric;
  v_total_venda numeric;
  v_taxa_total numeric := 0;
  v_custo_total numeric := 0;
  v_max_parcelas int := 1;
begin
  if jsonb_typeof(coalesce(p_pagamentos, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_pagamentos, '[]'::jsonb)) < 2 then
    raise exception 'Informe pelo menos duas formas de pagamento';
  end if;

  select coalesce(sum((p->>'valor')::numeric), 0)
    into v_total_pagamentos
    from jsonb_array_elements(p_pagamentos) p;

  if exists (
    select 1 from jsonb_array_elements(p_pagamentos) p
    where coalesce(p->>'forma', '') not in ('pix','dinheiro','cartao')
       or coalesce((p->>'valor')::numeric, 0) <= 0
       or coalesce((p->>'taxa_percentual')::numeric, 0) < 0
       or coalesce((p->>'taxa_percentual')::numeric, 0) > 100
       or coalesce((p->>'parcelas')::int, 1) < 1
  ) then
    raise exception 'Uma das formas de pagamento é inválida';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_pagamentos) p
    group by p->>'forma'
    having count(*) > 1
  ) then
    raise exception 'Não repita a mesma forma de pagamento; some os valores em uma única linha';
  end if;

  -- Dinheiro é usado apenas como caminho neutro: não aplica desconto Pix nem
  -- cria promissória. A soma informada é validada novamente abaixo.
  v_venda_id := public.criar_venda(
    p_cliente_id => p_cliente_id,
    p_responsavel => p_responsavel,
    p_funcionario_id => p_funcionario_id,
    p_forma_pagamento => 'dinheiro',
    p_parcelas => 1,
    p_taxa => 0,
    p_valor_recebido => v_total_pagamentos,
    p_desconto => p_desconto,
    p_observacao => p_observacao,
    p_itens => p_itens,
    p_promissoria_parcelas => null,
    p_promissoria_vencimento => null,
    p_promissoria_obs => null,
    p_entrada_forma => null,
    p_idempotency_key => p_idempotency_key
  );

  select total into v_total_venda
    from public.vendas
    where id = v_venda_id and organization_id = public.current_org_id();

  if abs(coalesce(v_total_pagamentos, 0) - coalesce(v_total_venda, 0)) > 0.009 then
    raise exception 'A soma dos pagamentos (R$ %) deve ser igual ao total da venda (R$ %)',
      v_total_pagamentos, v_total_venda;
  end if;

  -- Retry idempotente: o ledger pode já ter sido criado pela primeira chamada.
  if not exists (select 1 from public.venda_pagamentos where venda_id = v_venda_id) then
    for v_pagamento in select * from jsonb_array_elements(p_pagamentos)
    loop
      insert into public.venda_pagamentos (
        venda_id, forma, valor, parcelas, taxa_percentual, taxa_valor
      ) values (
        v_venda_id,
        v_pagamento->>'forma',
        (v_pagamento->>'valor')::numeric,
        coalesce((v_pagamento->>'parcelas')::int, 1),
        case when v_pagamento->>'forma' = 'cartao'
          then coalesce((v_pagamento->>'taxa_percentual')::numeric, 0) else 0 end,
        case when v_pagamento->>'forma' = 'cartao'
          then round((v_pagamento->>'valor')::numeric
            * coalesce((v_pagamento->>'taxa_percentual')::numeric, 0) / 100.0, 2)
          else 0 end
      );
    end loop;
  end if;

  select coalesce(sum(taxa_valor), 0), coalesce(max(parcelas), 1)
    into v_taxa_total, v_max_parcelas
    from public.venda_pagamentos where venda_id = v_venda_id;

  select coalesce(sum(
    (e->>'quantidade')::numeric * coalesce((e->>'custo_unitario')::numeric, 0)
  ), 0) into v_custo_total
  from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) e;

  update public.vendas set
    forma_pagamento = 'multiplo',
    parcelas = v_max_parcelas,
    taxa = case when v_total_venda > 0 then round(v_taxa_total / v_total_venda * 100, 3) else 0 end,
    taxa_valor = v_taxa_total,
    valor_bruto = v_total_venda,
    valor_liquido = v_total_venda - v_taxa_total,
    valor_recebido = v_total_pagamentos,
    troco = null,
    custo_total = v_custo_total,
    margem = v_total_venda - v_taxa_total - v_custo_total
  where id = v_venda_id;

  perform public.registrar_taxa_venda(v_venda_id);
  return v_venda_id;
end;
$$;

revoke all on function public.criar_venda_multiforma(uuid,text,uuid,numeric,text,jsonb,jsonb,text) from public;
grant execute on function public.criar_venda_multiforma(uuid,text,uuid,numeric,text,jsonb,jsonb,text) to authenticated;
