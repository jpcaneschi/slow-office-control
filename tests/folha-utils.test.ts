import { describe, it, expect } from "vitest";
import { montarFolha } from "@/lib/folha-utils";

describe("montarFolha", () => {
  it("exemplo do DoD (#3/#11): líquido R$ 1.385,75", () => {
    const r = montarFolha({
      salarioBase: 1500,
      comissao: 29.75,
      qtdVendas: 6,
      repasseServicos: 56,
      vales: 200,
    });
    expect(r.totalProventos).toBeCloseTo(1585.75, 2);
    expect(r.totalDescontos).toBeCloseTo(200, 2);
    expect(r.liquido).toBeCloseTo(1385.75, 2);
  });

  it("estrutura: salário sempre presente; comissão/serviços/vales quando há", () => {
    const r = montarFolha({
      salarioBase: 1500,
      comissao: 29.75,
      qtdVendas: 6,
      repasseServicos: 56,
      vales: 200,
    });
    const descs = r.linhas.map((l) => l.desc);
    expect(descs[0]).toBe("Salário base");
    expect(descs.some((d) => d.startsWith("Comissão sobre vendas"))).toBe(true);
    expect(descs).toContain("Repasse de serviços");
    expect(descs).toContain("Vales do período");
    // A linha de comissão informa a quantidade de vendas.
    expect(descs.find((d) => d.startsWith("Comissão"))).toContain("6 vendas");
  });

  it("omite linhas zeradas (sem comissão, sem serviços, sem vales)", () => {
    const r = montarFolha({
      salarioBase: 1000,
      comissao: 0,
      qtdVendas: 0,
      repasseServicos: 0,
      vales: 0,
    });
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0].desc).toBe("Salário base");
    expect(r.liquido).toBe(1000);
  });

  it("mostra comissão mesmo R$0 se houve venda (qtd > 0)", () => {
    const r = montarFolha({
      salarioBase: 1000,
      comissao: 0,
      qtdVendas: 3,
      repasseServicos: 0,
      vales: 0,
    });
    expect(r.linhas.some((l) => l.desc.startsWith("Comissão"))).toBe(true);
  });

  it("outros descontos com rótulo custom", () => {
    const r = montarFolha({
      salarioBase: 1000,
      comissao: 0,
      qtdVendas: 0,
      repasseServicos: 0,
      vales: 100,
      outrosDescontos: 50,
      outrosDescontosLabel: "Faltas",
    });
    expect(r.totalDescontos).toBe(150);
    expect(r.linhas.find((l) => l.desc === "Faltas")?.valor).toBe(50);
    expect(r.liquido).toBe(850);
  });

  it("singular: '1 venda'", () => {
    const r = montarFolha({
      salarioBase: 0,
      comissao: 10,
      qtdVendas: 1,
      repasseServicos: 0,
      vales: 0,
    });
    expect(r.linhas.find((l) => l.desc.startsWith("Comissão"))?.desc).toContain(
      "1 venda)"
    );
  });
});
