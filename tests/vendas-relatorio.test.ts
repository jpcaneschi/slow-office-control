import { describe, expect, it } from "vitest";
import {
  agruparItensVendidos,
  calcularTotaisTroca,
} from "@/lib/vendas-relatorio";

describe("relatório de produtos vendidos", () => {
  it("agrupa por produto e tamanho somente vendas concluídas", () => {
    const linhas = agruparItensVendidos(
      [
        { id: "v1", status: "concluida" },
        { id: "v2", status: "cancelada" },
        { id: "v3", status: "concluida" },
      ],
      [
        {
          venda_id: "v1",
          produto_id: "p1",
          variacao_id: "m",
          quantidade: 1,
          total_item: 100,
        },
        {
          venda_id: "v3",
          produto_id: "p1",
          variacao_id: "m",
          quantidade: 2,
          total_item: 200,
        },
        {
          venda_id: "v2",
          produto_id: "p1",
          variacao_id: "g",
          quantidade: 4,
          total_item: 400,
        },
        {
          venda_id: "v3",
          produto_id: "p2",
          variacao_id: null,
          quantidade: 0,
          total_item: 0,
        },
      ],
      {
        produtos: new Map([
          ["p1", "Camiseta"],
          ["p2", "Boné"],
        ]),
        variacoes: new Map([
          ["m", "M"],
          ["g", "G"],
        ]),
      }
    );

    expect(linhas).toEqual([
      {
        produto_id: "p1",
        variacao_id: "m",
        produto: "Camiseta",
        variacao: "M",
        quantidade: 3,
        valor: 300,
      },
    ]);
  });
});

describe("totais de troca", () => {
  it("aceita produtos diferentes quando os valores fecham", () => {
    expect(
      calcularTotaisTroca(
        [{ quantidade: 2, preco_unitario: 100 }],
        [{ quantidade: 1, preco_unitario: 200 }]
      )
    ).toEqual({
      totalDevolvido: 200,
      totalNovo: 200,
      diferenca: 0,
      valoresCompativeis: true,
    });
  });

  it("informa a diferença sem mascarar centavos", () => {
    const totais = calcularTotaisTroca(
      [{ quantidade: 1, preco_unitario: 299.9 }],
      [{ quantidade: 1, preco_unitario: 319.9 }]
    );

    expect(totais.diferenca).toBe(20);
    expect(totais.valoresCompativeis).toBe(false);
  });
});
