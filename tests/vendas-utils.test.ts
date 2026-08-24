import { describe, it, expect } from "vitest";
import {
  calcularDescontoPix,
  calcularDescontoManual,
  calcularTotal,
  formatCurrency,
  rotuloFormaPagamento,
} from "@/lib/vendas-utils";

describe("calcularDescontoPix", () => {
  it("aplica o percentual sobre o total", () => {
    expect(calcularDescontoPix(100, 5)).toBe(5);
    expect(calcularDescontoPix(250, 10)).toBe(25);
  });
  it("retorna 0 quando o percentual é 0", () => {
    expect(calcularDescontoPix(100, 0)).toBe(0);
  });
});

describe("calcularDescontoManual", () => {
  it("aceita desconto em reais", () => {
    expect(calcularDescontoManual(900, 80, "valor")).toBe(80);
  });

  it("converte percentual em valor monetário e respeita o limite", () => {
    expect(calcularDescontoManual(900, 10, "percentual")).toBe(90);
    expect(calcularDescontoManual(900, 150, "percentual")).toBe(900);
    expect(calcularDescontoManual(50, 80, "valor")).toBe(50);
  });
});

describe("calcularTotal", () => {
  it("subtrai desconto manual e desconto pix", () => {
    expect(calcularTotal(100, 10, 5)).toBe(85);
  });
  it("nunca fica negativo", () => {
    expect(calcularTotal(50, 40, 30)).toBe(0);
  });
  it("sem descontos mantém o subtotal", () => {
    expect(calcularTotal(199.9, 0, 0)).toBeCloseTo(199.9);
  });
});

describe("formatCurrency", () => {
  it("formata em BRL", () => {
    // NBSP entre R$ e o número no locale pt-BR.
    expect(formatCurrency(1234.5).replace(/\s/g, " ")).toBe("R$ 1.234,50");
  });
});

describe("rotuloFormaPagamento", () => {
  it("exibe o pagamento dividido com rótulo amigável", () => {
    expect(rotuloFormaPagamento("multiplo")).toBe("Pagamento dividido");
  });
});
