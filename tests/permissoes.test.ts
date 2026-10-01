import { describe, it, expect } from "vitest";
import {
  normalizarPapel,
  rotaInicial,
  podeAcessar,
  podeGerenciarEquipe,
  podeVerCusto,
  podeCancelarVenda,
  podeTrocarItensVenda,
} from "@/lib/permissoes";

describe("normalizarPapel", () => {
  it("mantém papéis válidos", () => {
    expect(normalizarPapel("gerente")).toBe("gerente");
    expect(normalizarPapel("caixa")).toBe("caixa");
    expect(normalizarPapel("financeiro")).toBe("financeiro");
  });
  it("restringe valores desconhecidos ou nulos ao caixa", () => {
    expect(normalizarPapel(null)).toBe("caixa");
    expect(normalizarPapel("qualquer")).toBe("caixa");
  });
});

describe("podeAcessar", () => {
  it("owner acessa tudo", () => {
    expect(podeAcessar("owner", "/dashboard/financeiro")).toBe(true);
    expect(podeAcessar("owner", "/dashboard/configuracoes")).toBe(true);
  });
  it("caixa NÃO acessa financeiro nem configurações", () => {
    expect(podeAcessar("caixa", "/dashboard/financeiro")).toBe(false);
    expect(podeAcessar("caixa", "/dashboard/configuracoes")).toBe(false);
  });
  it("caixa acessa somente vendas", () => {
    expect(podeAcessar("caixa", "/dashboard/vendas")).toBe(true);
    expect(podeAcessar("caixa", "/dashboard/clientes")).toBe(false);
  });
  it("financeiro acessa financeiro mas não vendas", () => {
    expect(podeAcessar("financeiro", "/dashboard/financeiro")).toBe(true);
    expect(podeAcessar("financeiro", "/dashboard/vendas")).toBe(false);
  });
  it("cobre sub-rotas (ex.: detalhe do cliente)", () => {
    expect(podeAcessar("caixa", "/dashboard/clientes/abc-123")).toBe(false);
  });
  it("caixa vai direto ao lançamento sem abrir dashboard", () => {
    expect(podeAcessar("caixa", "/dashboard")).toBe(false);
    expect(podeAcessar("financeiro", "/dashboard")).toBe(true);
  });
});

describe("capacidades", () => {
  it("só o dono gerencia equipe", () => {
    expect(podeGerenciarEquipe("owner")).toBe(true);
    expect(podeGerenciarEquipe("gerente")).toBe(false);
  });
  it("caixa não vê custo; demais veem", () => {
    expect(podeVerCusto("caixa")).toBe(false);
    expect(podeVerCusto("owner")).toBe(true);
    expect(podeVerCusto("gerente")).toBe(true);
    expect(podeVerCusto("financeiro")).toBe(true);
  });
  it("só dono e gerente cancelam venda", () => {
    expect(podeCancelarVenda("owner")).toBe(true);
    expect(podeCancelarVenda("gerente")).toBe(true);
    expect(podeCancelarVenda("caixa")).toBe(false);
    expect(podeCancelarVenda("financeiro")).toBe(false);
  });
  it("só dono e gerente trocam itens de uma venda", () => {
    expect(podeTrocarItensVenda("owner")).toBe(true);
    expect(podeTrocarItensVenda("gerente")).toBe(true);
    expect(podeTrocarItensVenda("caixa")).toBe(false);
    expect(podeTrocarItensVenda("financeiro")).toBe(false);
  });
});

it("caixa tem rota própria e não acessa gestão nem cobrança", () => {
 expect(rotaInicial("caixa")).toBe("/dashboard/vendas");
 expect(rotaInicial("owner")).toBe("/dashboard");
 for (const rota of ["relatorios", "folha", "agenda", "condicional", "promissorias", "fidelidade", "produtos", "funcionarios"]) expect(podeAcessar("caixa", `/dashboard/${rota}`)).toBe(false);
});
