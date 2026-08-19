-- ─────────────────────────────────────────────────────────────────────────────
-- Onboarding multiempresa atômico e seguro.
--
-- A policy histórica de INSERT em organization_members validava somente
-- user_id = auth.uid(). Isso permitia que alguém tentasse se adicionar a uma
-- empresa alheia se descobrisse seu UUID. O ingresso agora só acontece por esta
-- RPC: convite válido ou criação da própria empresa, tudo na mesma transação.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.garantir_empresa(p_nome text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_org uuid;
  v_convite record;
  v_tem_convite boolean := false;
begin
  if v_user is null then
    raise exception 'Usuario nao autenticado';
  end if;

  -- Serializa duas abas tentando concluir o onboarding do mesmo usuário.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  -- Já pertence a uma empresa: operação idempotente.
  select m.organization_id
    into v_org
    from public.organization_members m
    where m.user_id = v_user
    order by m.created_at
    limit 1;

  if v_org is not null then
    return v_org;
  end if;

  -- Convite válido tem prioridade sobre criar uma nova empresa.
  if v_email <> '' then
    select i.*
      into v_convite
      from public.organization_invites i
      where lower(i.email) = v_email
        and i.status = 'pendente'
        and (i.expires_at is null or i.expires_at > now())
      order by i.created_at desc
      limit 1
      for update;
    v_tem_convite := found;
  end if;

  if v_tem_convite then
    insert into public.organization_members (
      organization_id, user_id, papel, email
    ) values (
      v_convite.organization_id, v_user,
      case
        when v_convite.papel in ('owner', 'gerente', 'caixa', 'financeiro')
          then v_convite.papel
        else 'caixa'
      end,
      nullif(v_email, '')
    );

    update public.organization_invites
      set status = 'aceito', used_at = now(), used_by = v_user
      where id = v_convite.id;

    return v_convite.organization_id;
  end if;

  insert into public.organizations (nome, owner_user_id)
  values (coalesce(nullif(trim(p_nome), ''), 'Minha empresa'), v_user)
  returning id into v_org;

  insert into public.organization_members (
    organization_id, user_id, papel, email
  ) values (
    v_org, v_user, 'owner', nullif(v_email, '')
  );

  insert into public.stores (organization_id, nome)
  values (v_org, 'Unidade principal');

  return v_org;
end;
$$;

-- A RPC é o único caminho de entrada. SECURITY DEFINER permite que ela faça a
-- operação atômica; usuários não podem mais inserir memberships diretamente.
revoke all on function public.garantir_empresa(text) from public;
grant execute on function public.garantir_empresa(text) to authenticated;

drop policy if exists "members_insert" on public.organization_members;
drop policy if exists "org_insert" on public.organizations;
