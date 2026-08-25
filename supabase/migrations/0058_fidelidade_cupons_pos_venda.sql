-- Fidelidade / pós-venda: cupons individuais com validade, uso e isolamento por empresa.
-- Migration aditiva: não altera nem remove dados existentes.

create table if not exists public.cupons_pos_venda (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) default public.current_org_id(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  codigo text not null,
  status text not null default 'ativo',
  validade date not null,
  utilizado_em timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists cupons_pos_venda_org_codigo_uidx
  on public.cupons_pos_venda(organization_id, codigo);
create index if not exists cupons_pos_venda_org_cliente_idx
  on public.cupons_pos_venda(organization_id, cliente_id);
create index if not exists cupons_pos_venda_validade_idx
  on public.cupons_pos_venda(organization_id, validade);

do $$ begin
  alter table public.cupons_pos_venda add constraint chk_cupom_status
    check (status in ('ativo','usado','cancelado'));
exception when duplicate_object then null; end $$;

alter table public.cupons_pos_venda enable row level security;

drop policy if exists "rbac_select" on public.cupons_pos_venda;
drop policy if exists "rbac_insert" on public.cupons_pos_venda;
drop policy if exists "rbac_update" on public.cupons_pos_venda;
drop policy if exists "rbac_delete" on public.cupons_pos_venda;

create policy "rbac_select" on public.cupons_pos_venda
for select to authenticated
using (
  organization_id = public.current_org_id()
  and public.current_papel() = any(array['owner','gerente','caixa','financeiro'])
);

create policy "rbac_insert" on public.cupons_pos_venda
for insert to authenticated
with check (
  organization_id = public.current_org_id()
  and public.current_papel() = any(array['owner','gerente','caixa'])
);

create policy "rbac_update" on public.cupons_pos_venda
for update to authenticated
using (
  organization_id = public.current_org_id()
  and public.current_papel() = any(array['owner','gerente','caixa'])
)
with check (
  organization_id = public.current_org_id()
  and public.current_papel() = any(array['owner','gerente','caixa'])
);

create policy "rbac_delete" on public.cupons_pos_venda
for delete to authenticated
using (
  organization_id = public.current_org_id()
  and public.current_papel() = any(array['owner','gerente'])
);

create or replace function public.gerar_cupons_pos_venda(
  p_cliente_id uuid,
  p_quantidade int default 5,
  p_validade_dias int default 7
)
returns setof public.cupons_pos_venda
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_i int;
  v_codigo text;
  v_reg public.cupons_pos_venda%rowtype;
begin
  if public.current_papel() not in ('owner','gerente','caixa') then
    raise exception 'Sem permissão para gerar cupons';
  end if;
  if p_quantidade not between 1 and 10 then
    raise exception 'A quantidade deve ficar entre 1 e 10 cupons';
  end if;
  if p_validade_dias not between 1 and 90 then
    raise exception 'A validade deve ficar entre 1 e 90 dias';
  end if;
  if not exists (
    select 1 from public.clientes
    where id = p_cliente_id and organization_id = public.current_org_id()
  ) then
    raise exception 'Cliente não encontrado nesta empresa';
  end if;

  for v_i in 1..p_quantidade loop
    loop
      v_codigo := 'NEXO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
      begin
        insert into public.cupons_pos_venda(cliente_id, codigo, validade)
        values (p_cliente_id, v_codigo, current_date + p_validade_dias)
        returning * into v_reg;
        exit;
      exception when unique_violation then
        null;
      end;
    end loop;
    return next v_reg;
  end loop;
end;
$$;

create or replace function public.marcar_cupom_pos_venda_usado(p_cupom_id uuid)
returns public.cupons_pos_venda
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_reg public.cupons_pos_venda%rowtype;
begin
  if public.current_papel() not in ('owner','gerente','caixa') then
    raise exception 'Sem permissão para usar cupons';
  end if;

  select * into v_reg
  from public.cupons_pos_venda
  where id = p_cupom_id and organization_id = public.current_org_id()
  for update;

  if not found then raise exception 'Cupom não encontrado'; end if;
  if v_reg.status <> 'ativo' then raise exception 'Este cupom não está ativo'; end if;
  if v_reg.validade < current_date then raise exception 'Este cupom está vencido'; end if;

  update public.cupons_pos_venda
  set status = 'usado', utilizado_em = now()
  where id = p_cupom_id
  returning * into v_reg;

  return v_reg;
end;
$$;

revoke all on function public.gerar_cupons_pos_venda(uuid,int,int) from public;
revoke all on function public.marcar_cupom_pos_venda_usado(uuid) from public;
grant execute on function public.gerar_cupons_pos_venda(uuid,int,int) to authenticated;
grant execute on function public.marcar_cupom_pos_venda_usado(uuid) to authenticated;