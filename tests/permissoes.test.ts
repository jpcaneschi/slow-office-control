import { describe, it, expect } from "vitest";
import {
  normalizarPapel,
  podeAcessar,
  podeGerenciarEquipe,
  podeVerCusto,
  podeCancelarVenda,
} from "@/lib/permissoes";

describe("normalizarPapel", () => {
  it("mantém papéis válidos", () => {
    expect(normalizarPapel("gerente")).toBe("gerente");
    expect(normalizarPapel("caixa")).toBe("caixa");
    expect(normalizarPapel("financeiro")).toBe("financeiro");
  });
  it("cai para owner em valores desconhecidos ou nulos", () => {
    expect(normalizarPapel(null)).toBe("owner");
    expect(normalizarPapel("qualquer")).toBe("owner");
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
  it("caixa acessa vendas e clientes", () => {
    expect(podeAcessar("caixa", "/dashboard/vendas")).toBe(true);
    expect(podeAcessar("caixa", "/dashboard/clientes")).toBe(true);
  });
  it("financeiro acessa financeiro mas não vendas", () => {
    expect(podeAcessar("financeiro", "/dashboard/financeiro")).toBe(true);
    expect(podeAcessar("financeiro", "/dashboard/vendas")).toBe(false);
  });
  it("cobre sub-rotas (ex.: detalhe do cliente)", () => {
    expect(podeAcessar("caixa", "/dashboard/clientes/abc-123")).toBe(true);
  });
  it("/dashboard exato é liberado para todos os papéis", () => {
    expect(podeAcessar("caixa", "/dashboard")).toBe(true);
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
});
