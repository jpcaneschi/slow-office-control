"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Clock,
  CalendarDays,
  List,
  LayoutGrid,
  CalendarRange,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { EventoForm } from "@/components/dashboard/evento-form";
import {
  type Evento,
  TIPOS,
  STATUS,
  tipoInfo,
  prioridadeInfo,
  statusLabel,
  formatDataBR,
  formatHora,
  toISODate,
} from "@/lib/eventos-utils";
import { feriadosDoAno } from "@/lib/feriados";

type ClienteLite = { id: string; nome: string };

const WEEKDAYS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const selectClass =
  "rounded-lg border border-[#e8ecf4] bg-white px-3 py-2 text-sm font-semibold text-[#334155] outline-none focus:border-[#2563eb]";

export default function AgendaPage() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [clientes, setClientes] = useState<ClienteLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [view, setView] = useState<"lista" | "mes" | "semana" | "dia">("lista");
  const [mesView, setMesView] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [refDate, setRefDate] = useState(() => new Date());
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<Evento | null>(null);
  const [dataPadrao, setDataPadrao] = useState<string | undefined>(undefined);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    const { data, error } = await supabase
      .from("eventos")
      .select("*")
      .order("data", { ascending: true })
      .order("hora", { ascending: true });
    if (error) setErro(error.message);
    setEventos((data as Evento[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    supabase
      .from("clientes")
      .select("id, nome")
      .then(({ data }) => setClientes((data as ClienteLite[]) || []));
  }, []);

  const clienteNome = useMemo(() => {
    const m = new Map<string, string>();
    clientes.forEach((c) => m.set(c.id, c.nome));
    return m;
  }, [clientes]);

  const filtrados = useMemo(() => {
    return eventos.filter(
      (e) =>
        (filtroTipo === "todos" || e.tipo === filtroTipo) &&
        (filtroStatus === "todos" || e.status === filtroStatus)
    );
  }, [eventos, filtroTipo, filtroStatus]);

  const porDia = useMemo(() => {
    const m = new Map<string, Evento[]>();
    filtrados.forEach((e) => {
      const a = m.get(e.data) || [];
      a.push(e);
      m.set(e.data, a);
    });
    return m;
  }, [filtrados]);

  const cells = useMemo(() => {
    const first = new Date(mesView.getFullYear(), mesView.getMonth(), 1);
    const startWeekday = first.getDay();
    const dias = new Date(mesView.getFullYear(), mesView.getMonth() + 1, 0).getDate();
    const out: (Date | null)[] = [];
    for (let i = 0; i < startWeekday; i++) out.push(null);
    for (let d = 1; d <= dias; d++)
      out.push(new Date(mesView.getFullYear(), mesView.getMonth(), d));
    return out;
  }, [mesView]);

  const feriadosMap = useMemo(
    () => feriadosDoAno(mesView.getFullYear()),
    [mesView]
  );

  const hojeISO = toISODate(new Date());

  const diasDaSemana = useMemo(() => {
    const start = new Date(
      refDate.getFullYear(),
      refDate.getMonth(),
      refDate.getDate() - refDate.getDay()
    );
    return Array.from({ length: 7 }, (_, i) => {
      const x = new Date(start);
      x.setDate(start.getDate() + i);
      return x;
    });
  }, [refDate]);

  function feriadoDoDia(d: Date) {
    return feriadosDoAno(d.getFullYear()).get(toISODate(d));
  }

  const ddmm = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

  function abrirNovo(dataISO?: string) {
    setEditando(null);
    setDataPadrao(dataISO);
    setFormOpen(true);
  }

  function abrirEdicao(e: Evento) {
    setEditando(e);
    setDataPadrao(undefined);
    setFormOpen(true);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[#0f172a]">Agenda</h1>
          <p className="text-sm text-[#64748b]">
            Tarefas, compromissos, lembretes e agendamentos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Alternador de visão */}
          <div className="flex flex-wrap items-center rounded-lg border border-[#e8ecf4] bg-white p-0.5">
            {(
              [
                { v: "lista", l: "Lista", Icon: List },
                { v: "mes", l: "Mês", Icon: LayoutGrid },
                { v: "semana", l: "Semana", Icon: CalendarRange },
                { v: "dia", l: "Dia", Icon: CalendarClock },
              ] as const
            ).map(({ v, l, Icon }) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
                  view === v ? "bg-[#2563eb] text-white" : "text-[#334155]"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {l}
              </button>
            ))}
          </div>
          <button
            onClick={() => abrirNovo()}
            className="flex items-center gap-1.5 rounded-xl bg-[#2563eb] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#1d4ed8]"
          >
            <Plus className="h-4 w-4" />
            Novo evento
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className={selectClass}>
          <option value="todos">Todos os tipos</option>
          {TIPOS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className={selectClass}>
          <option value="todos">Todos os status</option>
          {STATUS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {erro && (
        <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">
          {erro}
        </div>
      )}

      {/* ─── Visão de mês ─────────────────────────────────────────────── */}
      {view === "mes" && (
        <div className="rounded-2xl border border-[#e8ecf4] bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-bold text-[#0f172a]">
              {MESES[mesView.getMonth()]} {mesView.getFullYear()}
            </h3>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMesView(new Date(mesView.getFullYear(), mesView.getMonth() - 1, 1))}
                aria-label="Mês anterior"
                className="rounded-lg p-1.5 text-[#64748b] transition hover:bg-[#f4f6fb]"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setMesView(new Date(mesView.getFullYear(), mesView.getMonth() + 1, 1))}
                aria-label="Próximo mês"
                className="rounded-lg p-1.5 text-[#64748b] transition hover:bg-[#f4f6fb]"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  const n = new Date();
                  setMesView(new Date(n.getFullYear(), n.getMonth(), 1));
                }}
                className="ml-1 rounded-lg border border-[#e8ecf4] px-2.5 py-1 text-xs font-semibold text-[#2563eb] transition hover:bg-[#f4f6fb]"
              >
                Hoje
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="pb-1 text-center text-[10px] font-bold text-[#94a3b8]">
                {w}
              </div>
            ))}
            {cells.map((d, i) => {
              if (!d) return <div key={i} className="min-h-[92px] rounded-lg bg-[#fafbfc]" />;
              const iso = toISODate(d);
              const evs = porDia.get(iso) || [];
              const isHoje = iso === hojeISO;
              return (
                <div
                  key={i}
                  className="min-h-[92px] rounded-lg border border-[#eef2f7] p-1.5 transition hover:border-[#c7d7fb]"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                        isHoje ? "bg-[#2563eb] font-bold text-white" : "font-medium text-[#334155]"
                      }`}
                    >
                      {d.getDate()}
                    </span>
                    <button
                      onClick={() => abrirNovo(iso)}
                      aria-label="Novo evento neste dia"
                      className="rounded p-0.5 text-[#cbd5e1] transition hover:bg-[#f4f6fb] hover:text-[#2563eb]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-0.5 space-y-0.5">
                    {feriadosMap.get(iso) && (
                      <div className="flex items-center gap-1 rounded px-1 py-0.5 text-[11px]">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#0ea5e9]" />
                        <span
                          className="truncate font-medium text-[#0369a1]"
                          title={feriadosMap.get(iso)}
                        >
                          {feriadosMap.get(iso)}
                        </span>
                      </div>
                    )}
                    {evs.slice(0, 3).map((e) => {
                      const info = tipoInfo(e.tipo);
                      return (
                        <button
                          key={e.id}
                          onClick={() => abrirEdicao(e)}
                          title={e.titulo}
                          className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] hover:bg-[#f4f6fb]"
                        >
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: info.color }} />
                          <span className="truncate text-[#334155]">{e.titulo}</span>
                        </button>
                      );
                    })}
                    {evs.length > 3 && (
                      <p className="px-1 text-[10px] font-semibold text-[#94a3b8]">
                        +{evs.length - 3} mais
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Visão de semana ─────────────────────────────────────────── */}
      {view === "semana" && (
        <div className="rounded-2xl border border-[#e8ecf4] bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-bold text-[#0f172a]">
              {ddmm(diasDaSemana[0])} – {ddmm(diasDaSemana[6])}
            </h3>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setRefDate(new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate() - 7))}
                aria-label="Semana anterior"
                className="rounded-lg p-1.5 text-[#64748b] transition hover:bg-[#f4f6fb]"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setRefDate(new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate() + 7))}
                aria-label="Próxima semana"
                className="rounded-lg p-1.5 text-[#64748b] transition hover:bg-[#f4f6fb]"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => setRefDate(new Date())}
                className="ml-1 rounded-lg border border-[#e8ecf4] px-2.5 py-1 text-xs font-semibold text-[#2563eb] transition hover:bg-[#f4f6fb]"
              >
                Hoje
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
            {diasDaSemana.map((d) => {
              const iso = toISODate(d);
              const evs = porDia.get(iso) || [];
              const fer = feriadoDoDia(d);
              const isHoje = iso === hojeISO;
              return (
                <div key={iso} className="min-h-[130px] rounded-lg border border-[#eef2f7] p-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-[#94a3b8]">{WEEKDAYS[d.getDay()]}</span>
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                        isHoje ? "bg-[#2563eb] font-bold text-white" : "font-medium text-[#334155]"
                      }`}
                    >
                      {d.getDate()}
                    </span>
                  </div>
                  {fer && (
                    <div className="mb-0.5 flex items-center gap-1 text-[11px]">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#0ea5e9]" />
                      <span className="truncate font-medium text-[#0369a1]" title={fer}>{fer}</span>
                    </div>
                  )}
                  <div className="space-y-0.5">
                    {evs.map((e) => {
                      const info = tipoInfo(e.tipo);
                      return (
                        <button
                          key={e.id}
                          onClick={() => abrirEdicao(e)}
                          title={e.titulo}
                          className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] hover:bg-[#f4f6fb]"
                        >
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: info.color }} />
                          <span className="truncate text-[#334155]">
                            {e.hora ? formatHora(e.hora) + " " : ""}
                            {e.titulo}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => abrirNovo(iso)}
                    className="mt-1 flex w-full items-center justify-center gap-1 rounded py-0.5 text-[11px] text-[#94a3b8] transition hover:bg-[#f4f6fb] hover:text-[#2563eb]"
                  >
                    <Plus className="h-3 w-3" /> novo
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Visão de dia ────────────────────────────────────────────── */}
      {view === "dia" &&
        (() => {
          const iso = toISODate(refDate);
          const evs = porDia.get(iso) || [];
          const fer = feriadoDoDia(refDate);
          return (
            <div className="rounded-2xl border border-[#e8ecf4] bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-bold text-[#0f172a]">{formatDataBR(iso)}</h3>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setRefDate(new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate() - 1))}
                    aria-label="Dia anterior"
                    className="rounded-lg p-1.5 text-[#64748b] transition hover:bg-[#f4f6fb]"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setRefDate(new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate() + 1))}
                    aria-label="Próximo dia"
                    className="rounded-lg p-1.5 text-[#64748b] transition hover:bg-[#f4f6fb]"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setRefDate(new Date())}
                    className="ml-1 rounded-lg border border-[#e8ecf4] px-2.5 py-1 text-xs font-semibold text-[#2563eb] transition hover:bg-[#f4f6fb]"
                  >
                    Hoje
                  </button>
                </div>
              </div>
              {fer && (
                <div className="mb-3 flex items-center gap-2 rounded-xl bg-[#e0f2fe] px-3 py-2 text-sm font-semibold text-[#0369a1]">
                  <CalendarDays className="h-4 w-4" /> {fer} (feriado nacional)
                </div>
              )}
              <button
                onClick={() => abrirNovo(iso)}
                className="mb-3 flex items-center gap-1.5 rounded-xl bg-[#2563eb] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#1d4ed8]"
              >
                <Plus className="h-4 w-4" /> Novo evento neste dia
              </button>
              {evs.length === 0 ? (
                <p className="py-6 text-center text-sm text-[#94a3b8]">Nenhum evento neste dia.</p>
              ) : (
                <div className="divide-y divide-[#f1f5f9]">
                  {evs.map((e) => {
                    const info = tipoInfo(e.tipo);
                    return (
                      <button
                        key={e.id}
                        onClick={() => abrirEdicao(e)}
                        className="flex w-full items-center gap-3 py-2.5 text-left transition hover:bg-[#f8fafc]"
                      >
                        <span className="w-12 shrink-0 text-xs font-semibold text-[#64748b]">
                          {e.hora ? formatHora(e.hora) : "—"}
                        </span>
                        <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: info.color }} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-[#0f172a]">{e.titulo}</span>
                          <span className="block text-xs" style={{ color: info.color }}>{info.label}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

      {/* ─── Visão de lista ───────────────────────────────────────────── */}
      {view === "lista" && (
        <div className="rounded-2xl border border-[#e8ecf4] bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
          {loading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-[#f1f5f9]" />
              ))}
            </div>
          ) : filtrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f1f5f9] text-[#94a3b8]">
                <CalendarDays className="h-6 w-6" />
              </span>
              <p className="text-sm font-semibold text-[#475569]">Nenhum evento</p>
              <p className="text-xs text-[#94a3b8]">
                Clique em “Novo evento” para começar a organizar sua agenda.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#f1f5f9]">
              {filtrados.map((e) => {
                const info = tipoInfo(e.tipo);
                const prio = prioridadeInfo(e.prioridade);
                return (
                  <button
                    key={e.id}
                    onClick={() => abrirEdicao(e)}
                    className="flex w-full items-center gap-3 p-3 text-left transition hover:bg-[#f8fafc]"
                  >
                    <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: info.color }} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-[#0f172a]">{e.titulo}</span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{ backgroundColor: `${prio.color}1a`, color: prio.color }}
                        >
                          {prio.label}
                        </span>
                        {e.status !== "pendente" && (
                          <span className="rounded-full bg-[#f1f5f9] px-2 py-0.5 text-[10px] font-semibold text-[#64748b]">
                            {statusLabel(e.status)}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[#64748b]">
                        <span style={{ color: info.color }}>{info.label}</span>
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {formatDataBR(e.data)}
                        </span>
                        {e.hora && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatHora(e.hora)}
                          </span>
                        )}
                        {e.cliente_id && clienteNome.get(e.cliente_id) && (
                          <span>· {clienteNome.get(e.cliente_id)}</span>
                        )}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
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
