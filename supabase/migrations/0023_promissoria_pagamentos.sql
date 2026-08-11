-- ─────────────────────────────────────────────────────────────────────────────
-- Fase (#4) — Recebimento PARCIAL de promissória
--
-- Antes: a promissória só era "paga" por inteiro. Agora registramos pagamentos
-- (parciais) e o saldo = valor_total − soma dos pagamentos. Quando zera, a
-- promissória vira 'pago' automaticamente.
--
-- RPC registrar_pagamento_promissoria: insere o pagamento, recalcula o saldo,
-- quita se necessário e audita — tudo numa transação. Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.promissoria_pagamentos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) default public.current_org_id(),
  promissoria_id uuid not null references public.promissorias (id) on delete cascade,
  valor numeric(12, 2) not null,
  data date not null default current_date,
  forma_pagamento text,
  observacao text,
  created_at timestamptz not null default now()
);
create index if not exists promissoria_pagamentos_prom_idx
  on public.promissoria_pagamentos (promissoria_id);
create index if not exists promissoria_pagamentos_org_idx
  on public.promissoria_pagamentos (organization_id);

-- ── RLS por papel (mesmo acesso das promissórias) ────────────────────────────
do $$
declare r record;
begin
  for r in
    select * from (values
      ('promissoria_pagamentos', 'owner,gerente,caixa,financeiro', 'owner,gerente,caixa,financeiro')
    ) as t(tabela, sel, wr)
  loop
    execute format('alter table public.%I enable row level security', r.tabela);
    execute format('drop policy if exists "rbac_select" on public.%I', r.tabela);
    execute format('drop policy if exists "rbac_insert" on public.%I', r.tabela);
    execute format('drop policy if exists "rbac_update" on public.%I', r.tabela);
    execute format('drop policy if exists "rbac_delete" on public.%I', r.tabela);

    execute format(
      'create policy "rbac_select" on public.%I for select to authenticated '
      || 'using (organization_id = public.current_org_id() '
      || 'and public.current_papel() = any(string_to_array(%L, %L)))',
      r.tabela, r.sel, ','
    );
    execute format(
      'create policy "rbac_insert" on public.%I for insert to authenticated '
      || 'with check (organization_id = public.current_org_id() '
      || 'and public.current_papel() = any(string_to_array(%L, %L)))',
      r.tabela, r.wr, ','
    );
    execute format(
      'create policy "rbac_update" on public.%I for update to authenticated '
      || 'using (organization_id = public.current_org_id() '
      || 'and public.current_papel() = any(string_to_array(%L, %L))) '
      || 'with check (organization_id = public.current_org_id() '
      || 'and public.current_papel() = any(string_to_array(%L, %L)))',
      r.tabela, r.wr, ',', r.wr, ','
    );
    execute format(
      'create policy "rbac_delete" on public.%I for delete to authenticated '
      || 'using (organization_id = public.current_org_id() '
      || 'and public.current_papel() = any(string_to_array(%L, %L)))',
      r.tabela, r.wr, ','
    );
  end loop;
end $$;

-- ── RPC: registra pagamento (parcial) e quita se zerar ───────────────────────
create or replace function public.registrar_pagamento_promissoria(
  p_promissoria_id uuid,
  p_valor numeric,
  p_forma text default null,
  p_obs text default null
)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_total numeric;
  v_pago numeric;
  v_saldo numeric;
begin
  select valor_total into v_total
  from public.promissorias where id = p_promissoria_id;
  if v_total is null then
    raise exception 'Promissória não encontrada';
  end if;
  if coalesce(p_valor, 0) <= 0 then
    raise exception 'Informe um valor de pagamento válido';
  end if;

  insert into public.promissoria_pagamentos (promissoria_id, valor, forma_pagamento, observacao)
  values (p_promissoria_id, p_valor, p_forma, p_obs);

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
