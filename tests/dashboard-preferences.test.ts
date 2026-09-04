import { describe, expect, it } from "vitest";
import {
  contemValorMonetario,
  normalizarTemaDashboard,
  normalizarVisibilidadeValores,
  serializarVisibilidadeValores,
} from "@/lib/dashboard-preferences";

describe("preferências visuais da dashboard", () => {
  it("aceita apenas os temas claro e escuro conhecidos", () => {
    expect(normalizarTemaDashboard("dark")).toBe("dark");
    expect(normalizarTemaDashboard("light")).toBe("light");
    expect(normalizarTemaDashboard("sistema")).toBe("light");
    expect(normalizarTemaDashboard(null)).toBe("light");
  });

  it("mantém valores visíveis por padrão e reconhece o modo oculto", () => {
    expect(normalizarVisibilidadeValores("hidden")).toBe(false);
    expect(normalizarVisibilidadeValores("visible")).toBe(true);
    expect(normalizarVisibilidadeValores(null)).toBe(true);
  });

  it("serializa a preferência de privacidade sem dados financeiros", () => {
    expect(serializarVisibilidadeValores(true)).toBe("visible");
    expect(serializarVisibilidadeValores(false)).toBe("hidden");
  });

  it("reconhece valores em reais sem confundir datas, quantidades ou percentuais", () => {
    expect(contemValorMonetario("Total: R$ 1.234,56")).toBe(true);
    expect(contemValorMonetario("− R$ 80,00")).toBe(true);
    expect(contemValorMonetario("10 compras · 5% de desconto")).toBe(false);
    expect(contemValorMonetario("04/09/2026")).toBe(false);
  });
});
