import { describe, expect, it } from "vitest";
import { calcularResultadoLoja } from "@/lib/resultado-loja-utils";

describe("calcularResultadoLoja", () => {
  it("apura faturamento e lucro sem contar venda cancelada", () => {
    const resultado = calcularResultadoLoja(
      {
        vendas: [
          { id: "v1", total: 1000, status: "concluida", created_at: "2026-08-01" },
          { id: "v2", total: 500, status: "cancelada", created_at: "2026-08-01" },
        ],
        itens: [
          { venda_id: "v1", quantidade: 2, custo_unitario: 100 },
          { venda_id: "v2", quantidade: 1, custo_unitario: 500 },
        ],
        despesas: [{ valor: 300, data: "2026-08-05" }],
        servicos: [{ valor: 200, percentual_loja: 20, data: "2026-08-08" }],
      },
      { vendaNoPeriodo: () => true, dataNoPeriodo: () => true }
    );
    expect(resultado.faturamento).toBe(1040);
    expect(resultado.lucro).toBe(540);
  });
});
