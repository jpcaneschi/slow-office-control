"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Clock, CalendarDays } from "lucide-react";
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
} from "@/lib/eventos-utils";

type ClienteLite = { id: string; nome: string };

export default function AgendaPage() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [clientes, setClientes] = useState<ClienteLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<Evento | null>(null);

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

  const selectClass =
    "rounded-lg border border-[#e8ecf4] bg-white px-3 py-2 text-sm font-semibold text-[#334155] outline-none focus:border-[#2563eb]";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[#0f172a]">Agenda</h1>
          <p className="text-sm text-[#64748b]">
            Tarefas, compromissos, lembretes e agendamentos.
          </p>
        </div>
        <button
          onClick={() => {
            setEditando(null);
            setFormOpen(true);
          }}
          className="flex items-center gap-1.5 rounded-xl bg-[#2563eb] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#1d4ed8]"
        >
          <Plus className="h-4 w-4" />
          Novo evento
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
          className={selectClass}
        >
          <option value="todos">Todos os tipos</option>
          {TIPOS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
          className={selectClass}
        >
          <option value="todos">Todos os status</option>
          {STATUS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {erro && (
        <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">
          {erro}
        </div>
      )}

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
                  onClick={() => {
                    setEditando(e);
                    setFormOpen(true);
                  }}
                  className="flex w-full items-center gap-3 p-3 text-left transition hover:bg-[#f8fafc]"
                >
                  <span
                    className="h-10 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: info.color }}
                  />
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

      <EventoForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={carregar}
        clientes={clientes}
        evento={editando}
      />
    </div>
  );
}
