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
