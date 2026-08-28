import { describe, expect, it } from "vitest";
import {
  filtrarOpcoesBuscaRapida,
  normalizarBuscaRapida,
  type OpcaoBuscaRapida,
} from "@/lib/busca-rapida";

const opcoes: OpcaoBuscaRapida[] = [
  {
    value: "1",
    label: "João da Silva",
    searchText: "joao@email.com (32) 99999-1234 123.456.789-09",
  },
  {
    value: "2",
    label: "Camiseta Básica Preta",
    searchText: "Slow Roupas camiseta SKU-PRETA-M 789123456",
  },
  { value: "3", label: "Maria Oliveira", searchText: "maria@email.com" },
];

describe("normalizarBuscaRapida", () => {
  it("ignora acentos, caixa e pontuação", () => {
    expect(normalizarBuscaRapida("  JOÃO (32) 99999-1234 ")).toBe(
      "joao 32 99999 1234"
    );
  });
});

describe("filtrarOpcoesBuscaRapida", () => {
  it("localiza cliente por sobrenome, telefone, CPF e e-mail", () => {
    expect(filtrarOpcoesBuscaRapida(opcoes, "silva")[0]?.value).toBe("1");
    expect(filtrarOpcoesBuscaRapida(opcoes, "99999 1234")[0]?.value).toBe("1");
    expect(filtrarOpcoesBuscaRapida(opcoes, "12345678909")[0]?.value).toBe("1");
    expect(filtrarOpcoesBuscaRapida(opcoes, "joao@email")[0]?.value).toBe("1");
  });

  it("localiza produto por partes do nome, marca, SKU e código de barras", () => {
    expect(filtrarOpcoesBuscaRapida(opcoes, "basica preta")[0]?.value).toBe("2");
    expect(filtrarOpcoesBuscaRapida(opcoes, "slow roupas")[0]?.value).toBe("2");
    expect(filtrarOpcoesBuscaRapida(opcoes, "sku preta m")[0]?.value).toBe("2");
    expect(filtrarOpcoesBuscaRapida(opcoes, "789123456")[0]?.value).toBe("2");
  });

  it("prioriza o nome que começa exatamente com o termo", () => {
    const resultado = filtrarOpcoesBuscaRapida(
      [
        { value: "a", label: "Blusa Camiseta" },
        { value: "b", label: "Camiseta Básica" },
      ],
      "camiseta"
    );
    expect(resultado.map((item) => item.value)).toEqual(["b", "a"]);
  });
});
