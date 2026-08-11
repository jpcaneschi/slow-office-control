-- ─────────────────────────────────────────────────────────────────────────────
-- Fase (cobrança) — Assinatura por empresa (checkout hospedado + webhook)
--
-- Modelo agnóstico de provedor (Kiwify / Cacto / etc.): a plataforma hospeda o
-- checkout (Pix/cartão) e nos avisa por webhook. Correlação por e-mail do dono.
-- O webhook roda com service_role (bypassa RLS) para escrever aqui.
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider text,                             -- 'kiwify' | 'cacto' | ...
  external_id text,                          -- id da venda/assinatura no provedor
  email text,                                -- e-mail do comprador (correlação)
  plano text,
  status text not null default 'inativa',    -- inativa | ativa | atrasada | cancelada
  valor numeric(12, 2),
  current_period_end timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id)
);

create index if not exists subscriptions_org_idx on public.subscriptions (organization_id);
create index if not exists subscriptions_email_idx on public.subscriptions (lower(email));

alter table public.subscriptions enable row level security;

-- Membros da empresa LEEM a assinatura da própria empresa.
drop policy if exists "subs_select" on public.subscriptions;
create policy "subs_select" on public.subscriptions for select to authenticated
  using (organization_id = public.current_org_id());

-- Sem policies de escrita para authenticated: quem grava é o webhook (service_role).
