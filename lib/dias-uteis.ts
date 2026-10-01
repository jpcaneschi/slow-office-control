const FERIADOS_NACIONAIS = new Set([
  "01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25",
]);

/** Datas civis em UTC: o fuso do dispositivo não pode mudar o vencimento. */
export function proximoDiaUtil(dataISO: string, feriados: readonly string[] = []) {
  const data = new Date(`${dataISO.slice(0, 10)}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataISO.slice(0, 10)) || !Number.isFinite(data.getTime()) || data.toISOString().slice(0, 10) !== dataISO.slice(0, 10)) throw new Error("Data de pagamento inválida.");
  const locais = new Set(feriados);
  for (let i = 0; i < 366; i += 1) {
    const iso = data.toISOString().slice(0, 10);
    if (data.getUTCDay() !== 0 && data.getUTCDay() !== 6 &&
      !FERIADOS_NACIONAIS.has(iso.slice(5)) && !locais.has(iso)) return iso;
    data.setUTCDate(data.getUTCDate() + 1);
  }
  throw new Error("Confira o calendário de feriados.");
}
