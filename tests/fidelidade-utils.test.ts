import { describe, expect, it } from "vitest";
import { cupomExpirado, mensagemCuponsPosVenda, statusVisualCupom } from "@/lib/fidelidade-utils";

describe("fidelidade pós-venda", () => {
  it("identifica cupom expirado pela validade", () => {
    expect(cupomExpirado("2026-08-20", new Date("2026-08-21T10:00:00"))).toBe(true);
    expect(cupomExpirado("2026-08-21", new Date("2026-08-21T10:00:00"))).toBe(false);
  });

  it("prioriza status usado sobre expiração", () => {
    expect(statusVisualCupom({ status: "usado", validade: "2026-01-01" }, new Date("2026-08-25"))).toBe("usado");
  });

  it("monta mensagem com quantidade, códigos e validade", () => {
    const mensagem = mensagemCuponsPosVenda({
      nomeCliente: "Ana",
      nomeLoja: "Loja Demo",
      cupons: [
        { codigo: "NEXO-ABC12345", validade: "2026-09-01" },
        { codigo: "NEXO-DEF67890", validade: "2026-09-01" },
      ],
    });
    expect(mensagem).toContain("Ana");
    expect(mensagem).toContain("2 cupons");
    expect(mensagem).toContain("NEXO-ABC12345");
    expect(mensagem).toContain("01/09/2026");
  });
});
