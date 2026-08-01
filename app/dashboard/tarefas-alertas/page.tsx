"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Clock, CalendarDays, Pencil, ListTodo } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/dashboard/page-header";
import { TasksAlerts } from "@/components/dashboard/tasks-alerts";
import { EventoForm } from "@/components/dashboard/evento-form";
import {
  type Evento,
  TIPOS,
  STATUS,
  PRIORIDADES,
  tipoInfo,
  prioridadeInfo,
  statusLabel,
  formatDataBR,
  formatHora,
} from "@/lib/eventos-utils";

type ClienteLite = { id: string; nome: string };

const selectClass =
  "rounded-lg border border-[#e8ecf4] bg-white px-3 py-2 text-sm font-semibold text-[#334155] outline-none focus:border-[#2563eb]";

export default function TarefasAlertasPage() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [clientes, setClientes] = useState<ClienteLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("pendente");
  const [filtroPrioridade, setFiltroPrioridade] = useState("todas");
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<Evento | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("eventos")
      .select("*")
      .order("data", { ascending: true })
      .order("hora", { ascending: true });
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
        (filtroStatus === "todos" || e.status === filtroStatus) &&
        (filtroPrioridade === "todas" || e.prioridade === filtroPrioridade)
    );
  }, [eventos, filtroTipo, filtroStatus, filtroPrioridade]);

  async function concluir(ev: Evento) {
    await supabase
      .from("eventos")
      .update({ status: "concluida", updated_at: new Date().toISOString() })
      .eq("id", ev.id);
    await carregar();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operação diária"
        title="Tarefas e alertas"
        description="Acompanhe os alertas do sistema e gerencie suas tarefas em um só lugar."
      />

      {/* Alertas calculados */}
      <div className="max-w-xl">
        <TasksAlerts />
      </div>

      {/* Tarefas */}
      <div className="rounded-2xl border border-[#e8ecf4] bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-bold text-[#0f172a]">Tarefas</h3>
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
            <select value={filtroPrioridade} onChange={(e) => setFiltroPrioridade(e.target.value)} className={selectClass}>
              <option value="todas">Todas as prioridades</option>
              {PRIORIDADES.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-[#f1f5f9]" />
            ))}
          </div>
        ) : filtrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f1f5f9] text-[#94a3b8]">
              <ListTodo className="h-6 w-6" />
            </span>
            <p className="text-sm font-semibold text-[#475569]">Nenhuma tarefa</p>
            <p className="text-xs text-[#94a3b8]">Ajuste os filtros ou crie tarefas na agenda.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#f1f5f9]">
            {filtrados.map((e) => {
              const info = tipoInfo(e.tipo);
              const prio = prioridadeInfo(e.prioridade);
              const concluida = e.status === "concluida";
              return (
                <div key={e.id} className="flex items-center gap-3 py-3">
                  <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: info.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-sm font-bold ${concluida ? "text-[#94a3b8] line-through" : "text-[#0f172a]"}`}>
                        {e.titulo}
                      </span>
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
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[#64748b]">
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
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {!concluida && (
                      <button
                        onClick={() => concluir(e)}
                        title="Concluir"
                        className="flex items-center gap-1 rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] px-2.5 py-1.5 text-xs font-semibold text-[#15803d] transition hover:bg-[#dcfce7]"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Concluir
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setEditando(e);
                        setFormOpen(true);
                      }}
                      title="Editar"
                      className="flex items-center gap-1 rounded-lg border border-[#e8ecf4] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#334155] transition hover:bg-[#f4f6fb]"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </button>
                  </div>
                </div>
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
