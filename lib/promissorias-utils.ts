export function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function calcularParcelaSugerida(valorTotal: number, parcelas: number) {
  if (!parcelas || parcelas <= 0) return 0;
  return valorTotal / parcelas;
}

export type ParcelaPromissoria = {
  numero: number;
  vencimento: string;
  valor: number;
};

/**
 * Soma meses preservando o dia combinado. Quando o mês não possui esse dia
 * (ex.: 31/01), usa o último dia válido do mês, sem conversão de fuso horário.
 */
export function adicionarMesesDataCalendario(dataISO: string, meses: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataISO);
  if (!match) return "";

  const ano = Number(match[1]);
  const mes = Number(match[2]);
  const dia = Number(match[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return "";

  const primeiroDoDestino = new Date(Date.UTC(ano, mes - 1 + meses, 1));
  const anoDestino = primeiroDoDestino.getUTCFullYear();
  const mesDestino = primeiroDoDestino.getUTCMonth();
  const ultimoDia = new Date(Date.UTC(anoDestino, mesDestino + 1, 0)).getUTCDate();
  const diaDestino = Math.min(dia, ultimoDia);

  return `${anoDestino}-${String(mesDestino + 1).padStart(2, "0")}-${String(
    diaDestino
  ).padStart(2, "0")}`;
}

/** Monta o cronograma mensal e distribui os centavos sem alterar o total. */
export function gerarCronogramaPromissoria(
  valorTotal: number,
  quantidadeParcelas: number,
  primeiraParcela: string
): ParcelaPromissoria[] {
  const totalCentavos = Math.round(Number(valorTotal || 0) * 100);
  const quantidade = Math.trunc(Number(quantidadeParcelas || 0));
  if (totalCentavos <= 0 || quantidade <= 0 || !adicionarMesesDataCalendario(primeiraParcela, 0)) {
    return [];
  }

  const base = Math.floor(totalCentavos / quantidade);
  const centavosRestantes = totalCentavos - base * quantidade;

  return Array.from({ length: quantidade }, (_, indice) => ({
    numero: indice + 1,
    vencimento: adicionarMesesDataCalendario(primeiraParcela, indice),
    valor: (base + (indice < centavosRestantes ? 1 : 0)) / 100,
  }));
}

export function obterCorStatus(status: string) {
  switch (status) {
    case "em_aberto":
      return "bg-blue-500/10 text-blue-300 border-blue-500/20";
    case "pago":
      return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
    case "atrasado":
      return "bg-red-500/10 text-red-300 border-red-500/20";
    case "cancelado":
      return "bg-zinc-500/10 text-zinc-300 border-zinc-500/20";
    default:
      return "bg-zinc-500/10 text-zinc-300 border-zinc-500/20";
  }
}

export type ConfigPromissoria = {
  /** Prazo máximo em meses (configuracoes.promissoria_prazo_meses). */
  prazoMaxMeses: number;
  /** Parcela mínima em R$ (configuracoes.parcela_minima). */
  parcelaMinima: number;
};

/**
 * Valida a promissória usando a CONFIG da loja (fonte única), não valores fixos.
 * O backend deve validar de novo — aqui é a UX amigável.
 */
export function validarRegrasPromissoria(
  valorTotal: number,
  parcelas: number,
  config: ConfigPromissoria
) {
  if (!valorTotal || valorTotal <= 0) {
    return "Informe um valor total válido.";
  }

  if (!parcelas || parcelas <= 0) {
    return "Informe uma quantidade de parcelas válida.";
  }

  if (parcelas > config.prazoMaxMeses) {
    return `O prazo máximo para dividir é de ${config.prazoMaxMeses} ${
      config.prazoMaxMeses === 1 ? "mês" : "meses"
    }.`;
  }

  const valorParcela = calcularParcelaSugerida(valorTotal, parcelas);

  if (config.parcelaMinima > 0 && valorParcela < config.parcelaMinima) {
    return `A parcela mínima deve ser de ${formatCurrency(
      config.parcelaMinima
    )} por mês.`;
  }

  return "";
}

/**
 * Saldo devedor de uma promissória (fonte única). Cancelada = 0 (sai dos
 * saldos/contas a receber). Nunca negativo.
 */
export function calcularSaldoPromissoria(
  valorTotal: number,
  totalPago: number,
  status: string
): number {
  if (status === "cancelado" || status === "pago") return 0;
  return Math.max(0, Number(valorTotal || 0) - Number(totalPago || 0));
}

export type PagamentoPromissoria = {
  promissoria_id: string;
  valor: number | null;
};

export type PromissoriaComSaldo = {
  id: string;
  valor_total: number | null;
  status: string;
};

/** Soma os pagamentos por promissória para todos os painéis usarem a mesma fonte. */
export function agregarPagamentosPromissoria(
  pagamentos: PagamentoPromissoria[]
): Record<string, number> {
  const totais: Record<string, number> = {};
  for (const pagamento of pagamentos) {
    totais[pagamento.promissoria_id] =
      (totais[pagamento.promissoria_id] || 0) + Number(pagamento.valor || 0);
  }
  return totais;
}

/** Saldo total real: desconta pagamentos e zera títulos pagos/cancelados. */
export function calcularSaldoTotalPromissorias(
  promissorias: PromissoriaComSaldo[],
  pagoPorPromissoria: Record<string, number>
): number {
  return promissorias.reduce(
    (total, promissoria) =>
      total +
      calcularSaldoPromissoria(
        Number(promissoria.valor_total || 0),
        pagoPorPromissoria[promissoria.id] || 0,
        promissoria.status
      ),
    0
  );
}
