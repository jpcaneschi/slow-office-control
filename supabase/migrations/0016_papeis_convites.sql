-- ─────────────────────────────────────────────────────────────────────────────
-- Fase (papéis) — Convites de equipe + RLS para gestão de membros
--
-- • current_papel(): papel do usuário logado (security definer p/ evitar
--   recursão de RLS ao referenciar organization_members dentro da sua policy).
-- • organization_members: passa a permitir LISTAR colegas da própria empresa;
--   UPDATE/DELETE só pelo dono (owner). INSERT continua "só a própria linha"
--   (é assim que o convidado entra na empresa ao aceitar o convite).
-- • organization_invites: o dono cria convites por e-mail + papel; o convidado
--   (mesmo e-mail do login) lê e aceita o próprio convite.
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.current_papel()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select papel from public.organization_members
  where user_id = auth.uid()
  order by created_at
  limit 1
$$;

-- E-mail na membership: RLS de profiles só deixa ver o próprio, então guardamos
-- o e-mail aqui para o dono conseguir identificar cada membro da equipe.
alter table public.organization_members
  add column if not exists email text;

-- Backfill do e-mail do dono (só dá para preencher a própria linha via app).

-- ── organization_members: leitura de colegas + gestão pelo dono ──────────────
drop policy if exists "members_select" on public.organization_members;
create policy "members_select" on public.organization_members for select to authenticated
  using (user_id = auth.uid() or organization_id = public.current_org_id());

-- INSERT permanece: with check (user_id = auth.uid())  [aceite de convite]

drop policy if exists "members_update" on public.organization_members;
create policy "members_update" on public.organization_members for update to authenticated
  using (organization_id = public.current_org_id() and public.current_papel() = 'owner')
  with check (organization_id = public.current_org_id());

drop policy if exists "members_delete" on public.organization_members;
create policy "members_delete" on public.organization_members for delete to authenticated
  using (organization_id = public.current_org_id() and public.current_papel() = 'owner');

-- ── organization_invites ─────────────────────────────────────────────────────
create table if not exists public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade
    default public.current_org_id(),
  email text not null,
  papel text not null default 'caixa',
  status text not null default 'pendente',
  created_at timestamptz not null default now()
);

create index if not exists organization_invites_org_idx
  on public.organization_invites (organization_id);
create index if not exists organization_invites_email_idx
  on public.organization_invites (lower(email));

alter table public.organization_invites enable row level security;

-- Dono gerencia os convites da própria empresa
drop policy if exists "invites_owner" on public.organization_invites;
create policy "invites_owner" on public.organization_invites for all to authenticated
  using (organization_id = public.current_org_id() and public.current_papel() = 'owner')
  with check (organization_id = public.current_org_id() and public.current_papel() = 'owner');

-- Convidado (mesmo e-mail do login) lê e aceita o próprio convite
drop policy if exists "invites_convidado_select" on public.organization_invites;
create policy "invites_convidado_select" on public.organization_invites for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists "invites_convidado_update" on public.organization_invites;
create policy "invites_convidado_update" on public.organization_invites for update to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  with check (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
