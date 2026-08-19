// ─────────────────────────────────────────────────────────────────────────────
// Datas — fonte única. Regras:
// • Datas de CALENDÁRIO (vencimento, aniversário, competência) são "YYYY-MM-DD"
//   e NUNCA passam por new Date("YYYY-MM-DD") (que parseia em UTC e volta 1 dia
//   no fuso do Brasil). Formatação é feita por string ou com Date LOCAL.
// • INSTANTES reais (created_at) são timestamps e são exibidos no fuso
//   America/Sao_Paulo.
// ─────────────────────────────────────────────────────────────────────────────

export const FUSO = "America/Sao_Paulo";

/** Hoje em São Paulo como "YYYY-MM-DD" (sem o bug de UTC à noite). */
export function hojeISO(): string {
  // en-CA formata como YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Converte "YYYY-MM-DD" em Date LOCAL (meia-noite local, sem shift de fuso). */
export function parseDataLocal(iso: string): Date {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}

/** Date -> "YYYY-MM-DD" usando componentes LOCAIS. */
export function toISOLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** Formata uma data pura "YYYY-MM-DD" em DD/MM/AAAA (puro string, sem Date). */
export function formatDataBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  if (!y || !m || !d) return "—";
  return `${d}/${m}/${y}`;
}

/** Formata um instante real (timestamp) em data + hora no fuso de São Paulo. */
export function formatDataHoraBR(ts: string | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("pt-BR", { timeZone: FUSO });
}

/** Formata um instante real (timestamp) só a data, no fuso de São Paulo. */
export function formatDataDeTimestamp(ts: string | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("pt-BR", { timeZone: FUSO });
}

/** Timestamp em milissegundos de uma data pura "YYYY-MM-DD" (meia-noite local). */
export function dataLocalMs(iso: string): number {
  return parseDataLocal(iso).getTime();
}

/** Soma dias a uma data pura "YYYY-MM-DD" e devolve "YYYY-MM-DD". */
export function somarDiasISO(iso: string, dias: number): string {
  const d = parseDataLocal(iso);
  d.setDate(d.getDate() + dias);
  return toISOLocal(d);
}

/** Primeiro dia do mês atual (São Paulo) como "YYYY-MM-DD". */
export function primeiroDiaMesISO(): string {
  return `${hojeISO().slice(0, 7)}-01`;
}

/** Um convite (ou qualquer prazo) já expirou? Sem prazo = nunca expira. */
export function expirado(quando: string | null | undefined): boolean {
  if (!quando) return false;
  return new Date(quando).getTime() <= Date.now();
}

/**
 * Normaliza qualquer valor de data (date ou timestamp) para "YYYY-MM-DD",
 * formato exigido por <input type="date"> (senão o campo reabre vazio).
 */
export function paraInputDate(v: string | null | undefined): string {
  if (!v) return "";
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

/** Valida se "YYYY-MM-DD" é uma data real (rejeita 2026-02-30, 2026-13-01). */
export function dataValida(iso: string | null | undefined): boolean {
  if (!iso) return true; // vazio é permitido (campo opcional)
  const s = String(iso).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  return (
    dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d
  );
}

/**
 * Normaliza uma data digitada ou importada (CSV) para "YYYY-MM-DD".
 * Aceita "AAAA-MM-DD" (ISO, com ou sem hora) e "DD/MM/AAAA" (formato BR,
 * também com "-" ou "." como separador). NÃO converte fuso — é tudo string.
 * Retorna:
 *   • ""    → entrada vazia (campo opcional, sem valor)
 *   • ISO   → "YYYY-MM-DD" quando a data é real
 *   • null  → formato irreconhecível ou data impossível (ex.: 29/02 não-bissexto)
 */
export function normalizarDataEntrada(
  v: string | null | undefined
): string | null {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  if (s === "") return "";
  // ISO: AAAA-MM-DD (aceita timestamp, corta na parte da data)
  const iso = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return dataValida(iso) ? iso : null;
  }
  // BR: DD/MM/AAAA (separadores / . -)
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) {
    const cand = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return dataValida(cand) ? cand : null;
  }
  return null;
}
