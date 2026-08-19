import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/billing/webhook/route";

describe("billing webhook", () => {
  const tokenAnterior = process.env.BILLING_WEBHOOK_TOKEN;

  beforeEach(() => {
    process.env.BILLING_WEBHOOK_TOKEN = "segredo-de-teste";
  });

  afterEach(() => {
    if (tokenAnterior === undefined) {
      delete process.env.BILLING_WEBHOOK_TOKEN;
    } else {
      process.env.BILLING_WEBHOOK_TOKEN = tokenAnterior;
    }
  });

  it("rejeita chamadas sem autenticação", async () => {
    const resposta = await POST(
      new NextRequest("https://example.test/api/billing/webhook", {
        method: "POST",
        body: "{}",
      })
    );

    expect(resposta.status).toBe(401);
  });

  it("rejeita JSON inválido", async () => {
    const resposta = await POST(
      new NextRequest("https://example.test/api/billing/webhook", {
        method: "POST",
        headers: { authorization: "Bearer segredo-de-teste" },
        body: "{",
      })
    );

    expect(resposta.status).toBe(400);
    await expect(resposta.json()).resolves.toEqual({ error: "invalid_json" });
  });

  it("limita o corpo real mesmo sem Content-Length", async () => {
    const resposta = await POST(
      new NextRequest("https://example.test/api/billing/webhook", {
        method: "POST",
        headers: { authorization: "Bearer segredo-de-teste" },
        body: "x".repeat(64 * 1024 + 1),
      })
    );

    expect(resposta.status).toBe(413);
    await expect(resposta.json()).resolves.toEqual({ error: "payload_too_large" });
  });
});
