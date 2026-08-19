// Fonte única (pura) da formatação da auditoria: resolve rótulo/cor da ação,
// descreve o registro afetado e monta o detalhamento "antes → depois" por campo.
// Sem React/Supabase aqui → coberto por Vitest. A página `dashboard/auditoria`
// só renderiza o que estas funções devolvem.

export type AlteracaoCampo = { antes: unknown; depois: unknown };

export type AuditoriaDados = {
  antes?: Record<string, unknown> | null;
  depois?: Record<string, unknown> | null;
  alteracoes?: Record<string, AlteracaoCampo> | null;
  // payloads semânticos (venda_criada, venda_cancelada, ...) trazem chaves soltas
  [k: string]: unknown;
};

export type DiffLinha = { campo: string; antes: string; depois: string };

export type DetalheAuditoria = {
  // quando há mudança campo a campo (UPDATE do trigger genérico)
  alteracoes: DiffLinha[];
  // resumo textual (INSERT/DELETE do trigger ou payload semântico)
  resumo: string;
};

// ── Ações semânticas (log_auditoria dentro das RPCs) ─────────────────────────
const ACAO_LABEL: Record<string, string> = {
  venda_criada: "Venda criada",
  venda_cancelada: "Venda cancelada",
  venda_devolucao: "Devolução de venda",
  promissoria_pagamento: "Pagamento de promissória",
  condicional_convertido: "Condicional convertido em venda",
  papel_alterado: "Papel alterado",
  membro_removido: "Membro removido",
  produto_excluido: "Produto excluído",
};

const ACAO_COR: Record<string, string> = {
  venda_criada: "#15803d",
  venda_cancelada: "#b91c1c",
  venda_devolucao: "#b45309",
  promissoria_pagamento: "#15803d",
  condicional_convertido: "#7c3aed",
  papel_alterado: "#1d4ed8",
  membro_removido: "#b91c1c",
  produto_excluido: "#b45309",
};

// Entidades dos triggers genéricos (tabela -> nome amigável no singular).
const ENTIDADE_LABEL: Record<string, string> = {
  clientes: "cliente",
  produtos: "produto",
  produto_variacoes: "variação",
  produto_opcoes: "opção de produto",
  funcionarios: "funcionário",
  vales: "vale",
  servicos: "serviço",
  atendimentos_servico: "atendimento",
  tatuagem_atendimentos: "tatuagem",
  despesas: "despesa",
  despesas_recorrentes: "conta recorrente",
  configuracoes: "configuração",
  taxas_cartao: "taxa de cartão",
};

const OP_VERBO: Record<string, { verbo: string; cor: string }> = {
  insert: { verbo: "Criou", cor: "#15803d" },
  update: { verbo: "Editou", cor: "#1d4ed8" },
  delete: { verbo: "Excluiu", cor: "#b91c1c" },
};

// Rótulos amigáveis de campos (config, taxas, semânticos, produtos).
const CAMPO_LABEL: Record<string, string> = {
  // configuração
  nome_operacao: "Nome da operação",
  pix_desconto: "Desconto Pix (%)",
  tatuagem_percentual: "Comissão tatuagem (%)",
  max_parcelas: "Máx. de parcelas",
  condicional_prazo_dias: "Prazo do condicional (dias)",
  parcela_minima: "Parcela mínima",
  promissoria_prazo_meses: "Prazo da promissória (meses)",
  categorias_produto: "Categorias de produto",
  responsaveis: "Responsáveis",
  modulos_ativos: "Módulos ativos",
  // taxas de cartão
  operadora: "Operadora",
  tipo: "Tipo",
  bandeira: "Bandeira",
  parcelas_min: "Parcelas (mín.)",
  parcelas_max: "Parcelas (máx.)",
  taxa_percentual: "Taxa (%)",
  taxa_fixa: "Taxa fixa (R$)",
  taxa_antecipacao: "Antecipação (%)",
  permite_ajuste_manual_pdv: "Permite ajuste manual no PDV",
  vigencia_inicio: "Vigência (início)",
  vigencia_fim: "Vigência (fim)",
  ativo: "Ativo",
  // produtos / variações
  nome: "Nome",
  preco: "Preço",
  custo: "Custo",
  estoque: "Estoque",
  sku: "SKU",
  codigo_barras: "Código de barras",
  marca: "Marca",
  obrigatorio: "Obrigatório",
  valores_permitidos: "Valores permitidos",
  atributos: "Atributos",
  status: "Status",
  // semânticos de venda/promissória/condicional
  total: "Total",
  forma_pagamento: "Forma de pagamento",
  parcelas: "Parcelas",
  taxa_valor: "Taxa (R$)",
  valor_liquido: "Valor líquido",
  motivo: "Motivo",
  valor: "Valor",
  saldo: "Saldo",
  venda_id: "Venda",
  funcionario_id: "Funcionário",
  itens: "Itens",
  origem: "Origem",
};

export function rotuloCampo(campo: string): string {
  return CAMPO_LABEL[campo] || campo.replace(/_/g, " ");
}

// Resolve rótulo + cor de uma ação (semântica OU trigger genérico insert/update/delete).
export function resolverAcao(acao: string): { label: string; cor: string } {
  if (ACAO_LABEL[acao]) {
    return { label: ACAO_LABEL[acao], cor: ACAO_COR[acao] || "#475569" };
  }
  const m = /^(insert|update|delete)_(.+)$/.exec(acao);
  if (m) {
    const op = OP_VERBO[m[1]];
    const ent = ENTIDADE_LABEL[m[2]] || m[2].replace(/_/g, " ");
    if (op) return { label: `${op.verbo} ${ent}`, cor: op.cor };
  }
  return { label: acao, cor: "#475569" };
}

// Descreve um registro pelo campo mais representativo.
export function descreverRegistro(obj: unknown): string {
  if (!obj || typeof obj !== "object") return "";
  const o = obj as Record<string, unknown>;
  for (const campo of [
    "nome",
    "nome_operacao",
    "descricao",
    "cliente_nome",
    "operadora",
    "email",
  ]) {
    const v = o[campo];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

// Formata um valor para exibição legível (números, booleanos, listas, vazios).
export function formatarValor(v: unknown): string {
  if (v === null || v === undefined || v === "") return "vazio";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "(nenhum)";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// Monta o detalhamento exibível de um evento de auditoria.
export function montarDetalhe(dados: AuditoriaDados | null | undefined): DetalheAuditoria {
  if (!dados || typeof dados !== "object") return { alteracoes: [], resumo: "" };

  // 1) UPDATE do trigger genérico: mostra o diff campo a campo.
  const alt = dados.alteracoes;
  if (alt && typeof alt === "object" && Object.keys(alt).length > 0) {
    const alteracoes: DiffLinha[] = Object.entries(alt)
      .map(([campo, par]) => {
        const p = (par || {}) as AlteracaoCampo;
        return {
          campo: rotuloCampo(campo),
          antes: formatarValor(p.antes),
          depois: formatarValor(p.depois),
        };
      })
      .sort((a, b) => a.campo.localeCompare(b.campo, "pt-BR"));
    return { alteracoes, resumo: descreverRegistro(dados.depois) || descreverRegistro(dados.antes) };
  }

  // 2) INSERT/DELETE do trigger genérico: nome representativo, com fallback.
  if ("depois" in dados || "antes" in dados) {
    const alvo = dados.depois || dados.antes;
    const nome = descreverRegistro(alvo);
    if (nome) return { alteracoes: [], resumo: nome };
    // Sem nome (ex.: configuração): resume alguns campos-chave em vez de "—".
    return { alteracoes: [], resumo: resumirCampos(alvo) };
  }

  // 3) Payload semântico (venda_criada, promissoria_pagamento, ...).
  const resumo = Object.entries(dados)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${rotuloCampo(k)}: ${formatarValor(v)}`)
    .join(" · ");
  return { alteracoes: [], resumo };
}

// Resumo compacto de um registro sem campo "nome" (ex.: configuração da loja).
function resumirCampos(obj: unknown): string {
  if (!obj || typeof obj !== "object") return "";
  const o = obj as Record<string, unknown>;
  const preferidos = [
    "nome_operacao",
    "pix_desconto",
    "max_parcelas",
    "modulos_ativos",
    "operadora",
    "taxa_percentual",
  ];
  const partes: string[] = [];
  for (const campo of preferidos) {
    if (campo in o) partes.push(`${rotuloCampo(campo)}: ${formatarValor(o[campo])}`);
    if (partes.length >= 3) break;
  }
  return partes.join(" · ");
}
