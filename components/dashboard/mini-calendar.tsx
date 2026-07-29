"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Clock,
  CalendarDays,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { EventoForm } from "./evento-form";
import {
  type Evento,
  tipoInfo,
  toISODate,
  formatDataBR,
  formatHora,
  statusLabel,
} from "@/lib/eventos-utils";

const WEEKDAYS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

type ClienteLite = { id: string; nome: string };

export function MiniCalendar() {
  const [view, setView] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [clientes, setClientes] = useState<ClienteLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<Evento | null>(null);
  const [dataPadrao, setDataPadrao] = useState<string | undefined>(undefined);

  const carregar = useCallback(async () => {
    setLoading(true);
    const first = toISODate(new Date(view.getFullYear(), view.getMonth(), 1));
    const last = toISODate(new Date(view.getFullYear(), view.getMonth() + 1, 0));
    const { data } = await supabase
      .from("eventos")
      .select("*")
      .gte("data", first)
      .lte("data", last)
      .order("data", { ascending: true })
      .order("hora", { ascending: true });
    setEventos((data as Evento[]) || []);
    setLoading(false);
  }, [view]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    supabase
      .from("clientes")
      .select("id, nome")
      .then(({ data }) => setClientes((data as ClienteLite[]) || []));
  }, []);

  const porDia = useMemo(() => {
    const map = new Map<string, Evento[]>();
    for (const e of eventos) {
      const arr = map.get(e.data) || [];
      arr.push(e);
      map.set(e.data, arr);
    }
    return map;
  }, [eventos]);

  const cells = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const startWeekday = first.getDay();
    const dias = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    const out: (Date | null)[] = [];
    for (let i = 0; i < startWeekday; i++) out.push(null);
    for (let d = 1; d <= dias; d++)
      out.push(new Date(view.getFullYear(), view.getMonth(), d));
    return out;
  }, [view]);

  const hojeISO = toISODate(new Date());

  function abrirDia(iso: string) {
    setDiaSelecionado(iso);
  }

  function novoEvento(dataISO?: string) {
    setEditando(null);
    setDataPadrao(dataISO);
    setFormOpen(true);
  }

  function editarEvento(ev: Evento) {
    setEditando(ev);
    setDataPadrao(undefined);
    setFormOpen(true);
  }

  const eventosDoDia = diaSelecionado ? porDia.get(diaSelecionado) || [] : [];

  return (
    <div className="flex h-full flex-col rounded-2xl border border-[#e8ecf4] bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-bold text-[#0f172a]">
          {MESES[view.getMonth()]} {view.getFullYear()}
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
            aria-label="Mês anterior"
            className="rounded-lg p-1.5 text-[#64748b] transition hover:bg-[#f4f6fb]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
            aria-label="Próximo mês"
            className="rounded-lg p-1.5 text-[#64748b] transition hover:bg-[#f4f6fb]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              const n = new Date();
              setView(new Date(n.getFullYear(), n.getMonth(), 1));
            }}
            className="ml-1 rounded-lg border border-[#e8ecf4] px-2.5 py-1 text-xs font-semibold text-[#2563eb] transition hover:bg-[#f4f6fb]"
          >
            Hoje
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="py-1 text-[10px] font-bold text-[#94a3b8]">
            {w}
          </span>
        ))}

        {cells.map((d, i) => {
          if (!d) return <span key={i} />;
          const iso = toISODate(d);
          const evs = porDia.get(iso) || [];
          const isHoje = iso === hojeISO;
          return (
            <button
              key={i}
              onClick={() => abrirDia(iso)}
              className="flex flex-col items-center justify-start rounded-lg py-1 transition hover:bg-[#f4f6fb]"
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${
                  isHoje
                    ? "bg-[#2563eb] font-bold text-white"
                    : "font-medium text-[#334155]"
                }`}
              >
                {d.getDate()}
              </span>
              <span className="mt-0.5 flex h-1.5 items-center gap-0.5">
                {evs.slice(0, 3).map((e) => (
                  <span
                    key={e.id}
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: tipoInfo(e.tipo).color }}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-[#eef2f7] pt-4">
        <button
          onClick={() => novoEvento(hojeISO)}
          className="flex items-center gap-1.5 rounded-lg bg-[#2563eb] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#1d4ed8]"
        >
          <Plus className="h-3.5 w-3.5" />
          Novo evento
        </button>
        <Link
          href="/dashboard/agenda"
          className="text-sm font-semibold text-[#2563eb] transition hover:underline"
        >
          Ver agenda completa →
        </Link>
      </div>

      {loading && (
        <p className="mt-2 text-center text-[11px] text-[#94a3b8]">Carregando eventos…</p>
      )}

      {/* Painel do dia */}
      {diaSelecionado && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
          onClick={() => setDiaSelecionado(null)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#eef2f7] px-5 py-4">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-[#2563eb]" />
                <h3 className="text-base font-bold text-[#0f172a]">
                  {formatDataBR(diaSelecionado)}
                </h3>
              </div>
              <button
                onClick={() => setDiaSelecionado(null)}
                aria-label="Fechar"
                className="rounded-lg p-1.5 text-[#64748b] transition hover:bg-[#f4f6fb]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
              {eventosDoDia.length === 0 ? (
                <p className="py-6 text-center text-sm text-[#94a3b8]">
                  Nenhum evento neste dia.
                </p>
              ) : (
                eventosDoDia.map((e) => {
                  const info = tipoInfo(e.tipo);
                  return (
                    <button
                      key={e.id}
                      onClick={() => editarEvento(e)}
                      className="flex w-full items-center gap-3 rounded-xl border border-[#eef2f7] p-3 text-left transition hover:bg-[#f8fafc]"
                    >
                      <span
                        className="mt-0.5 h-9 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: info.color }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-bold text-[#0f172a]">
                            {e.titulo}
                          </span>
                          {e.status === "concluida" && (
                            <span className="shrink-0 rounded-full bg-[#dcfce7] px-2 py-0.5 text-[10px] font-bold text-[#16a34a]">
                              {statusLabel(e.status)}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2 text-xs text-[#64748b]">
                          <span style={{ color: info.color }}>{info.label}</span>
                          {e.hora && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatHora(e.hora)}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <div className="border-t border-[#eef2f7] px-5 py-4">
              <button
                onClick={() => novoEvento(diaSelecionado)}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#2563eb] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#1d4ed8]"
              >
                <Plus className="h-4 w-4" />
                Novo evento neste dia
              </button>
            </div>
          </div>
        </div>
      )}

      <EventoForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={carregar}
        clientes={clientes}
        evento={editando}
        dataPadrao={dataPadrao}
      />
    </div>
  );
}
