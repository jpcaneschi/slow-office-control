export type FormaRecebimento = "pix" | "dinheiro" | "cartao";

export type FiltroFormaVenda =
  | "todas"
  | FormaRecebimento
  | "promissoria"
  | "misto"
  | "multiplo";

export type VendaParaFiltro = {
  id: string;
  forma_pagamento: string;
  total: number | null;
  valor_recebido: number | null;
  valor_liquido: number | null;
  entrada_forma: string | null;
  status: string;
};

export type PagamentoParaFiltro = {
  venda_id: string;
  forma: FormaRecebimento;
  valor: number;
  taxa_valor: number | null;
};

export type PagamentoEfetivo = {
  forma: FormaRecebimento;
  bruto: number;
  liquido: number;
};

export type ResumoRecebimentos = {
  pix: number;
  dinheiro: number;
  cartaoBruto: number;
  cartaoLiquido: number;
  totalRecebido: number;
};

function numeroSeguro(valor: number | null | undefined) {
  const numero = Number(valor || 0);
  return Number.isFinite(numero) ? Math.max(0, numero) : 0;
}

function ehFormaRecebimento(valor: string | null): valor is FormaRecebimento {
  return valor === "pix" || valor === "dinheiro" || valor === "cartao";
}

/**
 * Retorna somente o que entrou no caixa na data da venda.
 * Promissorias ficam de fora porque o recebimento delas ocorre em outra data.
 */
export function obterPagamentosEfetivos(
  venda: VendaParaFiltro,
  pagamentos: PagamentoParaFiltro[]
): PagamentoEfetivo[] {
  if (venda.status !== "concluida") return [];

  if (venda.forma_pagamento === "multiplo") {
    return pagamentos
      .filter((pagamento) => pagamento.venda_id === venda.id)
      .map((pagamento) => {
        const bruto = numeroSeguro(pagamento.valor);
        const taxa = Math.min(bruto, numeroSeguro(pagamento.taxa_valor));
        return {
          forma: pagamento.forma,
          bruto,
          liquido: pagamento.forma === "cartao" ? bruto - taxa : bruto,
        };
      });
  }

  if (venda.forma_pagamento === "misto") {
    if (!ehFormaRecebimento(venda.entrada_forma)) return [];
    const bruto = Math.min(
      numeroSeguro(venda.total),
      numeroSeguro(venda.valor_recebido)
    );
    return [{ forma: venda.entrada_forma, bruto, liquido: bruto }];
  }

  if (!ehFormaRecebimento(venda.forma_pagamento)) return [];

  const bruto = numeroSeguro(venda.total);
  const liquido =
    venda.forma_pagamento === "cartao"
      ? Math.min(bruto, numeroSeguro(venda.valor_liquido ?? venda.total))
      : bruto;

  return [{ forma: venda.forma_pagamento, bruto, liquido }];
}

export function vendaCorrespondeFiltro(
  venda: VendaParaFiltro,
  pagamentos: PagamentoParaFiltro[],
  filtro: FiltroFormaVenda
) {
  if (filtro === "todas") return true;
  if (filtro === "promissoria" || filtro === "misto" || filtro === "multiplo") {
    return venda.forma_pagamento === filtro;
  }
  return obterPagamentosEfetivos(venda, pagamentos).some(
    (pagamento) => pagamento.forma === filtro
  );
}

export function resumirRecebimentos(
  vendas: VendaParaFiltro[],
  pagamentos: PagamentoParaFiltro[]
): ResumoRecebimentos {
  const resumo: ResumoRecebimentos = {
    pix: 0,
    dinheiro: 0,
    cartaoBruto: 0,
    cartaoLiquido: 0,
    totalRecebido: 0,
  };

  for (const venda of vendas) {
    for (const pagamento of obterPagamentosEfetivos(venda, pagamentos)) {
      if (pagamento.forma === "pix") resumo.pix += pagamento.liquido;
      if (pagamento.forma === "dinheiro") resumo.dinheiro += pagamento.liquido;
      if (pagamento.forma === "cartao") {
        resumo.cartaoBruto += pagamento.bruto;
        resumo.cartaoLiquido += pagamento.liquido;
      }
      resumo.totalRecebido += pagamento.liquido;
    }
  }

  return resumo;
}
