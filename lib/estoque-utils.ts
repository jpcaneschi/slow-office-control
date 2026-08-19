// Fonte única do ESTOQUE EFETIVO de um produto (Área #8).
//
// Regra do modelo de variantes (#5): quando `tem_variacoes = true`, o estoque
// vive nas variações (produto_variacoes.estoque) e `produtos.estoque` fica 0.
// Quem só olha `produtos.estoque` (busca global, notificações) mostrava
// "0 em estoque" para produtos de grade. Estas funções puras agregam o estoque
// das variações e devem ser usadas por produtos, busca e notificações.

export type VariacaoEstoque = { produto_id: string; estoque: number | null };

export type ProdutoEstoque = {
  id: string;
  estoque: number | null;
  tem_variacoes?: boolean | null;
};

/**
 * Soma o estoque das variações por produto. Retorna um mapa produto_id → total.
 */
export function agregarEstoqueVariacoes(
  variacoes: VariacaoEstoque[]
): Record<string, number> {
  const mapa: Record<string, number> = {};
  for (const v of variacoes) {
    if (!v || !v.produto_id) continue;
    mapa[v.produto_id] = (mapa[v.produto_id] || 0) + Number(v.estoque || 0);
  }
  return mapa;
}

/**
 * Estoque efetivo de um produto: soma das variações se for grade, senão o
 * estoque do próprio produto. `somaVariacoes` é o mapa de
 * `agregarEstoqueVariacoes` (produto sem entrada no mapa → 0).
 */
export function estoqueEfetivo(
  produto: ProdutoEstoque,
  somaVariacoes: Record<string, number>
): number {
  if (produto.tem_variacoes) return somaVariacoes[produto.id] || 0;
  return Number(produto.estoque || 0);
}
