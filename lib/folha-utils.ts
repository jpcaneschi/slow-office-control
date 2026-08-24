// Montagem das LINHAS do recibo de folha (Área #11) — pura e testável.
//
// Os valores (comissão, repasse de serviços, vales) vêm da FONTE ÚNICA de
// comissão (lib/comissao-utils.ts, Área #3) — aqui só organizamos em proventos
// e descontos para o PDF e a prévia, batendo no centavo com a tela e o relatório.

export type LinhaFolha = {
  tipo: "Provento" | "Desconto";
  desc: string;
  valor: number; // sempre positivo; o sinal é dado pelo tipo
};

export type FolhaDados = {
  salarioBase: number;
  comissao: number;
  qtdVendas: number;
  repasseServicos: number;
  vales: number;
  outrosDescontos?: number;
  outrosDescontosLabel?: string;
  comissaoDescricao?: string;
};

export type ResumoFolha = {
  linhas: LinhaFolha[];
  totalProventos: number;
  totalDescontos: number;
  liquido: number;
};

function n(v: number | null | undefined): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

/**
 * Monta as linhas do recibo a partir do acerto real. Salário base entra sempre;
 * comissão só se houver venda ou valor; repasse/vales/outros só se > 0. O líquido
 * é proventos − descontos.
 */
export function montarFolha(d: FolhaDados): ResumoFolha {
  const salarioBase = n(d.salarioBase);
  const comissao = n(d.comissao);
  const qtdVendas = n(d.qtdVendas);
  const repasse = n(d.repasseServicos);
  const vales = n(d.vales);
  const outros = n(d.outrosDescontos);

  const linhas: LinhaFolha[] = [
    { tipo: "Provento", desc: "Salário base", valor: salarioBase },
  ];
  if (comissao > 0 || qtdVendas > 0) {
    const suf = qtdVendas > 0 ? ` (${qtdVendas} venda${qtdVendas === 1 ? "" : "s"})` : "";
    linhas.push({
      tipo: "Provento",
      desc: `${d.comissaoDescricao?.trim() || "Comissão sobre vendas"}${suf}`,
      valor: comissao,
    });
  }
  if (repasse > 0) {
    linhas.push({ tipo: "Provento", desc: "Repasse de serviços", valor: repasse });
  }
  if (vales > 0) {
    linhas.push({ tipo: "Desconto", desc: "Vales do período", valor: vales });
  }
  if (outros > 0) {
    linhas.push({
      tipo: "Desconto",
      desc: d.outrosDescontosLabel?.trim() || "Outros descontos",
      valor: outros,
    });
  }

  const totalProventos = linhas
    .filter((l) => l.tipo === "Provento")
    .reduce((s, l) => s + l.valor, 0);
  const totalDescontos = linhas
    .filter((l) => l.tipo === "Desconto")
    .reduce((s, l) => s + l.valor, 0);

  return {
    linhas,
    totalProventos,
    totalDescontos,
    liquido: totalProventos - totalDescontos,
  };
}
