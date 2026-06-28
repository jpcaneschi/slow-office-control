export function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function formatarEstoque(estoque: number | null | undefined) {
  if (estoque === null || estoque === undefined) return "0";
  return estoque.toString();
}

export function statusProdutoLabel(status: string | null | undefined) {
  switch (status) {
    case "ativo":
      return "Ativo";
    case "encalhado":
      return "Estoque parado";
    case "inativo":
      return "Inativo";
    default:
      return "Ativo";
  }
}

export function statusProdutoClass(status: string | null | undefined) {
  switch (status) {
    case "ativo":
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
    case "encalhado":
      return "border-yellow-500/20 bg-yellow-500/10 text-yellow-300";
    case "inativo":
      return "border-zinc-500/20 bg-zinc-500/10 text-zinc-300";
    default:
      return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
  }
}