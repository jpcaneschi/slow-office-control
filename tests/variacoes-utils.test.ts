import { describe, it, expect } from "vitest";
import {
  rotuloVariacao,
  assinaturaVariacao,
  assinaturaExiste,
  gerarCombinacoes,
  validarCombinacao,
  atributosParaLegado,
  type ProdutoOpcao,
} from "@/lib/variacoes-utils";

describe("rotuloVariacao", () => {
  it("lê atributos e respeita a ordem das opções", () => {
    expect(
      rotuloVariacao({ Cor: "Off White", Tamanho: "P" }, null, ["Tamanho", "Cor"])
    ).toBe("P · Off White");
  });

  it("usa ordem natural (Tamanho antes de Cor) sem ordemNomes", () => {
    expect(rotuloVariacao({ Cor: "Preto", Tamanho: "G" })).toBe("G · Preto");
  });

  it("cai no fallback legado quando atributos está vazio", () => {
    expect(rotuloVariacao({}, { tamanho: "M", cor: "Azul" })).toBe("M · Azul");
    expect(rotuloVariacao(null, { tamanho: "42", cor: null })).toBe("42");
  });

  it("retorna 'Variação' quando não há nada", () => {
    expect(rotuloVariacao({}, {})).toBe("Variação");
    expect(rotuloVariacao(null, null)).toBe("Variação");
  });

  it("funciona com atributo personalizado (numeração de calçado)", () => {
    expect(rotuloVariacao({ "Numeração": "40" })).toBe("40");
  });
});

describe("assinaturaVariacao — White ≠ Off White ≠ Branco", () => {
  it("mantém valores distintos", () => {
    const a = assinaturaVariacao({ Cor: "White" });
    const b = assinaturaVariacao({ Cor: "Off White" });
    const c = assinaturaVariacao({ Cor: "Branco" });
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it("é estável independentemente da ordem das chaves", () => {
    expect(assinaturaVariacao({ Tamanho: "P", Cor: "Azul" })).toBe(
      assinaturaVariacao({ Cor: "Azul", Tamanho: "P" })
    );
  });

  it("ignora espaços em branco nas bordas", () => {
    expect(assinaturaVariacao({ Tamanho: " P " })).toBe(
      assinaturaVariacao({ Tamanho: "P" })
    );
  });
});

describe("assinaturaExiste", () => {
  it("detecta combinação duplicada", () => {
    const existentes = [{ Tamanho: "P", Cor: "Azul" }, { Tamanho: "M" }];
    expect(assinaturaExiste({ Cor: "Azul", Tamanho: "P" }, existentes)).toBe(true);
    expect(assinaturaExiste({ Tamanho: "G" }, existentes)).toBe(false);
  });

  it("combinação vazia nunca conta como duplicada", () => {
    expect(assinaturaExiste({}, [{}])).toBe(false);
  });
});

describe("gerarCombinacoes", () => {
  const tamanho: ProdutoOpcao = {
    nome: "Tamanho",
    tipo: "lista",
    obrigatorio: true,
    ordem: 0,
    valores_permitidos: ["P", "M", "G"],
  };
  const cor: ProdutoOpcao = {
    nome: "Cor",
    tipo: "lista",
    obrigatorio: false,
    ordem: 1,
    valores_permitidos: ["Azul", "Preto"],
  };

  it("loja só-Tamanho gera uma combinação por tamanho", () => {
    expect(gerarCombinacoes([tamanho])).toEqual([
      { Tamanho: "P" },
      { Tamanho: "M" },
      { Tamanho: "G" },
    ]);
  });

  it("Tamanho + Cor gera o produto cartesiano (3×2=6)", () => {
    const combos = gerarCombinacoes([tamanho, cor]);
    expect(combos).toHaveLength(6);
    expect(combos).toContainEqual({ Tamanho: "P", Cor: "Azul" });
    expect(combos).toContainEqual({ Tamanho: "G", Cor: "Preto" });
  });

  it("ignora opções sem valores (ex.: texto livre)", () => {
    const gravacao: ProdutoOpcao = {
      nome: "Gravação",
      tipo: "texto",
      obrigatorio: false,
      ordem: 2,
      valores_permitidos: [],
    };
    expect(gerarCombinacoes([tamanho, gravacao])).toHaveLength(3);
  });

  it("sem opções utilizáveis retorna vazio", () => {
    expect(gerarCombinacoes([])).toEqual([]);
  });
});

describe("validarCombinacao", () => {
  const opcoes: ProdutoOpcao[] = [
    {
      nome: "Tamanho",
      tipo: "lista",
      obrigatorio: true,
      ordem: 0,
      valores_permitidos: ["P", "M", "G"],
    },
    {
      nome: "Cor",
      tipo: "lista",
      obrigatorio: false,
      ordem: 1,
      valores_permitidos: ["Azul"],
    },
  ];

  it("aceita combinação válida", () => {
    expect(validarCombinacao({ Tamanho: "P", Cor: "Azul" }, opcoes)).toBeNull();
  });

  it("exige a opção obrigatória", () => {
    expect(validarCombinacao({ Cor: "Azul" }, opcoes)).toMatch(/Tamanho/);
  });

  it("não força a opção opcional (Cor não obrigatória)", () => {
    expect(validarCombinacao({ Tamanho: "M" }, opcoes)).toBeNull();
  });

  it("rejeita valor fora da lista", () => {
    expect(validarCombinacao({ Tamanho: "XG" }, opcoes)).toMatch(/não é permitido/);
  });

  it("valida tipo numero", () => {
    const num: ProdutoOpcao[] = [
      { nome: "Numeração", tipo: "numero", obrigatorio: true, ordem: 0, valores_permitidos: [] },
    ];
    expect(validarCombinacao({ "Numeração": "40" }, num)).toBeNull();
    expect(validarCombinacao({ "Numeração": "abc" }, num)).toMatch(/numérico/);
  });
});

describe("atributosParaLegado", () => {
  it("extrai tamanho/cor para as colunas legadas", () => {
    expect(atributosParaLegado({ Tamanho: "P", Cor: "Azul" })).toEqual({
      tamanho: "P",
      cor: "Azul",
    });
  });

  it("retorna null para opções que não são tamanho/cor", () => {
    expect(atributosParaLegado({ "Numeração": "40", Voltagem: "110" })).toEqual({
      tamanho: null,
      cor: null,
    });
  });
});
