-- ─────────────────────────────────────────────────────────────────────────────
-- Assinatura com trial e enforcement real no banco.
--
-- Antes a página de assinatura era somente informativa. Como todas as tabelas
-- operacionais usam current_org_id() no RLS, fazer essa função devolver NULL
-- quando o plano está bloqueado fecha o acesso também fora da interface.
--
-- Compatibilidade:
--   • empresas já existentes sem linha ganham acesso manual/legado;
--   • linhas legadas sem provedor nem vencimento continuam liberadas;
--   • empresas novas recebem 14 dias de trial automaticamente.
-- ─────────────────────────────────────────────────────────────────────────────

-- Preserva todas as empresas que já estavam usando o sistema antes do gate.
insert into public.subscriptions (
  organization_id, provider, plano, status, updated_at
)
select o.id, 'manual', 'Acesso legado', 'ativa', now()
from public.organizations o
where not exists (
  select 1 from public.subscriptions s where s.organization_id = o.id
);

create or replace function public.fn_assinatura_permite_acesso(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.organization_id = p_org
      and (
        (
          s.status = 'ativa'
          and (s.current_period_end is null or s.current_period_end >= now())
        )
        or (
          s.status = 'trial'
          and s.current_period_end is not null
          and s.current_period_end >= now()
        )
        -- Compatibilidade com registros criados antes de existir enforcement.
        or (
          s.provider is null
          and s.current_period_end is null
        )
      )
  );
$$;

-- Cria o trial junto com toda nova organização, inclusive as criadas pela RPC
-- garantir_empresa(). O e-mail é útil para a futura correlação do checkout.
create or replace function public.fn_criar_trial_empresa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.subscriptions (
    organization_id, provider, email, plano, status, current_period_end
  ) values (
    NEW.id,
    'trial',
    nullif(lower(coalesce(auth.jwt() ->> 'email', '')), ''),
    'Teste gratuito',
    'trial',
    now() + interval '14 days'
  )
  on conflict (organization_id) do nothing;
  return NEW;
end;
$$;

drop trigger if exists trg_criar_trial_empresa on public.organizations;
create trigger trg_criar_trial_empresa
  after insert on public.organizations
  for each row execute function public.fn_criar_trial_empresa();

-- A empresa corrente só existe, para as tabelas operacionais, enquanto houver
-- acesso válido. A própria assinatura continua legível pela policy abaixo.
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.organization_id
  from public.organization_members m
  where m.user_id = auth.uid()
    and public.fn_assinatura_permite_acesso(m.organization_id)
  order by m.created_at
  limit 1
$$;

drop policy if exists "subs_select" on public.subscriptions;
create policy "subs_select" on public.subscriptions for select to authenticated
  using (
    exists (
      select 1
      from public.organization_members m
      where m.organization_id = subscriptions.organization_id
        and m.user_id = auth.uid()
    )
  );
