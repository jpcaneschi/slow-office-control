export function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function calcularDescontoPix(total: number, percentual: number) {
  return total * (percentual / 100);
}

export function calcularTotal(
  subtotal: number,
  desconto: number,
  descontoPix: number
) {
  const total = subtotal - desconto - descontoPix;
  return total < 0 ? 0 : total;
}

export function obterCorFormaPagamento(forma: string) {
  switch (forma) {
    case "pix":
      return "bg-blue-500/10 text-blue-300 border-blue-500/20";
    case "dinheiro":
      return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
    case "cartao":
      return "bg-purple-500/10 text-purple-300 border-purple-500/20";
    case "promissoria":
      return "bg-yellow-500/10 text-yellow-300 border-yellow-500/20";
    case "misto":
      return "bg-zinc-500/10 text-zinc-300 border-zinc-500/20";
    default:
      return "bg-zinc-500/10 text-zinc-300 border-zinc-500/20";
  }
}