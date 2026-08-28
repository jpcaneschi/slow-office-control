import { describe, expect, it } from "vitest";
import {
  calcularEscalaGrafico,
  formatarEixoBrl,
} from "@/lib/grafico-vendas-utils";

describe("calcularEscalaGrafico", () => {
  it("mantém poucas marcações legíveis no eixo monetário", () => {
    expect(calcularEscalaGrafico(2_000)).toEqual({
      max: 2_000,
      ticks: [0, 500, 1_000, 1_500, 2_000],
    });
  });

  it("usa uma escala previsível quando não há valor", () => {
    expect(calcularEscalaGrafico(0)).toEqual({
      max: 100,
      ticks: [0, 25, 50, 75, 100],
    });
  });
});

describe("formatarEixoBrl", () => {
  it("compacta milhares e milhões em uma única linha", () => {
    expect(formatarEixoBrl(500)).toBe("R$ 500");
    expect(formatarEixoBrl(2_000)).toBe("R$ 2 mil");
    expect(formatarEixoBrl(1_500_000)).toBe("R$ 1,5 mi");
  });
});
