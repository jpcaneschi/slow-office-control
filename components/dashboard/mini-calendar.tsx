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
  ExternalLink,
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
import { feriadosDoAno } from "@/lib/feriados";

const WEEKDAYS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

type Cliente = { id: string; nome: string; data_nascimento: string | null };
type CondicionalLite = { id: string; status: string; data_limite: string | null };
type PromissoriaLite = { id: string; status: string; data_vencimento: string | null };

// Item unificado do calendário (manual OU automático).
type CalItem = {
  id: string;
  data: string;
  titulo: string;
  subtitulo: string;
  color: string;
  hora: string | null;
  automatico: boolean;
  readonly?: boolean; // feriados: só leitura, sem clique
  categoria: string; // chave da legenda/filtro
  catLabel: string; // rótulo da legenda
  evento?: Evento; // quando manual
  href?: string; // quando automático (registro de origem)
};

export function MiniCalendar() {
  const [view, setView] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [condicionais, setCondicionais] = useState<CondicionalLite[]>([]);
  const [promissorias, setPromissorias] = useState<PromissoriaLite[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<Evento | null>(null);
  const [dataPadrao, setDataPadrao] = useState<string | undefined>(undefined);
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());

  const first = toISODate(new Date(view.getFullYear(), view.getMonth(), 1));
  const last = toISODate(new Date(view.getFullYear(), view.getMonth() + 1, 0));

  const carregar = useCallback(async () => {
    setLoading(true);
    const [evRes, condRes, promRes] = await Promise.all([
      supabase
        .from("eventos")
        .select("*")
        .gte("data", first)
        .lte("data", last)
        .order("hora", { ascending: true }),
      supabase
        .from("condicionais")
        .select("id, status, data_limite")
        .eq("status", "aberto")
        .gte("data_limite", first)
        .lte("data_limite", last),
      supabase
        .from("promissorias")
        .select("id, status, data_vencimento")
        .eq("status", "em_aberto")
        .gte("data_vencimento", first)
        .lte("data_vencimento", last),
    ]);
    setEventos((evRes.data as Evento[]) || []);
    setCondicionais((condRes.data as CondicionalLite[]) || []);
    setPromissorias((promRes.data as PromissoriaLite[]) || []);
    setLoading(false);
  }, [first, last]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    supabase
      .from("clientes")
      .select("id, nome, data_nascimento")
      .then(({ data }) => setClientes((data as Cliente[]) || []));
  }, []);

  // Monta os itens (manuais + automáticos) do mês visível.
  const itens = useMemo<CalItem[]>(() => {
    const out: CalItem[] = [];

    for (const e of eventos) {
      const info = tipoInfo(e.tipo);
      out.push({
        id: `ev-${e.id}`,
        data: e.data,
        titulo: e.titulo,
        subtitulo: info.label,
        color: info.color,
        hora: e.hora,
        automatico: false,
        categoria: e.tipo,
        catLabel: info.label,
        evento: e,
      });
    }

    for (const c of condicionais) {
      if (!c.data_limite) continue;
      out.push({
        id: `cond-${c.id}`,
        data: c.data_limite,
        titulo: "Retorno de condicional",
        subtitulo: "Prazo de devolução",
        color: "#d97706",
        hora: null,
        automatico: true,
        categoria: "condicional",
        catLabel: "Condicionais",
        href: "/dashboard/condicional",
      });
    }

    for (const p of promissorias) {
      if (!p.data_vencimento) continue;
      out.push({
        id: `prom-${p.id}`,
        data: p.data_vencimento,
        titulo: "Vencimento de promissória",
        subtitulo: "A receber",
        color: "#dc2626",
        hora: null,
        automatico: true,
        categoria: "promissoria",
        catLabel: "Vencimentos",
        href: "/dashboard/promissorias",
      });
    }

    // Aniversários: recorrentes todo ano → usa mês/dia no ano exibido.
    const mesView = view.getMonth() + 1;
    for (const cl of clientes) {
      if (!cl.data_nascimento) continue;
      const [, m, d] = cl.data_nascimento.split("-");
      if (Number(m) !== mesView) continue;
      out.push({
        id: `aniv-${cl.id}`,
        data: `${view.getFullYear()}-${m}-${d}`,
        titulo: `Aniversário de ${cl.nome}`,
        subtitulo: "Aniversário",
        color: "#db2777",
        hora: null,
        automatico: true,
        categoria: "aniversario",
        catLabel: "Aniversários",
        href: "/dashboard/clientes",
      });
    }

    // Feriados nacionais (somente leitura) do mês visível.
    const feriados = feriadosDoAno(view.getFullYear());
    const prefixoMes = `${view.getFullYear()}-${String(view.getMonth() + 1).padStart(2, "0")}`;
    for (const [dataISO, nome] of feriados) {
      if (!dataISO.startsWith(prefixoMes)) continue;
      out.push({
        id: `feriado-${dataISO}`,
        data: dataISO,
        titulo: nome,
        subtitulo: "Feriado nacional",
        color: "#0ea5e9",
        hora: null,
        automatico: true,
        readonly: true,
        categoria: "feriado",
        catLabel: "Feriados",
      });
    }

    return out;
  }, [eventos, condicionais, promissorias, clientes, view]);

  const legenda = useMemo(() => {
    const map = new Map<string, { label: string; color: string; count: number }>();
    for (const it of itens) {
      const cur = map.get(it.categoria);
      if (cur) cur.count += 1;
      else map.set(it.categoria, { label: it.catLabel, color: it.color, count: 1 });
    }
    return Array.from(map.entries()).map(([categoria, v]) => ({ categoria, ...v }));
  }, [itens]);

  const itensVisiveis = useMemo(
    () => itens.filter((it) => !ocultas.has(it.categoria)),
    [itens, ocultas]
  );

  const porDia = useMemo(() => {
    const map = new Map<string, CalItem[]>();
    for (const it of itensVisiveis) {
      const arr = map.get(it.data) || [];
      arr.push(it);
      map.set(it.data, arr);
    }
    return map;
  }, [itensVisiveis]);

  function toggleCategoria(cat: string) {
    setOcultas((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  const cells = useMemo(() => {
    const firstDate = new Date(view.getFullYear(), view.getMonth(), 1);
    const startWeekday = firstDate.getDay();
    const dias = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    const out: (Date | null)[] = [];
    for (let i = 0; i < startWeekday; i++) out.push(null);
    for (let d = 1; d <= dias; d++)
      out.push(new Date(view.getFullYear(), view.getMonth(), d));
    return out;
  }, [view]);

  const clientesLite = useMemo(
    () => clientes.map((c) => ({ id: c.id, nome: c.nome })),
    [clientes]
  );

  const hojeISO = toISODate(new Date());

  function novoEvento(dataISO?: string) {
    setEditando(null);
    setDataPadrao(dataISO);
    setFormOpen(true);
  }

  const itensDoDia = diaSelecionado ? porDia.get(diaSelecionado) || [] : [];

  return (
    <div className="flex h-full flex-col rounded-3xl border border-[#eef2f7] bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.05)]">
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
          const its = porDia.get(iso) || [];
          const isHoje = iso === hojeISO;
          return (
            <button
              key={i}
              onClick={() => setDiaSelecionado(iso)}
              className="flex flex-col items-center justify-start rounded-lg py-1 transition hover:bg-[#f4f6fb]"
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${
                  isHoje ? "bg-[#2563eb] font-bold text-white" : "font-medium text-[#334155]"
                }`}
              >
                {d.getDate()}
              </span>
              <span className="mt-0.5 flex h-1.5 items-center gap-0.5">
                {its.slice(0, 3).map((it) => (
                  <span
                    key={it.id}
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: it.color }}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      {legenda.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[#eef2f7] pt-3">
          {legenda.map((l) => {
            const oculta = ocultas.has(l.categoria);
            return (
              <button
                key={l.categoria}
                onClick={() => toggleCategoria(l.categoria)}
                aria-pressed={!oculta}
                title={oculta ? "Mostrar no calendário" : "Ocultar do calendário"}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                  oculta ? "bg-white text-[#94a3b8] opacity-60" : "bg-[#f4f6fb] text-[#334155]"
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: oculta ? "#cbd5e1" : l.color }}
                />
                {l.label}
                <span className="font-bold">{l.count}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-[#eef2f7] pt-4">
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
            className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
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
              {itensDoDia.length === 0 ? (
                <p className="py-6 text-center text-sm text-[#94a3b8]">
                  Nenhum evento neste dia.
                </p>
              ) : (
                itensDoDia.map((it) => {
                  const conteudo = (
                    <>
                      <span
                        className="mt-0.5 h-9 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: it.color }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-bold text-[#0f172a]">
                            {it.titulo}
                          </span>
                          {it.automatico && it.href && (
                            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-[#94a3b8]" />
                          )}
                          {!it.automatico &&
                            it.evento?.status === "concluida" && (
                              <span className="shrink-0 rounded-full bg-[#dcfce7] px-2 py-0.5 text-[10px] font-bold text-[#16a34a]">
                                {statusLabel(it.evento.status)}
                              </span>
                            )}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2 text-xs text-[#64748b]">
                          <span style={{ color: it.color }}>{it.subtitulo}</span>
                          {it.hora && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatHora(it.hora)}
                            </span>
                          )}
                          {it.automatico && it.href && (
                            <span className="text-[#94a3b8]">· automático</span>
                          )}
                        </span>
                      </span>
                    </>
                  );

                  const cls =
                    "flex w-full items-center gap-3 rounded-xl border border-[#eef2f7] p-3 text-left transition hover:bg-[#f8fafc]";

                  if (it.readonly) {
                    return (
                      <div key={it.id} className={`${cls} cursor-default`}>
                        {conteudo}
                      </div>
                    );
                  }
                  return it.automatico && it.href ? (
                    <Link key={it.id} href={it.href} className={cls}>
                      {conteudo}
                    </Link>
                  ) : (
                    <button
                      key={it.id}
                      onClick={() => {
                        setEditando(it.evento || null);
                        setDataPadrao(undefined);
                        setFormOpen(true);
                      }}
                      className={cls}
                    >
                      {conteudo}
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
        clientes={clientesLite}
        evento={editando}
        dataPadrao={dataPadrao}
      />
    </div>
  );
}
