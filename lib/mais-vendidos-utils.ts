export type VendaRanking = {
  id: string;
  status: string;
  created_at: string;
};

export type ItemRanking = {
  venda_id: string;
  produto_id: string;
  quantidade: number | null;
  total_item: number | null;
};

export type ProdutoRanking = { id: string; nome: string };

export type ProdutoMaisVendido = {
  produtoId: string;
  nome: string;
  quantidade: number;
  faturamento: number;
};

export function rankearProdutosMaisVendidos(
  vendas: VendaRanking[],
  itens: ItemRanking[],
  produtos: ProdutoRanking[],
  inicioMs: number,
  fimExclusivoMs: number
): ProdutoMaisVendido[] {
  const vendasValidas = new Set(
    vendas
      .filter((v) => v.status === "concluida")
      .filter((v) => {
        const instante = new Date(v.created_at).getTime();
        return instante >= inicioMs && instante < fimExclusivoMs;
      })
      .map((v) => v.id)
  );
  const nomes = new Map(produtos.map((produto) => [produto.id, produto.nome]));
  const ranking = new Map<string, ProdutoMaisVendido>();

  for (const item of itens) {
    if (!vendasValidas.has(item.venda_id)) continue;
    const atual = ranking.get(item.produto_id) || {
      produtoId: item.produto_id,
      nome: nomes.get(item.produto_id) || "Produto removido",
      quantidade: 0,
      faturamento: 0,
    };
    atual.quantidade += Number(item.quantidade || 0);
    atual.faturamento += Number(item.total_item || 0);
    ranking.set(item.produto_id, atual);
  }

  return Array.from(ranking.values()).sort(
    (a, b) => b.quantidade - a.quantidade || b.faturamento - a.faturamento
  );
}
