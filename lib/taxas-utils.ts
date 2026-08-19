// ─────────────────────────────────────────────────────────────────────────────
// Motor de cálculo de taxa de cartão / snapshot financeiro da venda.
// Fonte única, testável. O BACKEND (criar_venda) calcula o mesmo snapshot — aqui
// é a camada de UX (PDV mostra taxa/líquido antes de enviar).
//
// Definições (mesmo vocabulário do plano):
//   valorBruto    = total que o cliente paga (após descontos)
//   taxaValor     = R$ retido pela adquirente = bruto*%/100 (+ taxa fixa opcional)
//   valorLiquido  = bruto − taxaValor  (o que a loja recebe)
//   custoTotal    = COGS (custo dos produtos vendidos)
//   margem        = valorLiquido − custoTotal
// ─────────────────────────────────────────────────────────────────────────────

/** Arredonda para 2 casas (centavos), evitando erro de ponto flutuante. */
export function arredondar2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type EntradaTaxa = {
  valorBruto: number;
  custoTotal?: number;
  taxaPercentual: number;
  /** Taxa fixa opcional em R$ (ex.: R$0,10 por transação). */
  taxaFixa?: number;
};

export type SnapshotVenda = {
  valorBruto: number;
  taxaPercentual: number;
  taxaValor: number;
  valorLiquido: number;
  custoTotal: number;
  margem: number;
};

/** Calcula o snapshot financeiro de uma venda (bruto → taxa, líquido, margem). */
export function calcularSnapshotVenda(e: EntradaTaxa): SnapshotVenda {
  const bruto = Math.max(0, Number(e.valorBruto) || 0);
  const pct = Math.max(0, Number(e.taxaPercentual) || 0);
  const fixa = Math.max(0, Number(e.taxaFixa) || 0);
  const custo = Math.max(0, Number(e.custoTotal) || 0);

  const taxaValor = arredondar2((bruto * pct) / 100 + fixa);
  const liquido = arredondar2(bruto - taxaValor);
  const margem = arredondar2(liquido - custo);

  return {
    valorBruto: arredondar2(bruto),
    taxaPercentual: pct,
    taxaValor,
    valorLiquido: liquido,
    custoTotal: arredondar2(custo),
    margem,
  };
}

/**
 * Resultado financeiro do período com a taxa contada como despesa.
 * É a fórmula que o Financeiro usa: resultado = receita − COGS − taxas − despesas.
 * (a taxa NÃO pode ser esquecida — era a raiz do R$349 em vez de R$339.)
 */
export function calcularResultado(p: {
  receita: number;
  custoProdutos: number;
  taxasCartao: number;
  outrasDespesas: number;
}): number {
  return arredondar2(
    (Number(p.receita) || 0) -
      (Number(p.custoProdutos) || 0) -
      (Number(p.taxasCartao) || 0) -
      (Number(p.outrasDespesas) || 0)
  );
}

/** Encontra a taxa (%) aplicável a partir das regras de taxas_cartao. */
export type RegraTaxa = {
  id: string;
  tipo: string; // 'debito' | 'credito'
  bandeira: string | null;
  parcelas_min: number;
  parcelas_max: number;
  taxa_percentual: number;
  taxa_fixa: number;
  ativo: boolean;
  permite_ajuste_manual_pdv: boolean;
};

export function encontrarRegraTaxa(
  regras: RegraTaxa[],
  criterio: { tipo: string; parcelas: number; bandeira?: string | null }
): RegraTaxa | null {
  const candidatas = regras.filter(
    (r) =>
      r.ativo &&
      r.tipo === criterio.tipo &&
      criterio.parcelas >= r.parcelas_min &&
      criterio.parcelas <= r.parcelas_max &&
      (r.bandeira == null ||
        r.bandeira === "" ||
        r.bandeira === (criterio.bandeira ?? null))
  );
  if (candidatas.length === 0) return null;
  // Regra mais específica (com bandeira) ganha da genérica (bandeira nula).
  candidatas.sort((a, b) => {
    const espA = a.bandeira ? 1 : 0;
    const espB = b.bandeira ? 1 : 0;
    return espB - espA;
  });
  return candidatas[0];
}
