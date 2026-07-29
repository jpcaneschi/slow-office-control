"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import {
  usePeriod,
  presetRange,
  labelForPeriod,
  toISO,
  isoToDate,
  type PresetKey,
  type Period,
} from "./period-context";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "ontem", label: "Ontem" },
  { key: "7", label: "Últimos 7 dias" },
  { key: "15", label: "Últimos 15 dias" },
  { key: "30", label: "Últimos 30 dias" },
  { key: "este_mes", label: "Este mês" },
  { key: "mes_anterior", label: "Mês anterior" },
];

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function PeriodFilter() {
  const { period, setPeriod } = usePeriod();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // rascunho do intervalo enquanto o popover está aberto
  const [start, setStart] = useState<Date | null>(null);
  const [end, setEnd] = useState<Date | null>(null);
  const [view, setView] = useState(() => new Date());

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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

  function abrir() {
    const ini = isoToDate(period.inicio);
    const f = isoToDate(period.fim);
    setStart(ini);
    setEnd(f);
    setView(new Date(f.getFullYear(), f.getMonth(), 1));
    setOpen(true);
  }

  function aplicarPreset(key: PresetKey) {
    setPeriod(presetRange(key));
    setOpen(false);
  }

  function clicarDia(d: Date) {
    if (!start || (start && end)) {
      setStart(d);
      setEnd(null);
    } else if (d < start) {
      setStart(d);
    } else {
      setEnd(d);
    }
  }

  function aplicarIntervalo() {
    if (!start || !end) return;
    const p: Period = { inicio: toISO(start), fim: toISO(end) };
    setPeriod(p);
    setOpen(false);
  }

  const cells = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(
      view.getFullYear(),
      view.getMonth() + 1,
      0
    ).getDate();
    const out: (Date | null)[] = [];
    for (let i = 0; i < startWeekday; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++)
      out.push(new Date(view.getFullYear(), view.getMonth(), d));
    return out;
  }, [view]);

  const hoje = new Date();
  const anos = [];
  for (let a = hoje.getFullYear() - 5; a <= hoje.getFullYear() + 1; a++) anos.push(a);

  const label = mounted ? labelForPeriod(period) : "Período";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => (open ? setOpen(false) : abrir())}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-xl border border-[#e8ecf4] bg-white px-3.5 py-2.5 text-sm font-semibold text-[#334155] transition hover:bg-[#f4f6fb] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
      >
        <Calendar className="h-4 w-4 text-[#64748b]" />
        <span suppressHydrationWarning>{label}</span>
        <ChevronDown
          className={`h-4 w-4 text-[#94a3b8] transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Selecionar período"
          className="absolute right-0 z-40 mt-2 flex w-[min(92vw,540px)] flex-col overflow-hidden rounded-2xl border border-[#e8ecf4] bg-white shadow-[0_16px_44px_rgba(15,23,42,0.16)] sm:flex-row"
        >
          {/* Atalhos */}
          <div className="shrink-0 border-b border-[#eef2f7] p-2 sm:w-40 sm:border-b-0 sm:border-r">
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-1">
              {PRESETS.map((p) => {
                const r = presetRange(p.key);
                const ativo = r.inicio === period.inicio && r.fim === period.fim;
                return (
                  <button
                    key={p.key}
                    onClick={() => aplicarPreset(p.key)}
                    className={`rounded-lg px-3 py-2 text-left text-sm transition ${
                      ativo
                        ? "bg-[#eff6ff] font-semibold text-[#2563eb]"
                        : "text-[#475569] hover:bg-[#f4f6fb]"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Calendário */}
          <div className="flex-1 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <button
                onClick={() =>
                  setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))
                }
                aria-label="Mês anterior"
                className="rounded-lg p-1.5 text-[#64748b] transition hover:bg-[#f4f6fb]"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-1.5">
                <select
                  value={view.getMonth()}
                  onChange={(e) =>
                    setView(new Date(view.getFullYear(), Number(e.target.value), 1))
                  }
                  aria-label="Mês"
                  className="rounded-lg border border-[#e8ecf4] bg-white px-2 py-1 text-sm font-semibold text-[#334155] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
                >
                  {MESES.map((m, i) => (
                    <option key={m} value={i}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  value={view.getFullYear()}
                  onChange={(e) =>
                    setView(new Date(Number(e.target.value), view.getMonth(), 1))
                  }
                  aria-label="Ano"
                  className="rounded-lg border border-[#e8ecf4] bg-white px-2 py-1 text-sm font-semibold text-[#334155] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
                >
                  {anos.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={() =>
                  setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))
                }
                aria-label="Próximo mês"
                className="rounded-lg p-1.5 text-[#64748b] transition hover:bg-[#f4f6fb]"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-0.5 text-center">
              {WEEKDAYS.map((w, i) => (
                <span key={i} className="py-1 text-[10px] font-bold text-[#94a3b8]">
                  {w}
                </span>
              ))}
              {cells.map((d, i) => {
                if (!d) return <span key={i} />;
                const isStart = start && sameDay(d, start);
                const isEnd = end && sameDay(d, end);
                const inRange =
                  start && end && d >= start && d <= end && !isStart && !isEnd;
                const isToday = sameDay(d, hoje);
                return (
                  <button
                    key={i}
                    onClick={() => clicarDia(d)}
                    className={`flex h-8 items-center justify-center rounded-lg text-sm transition ${
                      isStart || isEnd
                        ? "bg-[#2563eb] font-bold text-white"
                        : inRange
                        ? "bg-[#dbeafe] text-[#1e40af]"
                        : isToday
                        ? "font-bold text-[#2563eb] ring-1 ring-inset ring-[#bfdbfe]"
                        : "text-[#334155] hover:bg-[#f4f6fb]"
                    }`}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-[#eef2f7] pt-3">
              <button
                onClick={() => {
                  setStart(null);
                  setEnd(null);
                }}
                className="text-xs font-semibold text-[#64748b] transition hover:text-[#334155]"
              >
                Limpar
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[#64748b] transition hover:bg-[#f4f6fb]"
                >
                  Cancelar
                </button>
                <button
                  onClick={aplicarIntervalo}
                  disabled={!start || !end}
                  className="rounded-lg bg-[#2563eb] px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
