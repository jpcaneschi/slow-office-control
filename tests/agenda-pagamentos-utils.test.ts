import { describe, expect, it } from "vitest";
import {
  distribuirValor,
  gerarDatasPagamentoMes,
  gerarProximosPagamentos,
} from "@/lib/agenda-pagamentos-utils";

describe("agenda de pagamentos", () => {
  it("gera duas datas para quinzenal, como 15 e 30 de outubro", () => {
    const agenda = gerarDatasPagamentoMes(
      {
        frequencia_pagamento: "quinzenal",
        dia_pagamento: 15,
        dia_pagamento_2: 30,
      },
      "2026-10-01"
    );
    expect(agenda.map((item) => item.data_pagamento)).toEqual([
      "2026-10-15",
      "2026-10-30",
    ]);
    expect(agenda.map((item) => item.parcela_numero)).toEqual([1, 2]);
  });

  it("gera todas as sextas-feiras no semanal", () => {
    const agenda = gerarDatasPagamentoMes(
      {
        frequencia_pagamento: "semanal",
        dia_pagamento: 5,
        dia_semana_pagamento: 5,
      },
      "2026-10-01"
    );
    expect(agenda.map((item) => item.data_pagamento)).toEqual([
      "2026-10-02",
      "2026-10-09",
      "2026-10-16",
      "2026-10-23",
      "2026-10-30",
    ]);
  });

  it("ajusta pagamento mensal no fim de fevereiro", () => {
    const agenda = gerarDatasPagamentoMes(
      { frequencia_pagamento: "mensal", dia_pagamento: 31 },
      "2027-02-01"
    );
    expect(agenda[0].data_pagamento).toBe("2027-02-28");
  });

  it("lista próximos pagamentos atravessando competências", () => {
    const agenda = gerarProximosPagamentos(
      {
        frequencia_pagamento: "quinzenal",
        dia_pagamento: 15,
        dia_pagamento_2: 30,
      },
      "2026-10-20",
      3
    );
    expect(agenda.map((item) => item.data_pagamento)).toEqual([
      "2026-10-30",
      "2026-11-15",
      "2026-11-30",
    ]);
  });
});

describe("divisão de valores", () => {
  it("fecha os centavos exatamente", () => {
    const partes = distribuirValor(100, 3);
    expect(partes).toEqual([33.33, 33.33, 33.34]);
    expect(partes.reduce((s, v) => s + v, 0)).toBeCloseTo(100, 2);
  });
});
