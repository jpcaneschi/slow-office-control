-- ─────────────────────────────────────────────────────────────────────────────
-- Fase (serviços) — Serviços genéricos (além de tatuagem)
--
-- Qualquer serviço (corte, conserto, consultoria, etc.) com preço e "% da loja"
-- (percentual_loja = quanto do valor é RECEITA da loja; o resto é repasse ao
-- profissional). Mesma lógica da Tatuagem, para o Financeiro somar igual.
--
-- • servicos: catálogo opcional (nome, preço e % padrão).
-- • atendimentos_servico: cada serviço prestado (valor, % da loja, cliente e
--   funcionário opcionais, data).
-- RLS por papel. Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.servicos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) default public.current_org_id(),
  nome text not null,
  preco numeric(12, 2) not null default 0,
  percentual_loja numeric(6, 2) not null default 100,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists servicos_org_idx on public.servicos (organization_id);

create table if not exists public.atendimentos_servico (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) default public.current_org_id(),
  servico_id uuid references public.servicos (id) on delete set null,
  descricao text,
  cliente_id uuid references public.clientes (id) on delete set null,
  funcionario_id uuid references public.funcionarios (id) on delete set null,
  valor numeric(12, 2) not null,
  percentual_loja numeric(6, 2) not null default 100,
  data date not null default current_date,
  observacao text,
  created_at timestamptz not null default now()
);
create index if not exists atendimentos_servico_org_idx on public.atendimentos_servico (organization_id);
create index if not exists atendimentos_servico_func_idx on public.atendimentos_servico (funcionario_id);

-- ── RLS por papel ────────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select * from (values
      ('servicos',             'owner,gerente,caixa,financeiro', 'owner,gerente'),
      ('atendimentos_servico', 'owner,gerente,financeiro',       'owner,gerente')
    ) as t(tabela, sel, wr)
  loop
    execute format('alter table public.%I enable row level security', r.tabela);
    execute format('drop policy if exists "org_isolation" on public.%I', r.tabela);
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
