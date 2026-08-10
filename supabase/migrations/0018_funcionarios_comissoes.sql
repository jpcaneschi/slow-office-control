-- ─────────────────────────────────────────────────────────────────────────────
-- Fase (funcionários) 1/2 — Funcionários, comissão por venda e vales
--
-- • funcionarios: equipe para fins de COMISSÃO/FOLHA (pode ou não ter login).
--   Diferente de organization_members (que é acesso ao sistema). O "responsável"
--   da venda é casado por nome ao funcionário → gera a comissão.
-- • vendas.funcionario_id: vínculo direto (preenchido quando o responsável
--   bate com um funcionário cadastrado).
-- • vales: adiantamentos pagos ao funcionário (descontados no acerto).
-- RLS por papel (mesmo padrão do 0017). Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.funcionarios (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) default public.current_org_id(),
  nome text not null,
  comissao_percentual numeric(6, 2) not null default 0,
  salario_fixo numeric(12, 2) not null default 0,
  ativo boolean not null default true,
  observacao text,
  created_at timestamptz not null default now()
);
create index if not exists funcionarios_org_idx on public.funcionarios (organization_id);

create table if not exists public.vales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) default public.current_org_id(),
  funcionario_id uuid not null references public.funcionarios (id) on delete cascade,
  valor numeric(12, 2) not null,
  data date not null default current_date,
  observacao text,
  created_at timestamptz not null default now()
);
create index if not exists vales_org_idx on public.vales (organization_id);
create index if not exists vales_funcionario_idx on public.vales (funcionario_id);

alter table public.vendas
  add column if not exists funcionario_id uuid references public.funcionarios (id);

-- ── RLS por papel ────────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select * from (values
      ('funcionarios', 'owner,gerente,financeiro', 'owner,gerente'),
      ('vales',        'owner,gerente,financeiro', 'owner,gerente,financeiro')
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
