import { describe, it, expect } from "vitest";
import {
  calcularAtivas,
  planejarSincronizacao,
  type DadosAlerta,
  type NovaNotificacao,
} from "@/lib/notificacoes-core";

const HOJE = "2026-08-18";
const EM7 = "2026-08-25";

function dadosVazios(): DadosAlerta {
  return {
    produtos: [],
    variacoes: [],
    promissorias: [],
    condicionais: [],
    eventos: [],
    clientes: [],
  };
}

describe("calcularAtivas — estoque efetivo", () => {
  it("produto de grade com estoque 18 nas variações NÃO gera alerta", () => {
    const dados = dadosVazios();
    dados.produtos = [
      { id: "P", nome: "Camiseta", estoque: 0, status: "ativo", tem_variacoes: true },
    ];
    dados.variacoes = [
      { produto_id: "P", estoque: 10 },
      { produto_id: "P", estoque: 8 },
    ];
    const ativas = calcularAtivas(dados, HOJE, EM7);
    expect(ativas.find((a) => a.chave === "estoque_baixo:P")).toBeUndefined();
  });

  it("produto de grade com estoque baixo agregado GERA alerta com o total", () => {
    const dados = dadosVazios();
    dados.produtos = [
      { id: "P", nome: "Meia", estoque: 0, status: "ativo", tem_variacoes: true },
    ];
    dados.variacoes = [
      { produto_id: "P", estoque: 2 },
      { produto_id: "P", estoque: 1 },
    ];
    const ativas = calcularAtivas(dados, HOJE, EM7);
    const alerta = ativas.find((a) => a.chave === "estoque_baixo:P");
    expect(alerta).toBeDefined();
    expect(alerta?.descricao).toContain("3 em estoque");
  });

  it("produto simples com estoque 7 NÃO aparece como alerta (limite 5)", () => {
    const dados = dadosVazios();
    dados.produtos = [
      { id: "S", nome: "Boné", estoque: 7, status: "ativo", tem_variacoes: false },
    ];
    const ativas = calcularAtivas(dados, HOJE, EM7);
    expect(ativas).toHaveLength(0);
  });

  it("produto simples com estoque 3 gera alerta", () => {
    const dados = dadosVazios();
    dados.produtos = [
      { id: "S", nome: "Boné", estoque: 3, status: "ativo", tem_variacoes: false },
    ];
    const ativas = calcularAtivas(dados, HOJE, EM7);
    expect(ativas.map((a) => a.chave)).toContain("estoque_baixo:S");
  });

  it("produto inativo não gera alerta de estoque", () => {
    const dados = dadosVazios();
    dados.produtos = [
      { id: "S", nome: "Boné", estoque: 0, status: "inativo", tem_variacoes: false },
    ];
    expect(calcularAtivas(dados, HOJE, EM7)).toHaveLength(0);
  });
});

describe("planejarSincronizacao — estados ativa/resolvida", () => {
  const alerta: NovaNotificacao = {
    chave: "estoque_baixo:P",
    tipo: "estoque",
    titulo: "Estoque baixo",
    descricao: "x",
    href: "/dashboard/produtos",
  };

  it("condição nova → inserir", () => {
    const plano = planejarSincronizacao([], [alerta]);
    expect(plano.inserir).toHaveLength(1);
    expect(plano.reativar).toHaveLength(0);
    expect(plano.resolver).toHaveLength(0);
  });

  it("condição sumiu (estoque reposto) → resolver, sem apagar", () => {
    const plano = planejarSincronizacao(
      [{ chave: "estoque_baixo:P", resolvida: false, lida: true }],
      []
    );
    expect(plano.resolver).toEqual(["estoque_baixo:P"]);
    expect(plano.inserir).toHaveLength(0);
  });

  it("condição voltou → reativar a resolvida", () => {
    const plano = planejarSincronizacao(
      [{ chave: "estoque_baixo:P", resolvida: true, lida: true }],
      [alerta]
    );
    expect(plano.reativar).toEqual(["estoque_baixo:P"]);
    expect(plano.inserir).toHaveLength(0);
    expect(plano.resolver).toHaveLength(0);
  });

  it("condição ativa que continua valendo → não faz nada", () => {
    const plano = planejarSincronizacao(
      [{ chave: "estoque_baixo:P", resolvida: false, lida: false }],
      [alerta]
    );
    expect(plano.inserir).toHaveLength(0);
    expect(plano.reativar).toHaveLength(0);
    expect(plano.resolver).toHaveLength(0);
  });

  it("já resolvida e ainda sem condição → não re-resolver", () => {
    const plano = planejarSincronizacao(
      [{ chave: "estoque_baixo:P", resolvida: true, lida: true }],
      []
    );
    expect(plano.resolver).toHaveLength(0);
  });
});
