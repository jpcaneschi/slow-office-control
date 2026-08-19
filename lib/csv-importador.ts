// Importador inteligente de CSV de produtos (Área #6).
//
// Funções puras (testáveis) que transformam linhas cruas de CSV em uma estrutura
// pronta para gravar no modelo de VARIANTES configuráveis (#5). Cobrem:
//   • sugestão de mapeamento de cabeçalho (sinônimos → campo canônico + confiança)
//   • parse de números no padrão BR (R$ 1.234,56) e internacional (1234.56)
//   • agrupamento de linhas do mesmo produto em produto + opções + variações
//   • idempotência (reenviar o mesmo arquivo não duplica), via nome do produto
//
// A persistência (Supabase) fica na página; aqui é só transformação/validação.

import {
  assinaturaVariacao,
  type Atributos,
} from "@/lib/variacoes-utils";

export type Confianca = "alta" | "media" | "baixa";
export type ColunaMapa = { campo: string; confianca: Confianca };
// header (minúsculo, como vem do parseCSV) -> mapeamento
export type Mapeamento = Record<string, ColunaMapa>;

// Campos "de produto" reconhecidos (o resto vira atributo de variante ou é ignorado).
export const CAMPOS_CANONICOS = [
  "nome",
  "marca",
  "categoria",
  "preco",
  "custo",
  "estoque",
  "status",
  "sku",
  "codigo_barras",
] as const;

export function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Sinônimos de cabeçalho → campo canônico (chaves já sem acento/minúsculas).
const SINONIMOS_CAMPO: Record<string, string> = {
  produto: "nome",
  nome: "nome",
  "nome do produto": "nome",
  item: "nome",
  descricao: "nome",
  "descricao do produto": "nome",
  produto_servico: "nome",

  marca: "marca",
  fabricante: "marca",

  categoria: "categoria",
  tipo: "categoria",
  departamento: "categoria",
  grupo: "categoria",

  preco: "preco",
  "preco venda": "preco",
  "preco de venda": "preco",
  "valor venda": "preco",
  "valor de venda": "preco",
  valor: "preco",
  pv: "preco",

  custo: "custo",
  "preco custo": "custo",
  "preco de custo": "custo",
  "custo unitario": "custo",
  pc: "custo",

  estoque: "estoque",
  quantidade: "estoque",
  qtd: "estoque",
  qtde: "estoque",
  saldo: "estoque",
  "quantidade em estoque": "estoque",

  status: "status",
  situacao: "status",
  ativo: "status",

  sku: "sku",
  referencia: "sku",
  "codigo interno": "sku",
  ref: "sku",

  "codigo de barras": "codigo_barras",
  "codigo barras": "codigo_barras",
  barras: "codigo_barras",
  ean: "codigo_barras",
  gtin: "codigo_barras",
};

// Sinônimos de cabeçalho de ATRIBUTO → nome de opção (exibição).
const SINONIMOS_ATRIBUTO: Record<string, string> = {
  tamanho: "Tamanho",
  tam: "Tamanho",
  size: "Tamanho",
  numeracao: "Numeração",
  num: "Numeração",
  cor: "Cor",
  tonalidade: "Cor",
  color: "Cor",
  colour: "Cor",
  voltagem: "Voltagem",
  tensao: "Voltagem",
  volts: "Voltagem",
  voltage: "Voltagem",
};

/**
 * Sugere o mapeamento de cada cabeçalho. Nunca "adivinha em silêncio": o que não
 * casa vira `ignorar` com confiança baixa, para o usuário decidir.
 */
export function sugerirMapeamento(headers: string[]): Mapeamento {
  const mapa: Mapeamento = {};
  const usados = new Set<string>();

  for (const header of headers) {
    const norm = normalizarTexto(header);
    let campo = "ignorar";
    let confianca: Confianca = "baixa";

    if (SINONIMOS_CAMPO[norm]) {
      campo = SINONIMOS_CAMPO[norm];
      confianca = "alta";
    } else if (SINONIMOS_ATRIBUTO[norm]) {
      campo = `atributo:${SINONIMOS_ATRIBUTO[norm]}`;
      confianca = "alta";
    } else {
      // Casa parcial (contém a palavra-chave).
      const chaveCampo = Object.keys(SINONIMOS_CAMPO).find(
        (k) => norm.includes(k) || k.includes(norm)
      );
      const chaveAttr = Object.keys(SINONIMOS_ATRIBUTO).find(
        (k) => norm.includes(k) || k.includes(norm)
      );
      if (chaveCampo) {
        campo = SINONIMOS_CAMPO[chaveCampo];
        confianca = "media";
      } else if (chaveAttr) {
        campo = `atributo:${SINONIMOS_ATRIBUTO[chaveAttr]}`;
        confianca = "media";
      }
    }

    // Evita dois cabeçalhos apontando para o mesmo campo — o 2º vira ignorar.
    if (campo !== "ignorar" && usados.has(campo)) {
      campo = "ignorar";
      confianca = "baixa";
    }
    if (campo !== "ignorar") usados.add(campo);

    mapa[header] = { campo, confianca };
  }

  return mapa;
}

/**
 * Converte texto numérico BR/internacional em número. Aceita "R$ 1.234,56",
 * "1.234,56", "99,90", "1234.56", "1234". Retorna null se não for número.
 */
export function parseNumeroBR(valor: string | null | undefined): number | null {
  if (valor === null || valor === undefined) return null;
  let s = String(valor).trim();
  if (s === "") return null;
  // Mantém apenas dígitos, separadores e sinal.
  s = s.replace(/[^0-9.,-]/g, "");
  if (s === "" || s === "-") return null;

  const temVirgula = s.includes(",");
  const temPonto = s.includes(".");
  if (temVirgula && temPonto) {
    // O separador decimal é o que aparece por último; o outro é milhar.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (temVirgula) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ── Estruturação ─────────────────────────────────────────────────────────────

export type VariacaoImport = {
  atributos: Atributos;
  preco: number | null;
  custo: number | null;
  estoque: number;
  sku: string | null;
  codigo_barras: string | null;
};

export type OpcaoImport = {
  nome: string;
  obrigatorio: boolean;
  ordem: number;
  valores_permitidos: string[];
};

export type ProdutoImport = {
  nome: string;
  marca: string | null;
  categoria: string | null;
  status: string;
  preco: number;
  custo: number;
  temVariacoes: boolean;
  estoque: number; // usado quando não tem variações
  opcoes: OpcaoImport[];
  variacoes: VariacaoImport[];
};

export type LinhaAviso = { linha: number; motivo: string };

export type ResultadoEstrutura = {
  produtos: ProdutoImport[];
  erros: LinhaAviso[];
  avisos: LinhaAviso[];
};

const STATUS_VALIDOS = new Set(["ativo", "inativo", "encalhado"]);

/**
 * Agrupa as linhas do CSV (já parseadas) em produtos + opções + variações,
 * conforme o mapeamento. Linhas com o mesmo nome viram a grade do produto.
 * `linhaBase` é o número da 1ª linha de dados no arquivo (default 2, após o
 * cabeçalho) — usado para reportar erros na linha certa.
 */
export function estruturarImportacao(
  linhas: Record<string, string>[],
  mapeamento: Mapeamento,
  linhaBase = 2
): ResultadoEstrutura {
  const erros: LinhaAviso[] = [];
  const avisos: LinhaAviso[] = [];

  // header -> campo (só os que não são "ignorar").
  const porCampo = new Map<string, string>(); // campo canônico -> header
  const atributosHeaders: { header: string; nome: string }[] = [];
  for (const [header, m] of Object.entries(mapeamento)) {
    if (m.campo === "ignorar") continue;
    if (m.campo.startsWith("atributo:")) {
      atributosHeaders.push({ header, nome: m.campo.slice("atributo:".length) });
    } else {
      porCampo.set(m.campo, header);
    }
  }

  const val = (row: Record<string, string>, campo: string) => {
    const header = porCampo.get(campo);
    return header ? (row[header] ?? "").trim() : "";
  };

  type Grupo = {
    nomeOriginal: string;
    linhas: { row: Record<string, string>; linha: number }[];
  };
  const grupos = new Map<string, Grupo>();

  linhas.forEach((row, idx) => {
    const linha = linhaBase + idx;
    const nome = val(row, "nome");
    if (!nome) {
      erros.push({ linha, motivo: "Linha sem nome de produto — ignorada." });
      return;
    }
    const chave = nome.toLowerCase();
    if (!grupos.has(chave)) grupos.set(chave, { nomeOriginal: nome, linhas: [] });
    grupos.get(chave)!.linhas.push({ row, linha });
  });

  const produtos: ProdutoImport[] = [];

  for (const grupo of grupos.values()) {
    const primeira = grupo.linhas[0];
    const precoProd = parseNumeroBR(val(primeira.row, "preco")) ?? 0;
    const custoProd = parseNumeroBR(val(primeira.row, "custo")) ?? 0;
    const statusBruto = normalizarTexto(val(primeira.row, "status"));
    const status = STATUS_VALIDOS.has(statusBruto) ? statusBruto : "ativo";

    // Quais linhas do grupo trazem atributos?
    const atributosDaLinha = (row: Record<string, string>): Atributos => {
      const attrs: Atributos = {};
      for (const { header, nome } of atributosHeaders) {
        const v = (row[header] ?? "").trim();
        if (v) attrs[nome] = v;
      }
      return attrs;
    };

    const temVariacoes = grupo.linhas.some(
      (l) => Object.keys(atributosDaLinha(l.row)).length > 0
    );

    let precoInvalido = false;
    const checarNum = (bruto: string, linha: number, rotulo: string): number | null => {
      if (bruto.trim() === "") return null;
      const n = parseNumeroBR(bruto);
      if (n === null) {
        erros.push({ linha, motivo: `${rotulo} inválido: "${bruto}".` });
        precoInvalido = true;
        return null;
      }
      if (n < 0) {
        erros.push({ linha, motivo: `${rotulo} não pode ser negativo.` });
        precoInvalido = true;
        return null;
      }
      return n;
    };

    if (!temVariacoes) {
      const preco = checarNum(val(primeira.row, "preco"), primeira.linha, "Preço") ?? 0;
      const custo = checarNum(val(primeira.row, "custo"), primeira.linha, "Custo") ?? 0;
      const estoque = checarNum(val(primeira.row, "estoque"), primeira.linha, "Estoque") ?? 0;
      if (precoInvalido) continue;
      produtos.push({
        nome: grupo.nomeOriginal,
        marca: val(primeira.row, "marca") || null,
        categoria: val(primeira.row, "categoria") || null,
        status,
        preco,
        custo,
        temVariacoes: false,
        estoque,
        opcoes: [],
        variacoes: [],
      });
      continue;
    }

    // Com variações: monta a grade.
    const variacoes: VariacaoImport[] = [];
    const assinaturas = new Set<string>();
    const valoresPorOpcao = new Map<string, Set<string>>();
    const ordemOpcao = new Map<string, number>();
    atributosHeaders.forEach((a, i) => {
      if (!ordemOpcao.has(a.nome)) ordemOpcao.set(a.nome, i);
    });

    for (const { row, linha } of grupo.linhas) {
      const atributos = atributosDaLinha(row);
      if (Object.keys(atributos).length === 0) {
        avisos.push({ linha, motivo: "Linha sem atributo de variação — ignorada." });
        continue;
      }
      const assinatura = assinaturaVariacao(atributos);
      if (assinaturas.has(assinatura)) {
        avisos.push({ linha, motivo: "Variação repetida no arquivo — ignorada." });
        continue;
      }
      const preco = checarNum((row[porCampo.get("preco") ?? ""] ?? "").trim(), linha, "Preço");
      const custo = checarNum((row[porCampo.get("custo") ?? ""] ?? "").trim(), linha, "Custo");
      const estoque = checarNum((row[porCampo.get("estoque") ?? ""] ?? "").trim(), linha, "Estoque") ?? 0;

      assinaturas.add(assinatura);
      for (const [nome, v] of Object.entries(atributos)) {
        if (!valoresPorOpcao.has(nome)) valoresPorOpcao.set(nome, new Set());
        valoresPorOpcao.get(nome)!.add(v);
      }
      variacoes.push({
        atributos,
        preco,
        custo,
        estoque,
        sku: (row[porCampo.get("sku") ?? ""] ?? "").trim() || null,
        codigo_barras: (row[porCampo.get("codigo_barras") ?? ""] ?? "").trim() || null,
      });
    }

    if (precoInvalido || variacoes.length === 0) {
      if (variacoes.length === 0) {
        erros.push({
          linha: primeira.linha,
          motivo: `Produto "${grupo.nomeOriginal}" sem variações válidas.`,
        });
      }
      continue;
    }

    const opcoes: OpcaoImport[] = [...valoresPorOpcao.entries()]
      .map(([nome, valores]) => ({
        nome,
        ordem: ordemOpcao.get(nome) ?? 0,
        obrigatorio: variacoes.every((v) => (v.atributos[nome] ?? "") !== ""),
        valores_permitidos: [...valores],
      }))
      .sort((a, b) => a.ordem - b.ordem);

    produtos.push({
      nome: grupo.nomeOriginal,
      marca: val(primeira.row, "marca") || null,
      categoria: val(primeira.row, "categoria") || null,
      status,
      preco: precoProd,
      custo: custoProd,
      temVariacoes: true,
      estoque: 0,
      opcoes,
      variacoes,
    });
  }

  return { produtos, erros, avisos };
}

// ── Idempotência ─────────────────────────────────────────────────────────────

export type AcaoImport = "criar" | "ignorar_existente";
export type PlanoItem = { produto: ProdutoImport; acao: AcaoImport };

/**
 * Decide o que criar vs ignorar comparando pelo NOME (case-insensitive) com os
 * produtos já existentes na organização. Reenviar o mesmo arquivo → tudo
 * ignorado (idempotente).
 */
export function planejarImportacao(
  produtos: ProdutoImport[],
  nomesExistentes: string[]
): PlanoItem[] {
  const existentes = new Set(nomesExistentes.map((n) => n.trim().toLowerCase()));
  return produtos.map((produto) => ({
    produto,
    acao: existentes.has(produto.nome.trim().toLowerCase())
      ? "ignorar_existente"
      : "criar",
  }));
}
