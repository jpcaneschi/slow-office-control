import { describe, it, expect } from "vitest";
import {
  resolverAcao,
  descreverRegistro,
  formatarValor,
  rotuloCampo,
  montarDetalhe,
} from "@/lib/auditoria-utils";

describe("resolverAcao", () => {
  it("rotula ações semânticas (incluindo as novas de #1/#2/#3)", () => {
    expect(resolverAcao("venda_criada").label).toBe("Venda criada");
    expect(resolverAcao("promissoria_pagamento").label).toBe("Pagamento de promissória");
    expect(resolverAcao("condicional_convertido").label).toBe(
      "Condicional convertido em venda"
    );
    expect(resolverAcao("venda_devolucao").label).toBe("Devolução de venda");
  });

  it("traduz o trigger genérico insert/update/delete_<tabela>", () => {
    expect(resolverAcao("update_configuracoes").label).toBe("Editou configuração");
    expect(resolverAcao("insert_taxas_cartao").label).toBe("Criou taxa de cartão");
    expect(resolverAcao("delete_produtos").label).toBe("Excluiu produto");
    expect(resolverAcao("insert_produto_opcoes").label).toBe("Criou opção de produto");
  });

  it("cai no cru quando não conhece a ação", () => {
    expect(resolverAcao("algo_desconhecido").label).toBe("algo_desconhecido");
  });
});

describe("formatarValor", () => {
  it("formata vazios, booleanos e listas de forma legível", () => {
    expect(formatarValor(null)).toBe("vazio");
    expect(formatarValor("")).toBe("vazio");
    expect(formatarValor(true)).toBe("Sim");
    expect(formatarValor(false)).toBe("Não");
    expect(formatarValor(["tatuagem", "servicos"])).toBe("tatuagem, servicos");
    expect(formatarValor([])).toBe("(nenhum)");
    expect(formatarValor(5)).toBe("5");
  });
});

describe("montarDetalhe — diff antes/depois (UPDATE do trigger)", () => {
  it("mostra só os campos alterados, com rótulos pt-BR", () => {
    const d = montarDetalhe({
      antes: { nome_operacao: "Slow", pix_desconto: 5, max_parcelas: 6 },
      depois: { nome_operacao: "Slow", pix_desconto: 8, max_parcelas: 6 },
      alteracoes: { pix_desconto: { antes: 5, depois: 8 } },
    });
    expect(d.alteracoes).toHaveLength(1);
    expect(d.alteracoes[0]).toEqual({
      campo: "Desconto Pix (%)",
      antes: "5",
      depois: "8",
    });
  });

  it("diff de módulos (array) fica legível", () => {
    const d = montarDetalhe({
      alteracoes: {
        modulos_ativos: {
          antes: ["condicional", "tatuagem"],
          depois: ["condicional"],
        },
      },
    });
    expect(d.alteracoes[0].campo).toBe("Módulos ativos");
    expect(d.alteracoes[0].antes).toBe("condicional, tatuagem");
    expect(d.alteracoes[0].depois).toBe("condicional");
  });
});

describe("montarDetalhe — INSERT/DELETE e config sem nome (DoD: nada de '—' vazio)", () => {
  it("usa o campo representativo quando existe", () => {
    const d = montarDetalhe({ depois: { nome: "Camiseta Branca" } });
    expect(d.resumo).toBe("Camiseta Branca");
    expect(d.alteracoes).toHaveLength(0);
  });

  it("configuração (sem 'nome') resume campos-chave em vez de vazio", () => {
    const d = montarDetalhe({
      depois: { nome_operacao: "Loja Slow", pix_desconto: 5, max_parcelas: 6 },
    });
    expect(d.resumo).not.toBe("");
    expect(d.resumo).toContain("Loja Slow");
  });
});

describe("montarDetalhe — payload semântico", () => {
  it("junta chaves soltas com rótulos e ignora vazios", () => {
    const d = montarDetalhe({ total: 100, forma_pagamento: "cartao", motivo: "" });
    expect(d.alteracoes).toHaveLength(0);
    expect(d.resumo).toContain("Total: 100");
    expect(d.resumo).toContain("Forma de pagamento: cartao");
    expect(d.resumo).not.toContain("Motivo");
  });
});

describe("segredos (DoD: nunca vazar) — a UI respeita o redigido do banco", () => {
  it("valor '[REDIGIDO]' vindo do banco é exibido como está, sem revelar nada", () => {
    // fn_auditoria_redigir substitui o valor no banco; aqui garantimos que a
    // formatação não tenta 'desfazer' nem esconde a existência da mudança.
    const d = montarDetalhe({
      alteracoes: { token: { antes: "[REDIGIDO]", depois: "[REDIGIDO]" } },
    });
    expect(d.alteracoes[0].antes).toBe("[REDIGIDO]");
    expect(d.alteracoes[0].depois).toBe("[REDIGIDO]");
  });
});

describe("descreverRegistro / rotuloCampo", () => {
  it("descreve por nome/operadora/email", () => {
    expect(descreverRegistro({ operadora: "Stone" })).toBe("Stone");
    expect(descreverRegistro({ nome_operacao: "Slow" })).toBe("Slow");
    expect(descreverRegistro({})).toBe("");
  });
  it("rótulo cai para o nome do campo humanizado quando desconhecido", () => {
    expect(rotuloCampo("campo_novo_qualquer")).toBe("campo novo qualquer");
  });
});
