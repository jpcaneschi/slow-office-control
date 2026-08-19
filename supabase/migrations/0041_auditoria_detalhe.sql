-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 3 P1 — #12 Auditoria detalhada (antes/depois por campo + sem segredos)
--
-- O trigger genérico fn_auditoria (0028) já grava INSERT/UPDATE/DELETE de todas
-- as tabelas de negócio com a linha inteira em antes/depois. Faltava:
--   1. REDIGIR segredos: a linha ia crua para o log (risco se alguma coluna
--      guardar senha/token/chave). Passa por fn_auditoria_redigir (denylist).
--   2. DIFF por campo: computa `alteracoes` = { campo: {antes, depois} } só com
--      os campos que realmente mudaram (fora ruído como updated_at) → é o que a
--      tela mostra como "antes → depois". Resolve o "Criou/Editou … —" vazio.
--   3. COBERTURA: anexa o trigger nas tabelas novas taxas_cartao (0035) e
--      produto_opcoes (0038), que ainda não eram auditadas.
--
-- Nada é destrutivo: create or replace + drop trigger if exists. Idempotente,
-- roda 2x sem erro. Reverter: reaplicar o corpo de fn_auditoria da migration
-- 0028 (sem redação/diff) — os logs já gravados permanecem intactos.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) Redação de segredos ───────────────────────────────────────────────────
-- Substitui o VALOR (não a chave) por "[REDIGIDO]" em qualquer campo cujo nome
-- case com a denylist. Preserva a existência do campo (dá pra ver que mudou,
-- sem vazar o conteúdo). Conservador de propósito: melhor redigir a mais.
create or replace function public.fn_auditoria_redigir(p jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case
    when p is null or jsonb_typeof(p) <> 'object' then p
    else (
      select coalesce(
        jsonb_object_agg(
          e.key,
          case
            when e.key ~* '(senha|password|secret|token|chave|api_?key|private|hash)'
              then to_jsonb('[REDIGIDO]'::text)
            else e.value
          end
        ),
        '{}'::jsonb
      )
      from jsonb_each(p) as e(key, value)
    )
  end;
$$;

-- ── 2) Trigger genérico com redação + diff por campo ─────────────────────────
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
  v_diff jsonb;
begin
  if TG_OP = 'DELETE' then
    v_old := public.fn_auditoria_redigir(to_jsonb(OLD));
    v_reg_id := (v_old->>'id')::uuid;
    v_org := ((to_jsonb(OLD))->>'organization_id')::uuid;
    v_dados := jsonb_build_object('antes', v_old);

  elsif TG_OP = 'UPDATE' then
    -- Não audita se nada mudou de fato (compara as linhas cruas).
    if to_jsonb(OLD) = to_jsonb(NEW) then
      return NEW;
    end if;
    v_old := public.fn_auditoria_redigir(to_jsonb(OLD));
    v_new := public.fn_auditoria_redigir(to_jsonb(NEW));
    v_reg_id := (v_new->>'id')::uuid;
    v_org := ((to_jsonb(NEW))->>'organization_id')::uuid;

    -- alteracoes: só os campos que mudaram, ignorando ruído (carimbos de tempo).
    select coalesce(
      jsonb_object_agg(k, jsonb_build_object('antes', v_old->k, 'depois', v_new->k)),
      '{}'::jsonb
    )
    into v_diff
    from (
      select jsonb_object_keys(v_new) as k
      union
      select jsonb_object_keys(v_old) as k
    ) ks
    where k not in ('updated_at', 'created_at')
      and (v_new->k) is distinct from (v_old->k);

    v_dados := jsonb_build_object('antes', v_old, 'depois', v_new, 'alteracoes', v_diff);

  else -- INSERT
    v_new := public.fn_auditoria_redigir(to_jsonb(NEW));
    v_reg_id := (v_new->>'id')::uuid;
    v_org := ((to_jsonb(NEW))->>'organization_id')::uuid;
    v_dados := jsonb_build_object('depois', v_new);
  end if;

  insert into public.audit_logs (organization_id, user_id, acao, entidade, registro_id, dados)
  values (v_org, auth.uid(), lower(TG_OP) || '_' || TG_TABLE_NAME, TG_TABLE_NAME, v_reg_id, v_dados);

  if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
end;
$$;

-- ── 3) Cobertura: (re)anexa o trigger nas tabelas de negócio, incluindo as
--       novas taxas_cartao (0035) e produto_opcoes (0038). ──────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'clientes','produtos','produto_variacoes','produto_opcoes','funcionarios',
    'vales','servicos','atendimentos_servico','tatuagem_atendimentos',
    'despesas','despesas_recorrentes','configuracoes','taxas_cartao'
  ] loop
    -- só anexa se a tabela existir (ambiente pode não ter todos os módulos).
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists trg_auditoria on public.%I', t);
      execute format(
        'create trigger trg_auditoria after insert or update or delete on public.%I '
        || 'for each row execute function public.fn_auditoria()', t);
    end if;
  end loop;
end $$;
