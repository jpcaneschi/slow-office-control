-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 2 P0 — #5 Auditoria COMPLETA via triggers append-only
--
-- Um trigger genérico grava INSERT/UPDATE/DELETE de todas as tabelas de negócio
-- em audit_logs, com valores ANTES/DEPOIS, autor (auth.uid()), organização,
-- entidade e id. Não depende de chamadas no front → cobre tudo automaticamente.
-- audit_logs continua travado (só o dono lê; ninguém escreve direto — o trigger
-- é SECURITY DEFINER). Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fn_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_reg_id uuid;
  v_org uuid;
  v_dados jsonb;
begin
  if TG_OP = 'DELETE' then
    v_old := to_jsonb(OLD);
    v_reg_id := (v_old->>'id')::uuid;
    v_org := (v_old->>'organization_id')::uuid;
    v_dados := jsonb_build_object('antes', v_old);
  elsif TG_OP = 'UPDATE' then
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    -- Não audita se nada mudou de fato.
    if v_old = v_new then
      return NEW;
    end if;
    v_reg_id := (v_new->>'id')::uuid;
    v_org := (v_new->>'organization_id')::uuid;
    v_dados := jsonb_build_object('antes', v_old, 'depois', v_new);
  else -- INSERT
    v_new := to_jsonb(NEW);
    v_reg_id := (v_new->>'id')::uuid;
    v_org := (v_new->>'organization_id')::uuid;
    v_dados := jsonb_build_object('depois', v_new);
  end if;

  insert into public.audit_logs (organization_id, user_id, acao, entidade, registro_id, dados)
  values (v_org, auth.uid(), lower(TG_OP) || '_' || TG_TABLE_NAME, TG_TABLE_NAME, v_reg_id, v_dados);

  if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
end;
$$;

-- Anexa o trigger nas tabelas de negócio que ainda não eram auditadas.
-- (Vendas, promissórias, estoque e equipe já têm logs semânticos próprios.)
do $$
declare t text;
begin
  foreach t in array array[
    'clientes','produtos','produto_variacoes','funcionarios','vales',
    'servicos','atendimentos_servico','tatuagem_atendimentos',
    'despesas','despesas_recorrentes','configuracoes'
  ] loop
    execute format('drop trigger if exists trg_auditoria on public.%I', t);
    execute format(
      'create trigger trg_auditoria after insert or update or delete on public.%I '
      || 'for each row execute function public.fn_auditoria()', t);
  end loop;
end $$;
