import { describe, expect, it } from "vitest";
import { calcularResultadoLoja } from "@/lib/resultado-loja-utils";

describe("calcularResultadoLoja", () => {
  it("apura vendas e serviços menos despesas lançadas, sem segunda saída por peça", () => {
    const resultado = calcularResultadoLoja(
      {
        vendas: [
          { id: "v1", total: 1000, status: "concluida", created_at: "2026-08-01" },
          { id: "v2", total: 500, status: "cancelada", created_at: "2026-08-01" },
        ],
        despesas: [{ valor: 300, data: "2026-08-05" }],
        servicos: [{ valor: 200, percentual_loja: 20, data: "2026-08-08" }],
      },
      { vendaNoPeriodo: () => true, dataNoPeriodo: () => true }
    );
    expect(resultado.faturamento).toBe(1040);
    expect(resultado.despesas).toBe(300);
    expect(resultado.lucro).toBe(740);
  });
});
