-- ─────────────────────────────────────────────────────────────────────────────
-- Fase 2 — Configurações centralizadas por empresa (fim dos hardcodes)
-- Adiciona à tabela configuracoes:
--   condicional_prazo_dias  : prazo padrão do condicional (era fixo em 2 dias)
--   parcela_minima          : valor mínimo de parcela no crediário
--   promissoria_prazo_meses : prazo máximo da promissória (era fixo em 4 meses)
--   categorias_produto      : categorias de produto (eram fixas de moda no código)
--   responsaveis            : equipe/responsáveis (eram nomes fixos: João Pedro...)
-- Colunas de array iniciam vazias; o app cai nos padrões quando vazio.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.configuracoes
  add column if not exists condicional_prazo_dias int not null default 2,
  add column if not exists parcela_minima numeric(12, 2) not null default 0,
  add column if not exists promissoria_prazo_meses int not null default 4,
  add column if not exists categorias_produto text[] not null default '{}',
  add column if not exists responsaveis text[] not null default '{}';
