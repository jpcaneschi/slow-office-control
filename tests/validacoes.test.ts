import { describe, it, expect } from "vitest";
import {
  paraNumero,
  validarNumero,
  validarPreco,
  validarEstoque,
  validarPercentual,
  validarParcelas,
  validarPrazoMeses,
  validarComissao,
  validarVale,
  validarTaxaPercentual,
  validarTexto,
  primeiroErro,
} from "@/lib/validacoes";

describe("paraNumero (aceita padrão BR)", () => {
  it("converte vírgula decimal e milhar", () => {
    expect(paraNumero("10")).toBe(10);
    expect(paraNumero("10,5")).toBe(10.5);
    expect(paraNumero("1.234,56")).toBeCloseTo(1234.56, 2);
    expect(paraNumero(42)).toBe(42);
  });
  it("vazio/inválido → NaN", () => {
    expect(Number.isNaN(paraNumero(""))).toBe(true);
    expect(Number.isNaN(paraNumero("abc"))).toBe(true);
    expect(Number.isNaN(paraNumero(null))).toBe(true);
  });
});

describe("validarNumero — obrigatoriedade e vazios", () => {
  it("obrigatório vazio → pede o campo", () => {
    expect(validarNumero("o preço", "")).toBe("Informe o preço.");
    expect(validarNumero("o preço", null)).toBe("Informe o preço.");
  });
  it("opcional vazio → ok (null)", () => {
    expect(validarNumero("o custo", "", { obrigatorio: false })).toBeNull();
  });
  it("não numérico → mensagem clara", () => {
    expect(validarNumero("o preço", "abc")).toBe("O preço deve ser um número válido.");
  });
});

describe("limites — não-negativos e inteiros", () => {
  it("negativo barrado", () => {
    expect(validarPreco("-1")).toBe("O preço não pode ser negativo.");
    expect(validarVale("-0,01")).toBe("O valor do vale não pode ser negativo.");
  });
  it("zero é permitido (min 0)", () => {
    expect(validarPreco("0")).toBeNull();
    expect(validarEstoque("0")).toBeNull();
  });
  it("estoque exige inteiro", () => {
    expect(validarEstoque("1,5")).toBe("O estoque deve ser um número inteiro.");
    expect(validarEstoque("3")).toBeNull();
  });
});

describe("percentuais — borda 0 e 100", () => {
  it("0 e 100 são válidos; fora disso, erro pt-BR", () => {
    expect(validarPercentual("0")).toBeNull();
    expect(validarPercentual("100")).toBeNull();
    expect(validarPercentual("-1")).toBe("O percentual deve ficar entre 0% e 100%.");
    expect(validarPercentual("101")).toBe("O percentual deve ficar entre 0% e 100%.");
  });
  it("comissão e taxa reaproveitam a regra 0–100 com rótulo próprio", () => {
    expect(validarComissao("150")).toBe("A comissão deve ficar entre 0% e 100%.");
    expect(validarTaxaPercentual("50", "a taxa de crédito")).toBeNull();
    expect(validarTaxaPercentual("120", "a taxa de crédito")).toBe(
      "A taxa de crédito deve ficar entre 0% e 100%."
    );
  });
});

describe("parcelas e prazos", () => {
  it("parcelas: mínimo 1, inteiro, teto configurável", () => {
    expect(validarParcelas("0")).toBe("O número de parcelas deve ser no mínimo 1.");
    expect(validarParcelas("1")).toBeNull();
    expect(validarParcelas("30", 24)).toBe("O número de parcelas deve ser no máximo 24.");
    expect(validarParcelas("2,5")).toBe("O número de parcelas deve ser um número inteiro.");
  });
  it("prazo em meses: não-negativo, inteiro, unidade na mensagem", () => {
    expect(validarPrazoMeses("-1")).toBe("O prazo não pode ser negativo.");
    expect(validarPrazoMeses("6")).toBeNull();
  });
});

describe("validarTexto e primeiroErro", () => {
  it("texto obrigatório", () => {
    expect(validarTexto("o nome", "  ")).toBe("Informe o nome.");
    expect(validarTexto("o nome", "Slow")).toBeNull();
  });
  it("primeiroErro devolve a primeira mensagem não-nula", () => {
    expect(primeiroErro(null, null, "erro 2", "erro 3")).toBe("erro 2");
    expect(primeiroErro(null, null)).toBeNull();
  });
});
