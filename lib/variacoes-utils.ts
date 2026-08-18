// Fonte única da lógica de VARIANTES configuráveis (Área #5).
//
// O modelo novo guarda a combinação escolhida em `produto_variacoes.atributos`
// (jsonb, ex.: {"Tamanho":"P","Cor":"Off White"}) e as definições em
// `produto_opcoes`. Estas funções (puras, testáveis) são usadas por produtos,
// PDV/vendas e condicional para: rotular, gerar combinações, validar e checar
// unicidade — sem espalhar a regra pelos componentes.

export type OpcaoTipo = "lista" | "texto" | "numero" | "numero_unidade";

export type ProdutoOpcao = {
  id?: string;
  nome: string;
  tipo: OpcaoTipo;
  unidade?: string | null;
  obrigatorio: boolean;
  ordem: number;
  valores_permitidos: string[];
};

// A combinação concreta de uma variação: nome da opção -> valor escolhido.
export type Atributos = Record<string, string>;

// Ordem de exibição "natural" quando não temos a ordem das opções em mãos
// (ex.: no PDV, onde só carregamos as variações). Tudo minúsculo.
const ORDEM_PADRAO = ["tamanho", "numeração", "numeracao", "cor", "voltagem"];

function prioridadeChave(nome: string, prioridade: string[]): number {
  const n = nome.toLowerCase();
  const p = prioridade.indexOf(n);
  if (p >= 0) return p;
  const d = ORDEM_PADRAO.indexOf(n);
  if (d >= 0) return 100 + d;
  return 1000;
}

function ordenarChaves(chaves: string[], ordemNomes?: string[]): string[] {
  const prioridade = (ordemNomes ?? []).map((n) => n.toLowerCase());
  return [...chaves].sort((a, b) => {
    const ia = prioridadeChave(a, prioridade);
    const ib = prioridadeChave(b, prioridade);
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b, "pt-BR");
  });
}

function normalizarAtributos(atributos?: Atributos | null): Atributos {
  return atributos && typeof atributos === "object" ? atributos : {};
}

/**
 * Rótulo curto da variação ("P · Off White"). Lê `atributos`; se estiver vazio
 * (linha legada ainda não migrada), cai no fallback tamanho/cor.
 * `ordemNomes` (opcional) respeita a ordem das opções do produto.
 */
export function rotuloVariacao(
  atributos?: Atributos | null,
  legado?: { tamanho?: string | null; cor?: string | null } | null,
  ordemNomes?: string[]
): string {
  const attrs = normalizarAtributos(atributos);
  const chaves = Object.keys(attrs).filter(
    (k) => String(attrs[k] ?? "").trim() !== ""
  );
  if (chaves.length > 0) {
    return ordenarChaves(chaves, ordemNomes)
      .map((k) => String(attrs[k]).trim())
      .join(" · ");
  }
  const partes = [legado?.tamanho, legado?.cor]
    .map((x) => (x ?? "").toString().trim())
    .filter(Boolean);
  return partes.join(" · ") || "Variação";
}

/**
 * Assinatura canônica da combinação — usada para detectar duplicidade por
 * produto. Ordena as chaves e preserva o VALOR exato (com case), de forma que
 * "White", "Off White" e "Branco" sejam combinações DIFERENTES.
 */
export function assinaturaVariacao(atributos?: Atributos | null): string {
  const attrs = normalizarAtributos(atributos);
  return Object.keys(attrs)
    .map((k) => [k.trim(), String(attrs[k] ?? "").trim()] as [string, string])
    .filter(([, v]) => v !== "")
    .sort((a, b) => a[0].toLowerCase().localeCompare(b[0].toLowerCase()))
    .map(([k, v]) => `${k.toLowerCase()}=${v}`)
    .join("|");
}

/** true se `atributos` já existe (mesma assinatura) na lista informada. */
export function assinaturaExiste(
  atributos: Atributos,
  existentes: (Atributos | null | undefined)[]
): boolean {
  const alvo = assinaturaVariacao(atributos);
  if (alvo === "") return false;
  return existentes.some((e) => assinaturaVariacao(e) === alvo);
}

/**
 * Produto cartesiano das opções de tipo lista (com valores). Opções sem valores
 * são ignoradas. Retorna a lista de combinações (atributos) a criar.
 */
export function gerarCombinacoes(opcoes: ProdutoOpcao[]): Atributos[] {
  const usaveis = [...opcoes]
    .filter(
      (o) => Array.isArray(o.valores_permitidos) && o.valores_permitidos.length > 0
    )
    .sort((a, b) => a.ordem - b.ordem);
  if (usaveis.length === 0) return [];

  let combos: Atributos[] = [{}];
  for (const o of usaveis) {
    const proximo: Atributos[] = [];
    for (const base of combos) {
      for (const bruto of o.valores_permitidos) {
        const val = String(bruto).trim();
        if (!val) continue;
        proximo.push({ ...base, [o.nome]: val });
      }
    }
    combos = proximo;
  }
  return combos;
}

/**
 * Valida uma combinação contra as opções do produto. Retorna a mensagem de erro
 * (pt-BR) ou null se estiver ok. Regras: opção obrigatória precisa de valor;
 * tipo lista só aceita valor permitido; numero/numero_unidade precisa ser
 * numérico.
 */
export function validarCombinacao(
  atributos: Atributos,
  opcoes: ProdutoOpcao[]
): string | null {
  for (const o of opcoes) {
    const val = String(atributos[o.nome] ?? "").trim();
    if (o.obrigatorio && !val) return `Informe "${o.nome}".`;
    if (!val) continue;
    if (
      o.tipo === "lista" &&
      o.valores_permitidos.length > 0 &&
      !o.valores_permitidos.map((v) => String(v).trim()).includes(val)
    ) {
      return `Valor "${val}" não é permitido para "${o.nome}".`;
    }
    if (
      (o.tipo === "numero" || o.tipo === "numero_unidade") &&
      !Number.isFinite(Number(val.replace(",", ".")))
    ) {
      return `"${o.nome}" deve ser numérico.`;
    }
  }
  return null;
}

/** Normaliza um SKU/código para comparação (trim). Vazio vira null. */
export function normalizarCodigo(valor?: string | null): string | null {
  const v = (valor ?? "").toString().trim();
  return v || null;
}

/**
 * Espelha `atributos` nas colunas legadas tamanho/cor (compatibilidade com
 * leitores antigos: CSV, relatórios). Só extrai se a opção existir.
 */
export function atributosParaLegado(atributos: Atributos): {
  tamanho: string | null;
  cor: string | null;
} {
  const get = (nome: string) => {
    const chave = Object.keys(atributos).find((k) => k.toLowerCase() === nome);
    const v = chave ? String(atributos[chave] ?? "").trim() : "";
    return v || null;
  };
  return { tamanho: get("tamanho"), cor: get("cor") };
}
