-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 4 P2 — #25 Módulos por empresa (habilitar/desabilitar por organização)
--
-- Núcleo (vendas, produtos, clientes, financeiro, promissórias) é sempre ligado.
-- Módulos OPCIONAIS (tatuagem, serviços, condicional) podem ser desligados por
-- empresa. Além de sumir da navegação (app), o backend BLOQUEIA inserts em
-- tabelas de módulo desligado (trigger). Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.configuracoes
  add column if not exists modulos_ativos text[]
    default array['tatuagem', 'servicos', 'condicional'];

update public.configuracoes
  set modulos_ativos = array['tatuagem', 'servicos', 'condicional']
  where modulos_ativos is null;

-- Trigger genérico: bloqueia insert se o módulo (TG_ARGV[0]) estiver desligado
-- na config da empresa da linha.
create or replace function public.fn_bloqueia_modulo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mods text[];
  v_mod text := TG_ARGV[0];
begin
  select modulos_ativos into v_mods
    from public.configuracoes
    where organization_id = NEW.organization_id
    order by created_at limit 1;

  if v_mods is not null and not (v_mod = any(v_mods)) then
    raise exception 'O módulo "%" está desativado nas configurações da empresa', v_mod;
  end if;
  return NEW;
end;
$$;

do $$
begin
  drop trigger if exists trg_modulo on public.tatuagem_atendimentos;
  create trigger trg_modulo before insert on public.tatuagem_atendimentos
    for each row execute function public.fn_bloqueia_modulo('tatuagem');

  drop trigger if exists trg_modulo on public.atendimentos_servico;
  create trigger trg_modulo before insert on public.atendimentos_servico
    for each row execute function public.fn_bloqueia_modulo('servicos');

  drop trigger if exists trg_modulo on public.condicionais;
  create trigger trg_modulo before insert on public.condicionais
    for each row execute function public.fn_bloqueia_modulo('condicional');
end $$;
