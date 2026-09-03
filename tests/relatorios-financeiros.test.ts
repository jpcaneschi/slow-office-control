import { describe, expect, it } from "vitest";
import {
  agruparMovimentosPorDia,
  normalizarResumo,
  periodoDoPreset,
  type MovimentoFinanceiro,
} from "@/lib/relatorios-financeiros";

describe("relatórios financeiros", () => {
  it("calcula o mês anterior completo, inclusive fevereiro bissexto", () => {
    expect(periodoDoPreset("mes_anterior", "2028-03-15")).toEqual({
      inicio: "2028-02-01",
      fim: "2028-02-29",
    });
    expect(periodoDoPreset("mes_anterior", "2026-09-02")).toEqual({
      inicio: "2026-08-01",
      fim: "2026-08-31",
    });
  });

  it("usa segunda-feira como início da semana", () => {
    expect(periodoDoPreset("semana", "2026-09-02")).toEqual({
      inicio: "2026-08-31",
      fim: "2026-09-02",
    });
  });

  it("normaliza numerais vindos do Postgres", () => {
    const resumo = normalizarResumo({
      vendas_brutas: "12662.50",
      vendas_quantidade: "42",
      resultado_caixa: "595.10",
    });
    expect(resumo.vendas_brutas).toBe(12662.5);
    expect(resumo.vendas_quantidade).toBe(42);
    expect(resumo.resultado_caixa).toBe(595.1);
    expect(resumo.saidas_total).toBe(0);
  });

  it("agrupa por dia sem misturar naturezas e ordena do mais recente", () => {
    const base = {
      tipo: "venda",
      descricao: "Teste",
      detalhe: null,
      forma_pagamento: "pix",
      valor: 10,
      status: "recebido",
    };
    const movimentos: MovimentoFinanceiro[] = [
      { ...base, id: "1", data: "2026-08-30", natureza: "entrada" },
      { ...base, id: "2", data: "2026-08-31", natureza: "venda" },
      { ...base, id: "3", data: "2026-08-30", natureza: "saida" },
    ];
    const grupos = agruparMovimentosPorDia(movimentos);
    expect(grupos.map((grupo) => grupo.data)).toEqual(["2026-08-31", "2026-08-30"]);
    expect(grupos[1].itens).toHaveLength(2);
  });
});
