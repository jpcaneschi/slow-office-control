import { describe, expect, it } from "vitest";
import { acessoPermiteEntrada, mensagemStatusAcesso } from "@/lib/acesso-utils";

describe("aprovação manual de acesso", () => {
  it("só libera status aprovado", () => {
    expect(acessoPermiteEntrada("aprovado")).toBe(true);
    expect(acessoPermiteEntrada("pendente")).toBe(false);
    expect(acessoPermiteEntrada("rejeitado")).toBe(false);
    expect(acessoPermiteEntrada(null)).toBe(false);
  });

  it("explica os estados sem revelar detalhes internos", () => {
    expect(mensagemStatusAcesso("pendente")).toContain("aguardando aprovação");
    expect(mensagemStatusAcesso("rejeitado")).toContain("não está liberado");
  });
});
