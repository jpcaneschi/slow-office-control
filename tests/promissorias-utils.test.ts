import { describe, it, expect } from "vitest";
import {
  calcularParcelaSugerida,
  validarRegrasPromissoria,
} from "@/lib/promissorias-utils";

describe("calcularParcelaSugerida", () => {
  it("divide o valor pelas parcelas", () => {
    expect(calcularParcelaSugerida(1200, 4)).toBe(300);
  });
  it("retorna 0 com parcelas inválidas", () => {
    expect(calcularParcelaSugerida(1200, 0)).toBe(0);
    expect(calcularParcelaSugerida(1200, -1)).toBe(0);
  });
});

describe("validarRegrasPromissoria", () => {
  it("aceita dentro das regras (<=4 meses, parcela >= 300)", () => {
    expect(validarRegrasPromissoria(1200, 4)).toBe("");
  });
  it("recusa valor inválido", () => {
    expect(validarRegrasPromissoria(0, 2)).toMatch(/valor total/i);
  });
  it("recusa parcelas inválidas", () => {
    expect(validarRegrasPromissoria(1000, 0)).toMatch(/parcelas/i);
  });
  it("recusa prazo maior que 4 meses", () => {
    expect(validarRegrasPromissoria(3000, 5)).toMatch(/4 meses/i);
  });
  it("recusa parcela abaixo de R$ 300", () => {
    expect(validarRegrasPromissoria(400, 4)).toMatch(/300/);
  });
});
