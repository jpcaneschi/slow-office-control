import { describe, it, expect } from "vitest";
import { parseCSV, gerarCSV } from "@/lib/csv";
import {
  sugerirMapeamento,
  parseNumeroBR,
  estruturarImportacao,
  planejarImportacao,
} from "@/lib/csv-importador";

describe("sugerirMapeamento — sinônimos de cabeçalho", () => {
  it("mapeia o CSV comum do DoD", () => {
    const m = sugerirMapeamento([
      "produto",
      "marca",
      "tamanho",
      "cor",
      "sku",
      "preço venda",
      "custo",
      "quantidade",
      "status",
    ]);
    expect(m["produto"].campo).toBe("nome");
    expect(m["marca"].campo).toBe("marca");
    expect(m["tamanho"].campo).toBe("atributo:Tamanho");
    expect(m["cor"].campo).toBe("atributo:Cor");
    expect(m["sku"].campo).toBe("sku");
    expect(m["preço venda"].campo).toBe("preco");
    expect(m["custo"].campo).toBe("custo");
    expect(m["quantidade"].campo).toBe("estoque");
    expect(m["status"].campo).toBe("status");
  });

  it("reconhece o formato interno atual (nome, categoria, preco, ...)", () => {
    const m = sugerirMapeamento([
      "nome",
      "categoria",
      "preco",
      "custo",
      "estoque",
      "status",
      "tamanho",
      "cor",
    ]);
    expect(m["nome"].campo).toBe("nome");
    expect(m["categoria"].campo).toBe("categoria");
    expect(m["preco"].campo).toBe("preco");
    expect(m["estoque"].campo).toBe("estoque");
  });

  it("marca cabeçalho desconhecido como ignorar/baixa (não adivinha)", () => {
    const m = sugerirMapeamento(["observações internas"]);
    expect(m["observações internas"].campo).toBe("ignorar");
    expect(m["observações internas"].confianca).toBe("baixa");
  });

  it("não aponta dois cabeçalhos para o mesmo campo", () => {
    const m = sugerirMapeamento(["produto", "nome do produto"]);
    const campos = Object.values(m).map((x) => x.campo);
    expect(campos.filter((c) => c === "nome")).toHaveLength(1);
  });

  it("reconhece numeração como atributo (calçados)", () => {
    const m = sugerirMapeamento(["Produto", "Numeração"]);
    expect(m["Numeração"].campo).toBe("atributo:Numeração");
  });
});

describe("parseNumeroBR", () => {
  it("moeda BR com milhar e decimal", () => {
    expect(parseNumeroBR("R$ 1.234,56")).toBeCloseTo(1234.56, 2);
    expect(parseNumeroBR("1.234,56")).toBeCloseTo(1234.56, 2);
    expect(parseNumeroBR("99,90")).toBeCloseTo(99.9, 2);
  });
  it("formato internacional", () => {
    expect(parseNumeroBR("1234.56")).toBeCloseTo(1234.56, 2);
    expect(parseNumeroBR("1234")).toBe(1234);
  });
  it("vazio/invalid vira null", () => {
    expect(parseNumeroBR("")).toBeNull();
    expect(parseNumeroBR("abc")).toBeNull();
    expect(parseNumeroBR(null)).toBeNull();
  });
});

describe("estruturarImportacao — CSV comum vira variantes", () => {
  const texto =
    "produto,marca,tamanho,cor,sku,preço venda,custo,quantidade,status\r\n" +
    "Camiseta,Slow,P,Off White,SKU-1,99.90,40,7,ativo\r\n" +
    "Camiseta,Slow,M,Off White,SKU-2,99.90,40,5,ativo\r\n" +
    "Camiseta,Slow,M,Preto,SKU-3,99.90,40,3,ativo";

  it("agrupa 3 linhas em 1 produto com 3 variações e 2 opções", () => {
    const linhas = parseCSV(texto);
    const map = sugerirMapeamento(Object.keys(linhas[0]));
    const { produtos, erros } = estruturarImportacao(linhas, map);
    expect(erros).toHaveLength(0);
    expect(produtos).toHaveLength(1);
    const p = produtos[0];
    expect(p.nome).toBe("Camiseta");
    expect(p.marca).toBe("Slow");
    expect(p.temVariacoes).toBe(true);
    expect(p.variacoes).toHaveLength(3);
    const nomesOpcoes = p.opcoes.map((o) => o.nome).sort();
    expect(nomesOpcoes).toEqual(["Cor", "Tamanho"]);
    // Cor não é obrigatória? Aqui todas têm cor → obrigatória.
    expect(p.opcoes.find((o) => o.nome === "Tamanho")?.valores_permitidos.sort()).toEqual(["M", "P"]);
  });

  it("preserva estoque por variação", () => {
    const linhas = parseCSV(texto);
    const map = sugerirMapeamento(Object.keys(linhas[0]));
    const { produtos } = estruturarImportacao(linhas, map);
    const total = produtos[0].variacoes.reduce((a, v) => a + v.estoque, 0);
    expect(total).toBe(15); // 7 + 5 + 3
  });
});

describe("estruturarImportacao — formato interno e produto simples", () => {
  it("importa produto sem variações (formato interno)", () => {
    const texto =
      "nome,categoria,preco,custo,estoque,status,tamanho,cor\r\n" +
      "Boné,Acessório,50,20,10,ativo,,";
    const linhas = parseCSV(texto);
    const map = sugerirMapeamento(Object.keys(linhas[0]));
    const { produtos, erros } = estruturarImportacao(linhas, map);
    expect(erros).toHaveLength(0);
    expect(produtos[0].temVariacoes).toBe(false);
    expect(produtos[0].estoque).toBe(10);
  });

  it("reporta linha sem nome como erro", () => {
    const texto = "nome,preco\r\n,10\r\nCamisa,20";
    const linhas = parseCSV(texto);
    const map = sugerirMapeamento(Object.keys(linhas[0]));
    const { produtos, erros } = estruturarImportacao(linhas, map);
    expect(produtos).toHaveLength(1);
    expect(erros).toHaveLength(1);
    expect(erros[0].linha).toBe(2);
  });

  it("White ≠ Off White ≠ Branco geram 3 variações distintas", () => {
    const texto =
      "produto,cor,estoque\r\nCamisa,White,1\r\nCamisa,Off White,1\r\nCamisa,Branco,1";
    const linhas = parseCSV(texto);
    const map = sugerirMapeamento(Object.keys(linhas[0]));
    const { produtos } = estruturarImportacao(linhas, map);
    expect(produtos[0].variacoes).toHaveLength(3);
  });

  it("ignora variação repetida no arquivo (aviso)", () => {
    const texto =
      "produto,tamanho,estoque\r\nCamisa,P,5\r\nCamisa,P,9";
    const linhas = parseCSV(texto);
    const map = sugerirMapeamento(Object.keys(linhas[0]));
    const { produtos, avisos } = estruturarImportacao(linhas, map);
    expect(produtos[0].variacoes).toHaveLength(1);
    expect(avisos.length).toBeGreaterThan(0);
  });

  it("reporta número inválido como erro na linha", () => {
    const texto = "nome,preco\r\nCamisa,abc";
    const linhas = parseCSV(texto);
    const map = sugerirMapeamento(Object.keys(linhas[0]));
    const { erros } = estruturarImportacao(linhas, map);
    expect(erros.some((e) => /inválido/i.test(e.motivo))).toBe(true);
  });
});

describe("planejarImportacao — idempotência", () => {
  it("reenviar o mesmo produto não duplica (ignora existente)", () => {
    const texto = "nome,preco,estoque\r\nCamisa,20,5";
    const linhas = parseCSV(texto);
    const map = sugerirMapeamento(Object.keys(linhas[0]));
    const { produtos } = estruturarImportacao(linhas, map);
    const plano = planejarImportacao(produtos, ["camisa"]);
    expect(plano[0].acao).toBe("ignorar_existente");
  });

  it("produto novo é criado", () => {
    const texto = "nome,preco,estoque\r\nBoné,20,5";
    const linhas = parseCSV(texto);
    const map = sugerirMapeamento(Object.keys(linhas[0]));
    const { produtos } = estruturarImportacao(linhas, map);
    const plano = planejarImportacao(produtos, ["camisa"]);
    expect(plano[0].acao).toBe("criar");
  });
});

describe("CSV injection — exportação neutraliza fórmula, round-trip sem perda", () => {
  it("célula com = ganha guarda e volta ao original ao reimportar", () => {
    const csv = gerarCSV(["nome"], ["=SUM(A1:A2)"].map((n) => [n]));
    // No arquivo, a célula está neutralizada com apóstrofo.
    expect(csv).toContain("'=SUM(A1:A2)");
    // Ao reimportar com o nosso parser, a guarda é removida.
    const rows = parseCSV(csv);
    expect(rows[0].nome).toBe("=SUM(A1:A2)");
  });

  it("célula normal não é alterada", () => {
    const csv = gerarCSV(["nome"], [["Camiseta"]]);
    expect(csv).toBe("nome\r\nCamiseta");
  });
});
