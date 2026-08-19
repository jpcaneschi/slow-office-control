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
  if (status === "cancelado") return 0;
  return Math.max(0, Number(valorTotal || 0) - Number(totalPago || 0));
}