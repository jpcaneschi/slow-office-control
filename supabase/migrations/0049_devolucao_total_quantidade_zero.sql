-- Permite que uma linha de venda permaneça no histórico após devolução total.
--
-- devolver_itens_venda reduz venda_itens.quantidade pela quantidade devolvida.
-- Quando a devolução é total, o resultado legítimo é zero; a restrição criada
-- em 0025 exigia quantidade > 0 e fazia toda a operação atômica falhar.
-- Quantidades negativas continuam proibidas.

alter table public.venda_itens
  drop constraint if exists chk_vi_qtd;

-- O schema legado também pode trazer a mesma regra com este nome.
alter table public.venda_itens
  drop constraint if exists venda_itens_quantidade_check;

alter table public.venda_itens
  add constraint chk_vi_qtd check (quantidade >= 0);
