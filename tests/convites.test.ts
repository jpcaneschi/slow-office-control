import { expect, it } from "vitest";
import { linkConvite, mensagemConvite } from "@/lib/convites";
it("convite abre cadastro da equipe, preserva o endereço e usa somente a origem", () => {
  const link = linkConvite("https://loja.example/dashboard/configuracoes", { id: "convite-exemplo", email: "pessoa+caixa@example.com" });
  const url = new URL(link);
  expect(url.pathname).toBe("/login");
  expect(url.searchParams.get("convite")).toBe("convite-exemplo");
  expect(url.searchParams.get("novo")).toBe("1");
  expect(url.searchParams.get("email")).toBe("pessoa+caixa@example.com");
  expect(mensagemConvite(link)).toContain(link);
  expect(mensagemConvite(link)).toContain("escolha Entrar");
});
