import { describe, it, expect } from "vitest";
import {
  rotaBloqueadaPorModulo,
  MODULOS_OPCIONAIS,
  MODULOS_PADRAO,
} from "@/lib/modulos";

const TODOS = [...MODULOS_PADRAO];
const SEM_TATUAGEM = TODOS.filter((m) => m !== "tatuagem");
const SEM_CONDICIONAL = TODOS.filter((m) => m !== "condicional");
const SEM_FIDELIDADE = TODOS.filter((m) => m !== "fidelidade");

describe("rotaBloqueadaPorModulo", () => {
  it("não bloqueia quando o módulo da rota está ativo", () => {
    expect(rotaBloqueadaPorModulo("/dashboard/tatuagem", TODOS)).toBe(false);
    expect(rotaBloqueadaPorModulo("/dashboard/condicional", TODOS)).toBe(false);
    expect(rotaBloqueadaPorModulo("/dashboard/servicos", TODOS)).toBe(false);
    expect(rotaBloqueadaPorModulo("/dashboard/fidelidade", TODOS)).toBe(false);
  });

  it("bloqueia a rota e subrotas do módulo desligado", () => {
    expect(rotaBloqueadaPorModulo("/dashboard/tatuagem", SEM_TATUAGEM)).toBe(true);
    expect(rotaBloqueadaPorModulo("/dashboard/tatuagem/123", SEM_TATUAGEM)).toBe(true);
    expect(rotaBloqueadaPorModulo("/dashboard/condicional", SEM_CONDICIONAL)).toBe(true);
    expect(rotaBloqueadaPorModulo("/dashboard/fidelidade", SEM_FIDELIDADE)).toBe(true);
  });

  it("nunca bloqueia rotas do núcleo", () => {
    for (const rota of [
      "/dashboard",
      "/dashboard/vendas",
      "/dashboard/produtos",
      "/dashboard/clientes",
      "/dashboard/financeiro",
      "/dashboard/promissorias",
      "/dashboard/configuracoes",
    ]) {
      expect(rotaBloqueadaPorModulo(rota, [])).toBe(false);
    }
  });

  it("com nenhum módulo ativo, todas as rotas opcionais ficam bloqueadas", () => {
    for (const m of MODULOS_OPCIONAIS) {
      expect(rotaBloqueadaPorModulo(`/dashboard/${m}`, [])).toBe(true);
    }
  });

  it("não confunde prefixo parcial", () => {
    expect(rotaBloqueadaPorModulo("/dashboard/servicos-extra", [])).toBe(false);
  });
});
