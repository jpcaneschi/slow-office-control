import { describe, expect, it } from "vitest";
import { proximoDiaUtil } from "@/lib/dias-uteis";
import { gerarDatasPagamentoMes, gerarProximosPagamentos } from "@/lib/agenda-pagamentos-utils";

describe("agenda no próximo dia útil", () => {
  it("leva 10/10/2026, sábado seguido do feriado nacional, para 13/10", () => {
    expect(proximoDiaUtil("2026-10-10")).toBe("2026-10-13");
  });
  it("respeita feriados locais, virada de ano e dias já úteis", () => {
    expect(proximoDiaUtil("2026-10-07", ["2026-10-07"])).toBe("2026-10-08");
    expect(proximoDiaUtil("2027-01-01")).toBe("2027-01-04");
    expect(proximoDiaUtil("2026-10-09")).toBe("2026-10-09");
  });
  it("mantém a competência de origem ao atravessar o mês", () => {
    expect(gerarDatasPagamentoMes({ frequencia_pagamento: "mensal", dia_pagamento: 31, ajustar_dia_util: true }, "2026-10-01")[0]).toMatchObject({ competencia: "2026-10-01", data_pagamento: "2026-11-03" });
    expect(gerarProximosPagamentos({ frequencia_pagamento: "mensal", dia_pagamento: 31, ajustar_dia_util: true }, "2026-11-01", 1)[0]).toMatchObject({ competencia: "2026-10-01", data_pagamento: "2026-11-03" });
  });
  it("preserva a agenda antiga quando não habilitado e respeita o primeiro mês", () => {
    const config = { frequencia_pagamento: "mensal" as const, dia_pagamento: 10, primeira_competencia_pagamento: "2026-10-01" };
    expect(gerarDatasPagamentoMes(config, "2026-09-01")).toEqual([]);
    expect(gerarDatasPagamentoMes(config, "2026-10-01")[0].data_pagamento).toBe("2026-10-10");
  });
});
