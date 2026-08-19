-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 3 P1 — #13 Validações: limites coerentes NO SERVIDOR (CHECK constraints)
--
-- Completa o conjunto de 0025 (que já cobriu produtos/variações/percentuais de
-- serviço/tatuagem/config pix+tatuagem). Aqui adicionamos o que faltava:
--   • funcionarios.salario_fixo >= 0
--   • vales.valor >= 0
--   • servicos.preco >= 0
--   • despesas.valor >= 0
--   • promissorias.valor_total >= 0
--   • taxas_cartao: percentuais 0–100, taxa_fixa >= 0, parcelas >= 1, max >= min
--   • configuracoes: max_parcelas >= 1, parcela_minima >= 0, prazos >= 0
--
-- Espelhado no front por lib/validacoes.ts (mensagens pt-BR). O servidor é a
-- fronteira real: mesmo burlando a UI, o banco recusa valor fora do limite.
--
-- Todas as constraints são NOT VALID: passam a valer para INSERT/UPDATE
-- imediatamente, MAS não rejeitam linhas legadas já existentes (seguro aplicar
-- em base com histórico). Idempotente (captura duplicate_object) e reversível
-- (drop constraint if exists ...). Para validar o legado depois:
--   alter table <t> validate constraint <c>;  (opcional, quando os dados
--   estiverem limpos).
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  -- (tabela, nome_constraint, expressão do check) — só aplica se a tabela existe.
  r record;
begin
  for r in
    select * from (values
      ('funcionarios',  'chk_func_salario',      'salario_fixo >= 0'),
      ('vales',         'chk_vale_valor',        'valor >= 0'),
      ('servicos',      'chk_serv_preco',        'preco >= 0'),
      ('despesas',      'chk_desp_valor',        'valor >= 0'),
      ('promissorias',  'chk_prom_total',        'valor_total >= 0'),
      ('taxas_cartao',  'chk_taxa_pct',          'taxa_percentual between 0 and 100'),
      ('taxas_cartao',  'chk_taxa_antec',        'taxa_antecipacao between 0 and 100'),
      ('taxas_cartao',  'chk_taxa_fixa',         'taxa_fixa >= 0'),
      ('taxas_cartao',  'chk_taxa_parc_min',     'parcelas_min >= 1'),
      ('taxas_cartao',  'chk_taxa_parc_ordem',   'parcelas_max >= parcelas_min'),
      ('configuracoes', 'chk_cfg_max_parcelas',  'max_parcelas is null or max_parcelas >= 1'),
      ('configuracoes', 'chk_cfg_parcela_min',   'parcela_minima is null or parcela_minima >= 0'),
      ('configuracoes', 'chk_cfg_prom_prazo',    'promissoria_prazo_meses is null or promissoria_prazo_meses >= 0'),
      ('configuracoes', 'chk_cfg_cond_prazo',    'condicional_prazo_dias is null or condicional_prazo_dias >= 0')
    ) as t(tabela, nome, expr)
  loop
    if to_regclass('public.' || r.tabela) is null then
      continue;
    end if;
    begin
      execute format(
        'alter table public.%I add constraint %I check (%s) not valid',
        r.tabela, r.nome, r.expr);
    exception
      when duplicate_object then null;  -- já existe: nada a fazer (idempotente)
      when undefined_column then null;  -- coluna não existe nesta base: ignora
    end;
  end loop;
end $$;
