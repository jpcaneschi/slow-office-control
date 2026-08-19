import { describe, expect, it } from "vitest";
import { assinaturaPermiteAcesso } from "@/lib/assinaturas-utils";

const agora = new Date("2026-08-18T12:00:00.000Z");

describe("assinaturaPermiteAcesso", () => {
  it("libera plano ativo sem vencimento", () => {
    expect(
      assinaturaPermiteAcesso(
        { status: "ativa", provider: "manual", current_period_end: null },
        agora
      )
    ).toBe(true);
  });

  it("libera trial vigente e bloqueia trial vencido", () => {
    expect(
      assinaturaPermiteAcesso(
        {
          status: "trial",
          provider: "trial",
          current_period_end: "2026-08-19T12:00:00.000Z",
        },
        agora
      )
    ).toBe(true);
    expect(
      assinaturaPermiteAcesso(
        {
          status: "trial",
          provider: "trial",
          current_period_end: "2026-08-17T12:00:00.000Z",
        },
        agora
      )
    ).toBe(false);
  });

  it("bloqueia assinatura cancelada ou atrasada do checkout", () => {
    expect(
      assinaturaPermiteAcesso(
        { status: "cancelada", provider: "checkout", current_period_end: null },
        agora
      )
    ).toBe(false);
    expect(
      assinaturaPermiteAcesso(
        { status: "atrasada", provider: "checkout", current_period_end: null },
        agora
      )
    ).toBe(false);
  });

  it("preserva linha legada e deploy sem linha", () => {
    expect(
      assinaturaPermiteAcesso(
        { status: "inativa", provider: null, current_period_end: null },
        agora
      )
    ).toBe(true);
    expect(assinaturaPermiteAcesso(null, agora)).toBe(true);
  });
});
