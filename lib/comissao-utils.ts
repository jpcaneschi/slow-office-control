// ─────────────────────────────────────────────────────────────────────────────
// Comissão / acerto de funcionário — FONTE ÚNICA.
// Consumida pela tela de Funcionários, por Relatórios e pelo PDF da folha, para
// que os três batam no centavo. Regras (mesmas exclusões em todo lugar):
//   • Comissão = (soma das vendas CONCLUÍDAS elegíveis do funcionário) × %.
//     Vendas canceladas NÃO entram (status != 'concluida'). A origem não importa
//     (PDV, conversão de condicional, etc.) — o que vale é vendas.funcionario_id.
//   • Repasse de serviços = soma de valor × (1 − %loja/100).
//   • A pagar = salário fixo + comissão + repasse − vales.
// ─────────────────────────────────────────────────────────────────────────────

export type FuncionarioComissao = {
  id: string;
  comissao_percentual: number | null;
  salario_fixo: number | null;
};

export type VendaComissao = {
  funcionario_id: string | null;
  total: number | null;
  status: string;
  created_at: string;
};

export type ServicoComissao = {
  funcionario_id: string | null;
  valor: number | null;
  percentual_loja: number | null;
  data: string;
};

export type ValeComissao = {
  funcionario_id: string;
  valor: number | null;
  data: string;
};

export type Acerto = {
  qtdVendas: number;
  vendido: number;
  comissao: number;
  repasse: number;
  vales: number;
  salario: number;
  aPagar: number;
};

/** Comissão em R$ = base vendida × percentual. */
export function comissaoDeVendas(totalVendido: number, percentual: number): number {
  return (Number(totalVendido) || 0) * ((Number(percentual) || 0) / 100);
}

/** Repasse de um serviço = valor × (1 − %loja/100) (parte que vai ao funcionário). */
export function repasseDeServico(valor: number, percentualLoja: number): number {
  return (Number(valor) || 0) * (1 - (Number(percentualLoja) || 0) / 100);
}

/**
 * Acerto do funcionário no período. Os filtros de período são injetados (cada
 * tela tem a sua semântica de janela), mas a FÓRMULA e as EXCLUSÕES são únicas.
 */
export function calcularAcerto(
  func: FuncionarioComissao,
  dados: {
    vendas: VendaComissao[];
    servicos: ServicoComissao[];
    vales: ValeComissao[];
  },
  filtros: {
    vendaNoPeriodo: (v: VendaComissao) => boolean;
    dataNoPeriodo: (dataISO: string) => boolean;
  }
): Acerto {
  const vendasFunc = dados.vendas.filter(
    (v) =>
      v.funcionario_id === func.id &&
      v.status === "concluida" &&
      filtros.vendaNoPeriodo(v)
  );
  const vendido = vendasFunc.reduce((s, v) => s + Number(v.total || 0), 0);
  const comissao = comissaoDeVendas(vendido, Number(func.comissao_percentual || 0));

  const repasse = dados.servicos
    .filter(
      (a) => a.funcionario_id === func.id && filtros.dataNoPeriodo(a.data)
    )
    .reduce(
      (s, a) => s + repasseDeServico(Number(a.valor || 0), Number(a.percentual_loja || 0)),
      0
    );

  const vales = dados.vales
    .filter((vl) => vl.funcionario_id === func.id && filtros.dataNoPeriodo(vl.data))
    .reduce((s, vl) => s + Number(vl.valor || 0), 0);

  const salario = Number(func.salario_fixo || 0);
  const aPagar = salario + comissao + repasse - vales;

  return {
    qtdVendas: vendasFunc.length,
    vendido,
    comissao,
    repasse,
    vales,
    salario,
    aPagar,
  };
}
