// Fonte única do RESUMO DE FINALIZAÇÃO de um condicional (Área #9).
//
// Um condicional finalizado precisa mostrar, por peça, quanto foi VENDIDO e
// quanto foi DEVOLVIDO (na variante certa), além da venda gerada e dos
// movimentos de estoque. Estas funções puras reconstroem esse detalhamento a
// partir dos dados reais (itens do condicional + ledger de estoque + itens da
// venda gerada), sem heurística frágil.
//
// Chave de casamento por peça: produto_id + variacao_id (o front impede peças
// duplicadas com a mesma combinação no mesmo condicional).

export type CondItemResumo = {
  id: string;
  produto_id: string;
  variacao_id: string | null;
  quantidade: number;
  preco_unitario: number | null;
  status: string | null;
};

// Movimento de estoque do ledger (só os de retorno interessam para "devolvido").
export type MovResumo = {
  produto_id: string;
  variacao_id: string | null;
  tipo: string;
  quantidade: number;
};

// Item da venda gerada pela conversão (para o "vendido" exato).
export type VendaItemResumo = {
  produto_id: string;
  variacao_id: string | null;
  quantidade: number;
};

export type EstadoItem = "vendido" | "devolvido" | "parcial" | "sem_movimento";

export type ItemFinalizacao = {
  produto_id: string;
  variacao_id: string | null;
  enviado: number;
  vendido: number;
  devolvido: number;
  preco_unitario: number;
  estado: EstadoItem;
};

export type ResumoFinalizacao = {
  itens: ItemFinalizacao[];
  totalVendidoQtd: number;
  totalDevolvidoQtd: number;
  // Peças enviadas sem venda nem devolução registradas (ex.: finalização
  // manual antiga, sem movimentação) — sinaliza "sem detalhamento".
  totalSemMovimento: number;
};

function chave(produtoId: string, variacaoId: string | null): string {
  return `${produtoId}::${variacaoId ?? ""}`;
}

function somarPorChave<T extends { produto_id: string; variacao_id: string | null; quantidade: number }>(
  linhas: T[]
): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of linhas) {
    const k = chave(l.produto_id, l.variacao_id);
    m.set(k, (m.get(k) || 0) + Number(l.quantidade || 0));
  }
  return m;
}

function estadoDe(vendido: number, devolvido: number): EstadoItem {
  if (vendido > 0 && devolvido > 0) return "parcial";
  if (vendido > 0) return "vendido";
  if (devolvido > 0) return "devolvido";
  return "sem_movimento";
}

/**
 * Reconstrói, por peça, o que foi vendido/devolvido na finalização.
 * `retornos` são os movimentos `retorno_condicional` do condicional; `vendaItens`
 * são os itens da venda gerada (pode ser vazio: recolhido/finalização manual).
 */
export function resumirFinalizacao(
  itens: CondItemResumo[],
  retornos: MovResumo[],
  vendaItens: VendaItemResumo[]
): ResumoFinalizacao {
  const devolvidoPorChave = somarPorChave(
    retornos.filter((m) => m.tipo === "retorno_condicional")
  );
  const vendidoPorChave = somarPorChave(vendaItens);

  const linhas: ItemFinalizacao[] = itens.map((it) => {
    const k = chave(it.produto_id, it.variacao_id);
    const enviado = Number(it.quantidade || 0);
    const devolvido = Math.min(enviado, devolvidoPorChave.get(k) || 0);
    // Vendido: prioriza os itens da venda; se não houver venda ligada, deriva
    // pelo que sobrou (enviado − devolvido) só quando houve devolução parcial.
    const vendidoVenda = vendidoPorChave.get(k);
    const vendido =
      vendidoVenda != null
        ? Math.min(enviado, vendidoVenda)
        : devolvido > 0
        ? enviado - devolvido
        : 0;
    return {
      produto_id: it.produto_id,
      variacao_id: it.variacao_id,
      enviado,
      vendido,
      devolvido,
      preco_unitario: Number(it.preco_unitario || 0),
      estado: estadoDe(vendido, devolvido),
    };
  });

  return {
    itens: linhas,
    totalVendidoQtd: linhas.reduce((s, l) => s + l.vendido, 0),
    totalDevolvidoQtd: linhas.reduce((s, l) => s + l.devolvido, 0),
    totalSemMovimento: linhas.filter((l) => l.estado === "sem_movimento").length,
  };
}

export const ESTADO_LABEL: Record<EstadoItem, string> = {
  vendido: "Vendido",
  devolvido: "Devolvido",
  parcial: "Parcial",
  sem_movimento: "Sem movimentação",
};
