import { describe, expect, it } from "vitest";
import {
  obterPagamentosEfetivos,
  resumirRecebimentos,
  vendaCorrespondeFiltro,
  type PagamentoParaFiltro,
  type VendaParaFiltro,
} from "@/lib/vendas-filtros";

function venda(
  patch: Partial<VendaParaFiltro> & Pick<VendaParaFiltro, "id" | "forma_pagamento">
): VendaParaFiltro {
  return {
    total: 100,
    valor_recebido: null,
    valor_liquido: 100,
    entrada_forma: null,
    status: "concluida",
    ...patch,
  };
}

describe("filtros e recebimentos de vendas", () => {
  it("separa corretamente uma venda dividida e desconta somente a taxa do cartão", () => {
    const item = venda({ id: "multi", forma_pagamento: "multiplo" });
    const pagamentos: PagamentoParaFiltro[] = [
      { venda_id: "multi", forma: "pix", valor: 40, taxa_valor: 0 },
      { venda_id: "multi", forma: "cartao", valor: 60, taxa_valor: 3 },
    ];

    expect(obterPagamentosEfetivos(item, pagamentos)).toEqual([
      { forma: "pix", bruto: 40, liquido: 40 },
      { forma: "cartao", bruto: 60, liquido: 57 },
    ]);
    expect(vendaCorrespondeFiltro(item, pagamentos, "pix")).toBe(true);
    expect(vendaCorrespondeFiltro(item, pagamentos, "cartao")).toBe(true);
    expect(vendaCorrespondeFiltro(item, pagamentos, "dinheiro")).toBe(false);
    expect(vendaCorrespondeFiltro(item, pagamentos, "multiplo")).toBe(true);
  });

  it("conta somente a entrada de uma venda mista", () => {
    const item = venda({
      id: "misto",
      forma_pagamento: "misto",
      total: 500,
      valor_recebido: 120,
      entrada_forma: "dinheiro",
    });

    expect(obterPagamentosEfetivos(item, [])).toEqual([
      { forma: "dinheiro", bruto: 120, liquido: 120 },
    ]);
    expect(vendaCorrespondeFiltro(item, [], "dinheiro")).toBe(true);
    expect(vendaCorrespondeFiltro(item, [], "misto")).toBe(true);
    expect(vendaCorrespondeFiltro(item, [], "promissoria")).toBe(false);
  });

  it("não trata promissória nem venda cancelada como recebimento imediato", () => {
    const promissoria = venda({ id: "prom", forma_pagamento: "promissoria" });
    const cancelada = venda({
      id: "cancelada",
      forma_pagamento: "pix",
      status: "cancelada",
    });

    expect(obterPagamentosEfetivos(promissoria, [])).toEqual([]);
    expect(obterPagamentosEfetivos(cancelada, [])).toEqual([]);
    expect(vendaCorrespondeFiltro(promissoria, [], "promissoria")).toBe(true);
  });

  it("resume Pix, dinheiro e cartão líquido sem duplicar vendas simples", () => {
    const vendas = [
      venda({ id: "pix", forma_pagamento: "pix", total: 80 }),
      venda({ id: "cash", forma_pagamento: "dinheiro", total: 50 }),
      venda({
        id: "card",
        forma_pagamento: "cartao",
        total: 100,
        valor_liquido: 96,
      }),
    ];

    expect(resumirRecebimentos(vendas, [])).toEqual({
      pix: 80,
      dinheiro: 50,
      cartaoBruto: 100,
      cartaoLiquido: 96,
      totalRecebido: 226,
    });
  });
});
