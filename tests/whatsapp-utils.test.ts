import { afterEach, describe, expect, it, vi } from "vitest";
import { compartilharPdf, criarLinkWhatsApp, normalizarTelefoneWhatsApp } from "@/lib/whatsapp-utils";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("links do WhatsApp", () => {
  it("normaliza telefone brasileiro com DDD", () => {
    expect(normalizarTelefoneWhatsApp("(32) 99999-1234")).toBe("5532999991234");
  });
  it("DDD 55 também recebe o código de país", () => {
    expect(normalizarTelefoneWhatsApp("(55) 99999-1234")).toBe("5555999991234");
  });

  it("preserva código do país e codifica a mensagem", () => {
    expect(criarLinkWhatsApp("+55 32 99999-1234", "Olá! 👋")).toBe(
      "https://wa.me/5532999991234?text=Ol%C3%A1!%20%F0%9F%91%8B"
    );
  });

  it("gera um link direto do WhatsApp com quebras de linha", () => {
    expect(criarLinkWhatsApp("32999991234", "Olá!\nSegue o PDF.")).toBe(
      "https://wa.me/5532999991234?text=Ol%C3%A1!%0ASegue%20o%20PDF."
    );
  });

  it("compartilha o PDF pelo menu nativo sem precisar de telefone", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      share,
      canShare: vi.fn().mockReturnValue(true),
    });

    const resultado = await compartilharPdf({
      blob: new Blob(["pdf"], { type: "application/pdf" }),
      nomeArquivo: "comprovante.pdf",
      mensagem: "Segue o comprovante.",
    });

    expect(resultado).toBe("compartilhado");
    expect(share).toHaveBeenCalledWith(expect.objectContaining({
      title: "comprovante.pdf",
      text: "Segue o comprovante.",
      files: [expect.any(File)],
    }));
  });
});
