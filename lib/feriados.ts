// Feriados nacionais brasileiros (fixos + móveis derivados da Páscoa).
// Sem dependências externas.

function pascoa(ano: number): Date {
  // Algoritmo de Gauss / Anonymous Gregorian.
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function somaDias(d: Date, dias: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + dias);
  return x;
}

/** Mapa { "YYYY-MM-DD" -> nome do feriado } para o ano informado. */
export function feriadosDoAno(ano: number): Map<string, string> {
  const m = new Map<string, string>();
  const fixo = (mes: number, dia: number, nome: string) =>
    m.set(iso(new Date(ano, mes - 1, dia)), nome);

  fixo(1, 1, "Confraternização Universal");
  fixo(4, 21, "Tiradentes");
  fixo(5, 1, "Dia do Trabalho");
  fixo(9, 7, "Independência");
  fixo(10, 12, "N. Sra. Aparecida");
  fixo(11, 2, "Finados");
  fixo(11, 15, "Proclamação da República");
  fixo(11, 20, "Consciência Negra");
  fixo(12, 25, "Natal");

  const p = pascoa(ano);
  m.set(iso(somaDias(p, -47)), "Carnaval");
  m.set(iso(somaDias(p, -2)), "Sexta-feira Santa");
  m.set(iso(somaDias(p, 60)), "Corpus Christi");

  return m;
}
