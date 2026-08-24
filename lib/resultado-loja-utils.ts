export type VendaResultado = {
  id: string;
  total: number | null;
  status: string;
  created_at: string;
};

export type ItemResultado = {
  venda_id: string;
  quantidade: number | null;
  custo_unitario: number | null;
};

export type DespesaResultado = { valor: number | null; data: string };
export type ServicoResultado = {
  valor: number | null;
  percentual_loja: number | null;
  data: string;
};

export function calcularResultadoLoja(
  dados: {
    vendas: VendaResultado[];
    itens: ItemResultado[];
    despesas: DespesaResultado[];
    servicos?: ServicoResultado[];
  },
  filtros: {
    vendaNoPeriodo: (venda: VendaResultado) => boolean;
    dataNoPeriodo: (dataISO: string) => boolean;
  }
) {
  const vendas = dados.vendas.filter(
    (venda) => venda.status === "concluida" && filtros.vendaNoPeriodo(venda)
  );
  const ids = new Set(vendas.map((venda) => venda.id));
  const receitaVendas = vendas.reduce((soma, venda) => soma + Number(venda.total || 0), 0);
  const custoProdutos = dados.itens
    .filter((item) => ids.has(item.venda_id))
    .reduce(
      (soma, item) =>
        soma + Number(item.quantidade || 0) * Number(item.custo_unitario || 0),
      0
    );
  const despesas = dados.despesas
    .filter((item) => filtros.dataNoPeriodo(item.data))
    .reduce((soma, item) => soma + Number(item.valor || 0), 0);
  const receitaServicos = (dados.servicos || [])
    .filter((item) => filtros.dataNoPeriodo(item.data))
    .reduce(
      (soma, item) =>
        soma + Number(item.valor || 0) * (Number(item.percentual_loja || 0) / 100),
      0
    );
  const faturamento = receitaVendas + receitaServicos;
  return {
    faturamento,
    receitaVendas,
    receitaServicos,
    custoProdutos,
    despesas,
    lucro: faturamento - custoProdutos - despesas,
  };
}
