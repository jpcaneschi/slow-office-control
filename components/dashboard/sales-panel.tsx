"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  MoreVertical,
  BarChart3,
  RefreshCw,
  Download,
  FileBarChart2,
} from "lucide-react";
import { SalesChart, type SalesPoint } from "./sales-chart";
import {
  usePeriod,
  presetRange,
  labelForPeriod,
  isoToDate,
  formatBR,
  type PresetKey,
} from "./period-context";
import { supabase } from "@/lib/supabase";

export type VendaLite = {
  total: number | null;
  status: string;
  created_at: string;
  contarPedido?: boolean;
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
  { key: "este_ano", label: "Este ano" },
];

const MESES_ABREV = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
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

function buildSeries(vendas: VendaLite[], start: Date, end: Date): SalesPoint[] {
  const concluidas = vendas.filter((v) => v.status === "concluida");
  const startMs = startOfDay(start).getTime();
  const endMs = startOfDay(end).getTime();
  const totalDays = Math.round((endMs - startMs) / DAY) + 1;

  const somaEntre = (a: number, b: number) => {
    let faturamento = 0;
    let pedidos = 0;
    for (const v of concluidas) {
      const vt = new Date(v.created_at).getTime();
      if (vt >= a && vt < b) {
        faturamento += Number(v.total || 0);
        pedidos += v.contarPedido === false ? 0 : 1;
      }
    }
    return { faturamento, pedidos };
  };

  const points: SalesPoint[] = [];
  if (totalDays > 92) {
    let cur = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cur <= last) {
      const next = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      const { faturamento, pedidos } = somaEntre(cur.getTime(), next.getTime());
      points.push({
        dia: `${MESES_ABREV[cur.getMonth()]}/${String(cur.getFullYear()).slice(2)}`,
        faturamento,
        pedidos,
      });
      cur = next;
    }
  } else {
    const stepDays = totalDays > 31 ? 7 : 1;
    for (let t = startMs; t <= endMs; t += stepDays * DAY) {
      const { faturamento, pedidos } = somaEntre(t, t + stepDays * DAY);
      points.push({ dia: label(new Date(t)), faturamento, pedidos });
    }
  }
  return points;
}

export function SalesPanel({
  vendas,
  loading,
  onRefresh,
}: {
  vendas: VendaLite[];
  loading: boolean;
  onRefresh?: () => void;
}) {
  const { period, setPeriod } = usePeriod();
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [vendasReais, setVendasReais] = useState<VendaLite[] | null>(null);
  const [loadingVendasReais, setLoadingVendasReais] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  const carregarVendasReais = useCallback(async () => {
    setLoadingVendasReais(true);
    const { data, error } = await supabase
      .from("vendas")
      .select("total,status,created_at")
      .order("created_at", { ascending: true });

    if (!error) {
      setVendasReais((data as VendaLite[] | null) || []);
    }
    setLoadingVendasReais(false);
  }, []);

  useEffect(() => {
    setMounted(true);
    carregarVendasReais();
  }, [carregarVendasReais]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const n = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(n)) setOpen(false);
      if (moreRef.current && !moreRef.current.contains(n)) setMoreOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  // O gráfico representa o valor integral dos pedidos vendidos na data da venda.
  // Recebimentos posteriores de promissória ficam nos cards financeiros, não aqui.
  const fonteGrafico = useMemo(
    () => vendasReais ?? vendas.filter((v) => v.contarPedido !== false),
    [vendasReais, vendas]
  );

  const data = useMemo(
    () => buildSeries(fonteGrafico, isoToDate(period.inicio), isoToDate(period.fim)),
    [fonteGrafico, period]
  );
  const temDados = data.some((d) => d.pedidos > 0 || d.faturamento > 0);
  const currentLabel = mounted ? labelForPeriod(period) : "Período";
  const carregandoGrafico = loading || loadingVendasReais;

  function exportarCSV() {
    const linhas = [
      ["Periodo", "Valor dos pedidos (R$)", "Pedidos"],
      ...data.map((d) => [
        d.dia,
        String(d.faturamento).replace(".", ","),
        String(d.pedidos),
      ]),
    ];
    const csv = linhas.map((l) => l.join(";")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pedidos_${period.inicio}_a_${period.fim}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setMoreOpen(false);
  }

  function atualizarTudo() {
    onRefresh?.();
    carregarVendasReais();
    setMoreOpen(false);
  }

  return (
    <section className="rounded-3xl border border-[#eef2f7] bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.05)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-[#0f172a]">Pedidos vendidos no período</h3>
          <div className="mt-2 flex items-center gap-4 text-xs text-[#64748b]">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#3b82f6]" />
              Valor dos pedidos (R$)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full bg-[#2563eb]" />
              Pedidos
            </span>
          </div>
          <p className="mt-1.5 text-[11px] text-[#94a3b8]">
            Mostra o valor integral vendido na data da venda. Recebimentos de promissórias aparecem nos cards financeiros quando o dinheiro entra.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div ref={menuRef} className="relative">
            <button
              onClick={() => {
                setOpen((o) => !o);
                setMoreOpen(false);
              }}
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

          <div ref={moreRef} className="relative">
            <button
              onClick={() => {
                setMoreOpen((o) => !o);
                setOpen(false);
              }}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              aria-label="Mais opções do gráfico"
              className="rounded-lg border border-[#e8ecf4] bg-white p-1.5 text-[#64748b] transition hover:bg-[#f4f6fb] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {moreOpen && (
              <div
                role="menu"
                className="absolute right-0 z-20 mt-1.5 w-52 overflow-hidden rounded-xl border border-[#e8ecf4] bg-white py-1 shadow-[0_12px_30px_rgba(15,23,42,0.12)]"
              >
                {onRefresh && (
                  <button
                    onClick={atualizarTudo}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-[#334155] transition hover:bg-[#f4f6fb]"
                  >
                    <RefreshCw className="h-4 w-4 text-[#64748b]" />
                    Atualizar dados
                  </button>
                )}
                <button
                  onClick={exportarCSV}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-[#334155] transition hover:bg-[#f4f6fb]"
                >
                  <Download className="h-4 w-4 text-[#64748b]" />
                  Exportar CSV
                </button>
                <Link
                  href="/dashboard/relatorios"
                  onClick={() => setMoreOpen(false)}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-[#334155] transition hover:bg-[#f4f6fb]"
                >
                  <FileBarChart2 className="h-4 w-4 text-[#64748b]" />
                  Ver relatório completo
                </Link>
                <div className="border-t border-[#eef2f7] px-3.5 py-1.5 text-[11px] text-[#94a3b8]">
                  Período: {formatBR(period.inicio)} – {formatBR(period.fim)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {carregandoGrafico ? (
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
            Nenhum pedido concluído neste período
          </p>
          <p className="text-xs text-[#94a3b8]">
            Selecione outro período ou registre vendas para ver o gráfico.
          </p>
        </div>
      )}
    </section>
  );
}
