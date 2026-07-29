"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, MoreVertical, BarChart3 } from "lucide-react";
import { SalesChart, type SalesPoint } from "./sales-chart";
import {
  usePeriod,
  presetRange,
  labelForPeriod,
  isoToDate,
  type PresetKey,
} from "./period-context";

export type VendaLite = {
  total: number | null;
  status: string;
  created_at: string;
};

const PERIODS: { key: PresetKey; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "7", label: "Últimos 7 dias" },
  { key: "15", label: "Últimos 15 dias" },
  { key: "30", label: "Últimos 30 dias" },
  { key: "60", label: "Últimos 60 dias" },
  { key: "90", label: "Últimos 90 dias" },
  { key: "este_mes", label: "Este mês" },
  { key: "mes_anterior", label: "Mês anterior" },
];

const DAY = 86400000;

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function label(date: Date) {
  return `${String(date.getDate()).padStart(2, "0")}/${String(
    date.getMonth() + 1
  ).padStart(2, "0")}`;
}

/** Agrega vendas concluídas em barras (faturamento) e linha (pedidos). */
function buildSeries(vendas: VendaLite[], start: Date, end: Date): SalesPoint[] {
  const concluidas = vendas.filter((v) => v.status === "concluida");
  const startMs = startOfDay(start).getTime();
  const endMs = startOfDay(end).getTime();
  const totalDays = Math.round((endMs - startMs) / DAY) + 1;
  const weekly = totalDays > 31; // acima de ~1 mês, agrupa por semana
  const stepDays = weekly ? 7 : 1;

  const points: SalesPoint[] = [];
  for (let t = startMs; t <= endMs; t += stepDays * DAY) {
    const bucketStart = t;
    const bucketEnd = t + stepDays * DAY; // exclusivo
    let faturamento = 0;
    let pedidos = 0;
    for (const v of concluidas) {
      const vt = new Date(v.created_at).getTime();
      if (vt >= bucketStart && vt < bucketEnd) {
        faturamento += Number(v.total || 0);
        pedidos += 1;
      }
    }
    points.push({ dia: label(new Date(bucketStart)), faturamento, pedidos });
  }
  return points;
}

export function SalesPanel({
  vendas,
  loading,
}: {
  vendas: VendaLite[];
  loading: boolean;
}) {
  const { period, setPeriod } = usePeriod();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  const data = useMemo(() => {
    return buildSeries(vendas, isoToDate(period.inicio), isoToDate(period.fim));
  }, [vendas, period]);

  const temDados = data.some((d) => d.pedidos > 0);
  const currentLabel = mounted ? labelForPeriod(period) : "Período";

  return (
    <section className="rounded-2xl border border-[#e8ecf4] bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-[#0f172a]">Vendas no período</h3>
          <div className="mt-2 flex items-center gap-4 text-xs text-[#64748b]">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#3b82f6]" />
              Faturamento (R$)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full bg-[#2563eb]" />
              Pedidos
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setOpen((o) => !o)}
              aria-haspopup="listbox"
              aria-expanded={open}
              className="flex items-center gap-1.5 rounded-lg border border-[#e8ecf4] bg-white px-3 py-1.5 text-xs font-semibold text-[#334155] transition hover:bg-[#f4f6fb] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
            >
              <span suppressHydrationWarning>{currentLabel}</span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-[#94a3b8] transition-transform ${
                  open ? "rotate-180" : ""
                }`}
              />
            </button>

            {open && (
              <div
                role="listbox"
                className="absolute right-0 z-20 mt-1.5 w-48 overflow-hidden rounded-xl border border-[#e8ecf4] bg-white py-1 shadow-[0_12px_30px_rgba(15,23,42,0.12)]"
              >
                {PERIODS.map((p) => {
                  const r = presetRange(p.key);
                  const active = r.inicio === period.inicio && r.fim === period.fim;
                  return (
                    <button
                      key={p.key}
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        setPeriod(presetRange(p.key));
                        setOpen(false);
                      }}
                      className={`block w-full px-3.5 py-2 text-left text-sm transition ${
                        active
                          ? "bg-[#eff6ff] font-semibold text-[#2563eb]"
                          : "text-[#334155] hover:bg-[#f4f6fb]"
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            className="rounded-lg border border-[#e8ecf4] bg-white p-1.5 text-[#64748b] transition hover:bg-[#f4f6fb]"
            aria-label="Mais opções do gráfico"
            title="Mais opções (em breve)"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-[340px] w-full items-center justify-center">
          <div className="h-full w-full animate-pulse rounded-xl bg-[#f1f5f9]" />
        </div>
      ) : temDados ? (
        <SalesChart data={data} />
      ) : (
        <div className="flex h-[340px] w-full flex-col items-center justify-center gap-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f1f5f9] text-[#94a3b8]">
            <BarChart3 className="h-6 w-6" />
          </span>
          <p className="text-sm font-semibold text-[#475569]">
            Nenhuma venda concluída neste período
          </p>
          <p className="text-xs text-[#94a3b8]">
            Selecione outro período ou registre vendas para ver o gráfico.
          </p>
        </div>
      )}
    </section>
  );
}
