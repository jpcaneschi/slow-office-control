import { describe, it, expect } from "vitest";
import {
  parseDataLocal,
  formatDataBR,
  somarDiasISO,
  toISOLocal,
  hojeISO,
  expirado,
  paraInputDate,
  dataValida,
  normalizarDataEntrada,
} from "@/lib/datas";

describe("formatDataBR", () => {
  it("formata data pura SEM voltar 1 dia (bug de fuso)", () => {
    expect(formatDataBR("2026-08-11")).toBe("11/08/2026");
    expect(formatDataBR("1990-01-01")).toBe("01/01/1990");
  });
  it("usa só a parte da data quando vem timestamp", () => {
    expect(formatDataBR("2026-08-11T23:30:00Z")).toBe("11/08/2026");
  });
  it("vazio/nulo vira —", () => {
    expect(formatDataBR(null)).toBe("—");
    expect(formatDataBR("")).toBe("—");
    expect(formatDataBR(undefined)).toBe("—");
  });
});

describe("parseDataLocal", () => {
  it("cria data LOCAL no dia correto (meia-noite local)", () => {
    const d = parseDataLocal("2026-08-11");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7); // agosto = 7
    expect(d.getDate()).toBe(11);
    expect(d.getHours()).toBe(0);
  });
});

describe("somarDiasISO", () => {
  it("soma dias simples", () => {
    expect(somarDiasISO("2026-08-11", 2)).toBe("2026-08-13");
  });
  it("vira o mês", () => {
    expect(somarDiasISO("2026-08-31", 1)).toBe("2026-09-01");
  });
  it("vira o ano", () => {
    expect(somarDiasISO("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("ano bissexto: 28/02/2028 + 1 = 29/02/2028", () => {
    expect(somarDiasISO("2028-02-28", 1)).toBe("2028-02-29");
  });
  it("ano não-bissexto: 28/02/2026 + 1 = 01/03/2026", () => {
    expect(somarDiasISO("2026-02-28", 1)).toBe("2026-03-01");
  });
});

describe("toISOLocal", () => {
  it("formata Date local em YYYY-MM-DD com zero à esquerda", () => {
    expect(toISOLocal(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("hojeISO", () => {
  it("retorna no formato YYYY-MM-DD", () => {
    expect(hojeISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("paraInputDate", () => {
  it("mantém YYYY-MM-DD", () => {
    expect(paraInputDate("1990-01-01")).toBe("1990-01-01");
  });
  it("corta timestamp para a data (corrige input que reabre vazio)", () => {
    expect(paraInputDate("2000-02-29T00:00:00+00:00")).toBe("2000-02-29");
  });
  it("vazio/nulo vira string vazia", () => {
    expect(paraInputDate(null)).toBe("");
    expect(paraInputDate("")).toBe("");
  });
});

describe("dataValida", () => {
  it("aceita datas reais e vazio (opcional)", () => {
    expect(dataValida("1990-01-01")).toBe(true);
    expect(dataValida("2028-02-29")).toBe(true); // bissexto
    expect(dataValida("")).toBe(true);
    expect(dataValida(null)).toBe(true);
  });
  it("rejeita datas impossíveis", () => {
    expect(dataValida("2026-02-30")).toBe(false);
    expect(dataValida("2026-13-01")).toBe(false);
    expect(dataValida("2026-02-29")).toBe(false); // não-bissexto
    expect(dataValida("abc")).toBe(false);
  });
});

describe("normalizarDataEntrada (CSV / edição — round-trip da data)", () => {
  it("data comum ISO passa igual", () => {
    expect(normalizarDataEntrada("2001-03-10")).toBe("2001-03-10");
  });
  it("formato BR DD/MM/AAAA vira ISO", () => {
    expect(normalizarDataEntrada("10/03/2001")).toBe("2001-03-10");
    expect(normalizarDataEntrada("1/3/2001")).toBe("2001-03-01"); // sem zero à esquerda
  });
  it("aceita separadores . e - no formato BR", () => {
    expect(normalizarDataEntrada("10.03.2001")).toBe("2001-03-10");
    expect(normalizarDataEntrada("10-03-2001")).toBe("2001-03-10");
  });
  it("ano bissexto: 29/02/2000 é válido", () => {
    expect(normalizarDataEntrada("29/02/2000")).toBe("2000-02-29");
    expect(normalizarDataEntrada("2000-02-29")).toBe("2000-02-29");
  });
  it("data impossível vira null (não entra em silêncio)", () => {
    expect(normalizarDataEntrada("2026-02-29")).toBeNull(); // não-bissexto
    expect(normalizarDataEntrada("30/02/2026")).toBeNull();
    expect(normalizarDataEntrada("2026-13-01")).toBeNull();
    expect(normalizarDataEntrada("banana")).toBeNull();
  });
  it("campo vazio vira string vazia (opcional)", () => {
    expect(normalizarDataEntrada("")).toBe("");
    expect(normalizarDataEntrada("   ")).toBe("");
    expect(normalizarDataEntrada(null)).toBe("");
    expect(normalizarDataEntrada(undefined)).toBe("");
  });
  it("não desloca fuso — 29/02/2000 não vira 28/02", () => {
    // regressão do bug: BR → ISO puramente textual, sem new Date(UTC)
    expect(normalizarDataEntrada("29/02/2000")).toBe("2000-02-29");
  });
});

describe("expirado (convites)", () => {
  it("sem prazo = nunca expira", () => {
    expect(expirado(null)).toBe(false);
    expect(expirado(undefined)).toBe(false);
  });
  it("data no passado = expirado", () => {
    expect(expirado(new Date(Date.now() - 1000).toISOString())).toBe(true);
  });
  it("data no futuro = válido", () => {
    expect(expirado(new Date(Date.now() + 3600_000).toISOString())).toBe(false);
  });
});
