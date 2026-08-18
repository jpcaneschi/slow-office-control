import { describe, it, expect } from "vitest";
import {
  agregarEstoqueVariacoes,
  estoqueEfetivo,
} from "@/lib/estoque-utils";

describe("agregarEstoqueVariacoes", () => {
  it("soma o estoque das variações por produto", () => {
    const mapa = agregarEstoqueVariacoes([
      { produto_id: "A", estoque: 10 },
      { produto_id: "A", estoque: 8 },
      { produto_id: "B", estoque: 3 },
    ]);
    expect(mapa.A).toBe(18);
    expect(mapa.B).toBe(3);
  });

  it("trata estoque null como 0", () => {
    const mapa = agregarEstoqueVariacoes([
      { produto_id: "A", estoque: null },
      { produto_id: "A", estoque: 5 },
    ]);
    expect(mapa.A).toBe(5);
  });

  it("ignora linhas sem produto_id", () => {
    const mapa = agregarEstoqueVariacoes([
      { produto_id: "", estoque: 9 },
      { produto_id: "A", estoque: 2 },
    ]);
    expect(mapa.A).toBe(2);
    expect(mapa[""]).toBeUndefined();
  });
});

describe("estoqueEfetivo", () => {
  const soma = { grade: 18 };

  it("produto de grade usa a soma das variações (DoD: 18 → 18)", () => {
    expect(
      estoqueEfetivo({ id: "grade", estoque: 0, tem_variacoes: true }, soma)
    ).toBe(18);
  });

  it("produto de grade sem variações vira 0", () => {
    expect(
      estoqueEfetivo({ id: "vazio", estoque: 0, tem_variacoes: true }, soma)
    ).toBe(0);
  });

  it("produto simples usa o próprio estoque", () => {
    expect(
      estoqueEfetivo({ id: "s", estoque: 7, tem_variacoes: false }, soma)
    ).toBe(7);
  });
});
