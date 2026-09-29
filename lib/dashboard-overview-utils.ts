export type VendaResumo = {
  id: string;
  forma_pagamento: string;
  total: number | null;
  status: string;
  data_venda: string;
};
export type ItemResumo = { venda_id: string; produto_id: string; quantidade: number; total_item: number };
export type ProdutoResumo = { id: string; nome: string; marca: string | null };

/** Recebe apenas dados autorizados da loja atual. Custo de estoque não entra no resultado. */
export function resumirDashboard(
  vendas: VendaResumo[], itens: ItemResumo[], produtos: ProdutoResumo[],
  despesasPagas: number, inicio: string, fim: string,
) {
  const concluidas = vendas.filter((v) => v.status === "concluida" && v.data_venda >= inicio && v.data_venda <= fim);
  const vendaPorId = new Map(concluidas.map((v) => [v.id, v]));
  const itensPeriodo = itens.filter((i) => vendaPorId.has(i.venda_id));
  const receita = concluidas.reduce((s, v) => s + Number(v.total || 0), 0);
  const unidades = itensPeriodo.reduce((s, i) => s + Number(i.quantidade || 0), 0);
  const porPagamento = new Map<string, number>();
  for (const venda of concluidas) {
    porPagamento.set(venda.forma_pagamento, (porPagamento.get(venda.forma_pagamento) || 0) + Number(venda.total || 0));
  }

  const subtotalPorVenda = new Map<string, number>();
  for (const item of itensPeriodo) {
    subtotalPorVenda.set(item.venda_id, (subtotalPorVenda.get(item.venda_id) || 0) + Number(item.total_item || 0));
  }
  const produtoPorId = new Map(produtos.map((p) => [p.id, p]));
  const marcas = new Map<string, { nome: string; unidades: number; receita: number }>();
  for (const item of itensPeriodo) {
    const nome = produtoPorId.get(item.produto_id)?.marca?.trim().replace(/\s+/g, " ") || "Sem marca";
    const chave = nome.toLocaleLowerCase("pt-BR");
    const atual = marcas.get(chave) || { nome, unidades: 0, receita: 0 };
    const subtotal = subtotalPorVenda.get(item.venda_id) || 0;
    // Rateia descontos/acréscimos para o ranking refletir o valor efetivamente vendido.
    const proporcao = subtotal > 0 ? Number(vendaPorId.get(item.venda_id)?.total || 0) / subtotal : 0;
    atual.unidades += Number(item.quantidade || 0);
    atual.receita += Number(item.total_item || 0) * proporcao;
    marcas.set(chave, atual);
  }
  return {
    pedidos: concluidas.length,
    unidades,
    receita,
    despesas: despesasPagas,
    resultado: receita - despesasPagas,
    pagamentos: [...porPagamento.entries()].map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor),
    marcas: [...marcas.values()].sort((a, b) => b.receita - a.receita).slice(0, 5),
  };
}
