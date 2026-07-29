"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, MoreVertical } from "lucide-react";
import { SalesChart, type SalesPoint } from "./sales-chart";

// Dados de exemplo (serão trocados por dados reais do Supabase). ───────────────
const seven: SalesPoint[] = [
  { dia: "Sex 24/05", faturamento: 32450, pedidos: 42 },
  { dia: "Sáb 25/05", faturamento: 58210, pedidos: 68 },
  { dia: "Dom 26/05", faturamento: 24780, pedidos: 31 },
  { dia: "Seg 27/05", faturamento: 65430, pedidos: 75 },
  { dia: "Ter 28/05", faturamento: 43190, pedidos: 52 },
  { dia: "Qua 29/05", faturamento: 71890, pedidos: 83 },
  { dia: "Qui 30/05", faturamento: 54230, pedidos: 61 },
];

// Série determinística por dia (mesmo resultado no servidor e no cliente).
function buildMonthSeries(fromDay: number, toDay: number): SalesPoint[] {
  const out: SalesPoint[] = [];
  for (let d = fromDay; d <= toDay; d++) {
    const faturamento = Math.round(
      46000 + 20000 * Math.sin(d * 0.7) + 9000 * Math.cos(d * 1.6)
    );
    out.push({
      dia: `${String(d).padStart(2, "0")}/05`,
      faturamento,
      pedidos: Math.max(20, Math.round(faturamento / 850)),
    });
  }
  return out;
}

const PERIODS = {
  "7": { label: "Últimos 7 dias", data: seven },
  "15": { label: "Últimos 15 dias", data: buildMonthSeries(16, 30) },
  "30": { label: "Últimos 30 dias", data: buildMonthSeries(1, 30) },
} as const;

type PeriodKey = keyof typeof PERIODS;

export function SalesPanel() {
  const [period, setPeriod] = useState<PeriodKey>("7");
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Fecha o menu ao clicar fora.
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const current = PERIODS[period];

  return (
    <section className="rounded-2xl border border-[#e8ecf4] bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-[#0f172a]">
            Vendas nos {current.label.replace("Últimos ", "últimos ")}
          </h3>
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
          {/* Seletor de período (funcional) */}
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-lg border border-[#e8ecf4] bg-white px-3 py-1.5 text-xs font-semibold text-[#334155] transition hover:bg-[#f4f6fb]"
            >
              {current.label}
              <ChevronDown
                className={`h-3.5 w-3.5 text-[#94a3b8] transition-transform ${
                  open ? "rotate-180" : ""
                }`}
              />
            </button>

            {open && (
              <div className="absolute right-0 z-20 mt-1.5 w-44 overflow-hidden rounded-xl border border-[#e8ecf4] bg-white py-1 shadow-[0_12px_30px_rgba(15,23,42,0.12)]">
                {(Object.keys(PERIODS) as PeriodKey[]).map((key) => {
                  const active = key === period;
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        setPeriod(key);
                        setOpen(false);
                      }}
                      className={`block w-full px-3.5 py-2 text-left text-sm transition ${
                        active
                          ? "bg-[#eff6ff] font-semibold text-[#2563eb]"
                          : "text-[#334155] hover:bg-[#f4f6fb]"
                      }`}
                    >
                      {PERIODS[key].label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button className="rounded-lg border border-[#e8ecf4] bg-white p-1.5 text-[#64748b] transition hover:bg-[#f4f6fb]">
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      </div>

      <SalesChart data={current.data} />
    </section>
  );
}
