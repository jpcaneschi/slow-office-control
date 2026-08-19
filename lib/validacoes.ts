// Fonte única de validação de campos numéricos/limites, com mensagens em pt-BR.
// Espelha (no front) as CHECK constraints do banco (migration 0043 + 0025) — o
// servidor é a fronteira real; isto é a UX amigável. Pura → coberta por Vitest.
//
// Convenção: cada função devolve `string` (mensagem de erro em pt-BR) quando
// inválido, ou `null` quando ok. Assim o formulário faz:
//   const erro = validarPreco(valor); if (erro) { setErro(erro); return; }

export type OpcoesNumero = {
  min?: number; // limite inferior (default 0)
  max?: number; // limite superior (opcional)
  inteiro?: boolean; // exige inteiro
  obrigatorio?: boolean; // default true
  unidade?: string; // sufixo na mensagem (ex.: "%", " meses")
};

// Converte entrada de formulário (string/number) num número, aceitando vírgula
// decimal do padrão BR ("1.234,56" → 1234.56). Devolve NaN quando não numérico.
export function paraNumero(valor: unknown): number {
  if (typeof valor === "number") return valor;
  if (typeof valor !== "string") return NaN;
  const s = valor.trim();
  if (s === "") return NaN;
  // Remove separador de milhar "." e troca vírgula decimal por ".".
  const normal = s.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(normal);
  return Number.isFinite(n) ? n : NaN;
}

function sufixo(op: OpcoesNumero): string {
  return op.unidade || "";
}

// Validador genérico. Todos os específicos abaixo delegam para cá.
export function validarNumero(
  rotulo: string,
  valor: unknown,
  op: OpcoesNumero = {}
): string | null {
  const obrigatorio = op.obrigatorio !== false;
  const min = op.min ?? 0;

  const vazio =
    valor === null ||
    valor === undefined ||
    (typeof valor === "string" && valor.trim() === "");
  if (vazio) {
    return obrigatorio ? `Informe ${rotulo}.` : null;
  }

  const n = paraNumero(valor);
  if (Number.isNaN(n)) return `${cap(rotulo)} deve ser um número válido.`;
  if (op.inteiro && !Number.isInteger(n)) {
    return `${cap(rotulo)} deve ser um número inteiro.`;
  }
  const u = sufixo(op);
  if (op.max !== undefined && min === 0 && op.max === 100) {
    // Caso especial de percentual: mensagem única e clara.
    if (n < 0 || n > 100) return `${cap(rotulo)} deve ficar entre 0% e 100%.`;
    return null;
  }
  if (n < min) {
    if (min === 0) return `${cap(rotulo)} não pode ser negativo.`;
    return `${cap(rotulo)} deve ser no mínimo ${min}${u}.`;
  }
  if (op.max !== undefined && n > op.max) {
    return `${cap(rotulo)} deve ser no máximo ${op.max}${u}.`;
  }
  return null;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Específicos (limites coerentes por domínio) ──────────────────────────────
export const validarPreco = (v: unknown, obrigatorio = true) =>
  validarNumero("o preço", v, { min: 0, obrigatorio });

export const validarCusto = (v: unknown, obrigatorio = false) =>
  validarNumero("o custo", v, { min: 0, obrigatorio });

export const validarEstoque = (v: unknown, obrigatorio = false) =>
  validarNumero("o estoque", v, { min: 0, inteiro: true, obrigatorio });

export const validarValorServico = (v: unknown, obrigatorio = true) =>
  validarNumero("o valor do serviço", v, { min: 0, obrigatorio });

export const validarPercentual = (v: unknown, rotulo = "o percentual", obrigatorio = true) =>
  validarNumero(rotulo, v, { min: 0, max: 100, obrigatorio });

export const validarParcelas = (v: unknown, max = 24) =>
  validarNumero("o número de parcelas", v, { min: 1, max, inteiro: true });

export const validarPrazoMeses = (v: unknown) =>
  validarNumero("o prazo", v, { min: 0, inteiro: true, unidade: " meses" });

export const validarPrazoDias = (v: unknown) =>
  validarNumero("o prazo", v, { min: 0, inteiro: true, unidade: " dias" });

export const validarSalario = (v: unknown, obrigatorio = false) =>
  validarNumero("o salário", v, { min: 0, obrigatorio });

export const validarComissao = (v: unknown, obrigatorio = false) =>
  validarNumero("a comissão", v, { min: 0, max: 100, obrigatorio });

export const validarVale = (v: unknown, obrigatorio = true) =>
  validarNumero("o valor do vale", v, { min: 0, obrigatorio });

export const validarTaxaPercentual = (v: unknown, rotulo = "a taxa", obrigatorio = true) =>
  validarNumero(rotulo, v, { min: 0, max: 100, obrigatorio });

export const validarTaxaFixa = (v: unknown, obrigatorio = false) =>
  validarNumero("a taxa fixa", v, { min: 0, obrigatorio });

export const validarParcelaMinima = (v: unknown, obrigatorio = false) =>
  validarNumero("a parcela mínima", v, { min: 0, obrigatorio });

// Texto obrigatório padrão (nomes/descrições).
export function validarTexto(rotulo: string, v: unknown, minLen = 1): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length < minLen) return `Informe ${rotulo}.`;
  return null;
}

// Roda uma lista de validações e devolve a PRIMEIRA mensagem de erro (ou null).
export function primeiroErro(...erros: (string | null)[]): string | null {
  for (const e of erros) if (e) return e;
  return null;
}
