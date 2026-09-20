import { describe, it, expect } from "vitest";
import { validarPagamento, type ParamsPagamento } from "@/lib/pdv-regras";

const base: ParamsPagamento = {
  forma: "pix",
  total: 100,
  recebido: 0,
  entradaMisto: 0,
  restanteMisto: 0,
  parcelasCartao: 1,
  mesesFiado: 1,
  parcelaMinima: 300,
  promMax: 4,
  maxParcelasCartao: 6,
  temCliente: true,
};

describe("validarPagamento — dinheiro", () => {
  it("aceita recebido >= total", () => {
    expect(validarPagamento({ ...base, forma: "dinheiro", total: 100, recebido: 100 })).toBe("");
    expect(validarPagamento({ ...base, forma: "dinheiro", total: 100, recebido: 150 })).toBe("");
  });
  it("rejeita recebido < total", () => {
    expect(
      validarPagamento({ ...base, forma: "dinheiro", total: 100, recebido: 80 })
    ).toMatch(/menor que o total/i);
  });
});

describe("validarPagamento — cartão", () => {
  it("aceita dentro do máximo", () => {
    expect(validarPagamento({ ...base, forma: "cartao", parcelasCartao: 6, maxParcelasCartao: 6 })).toBe("");
  });
  it("rejeita acima do máximo da org", () => {
    expect(
      validarPagamento({ ...base, forma: "cartao", parcelasCartao: 10, maxParcelasCartao: 6 })
    ).toMatch(/limite/i);
  });
});

describe("validarPagamento — promissória", () => {
  it("rejeita sem cliente", () => {
    expect(
      validarPagamento({ ...base, forma: "promissoria", temCliente: false })
    ).toMatch(/cliente/i);
  });
  it("aceita qualquer valor positivo de parcela", () => {
    expect(
      validarPagamento({ ...base, forma: "promissoria", total: 110, mesesFiado: 1, parcelaMinima: 300 })
    ).toBe("");
  });
  it("aceita quantidade de parcelas definida pelo cliente", () => {
    expect(
      validarPagamento({ ...base, forma: "promissoria", total: 4000, mesesFiado: 5, promMax: 4 })
    ).toBe("");
  });
  it("aceita dentro das regras", () => {
    expect(
      validarPagamento({ ...base, forma: "promissoria", total: 1200, mesesFiado: 4, parcelaMinima: 300, promMax: 4 })
    ).toBe("");
  });
});

describe("validarPagamento — misto", () => {
  it("aceita fiado sem parcela mínima", () => {
    expect(
      validarPagamento({ ...base, forma: "misto", total: 260, entradaMisto: 200, restanteMisto: 60, mesesFiado: 1, parcelaMinima: 300 })
    ).toBe("");
  });
  it("rejeita restante <= 0", () => {
    expect(
      validarPagamento({ ...base, forma: "misto", total: 200, entradaMisto: 200, restanteMisto: 0 })
    ).toMatch(/maior que zero/i);
  });
  it("aceita composição válida (entrada 200 + fiado 400 em 1x, mín 300)", () => {
    expect(
      validarPagamento({ ...base, forma: "misto", total: 600, entradaMisto: 200, restanteMisto: 400, mesesFiado: 1, parcelaMinima: 300 })
    ).toBe("");
  });
});
