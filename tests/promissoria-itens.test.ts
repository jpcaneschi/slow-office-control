import { describe, expect, it } from "vitest";
import {
  calcularItemPromissoria,
  calcularTotaisItensPromissoria,
  validarItemPromissoria,
} from "@/lib/promissoria-itens";

describe("itens da promissória", () => {
  it("calcula desconto percentual por produto", () => {
    expect(
      calcularItemPromissoria({
        quantidade: 2,
        precoOriginal: 100,
        descontoTipo: "percentual",
        descontoInput: 10,
      })
    ).toEqual({
      quantidade: 2,
      precoOriginal: 100,
      descontoUnitario: 10,
      descontoPercentual: 10,
      precoUnitarioFinal: 90,
      subtotalBruto: 200,
      descontoTotal: 20,
      total: 180,
    });
  });

  it("calcula desconto em reais por unidade", () => {
    const resultado = calcularItemPromissoria({
      quantidade: 3,
      precoOriginal: 79.9,
      descontoTipo: "valor",
      descontoInput: 9.9,
    });

    expect(resultado.precoUnitarioFinal).toBe(70);
    expect(resultado.descontoTotal).toBe(29.7);
    expect(resultado.total).toBe(210);
  });

  it("soma produtos com descontos diferentes sem misturar os cálculos", () => {
    expect(
      calcularTotaisItensPromissoria([
        {
          quantidade: 1,
          precoOriginal: 200,
          descontoTipo: "percentual",
          descontoInput: 15,
        },
        {
          quantidade: 2,
          precoOriginal: 50,
          descontoTipo: "valor",
          descontoInput: 5,
        },
      ])
    ).toEqual({ subtotalBruto: 300, descontoTotal: 40, total: 260 });
  });

  it("recusa quantidade, valor ou desconto inválidos", () => {
    expect(
      validarItemPromissoria({
        quantidade: 0,
        precoOriginal: 100,
        descontoTipo: "valor",
        descontoInput: 0,
      })
    ).toMatch(/quantidade/i);
    expect(
      validarItemPromissoria({
        quantidade: 1,
        precoOriginal: 100,
        descontoTipo: "percentual",
        descontoInput: 101,
      })
    ).toMatch(/100%/);
    expect(
      validarItemPromissoria({
        quantidade: 1,
        precoOriginal: 100,
        descontoTipo: "valor",
        descontoInput: 101,
      })
    ).toMatch(/maior/i);
  });
});
