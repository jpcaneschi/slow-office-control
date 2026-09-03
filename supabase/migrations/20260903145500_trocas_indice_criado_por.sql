-- Índice de apoio para a FK/autoria das trocas (indicado pelo advisor após a
-- criação das tabelas). Não altera dados existentes.

create index if not exists venda_trocas_criado_por_idx
  on public.venda_trocas(criado_por)
  where criado_por is not null;
