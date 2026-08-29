-- Corrige a assinatura da RPC de auditoria administrativa.
-- auth.users.email e varchar(255), enquanto a RPC publica email como text.
-- O cast explicito evita o erro 42804 sem alterar nenhuma linha de dados.

create or replace function public.admin_listar_auditoria(p_limite integer default 30)
returns table (
  id bigint,
  acao text,
  admin_email text,
  target_email text,
  organization_nome text,
  detalhes jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito ao administrador da plataforma'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select
    a.id,
    a.acao,
    au.email::text,
    tu.email::text,
    o.nome,
    a.detalhes,
    a.created_at
  from public.platform_admin_audit a
  join auth.users au on au.id = a.admin_user_id
  left join auth.users tu on tu.id = a.target_user_id
  left join public.organizations o on o.id = a.organization_id
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_limite, 30), 100));
end;
$$;

revoke all on function public.admin_listar_auditoria(integer) from public, anon;
grant execute on function public.admin_listar_auditoria(integer) to authenticated;
