// ─────────────────────────────────────────────────────────────────────────────
// Regras de pagamento do PDV (fonte única, testável).
// O BACKEND (criar_venda) valida de novo estas mesmas regras — aqui é a camada
// de UX que dá erro amigável antes de enviar. Retorna "" se estiver tudo ok.
// ─────────────────────────────────────────────────────────────────────────────

export type ParamsPagamento = {
  forma: string;
  total: number;
  recebido: number; // dinheiro
  entradaMisto: number;
  restanteMisto: number;
  parcelasCartao: number;
  mesesFiado: number;
  parcelaMinima: number;
  promMax: number;
  maxParcelasCartao: number;
  temCliente: boolean;
};

export function validarPagamento(p: ParamsPagamento): string {
  if (p.forma === "dinheiro") {
    if (p.recebido < p.total) {
      return "Valor recebido é menor que o total da venda.";
    }
  }

  if (p.forma === "cartao") {
    if (p.parcelasCartao < 1 || p.parcelasCartao > p.maxParcelasCartao) {
      return `Parcelas do cartão fora do limite (máximo ${p.maxParcelasCartao}).`;
    }
  }

  if (p.forma === "promissoria") {
    if (!p.temCliente) return "Venda no fiado exige um cliente identificado.";
    if (p.mesesFiado > p.promMax) {
      return `O prazo máximo da promissória é de ${p.promMax} meses.`;
    }
    if (p.mesesFiado < 1) return "Informe as parcelas da promissória.";
    if (p.total / p.mesesFiado < p.parcelaMinima) {
      return "A parcela está abaixo da mínima configurada.";
    }
  }

  if (p.forma === "misto") {
    if (!p.temCliente) return "Venda mista exige um cliente identificado.";
    if (p.entradaMisto <= 0) return "Informe o valor da entrada (pago agora).";
    if (p.restanteMisto <= 0) {
      return "No misto, o valor no fiado deve ser maior que zero.";
    }
    if (p.mesesFiado > p.promMax) {
      return `O prazo máximo do fiado é de ${p.promMax} meses.`;
    }
    if (p.restanteMisto / p.mesesFiado < p.parcelaMinima) {
      return "A parcela do fiado está abaixo da mínima configurada.";
    }
  }

  return "";
}
