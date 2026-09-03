export type VendaDoRelatorio = {
  id: string;
  status: string;
};

export type ItemDoRelatorio = {
  venda_id: string;
  produto_id: string;
  variacao_id: string | null;
  quantidade: number;
  total_item: number;
};

export type LinhaRelatorioVendas = {
  produto_id: string;
  variacao_id: string | null;
  produto: string;
  variacao: string;
  quantidade: number;
  valor: number;
};

type RotulosRelatorio = {
  produtos: Map<string, string>;
  variacoes: Map<string, string>;
};

/**
 * Agrupa os itens efetivamente mantidos nas vendas concluídas do filtro atual.
 * Quantidades zeradas por devolução não entram; trocas aparecem já na grade nova.
 */
export function agruparItensVendidos(
  vendas: VendaDoRelatorio[],
  itens: ItemDoRelatorio[],
  rotulos: RotulosRelatorio
): LinhaRelatorioVendas[] {
  const vendasConcluidas = new Set(
    vendas.filter((venda) => venda.status === "concluida").map((venda) => venda.id)
  );
  const grupos = new Map<string, LinhaRelatorioVendas>();

  for (const item of itens) {
    const quantidade = Number(item.quantidade || 0);
    if (!vendasConcluidas.has(item.venda_id) || quantidade <= 0) continue;

    const chave = `${item.produto_id}:${item.variacao_id || "sem-variacao"}`;
    const atual = grupos.get(chave) || {
      produto_id: item.produto_id,
      variacao_id: item.variacao_id,
      produto: rotulos.produtos.get(item.produto_id) || "Produto",
      variacao: item.variacao_id
        ? rotulos.variacoes.get(item.variacao_id) || "Variação"
        : "Sem variação",
      quantidade: 0,
      valor: 0,
    };

    atual.quantidade += quantidade;
    atual.valor += Number(item.total_item || 0);
    grupos.set(chave, atual);
  }

  return [...grupos.values()].sort(
    (a, b) =>
      b.quantidade - a.quantidade ||
      b.valor - a.valor ||
      a.produto.localeCompare(b.produto, "pt-BR")
  );
}

export function calcularTotaisTroca(
  devolvidos: { quantidade: number; preco_unitario: number }[],
  novos: { quantidade: number; preco_unitario: number }[]
) {
  const totalDevolvido = devolvidos.reduce(
    (total, item) => total + Number(item.quantidade || 0) * Number(item.preco_unitario || 0),
    0
  );
  const totalNovo = novos.reduce(
    (total, item) => total + Number(item.quantidade || 0) * Number(item.preco_unitario || 0),
    0
  );
  const diferenca = Math.round((totalNovo - totalDevolvido) * 100) / 100;

  return {
    totalDevolvido,
    totalNovo,
    diferenca,
    valoresCompativeis: Math.abs(diferenca) < 0.01,
  };
}
