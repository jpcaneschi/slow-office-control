import { describe, expect, it } from "vitest";
import { criarLinkWhatsApp, normalizarTelefoneWhatsApp } from "@/lib/whatsapp-utils";

describe("links do WhatsApp", () => {
  it("normaliza telefone brasileiro com DDD", () => {
    expect(normalizarTelefoneWhatsApp("(32) 99999-1234")).toBe("5532999991234");
  });

  it("preserva código do país e codifica a mensagem", () => {
    expect(criarLinkWhatsApp("+55 32 99999-1234", "Olá! 👋")).toBe(
      "https://wa.me/5532999991234?text=Ol%C3%A1!%20%F0%9F%91%8B"
    );
  });
});
