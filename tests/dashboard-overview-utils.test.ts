import { describe, expect, it } from "vitest";
import { resumirDashboard, type VendaResumo } from "@/lib/dashboard-overview-utils";

const venda = (id: string, total: number, extra: Partial<VendaResumo> = {}): VendaResumo => ({
  id, total, status: "concluida", data_venda: "2026-09-26", forma_pagamento: "pix", ...extra,
});

describe("resumo do dashboard", () => {
  it("inclui o valor integral de promissórias e desconta apenas despesas pagas", () => {
    const dados = resumirDashboard([
      venda("1", 600, { forma_pagamento: "promissoria" }), venda("2", 200),
      venda("cancelada", 900, { status: "cancelada" }),
      venda("fora", 300, { data_venda: "2026-08-31" }),
    ], [], [], 250, "2026-09-01", "2026-09-30");
    expect(dados.receita).toBe(800);
    expect(dados.resultado).toBe(550);
    expect(dados.pedidos).toBe(2);
  });

  it("agrupa grafias da mesma marca e rateia o desconto entre marcas", () => {
    const dados = resumirDashboard([venda("1", 90), venda("2", 50)], [
      { venda_id: "1", produto_id: "a", quantidade: 1, total_item: 60 },
      { venda_id: "1", produto_id: "b", quantidade: 1, total_item: 40 },
      { venda_id: "2", produto_id: "c", quantidade: 1, total_item: 50 },
      { venda_id: "fora", produto_id: "a", quantidade: 10, total_item: 500 },
    ], [
      { id: "a", nome: "A", marca: "Class" },
      { id: "b", nome: "B", marca: "Nike" },
      { id: "c", nome: "C", marca: " CLASS " },
    ], 0, "2026-09-01", "2026-09-30");
    expect(dados.marcas).toEqual([
      { nome: "Class", receita: 104, unidades: 2 },
      { nome: "Nike", receita: 36, unidades: 1 },
    ]);
    expect(dados.marcas.reduce((s, m) => s + m.receita, 0)).toBe(dados.receita);
    expect(dados.unidades).toBe(3);
  });

  it("mantém resultado negativo e período vazio sem inventar margem", () => {
    const dados = resumirDashboard([], [], [], 100, "2026-09-01", "2026-09-30");
    expect(dados.resultado).toBe(-100);
    expect(dados.pagamentos).toEqual([]);
    expect(dados.marcas).toEqual([]);
  });
});
