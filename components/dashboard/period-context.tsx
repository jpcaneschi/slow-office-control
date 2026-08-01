"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Period = { inicio: string; fim: string }; // YYYY-MM-DD (inclusivo)

// ─── Helpers de data (tudo em horário local, padrão pt-BR) ──────────────────
export function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function isoToDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function formatBR(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export type PresetKey =
  | "hoje"
  | "ontem"
  | "7"
  | "15"
  | "30"
  | "60"
  | "90"
  | "este_mes"
  | "mes_anterior"
  | "este_ano";

export function presetRange(key: PresetKey): Period {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const fim = new Date(hoje);
  const inicio = new Date(hoje);

  switch (key) {
    case "hoje":
      break;
    case "ontem":
      inicio.setDate(inicio.getDate() - 1);
      fim.setDate(fim.getDate() - 1);
      break;
    case "7":
    case "15":
    case "30":
    case "60":
    case "90":
      inicio.setDate(inicio.getDate() - (Number(key) - 1));
      break;
    case "este_mes":
      inicio.setDate(1);
      break;
    case "mes_anterior": {
      inicio.setMonth(inicio.getMonth() - 1, 1);
      fim.setDate(0); // último dia do mês anterior
      break;
    }
    case "este_ano":
      inicio.setMonth(0, 1); // 1º de janeiro do ano atual
      break;
  }

  return { inicio: toISO(inicio), fim: toISO(fim) };
}

export function labelForPeriod(p: Period): string {
  const presets: [PresetKey, string][] = [
    ["hoje", "Hoje"],
    ["ontem", "Ontem"],
    ["7", "Últimos 7 dias"],
    ["15", "Últimos 15 dias"],
    ["30", "Últimos 30 dias"],
    ["este_mes", "Este mês"],
    ["mes_anterior", "Mês anterior"],
    ["este_ano", "Este ano"],
  ];
  for (const [key, label] of presets) {
    const r = presetRange(key);
    if (r.inicio === p.inicio && r.fim === p.fim) return label;
  }
  if (p.inicio === p.fim) return formatBR(p.inicio);
  return `${formatBR(p.inicio)} - ${formatBR(p.fim)}`;
}

function defaultPeriod(): Period {
  return presetRange("este_mes");
}

type Ctx = { period: Period; setPeriod: (p: Period) => void };
const PeriodContext = createContext<Ctx | null>(null);

export function PeriodProvider({ children }: { children: ReactNode }) {
  const [period, setPeriodState] = useState<Period>(defaultPeriod);

  // Ao montar, lê o período da URL (sobrevive a F5 / link compartilhado).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inicio = params.get("inicio");
    const fim = params.get("fim");
    if (inicio && fim) setPeriodState({ inicio, fim });
  }, []);

  function setPeriod(p: Period) {
    setPeriodState(p);
    const params = new URLSearchParams(window.location.search);
    params.set("inicio", p.inicio);
    params.set("fim", p.fim);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${params.toString()}`
    );
  }

  return (
    <PeriodContext.Provider value={{ period, setPeriod }}>
      {children}
    </PeriodContext.Provider>
  );
}

export function usePeriod() {
  const ctx = useContext(PeriodContext);
  if (!ctx) throw new Error("usePeriod deve ser usado dentro de PeriodProvider");
  return ctx;
}
