import { describe, it, expect } from "vitest";
import {
  comissaoDeVendas,
  repasseDeServico,
  calcularAcerto,
  type VendaComissao,
  type ServicoComissao,
  type ValeComissao,
} from "@/lib/comissao-utils";

describe("comissaoDeVendas", () => {
  it("aplica o percentual sobre o vendido", () => {
    expect(comissaoDeVendas(595, 5)).toBeCloseTo(29.75, 2);
    expect(comissaoDeVendas(1000, 0)).toBe(0);
  });
});

describe("repasseDeServico", () => {
  it("repassa a parte que não é da loja", () => {
    // valor 100, loja fica com 30% → repasse 70.
    expect(repasseDeServico(100, 30)).toBe(70);
  });
});

describe("calcularAcerto — exemplo obrigatório do DoD (pagamento final R$1.385,75)", () => {
  const func = { id: "f1", comissao_percentual: 5, salario_fixo: 1500 };

  // 6 vendas concluídas do f1 somando R$595 (uma delas convertida de condicional).
  const vendas: VendaComissao[] = [
    { funcionario_id: "f1", total: 100, status: "concluida", created_at: "2026-08-01" },
    { funcionario_id: "f1", total: 100, status: "concluida", created_at: "2026-08-02" },
    { funcionario_id: "f1", total: 100, status: "concluida", created_at: "2026-08-03" },
    { funcionario_id: "f1", total: 100, status: "concluida", created_at: "2026-08-04" },
    { funcionario_id: "f1", total: 100, status: "concluida", created_at: "2026-08-05" },
    // Convertida de condicional — AGORA tem funcionario_id (correção da #3).
    { funcionario_id: "f1", total: 95, status: "concluida", created_at: "2026-08-06" },
    // Cancelada NÃO conta:
    { funcionario_id: "f1", total: 500, status: "cancelada", created_at: "2026-08-06" },
    // De outro funcionário NÃO conta:
    { funcionario_id: "f2", total: 999, status: "concluida", created_at: "2026-08-06" },
  ];
  // Repasse de serviços = R$56 (valor 80, loja 30% → 56).
  const servicos: ServicoComissao[] = [
    { funcionario_id: "f1", valor: 80, percentual_loja: 30, data: "2026-08-03" },
  ];
  const vales: ValeComissao[] = [
    { funcionario_id: "f1", valor: 200, data: "2026-08-04" },
  ];

  const a = calcularAcerto(
    func,
    { vendas, servicos, vales },
    { vendaNoPeriodo: () => true, dataNoPeriodo: () => true }
  );

  it("vendas elegíveis = 6 e vendido = R$595 (inclui a convertida, exclui cancelada e de outro)", () => {
    expect(a.qtdVendas).toBe(6);
    expect(a.vendido).toBe(595);
  });
  it("comissão = R$29,75 (5% de 595)", () => {
    expect(a.comissao).toBeCloseTo(29.75, 2);
  });
  it("repasse serviços = R$56 e vales = R$200 e salário = R$1500", () => {
    expect(a.repasse).toBe(56);
    expect(a.vales).toBe(200);
    expect(a.salario).toBe(1500);
  });
  it("pagamento final = R$1.385,75", () => {
    expect(a.aPagar).toBeCloseTo(1385.75, 2);
  });
});

describe("calcularAcerto — exclusões e período", () => {
  const func = { id: "f1", comissao_percentual: 10, salario_fixo: 0 };
  const vendas: VendaComissao[] = [
    { funcionario_id: "f1", total: 100, status: "concluida", created_at: "2026-08-10" },
    { funcionario_id: "f1", total: 100, status: "concluida", created_at: "2026-09-10" },
  ];
  it("respeita o filtro de período injetado", () => {
    const a = calcularAcerto(
      func,
      { vendas, servicos: [], vales: [] },
      {
        vendaNoPeriodo: (v) => v.created_at.startsWith("2026-08"),
        dataNoPeriodo: () => true,
      }
    );
    expect(a.qtdVendas).toBe(1);
    expect(a.vendido).toBe(100);
    expect(a.comissao).toBe(10);
  });
});

describe("calcularAcerto — bases configuráveis", () => {
  const dados = {
    vendas: [] as VendaComissao[],
    servicos: [] as ServicoComissao[],
    vales: [] as ValeComissao[],
    resultadoLoja: { faturamento: 10_000, lucro: 3_000 },
  };
  const filtros = { vendaNoPeriodo: () => true, dataNoPeriodo: () => true };

  it("calcula 3% sobre o lucro total da loja", () => {
    const a = calcularAcerto(
      { id: "f1", comissao_percentual: 3, salario_fixo: 0, comissao_base: "lucro_loja" },
      dados,
      filtros
    );
    expect(a.baseComissao).toBe(3000);
    expect(a.comissao).toBe(90);
  });

  it("nunca gera comissão negativa quando a loja tem prejuízo", () => {
    const a = calcularAcerto(
      { id: "f1", comissao_percentual: 3, salario_fixo: 0, comissao_base: "lucro_loja" },
      { ...dados, resultadoLoja: { faturamento: 1000, lucro: -200 } },
      filtros
    );
    expect(a.comissao).toBe(0);
  });
});
