-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 2 P0 — #7 Convites seguros (expiração + uso único)
--
-- organization_invites ganha expires_at (7 dias por padrão), used_at e used_by.
-- O convidado só pode LER/ACEITAR convite PENDENTE e NÃO EXPIRADO.
-- Convites antigos (sem expires_at) seguem válidos por compatibilidade.
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.organization_invites
  add column if not exists expires_at timestamptz default (now() + interval '7 days'),
  add column if not exists used_at timestamptz,
  add column if not exists used_by uuid;

-- O convidado (mesmo e-mail) só enxerga convite pendente e não expirado.
drop policy if exists "invites_convidado_select" on public.organization_invites;
create policy "invites_convidado_select" on public.organization_invites for select to authenticated
  using (
    lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and status = 'pendente'
    and (expires_at is null or expires_at > now())
  );

drop policy if exists "invites_convidado_update" on public.organization_invites;
create policy "invites_convidado_update" on public.organization_invites for update to authenticated
  using (
    lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and status = 'pendente'
    and (expires_at is null or expires_at > now())
  )
  with check (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
