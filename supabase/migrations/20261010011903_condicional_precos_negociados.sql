alter table public.condicional_itens
  add column if not exists preco_original numeric;

update public.condicional_itens
set preco_original = preco_unitario
where preco_original is null;

alter table public.condicional_itens
  alter column preco_original set not null;

alter table public.condicional_itens
  add constraint condicional_itens_preco_original_nao_negativo
  check (preco_original >= 0);

comment on column public.condicional_itens.preco_original is
  'Preco de tabela no momento da saida. preco_unitario guarda o valor combinado com o cliente.';
