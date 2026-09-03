import {
  hojeISO,
  parseDataLocal,
  somarDiasISO,
  toISOLocal,
} from "@/lib/datas";

export type ResumoFinanceiroPeriodo = {
  vendas_brutas: number;
  vendas_quantidade: number;
  entradas_vendas: number;
  recebimentos_promissorias: number;
  receita_servicos: number;
  entradas_total: number;
  despesas_operacionais_pagas: number;
  compras_pagas: number;
  folha_vales_pagos: number;
  saidas_total: number;
  resultado_caixa: number;
  despesas_pendentes: number;
};

export type MovimentoFinanceiro = {
  id: string;
  data: string;
  natureza: "venda" | "entrada" | "saida";
  tipo: string;
  descricao: string;
  detalhe: string | null;
  forma_pagamento: string | null;
  valor: number;
  status: string;
};

export type ResumoMes = {
  mes: string;
  entradas_total: number;
  saidas_total: number;
  resultado_caixa: number;
  vendas_brutas: number;
  vendas_quantidade: number;
};

export type FechamentoFinanceiro = ResumoFinanceiroPeriodo & {
  id: string;
  periodo_inicio: string;
  periodo_fim: string;
  tipo: "diario" | "semanal" | "mensal" | "personalizado";
  fechado_em: string;
  created_at: string;
};

export const resumoFinanceiroVazio: ResumoFinanceiroPeriodo = {
  vendas_brutas: 0,
  vendas_quantidade: 0,
  entradas_vendas: 0,
  recebimentos_promissorias: 0,
  receita_servicos: 0,
  entradas_total: 0,
  despesas_operacionais_pagas: 0,
  compras_pagas: 0,
  folha_vales_pagos: 0,
  saidas_total: 0,
  resultado_caixa: 0,
  despesas_pendentes: 0,
};

export type PeriodoPreset =
  | "hoje"
  | "semana"
  | "mes"
  | "mes_anterior"
  | "ano"
  | "personalizado";

export function periodoDoPreset(
  preset: Exclude<PeriodoPreset, "personalizado">,
  hoje = hojeISO()
): { inicio: string; fim: string } {
  if (preset === "hoje") return { inicio: hoje, fim: hoje };

  const data = parseDataLocal(hoje);
  if (preset === "semana") {
    const diaSemana = data.getDay();
    const diasDesdeSegunda = diaSemana === 0 ? 6 : diaSemana - 1;
    return {
      inicio: somarDiasISO(hoje, -diasDesdeSegunda),
      fim: hoje,
    };
  }

  if (preset === "mes") {
    return { inicio: `${hoje.slice(0, 7)}-01`, fim: hoje };
  }

  if (preset === "mes_anterior") {
    data.setDate(1);
    data.setMonth(data.getMonth() - 1);
    const inicio = toISOLocal(data);
    data.setMonth(data.getMonth() + 1);
    data.setDate(0);
    return { inicio, fim: toISOLocal(data) };
  }

  return { inicio: `${hoje.slice(0, 4)}-01-01`, fim: hoje };
}

export function numeroSeguro(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

export function normalizarResumo(
  linha: Partial<Record<keyof ResumoFinanceiroPeriodo, unknown>> | null | undefined
): ResumoFinanceiroPeriodo {
  return {
    vendas_brutas: numeroSeguro(linha?.vendas_brutas),
    vendas_quantidade: numeroSeguro(linha?.vendas_quantidade),
    entradas_vendas: numeroSeguro(linha?.entradas_vendas),
    recebimentos_promissorias: numeroSeguro(linha?.recebimentos_promissorias),
    receita_servicos: numeroSeguro(linha?.receita_servicos),
    entradas_total: numeroSeguro(linha?.entradas_total),
    despesas_operacionais_pagas: numeroSeguro(linha?.despesas_operacionais_pagas),
    compras_pagas: numeroSeguro(linha?.compras_pagas),
    folha_vales_pagos: numeroSeguro(linha?.folha_vales_pagos),
    saidas_total: numeroSeguro(linha?.saidas_total),
    resultado_caixa: numeroSeguro(linha?.resultado_caixa),
    despesas_pendentes: numeroSeguro(linha?.despesas_pendentes),
  };
}

export function nomeFormaPagamento(valor: string | null | undefined): string {
  const nomes: Record<string, string> = {
    pix: "Pix",
    dinheiro: "Dinheiro",
    cartao: "Cartão",
    misto: "Entrada + promissória",
    multiplo: "Pagamento dividido",
    promissoria: "Promissória",
    "não informado": "Não informado",
  };
  return nomes[valor || ""] || valor || "Não informado";
}

export function nomeTipoMovimento(valor: string): string {
  const nomes: Record<string, string> = {
    venda: "Venda",
    recebimento_venda: "Recebimento de venda",
    recebimento_promissoria: "Recebimento de promissória",
    servico: "Serviço",
    compra: "Compra / fornecedor",
    despesa: "Despesa",
    folha: "Folha",
    vale: "Vale / adiantamento",
  };
  return nomes[valor] || valor;
}

export function agruparMovimentosPorDia(movimentos: MovimentoFinanceiro[]) {
  const grupos = new Map<string, MovimentoFinanceiro[]>();
  movimentos.forEach((movimento) => {
    const atuais = grupos.get(movimento.data) || [];
    atuais.push(movimento);
    grupos.set(movimento.data, atuais);
  });
  return Array.from(grupos.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([data, itens]) => ({ data, itens }));
}
