"use client";

import { useEffect, useState, type ReactNode } from "react";
import { X, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  TIPOS,
  PRIORIDADES,
  STATUS,
  type Evento,
} from "@/lib/eventos-utils";

type ClienteLite = { id: string; nome: string };

const inputClass =
  "w-full rounded-xl border border-[#e8ecf4] bg-[#f8fafc] px-2.5 py-2 text-sm text-[#0f172a] outline-none transition focus:border-[#2563eb] focus:bg-white focus:ring-2 focus:ring-[#2563eb]/15";

export function EventoForm({
  open,
  onClose,
  onSaved,
  clientes,
  evento,
  dataPadrao,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  clientes: ClienteLite[];
  evento?: Evento | null;
  dataPadrao?: string;
}) {
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tipo, setTipo] = useState("tarefa");
  const [prioridade, setPrioridade] = useState("media");
  const [status, setStatus] = useState("pendente");
  const [data, setData] = useState("");
  const [hora, setHora] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [confirmarExcluir, setConfirmarExcluir] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!open) return;
    setErro("");
    setConfirmarExcluir(false);
    if (evento) {
      setTitulo(evento.titulo);
      setDescricao(evento.descricao || "");
      setTipo(evento.tipo);
      setPrioridade(evento.prioridade);
      setStatus(evento.status);
      setData(evento.data);
      setHora(evento.hora ? evento.hora.slice(0, 5) : "");
      setResponsavel(evento.responsavel || "");
      setClienteId(evento.cliente_id || "");
      setObservacoes(evento.observacoes || "");
    } else {
      setTitulo("");
      setDescricao("");
      setTipo("tarefa");
      setPrioridade("media");
      setStatus("pendente");
      setData(dataPadrao || "");
      setHora("");
      setResponsavel("");
      setClienteId("");
      setObservacoes("");
    }
  }, [open, evento, dataPadrao]);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open) return null;

  async function salvar() {
    setErro("");
    if (!titulo.trim()) {
      setErro("Informe um título.");
      return;
    }
    if (!data) {
      setErro("Informe a data.");
      return;
    }

    setSalvando(true);
    const payload = {
      titulo: titulo.trim(),
      descricao: descricao.trim() || null,
      tipo,
      prioridade,
      status,
      data,
      hora: hora || null,
      responsavel: responsavel.trim() || null,
      cliente_id: clienteId || null,
      observacoes: observacoes.trim() || null,
    };

    const res = evento
      ? await supabase
          .from("eventos")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", evento.id)
      : await supabase.from("eventos").insert(payload);

    setSalvando(false);

    if (res.error) {
      setErro(res.error.message);
      return;
    }
    onSaved();
    onClose();
  }

  async function excluir() {
    if (!evento) return;
    setExcluindo(true);
    const { error } = await supabase.from("eventos").delete().eq("id", evento.id);
    setExcluindo(false);
    if (error) {
      setErro(error.message);
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={evento ? "Editar evento" : "Novo evento"}
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#eef2f7] px-5 py-4">
          <h3 className="text-base font-bold text-[#0f172a]">
            {evento ? "Editar evento" : "Novo evento"}
          </h3>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-[#64748b] transition hover:bg-[#f4f6fb]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {erro && (
            <div className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm text-[#b91c1c]">
              {erro}
            </div>
          )}

          <Campo label="Título *">
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Ligar para o cliente"
              className={inputClass}
              autoFocus
            />
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo label="Tipo">
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputClass}>
                {TIPOS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Prioridade">
              <select
                value={prioridade}
                onChange={(e) => setPrioridade(e.target.value)}
                className={inputClass}
              >
                {PRIORIDADES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Campo label="Data *">
              <input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className={inputClass}
              />
            </Campo>
            <Campo label="Hora">
              <input
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                className={inputClass}
              />
            </Campo>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Campo label="Responsável">
              <input
                value={responsavel}
                onChange={(e) => setResponsavel(e.target.value)}
                placeholder="Nome"
                className={inputClass}
              />
            </Campo>
            <Campo label="Cliente">
              <select
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
                className={inputClass}
              >
                <option value="">Nenhum</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          {evento && (
            <Campo label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={inputClass}
              >
                {STATUS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Campo>
          )}

          <Campo label="Descrição">
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={2}
              className={`${inputClass} resize-none`}
            />
          </Campo>

          <Campo label="Observações">
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={2}
              className={`${inputClass} resize-none`}
            />
          </Campo>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[#eef2f7] px-5 py-4">
          {evento ? (
            confirmarExcluir ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={excluir}
                  disabled={excluindo}
                  className="flex items-center gap-1.5 rounded-lg bg-[#dc2626] px-3 py-2 text-sm font-bold text-white transition hover:bg-[#b91c1c] disabled:opacity-50"
                >
                  {excluindo && <Loader2 className="h-4 w-4 animate-spin" />}
                  Confirmar exclusão
                </button>
                <button
                  onClick={() => setConfirmarExcluir(false)}
                  className="text-sm font-semibold text-[#64748b]"
                >
                  Não
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmarExcluir(true)}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-[#dc2626] transition hover:bg-[#fef2f2]"
              >
                <Trash2 className="h-4 w-4" />
                Excluir
              </button>
            )
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-[#64748b] transition hover:bg-[#f4f6fb]"
            >
              Cancelar
            </button>
            <button
              onClick={salvar}
              disabled={salvando}
              className="flex items-center gap-1.5 rounded-lg bg-[#2563eb] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#1d4ed8] disabled:opacity-50"
            >
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-[#475569]">{label}</span>
      {children}
    </label>
  );
}
