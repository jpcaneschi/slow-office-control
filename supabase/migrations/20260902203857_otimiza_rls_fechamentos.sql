-- Evita reavaliar auth.uid/current_org/current_papel para cada linha inserida.
drop policy if exists fechamentos_financeiros_insert on public.fechamentos_financeiros;

create policy fechamentos_financeiros_insert
  on public.fechamentos_financeiros
  for insert to authenticated
  with check (
    organization_id = (select public.current_org_id())
    and created_by = (select auth.uid())
    and (select public.current_papel()) = any(array['owner','gerente','financeiro'])
  );
