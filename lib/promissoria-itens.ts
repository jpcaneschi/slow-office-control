export type TipoDescontoPromissoria = "valor" | "percentual";

export type ItemPromissoriaCalculavel = {
  quantidade: number;
  precoOriginal: number;
  descontoTipo: TipoDescontoPromissoria;
  descontoInput: number;
};

export type CalculoItemPromissoria = {
  quantidade: number;
  precoOriginal: number;
  descontoUnitario: number;
  descontoPercentual: number;
  precoUnitarioFinal: number;
  subtotalBruto: number;
  descontoTotal: number;
  total: number;
};

const centavos = (valor: number) => Math.round((valor + Number.EPSILON) * 100) / 100;

export function calcularItemPromissoria(
  item: ItemPromissoriaCalculavel
): CalculoItemPromissoria {
  const quantidade = Math.max(1, Math.trunc(Number(item.quantidade) || 1));
  const precoOriginal = centavos(Math.max(0, Number(item.precoOriginal) || 0));
  const descontoInput = Math.max(0, Number(item.descontoInput) || 0);

  const descontoPercentual =
    item.descontoTipo === "percentual"
      ? Math.min(100, descontoInput)
      : precoOriginal > 0
        ? Math.min(100, (descontoInput / precoOriginal) * 100)
        : 0;
  const descontoUnitario = centavos(
    Math.min(
      precoOriginal,
      item.descontoTipo === "percentual"
        ? (precoOriginal * descontoPercentual) / 100
        : descontoInput
    )
  );
  const precoUnitarioFinal = centavos(precoOriginal - descontoUnitario);
  const subtotalBruto = centavos(precoOriginal * quantidade);
  const descontoTotal = centavos(descontoUnitario * quantidade);

  return {
    quantidade,
    precoOriginal,
    descontoUnitario,
    descontoPercentual,
    precoUnitarioFinal,
    subtotalBruto,
    descontoTotal,
    total: centavos(precoUnitarioFinal * quantidade),
  };
}

export function validarItemPromissoria(item: ItemPromissoriaCalculavel) {
  if (!Number.isInteger(Number(item.quantidade)) || Number(item.quantidade) < 1) {
    return "Informe uma quantidade inteira maior que zero.";
  }
  if (!Number.isFinite(Number(item.precoOriginal)) || Number(item.precoOriginal) <= 0) {
    return "Informe um valor unitário maior que zero.";
  }
  if (!Number.isFinite(Number(item.descontoInput)) || Number(item.descontoInput) < 0) {
    return "Informe um desconto válido.";
  }
  if (item.descontoTipo === "percentual" && Number(item.descontoInput) > 100) {
    return "O desconto percentual não pode ultrapassar 100%.";
  }
  if (
    item.descontoTipo === "valor" &&
    Number(item.descontoInput) > Number(item.precoOriginal)
  ) {
    return "O desconto em reais não pode ser maior que o valor unitário.";
  }
  return "";
}

export function calcularTotaisItensPromissoria(
  itens: ItemPromissoriaCalculavel[]
) {
  return itens.reduce(
    (totais, item) => {
      const calculo = calcularItemPromissoria(item);
      totais.subtotalBruto = centavos(totais.subtotalBruto + calculo.subtotalBruto);
      totais.descontoTotal = centavos(totais.descontoTotal + calculo.descontoTotal);
      totais.total = centavos(totais.total + calculo.total);
      return totais;
    },
    { subtotalBruto: 0, descontoTotal: 0, total: 0 }
  );
}
