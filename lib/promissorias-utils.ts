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

export function validarRegrasPromissoria(valorTotal: number, parcelas: number) {
  if (!valorTotal || valorTotal <= 0) {
    return "Informe um valor total válido.";
  }

  if (!parcelas || parcelas <= 0) {
    return "Informe uma quantidade de parcelas válida.";
  }

  if (parcelas > 4) {
    return "O prazo máximo para dividir é de 4 meses.";
  }

  const valorParcela = calcularParcelaSugerida(valorTotal, parcelas);

  if (valorParcela < 300) {
    return "A parcela mínima deve ser de R$ 300 por mês.";
  }

  return "";
}