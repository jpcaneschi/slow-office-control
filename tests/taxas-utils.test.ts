import { describe, it, expect } from "vitest";
import {
  calcularSnapshotVenda,
  calcularResultado,
  encontrarRegraTaxa,
  arredondar2,
  type RegraTaxa,
} from "@/lib/taxas-utils";

describe("calcularSnapshotVenda — exemplo obrigatório do plano", () => {
  it("R$100, custo R$50, cartão 3x, taxa 10% → bruto 100, taxa 10, líquido 90, margem 40", () => {
    const s = calcularSnapshotVenda({
      valorBruto: 100,
      custoTotal: 50,
      taxaPercentual: 10,
    });
    expect(s.valorBruto).toBe(100);
    expect(s.taxaValor).toBe(10);
    expect(s.valorLiquido).toBe(90);
    expect(s.custoTotal).toBe(50);
    expect(s.margem).toBe(40);
  });

  it("sem taxa (dinheiro/pix): taxa 0, líquido = bruto", () => {
    const s = calcularSnapshotVenda({ valorBruto: 100, custoTotal: 50, taxaPercentual: 0 });
    expect(s.taxaValor).toBe(0);
    expect(s.valorLiquido).toBe(100);
    expect(s.margem).toBe(50);
  });

  it("taxa fixa soma à percentual", () => {
    const s = calcularSnapshotVenda({ valorBruto: 100, taxaPercentual: 10, taxaFixa: 0.5 });
    expect(s.taxaValor).toBe(10.5);
    expect(s.valorLiquido).toBe(89.5);
  });

  it("arredonda a taxa para centavos", () => {
    // 33.33 * 4.99% = 1.663... → 1.66
    const s = calcularSnapshotVenda({ valorBruto: 33.33, taxaPercentual: 4.99 });
    expect(s.taxaValor).toBe(1.66);
    expect(s.valorLiquido).toBe(31.67);
  });

  it("valores negativos/invalidos são saneados para 0", () => {
    const s = calcularSnapshotVenda({ valorBruto: -10, taxaPercentual: -5, custoTotal: -1 });
    expect(s.valorBruto).toBe(0);
    expect(s.taxaValor).toBe(0);
    expect(s.valorLiquido).toBe(0);
    expect(s.margem).toBe(0);
  });
});

describe("calcularResultado — a taxa NÃO pode ser esquecida (R$349 vs R$339)", () => {
  it("subtrai a taxa do resultado: 349 sem taxa → 339 com taxa de R$10", () => {
    const semTaxa = calcularResultado({
      receita: 400,
      custoProdutos: 51,
      taxasCartao: 0,
      outrasDespesas: 0,
    });
    expect(semTaxa).toBe(349);

    const comTaxa = calcularResultado({
      receita: 400,
      custoProdutos: 51,
      taxasCartao: 10,
      outrasDespesas: 0,
    });
    expect(comTaxa).toBe(339);
    expect(semTaxa - comTaxa).toBe(10); // exatamente a taxa não contabilizada
  });
});

describe("encontrarRegraTaxa", () => {
  const regras: RegraTaxa[] = [
    {
      id: "generica-credito",
      tipo: "credito",
      bandeira: null,
      parcelas_min: 1,
      parcelas_max: 6,
      taxa_percentual: 4.5,
      taxa_fixa: 0,
      ativo: true,
      permite_ajuste_manual_pdv: true,
    },
    {
      id: "visa-3x",
      tipo: "credito",
      bandeira: "Visa",
      parcelas_min: 2,
      parcelas_max: 3,
      taxa_percentual: 3.2,
      taxa_fixa: 0,
      ativo: true,
      permite_ajuste_manual_pdv: false,
    },
    {
      id: "debito",
      tipo: "debito",
      bandeira: null,
      parcelas_min: 1,
      parcelas_max: 1,
      taxa_percentual: 1.5,
      taxa_fixa: 0,
      ativo: true,
      permite_ajuste_manual_pdv: true,
    },
  ];

  it("casa por tipo + faixa de parcelas", () => {
    expect(encontrarRegraTaxa(regras, { tipo: "debito", parcelas: 1 })?.id).toBe("debito");
    expect(encontrarRegraTaxa(regras, { tipo: "credito", parcelas: 5 })?.id).toBe(
      "generica-credito"
    );
  });

  it("regra com bandeira específica ganha da genérica", () => {
    expect(
      encontrarRegraTaxa(regras, { tipo: "credito", parcelas: 3, bandeira: "Visa" })?.id
    ).toBe("visa-3x");
    // Mastercard 3x cai na genérica (não há regra específica)
    expect(
      encontrarRegraTaxa(regras, { tipo: "credito", parcelas: 3, bandeira: "Master" })?.id
    ).toBe("generica-credito");
  });

  it("sem regra aplicável retorna null", () => {
    expect(encontrarRegraTaxa(regras, { tipo: "credito", parcelas: 12 })).toBeNull();
    expect(encontrarRegraTaxa([], { tipo: "debito", parcelas: 1 })).toBeNull();
  });
});

describe("arredondar2", () => {
  it("resolve o clássico 0.1+0.2", () => {
    expect(arredondar2(0.1 + 0.2)).toBe(0.3);
  });
});
