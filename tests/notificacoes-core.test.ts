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
    despesas: [],
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

  it("produto de grade com estoque agregado 2 GERA alerta crítico", () => {
    const dados = dadosVazios();
    dados.produtos = [
      { id: "P", nome: "Meia", estoque: 0, status: "ativo", tem_variacoes: true },
    ];
    dados.variacoes = [
      { produto_id: "P", estoque: 1 },
      { produto_id: "P", estoque: 1 },
    ];
    const ativas = calcularAtivas(dados, HOJE, EM7);
    const alerta = ativas.find((a) => a.chave === "estoque_baixo:P");
    expect(alerta).toBeDefined();
    expect(alerta?.descricao).toContain("2 em estoque");
  });

  it("produto simples com estoque 3 NÃO aparece como crítico", () => {
    const dados = dadosVazios();
    dados.produtos = [
      { id: "S", nome: "Boné", estoque: 3, status: "ativo", tem_variacoes: false },
    ];
    const ativas = calcularAtivas(dados, HOJE, EM7);
    expect(ativas).toHaveLength(0);
  });

  it("produto simples com estoque 2 gera alerta", () => {
    const dados = dadosVazios();
    dados.produtos = [
      { id: "S", nome: "Boné", estoque: 2, status: "ativo", tem_variacoes: false },
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

describe("calcularAtivas — fornecedor", () => {
  it("boleto pendente vencendo em até 3 dias gera alerta", () => {
    const dados = dadosVazios();
    dados.despesas = [
      {
        id: "B1",
        status: "pendente",
        data_vencimento: "2026-08-20",
        fornecedor: "Barra",
        descricao: "Boleto 1/3",
        valor: 1200,
      },
    ];
    const ativas = calcularAtivas(dados, HOJE, EM7);
    const alerta = ativas.find((a) => a.chave === "fornecedor_vencer:B1");
    expect(alerta?.titulo).toContain("a vencer");
    expect(alerta?.descricao).toContain("Barra");
    expect(alerta?.descricao).toContain("1.200,00");
  });

  it("boleto vencido gera alerta de atraso", () => {
    const dados = dadosVazios();
    dados.despesas = [
      {
        id: "B2",
        status: "pendente",
        data_vencimento: "2026-08-17",
        fornecedor: "Nike",
        descricao: "Boleto",
        valor: 500,
      },
    ];
    const ativas = calcularAtivas(dados, HOJE, EM7);
    expect(ativas.map((a) => a.chave)).toContain("fornecedor_vencido:B2");
  });

  it("boleto já pago não gera alerta", () => {
    const dados = dadosVazios();
    dados.despesas = [
      {
        id: "B3",
        status: "pago",
        data_vencimento: "2026-08-19",
        fornecedor: "Barra",
        descricao: "Boleto",
        valor: 800,
      },
    ];
    expect(calcularAtivas(dados, HOJE, EM7)).toHaveLength(0);
  });

  it("despesa comum sem fornecedor não vira alerta de fornecedor", () => {
    const dados = dadosVazios();
    dados.despesas = [
      {
        id: "D1",
        status: "pendente",
        data_vencimento: "2026-08-19",
        fornecedor: null,
        descricao: "Internet",
        valor: 100,
      },
    ];
    expect(calcularAtivas(dados, HOJE, EM7)).toHaveLength(0);
  });
});

describe("planejarSincronizacao — estados ativa/resolvida", () => {
  const alerta: NovaNotificacao = {
    chave: "estoque_baixo:P",
    tipo: "estoque",
    titulo: "Estoque crítico",
    descricao: "x",
    href: "/dashboard/produtos/P",
  };

  it("condição nova → inserir", () => {
    const plano = planejarSincronizacao([], [alerta]);
    expect(plano.inserir).toHaveLength(1);
    expect(plano.atualizar).toHaveLength(0);
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
    expect(plano.atualizar).toHaveLength(0);
  });

  it("condição voltou → reativar a resolvida", () => {
    const plano = planejarSincronizacao(
      [{ chave: "estoque_baixo:P", resolvida: true, lida: true }],
      [alerta]
    );
    expect(plano.reativar).toEqual(["estoque_baixo:P"]);
    expect(plano.inserir).toHaveLength(0);
    expect(plano.atualizar).toHaveLength(0);
    expect(plano.resolver).toHaveLength(0);
  });

  it("condição ativa que continua valendo → não faz nada", () => {
    const plano = planejarSincronizacao(
      [
        {
          chave: "estoque_baixo:P",
          resolvida: false,
          lida: false,
          tipo: alerta.tipo,
          titulo: alerta.titulo,
          descricao: alerta.descricao,
          href: alerta.href,
        },
      ],
      [alerta]
    );
    expect(plano.inserir).toHaveLength(0);
    expect(plano.atualizar).toHaveLength(0);
    expect(plano.reativar).toHaveLength(0);
    expect(plano.resolver).toHaveLength(0);
  });

  it("condição continua, mas o valor mudou → atualiza o texto", () => {
    const plano = planejarSincronizacao(
      [
        {
          chave: "estoque_baixo:P",
          resolvida: false,
          lida: false,
          tipo: alerta.tipo,
          titulo: alerta.titulo,
          descricao: "Produto está com 0 em estoque.",
          href: alerta.href,
        },
      ],
      [{ ...alerta, descricao: "Produto está com 2 em estoque." }]
    );
    expect(plano.atualizar).toEqual([
      { ...alerta, descricao: "Produto está com 2 em estoque." },
    ]);
  });

  it("já resolvida e ainda sem condição → não re-resolver", () => {
    const plano = planejarSincronizacao(
      [{ chave: "estoque_baixo:P", resolvida: true, lida: true }],
      []
    );
    expect(plano.resolver).toHaveLength(0);
  });
});
