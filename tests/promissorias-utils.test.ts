import { describe, it, expect } from "vitest";
import {
  agregarPagamentosPromissoria,
  calcularParcelaSugerida,
  calcularSaldoPromissoria,
  calcularSaldoTotalPromissorias,
  adicionarMesesDataCalendario,
  gerarCronogramaPromissoria,
  validarRegrasPromissoria,
} from "@/lib/promissorias-utils";

describe("cronograma mensal da promissória", () => {
  it("preserva o dia da primeira parcela nos meses seguintes", () => {
    expect(gerarCronogramaPromissoria(900, 3, "2026-09-10")).toEqual([
      { numero: 1, vencimento: "2026-09-10", valor: 300 },
      { numero: 2, vencimento: "2026-10-10", valor: 300 },
      { numero: 3, vencimento: "2026-11-10", valor: 300 },
    ]);
  });

  it("ajusta dia 31 para o último dia válido do mês", () => {
    expect(adicionarMesesDataCalendario("2026-01-31", 1)).toBe("2026-02-28");
    expect(adicionarMesesDataCalendario("2028-01-31", 1)).toBe("2028-02-29");
  });

  it("distribui centavos e preserva exatamente o total", () => {
    const plano = gerarCronogramaPromissoria(100, 3, "2026-09-05");
    expect(plano.map((p) => p.valor)).toEqual([33.34, 33.33, 33.33]);
    expect(plano.reduce((total, p) => total + p.valor, 0)).toBeCloseTo(100, 2);
  });
});

// Config de exemplo (fonte única): prazo 4 meses, parcela mínima R$300.
const CFG = { prazoMaxMeses: 4, parcelaMinima: 300 };

describe("calcularParcelaSugerida", () => {
  it("divide o valor pelas parcelas", () => {
    expect(calcularParcelaSugerida(1200, 4)).toBe(300);
  });
  it("retorna 0 com parcelas inválidas", () => {
    expect(calcularParcelaSugerida(1200, 0)).toBe(0);
    expect(calcularParcelaSugerida(1200, -1)).toBe(0);
  });
});

describe("validarRegrasPromissoria (config como fonte única)", () => {
  it("aceita dentro das regras da config", () => {
    expect(validarRegrasPromissoria(1200, 4, CFG)).toBe("");
  });
  it("recusa valor inválido", () => {
    expect(validarRegrasPromissoria(0, 2, CFG)).toMatch(/valor total/i);
  });
  it("recusa parcelas inválidas", () => {
    expect(validarRegrasPromissoria(1000, 0, CFG)).toMatch(/parcelas/i);
  });
  it("usa o prazo máximo da CONFIG (não o fixo 4)", () => {
    // Com prazo 6 na config, 5 meses é válido.
    expect(
      validarRegrasPromissoria(3000, 5, { prazoMaxMeses: 6, parcelaMinima: 0 })
    ).toBe("");
    // Com prazo 4, 5 meses é recusado.
    expect(validarRegrasPromissoria(3000, 5, CFG)).toMatch(/4 meses/i);
  });
  it("usa a parcela mínima da CONFIG", () => {
    expect(validarRegrasPromissoria(400, 4, CFG)).toMatch(/300/);
    // parcelaMinima 0 = sem mínimo → aceita parcela pequena.
    expect(
      validarRegrasPromissoria(400, 4, { prazoMaxMeses: 4, parcelaMinima: 0 })
    ).toBe("");
  });
});

describe("calcularSaldoPromissoria", () => {
  it("saldo = total − pago", () => {
    expect(calcularSaldoPromissoria(400, 100, "em_aberto")).toBe(300);
  });
  it("nunca negativo (pago >= total)", () => {
    expect(calcularSaldoPromissoria(400, 500, "em_aberto")).toBe(0);
    expect(calcularSaldoPromissoria(400, 400, "pago")).toBe(0);
  });
  it("cancelada não entra nos saldos (sempre 0)", () => {
    expect(calcularSaldoPromissoria(400, 0, "cancelado")).toBe(0);
    expect(calcularSaldoPromissoria(400, 100, "cancelado")).toBe(0);
  });
  it("paga não volta a aparecer por falta de linha legada de pagamento", () => {
    expect(calcularSaldoPromissoria(400, 0, "pago")).toBe(0);
  });
});

describe("saldo consolidado de promissórias", () => {
  it("desconta pagamentos e ignora títulos pagos/cancelados", () => {
    const pagamentos = agregarPagamentosPromissoria([
      { promissoria_id: "aberta", valor: 100 },
      { promissoria_id: "aberta", valor: 50 },
      { promissoria_id: "cancelada", valor: 10 },
    ]);
    expect(
      calcularSaldoTotalPromissorias(
        [
          { id: "aberta", valor_total: 400, status: "em_aberto" },
          { id: "cancelada", valor_total: 410, status: "cancelado" },
          { id: "paga", valor_total: 60, status: "pago" },
        ],
        pagamentos
      )
    ).toBe(250);
  });
});
