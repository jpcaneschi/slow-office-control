import { describe, it, expect } from "vitest";
import {
  resumirFinalizacao,
  type CondItemResumo,
  type MovResumo,
  type VendaItemResumo,
} from "@/lib/condicional-utils";

function item(
  over: Partial<CondItemResumo> & { id: string; produto_id: string; quantidade: number }
): CondItemResumo {
  return {
    variacao_id: null,
    preco_unitario: 100,
    status: null,
    ...over,
  };
}

describe("resumirFinalizacao", () => {
  it("conversão parcial: 1 vendida, 2 devolvidas (com venda ligada)", () => {
    const itens = [item({ id: "i1", produto_id: "P", quantidade: 3 })];
    const retornos: MovResumo[] = [
      { produto_id: "P", variacao_id: null, tipo: "retorno_condicional", quantidade: 2 },
    ];
    const vendaItens: VendaItemResumo[] = [
      { produto_id: "P", variacao_id: null, quantidade: 1 },
    ];
    const r = resumirFinalizacao(itens, retornos, vendaItens);
    expect(r.itens[0]).toMatchObject({ enviado: 3, vendido: 1, devolvido: 2, estado: "parcial" });
    expect(r.totalVendidoQtd).toBe(1);
    expect(r.totalDevolvidoQtd).toBe(2);
  });

  it("venda total: tudo vendido, nada devolvido", () => {
    const itens = [item({ id: "i1", produto_id: "P", quantidade: 2 })];
    const vendaItens: VendaItemResumo[] = [
      { produto_id: "P", variacao_id: null, quantidade: 2 },
    ];
    const r = resumirFinalizacao(itens, [], vendaItens);
    expect(r.itens[0]).toMatchObject({ vendido: 2, devolvido: 0, estado: "vendido" });
  });

  it("recolhido: tudo devolvido (sem venda)", () => {
    const itens = [item({ id: "i1", produto_id: "P", quantidade: 2 })];
    const retornos: MovResumo[] = [
      { produto_id: "P", variacao_id: null, tipo: "retorno_condicional", quantidade: 2 },
    ];
    const r = resumirFinalizacao(itens, retornos, []);
    expect(r.itens[0]).toMatchObject({ vendido: 0, devolvido: 2, estado: "devolvido" });
  });

  it("distingue variantes do mesmo produto", () => {
    const itens = [
      item({ id: "i1", produto_id: "P", variacao_id: "vP", quantidade: 2 }),
      item({ id: "i2", produto_id: "P", variacao_id: "vM", quantidade: 2 }),
    ];
    const retornos: MovResumo[] = [
      { produto_id: "P", variacao_id: "vM", tipo: "retorno_condicional", quantidade: 2 },
    ];
    const vendaItens: VendaItemResumo[] = [
      { produto_id: "P", variacao_id: "vP", quantidade: 2 },
    ];
    const r = resumirFinalizacao(itens, retornos, vendaItens);
    const vP = r.itens.find((x) => x.variacao_id === "vP");
    const vM = r.itens.find((x) => x.variacao_id === "vM");
    expect(vP).toMatchObject({ vendido: 2, devolvido: 0, estado: "vendido" });
    expect(vM).toMatchObject({ vendido: 0, devolvido: 2, estado: "devolvido" });
  });

  it("finalização manual sem movimentos: sem_movimento", () => {
    const itens = [item({ id: "i1", produto_id: "P", quantidade: 2 })];
    const r = resumirFinalizacao(itens, [], []);
    expect(r.itens[0]).toMatchObject({ vendido: 0, devolvido: 0, estado: "sem_movimento" });
    expect(r.totalSemMovimento).toBe(1);
  });

  it("sem venda ligada (dados antigos): deriva vendido = enviado - devolvido", () => {
    const itens = [item({ id: "i1", produto_id: "P", quantidade: 3 })];
    const retornos: MovResumo[] = [
      { produto_id: "P", variacao_id: null, tipo: "retorno_condicional", quantidade: 1 },
    ];
    const r = resumirFinalizacao(itens, retornos, []);
    expect(r.itens[0]).toMatchObject({ vendido: 2, devolvido: 1, estado: "parcial" });
  });

  it("ignora movimentos que não são retorno_condicional", () => {
    const itens = [item({ id: "i1", produto_id: "P", quantidade: 2 })];
    const retornos: MovResumo[] = [
      { produto_id: "P", variacao_id: null, tipo: "condicional", quantidade: 2 },
    ];
    const r = resumirFinalizacao(itens, retornos, []);
    expect(r.itens[0].devolvido).toBe(0);
  });
});
