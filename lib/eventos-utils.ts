export type Evento = {
  id: string;
  titulo: string;
  descricao: string | null;
  tipo: string;
  prioridade: string;
  status: string;
  data: string; // YYYY-MM-DD
  hora: string | null; // HH:MM(:SS)
  responsavel: string | null;
  cliente_id: string | null;
  observacoes: string | null;
};

export const TIPOS: { value: string; label: string; color: string }[] = [
  { value: "tarefa", label: "Tarefa", color: "#2563eb" },
  { value: "compromisso", label: "Compromisso", color: "#7c3aed" },
  { value: "lembrete", label: "Lembrete", color: "#d97706" },
  { value: "agendamento", label: "Agendamento", color: "#0891b2" },
  { value: "anotacao", label: "Anotação", color: "#64748b" },
  { value: "outro", label: "Outro", color: "#16a34a" },
];

export const PRIORIDADES: { value: string; label: string; color: string }[] = [
  { value: "baixa", label: "Baixa", color: "#16a34a" },
  { value: "media", label: "Média", color: "#d97706" },
  { value: "alta", label: "Alta", color: "#dc2626" },
];

export const STATUS: { value: string; label: string }[] = [
  { value: "pendente", label: "Pendente" },
  { value: "concluida", label: "Concluída" },
  { value: "cancelada", label: "Cancelada" },
];

export function tipoInfo(tipo: string) {
  return TIPOS.find((t) => t.value === tipo) ?? { value: tipo, label: tipo, color: "#64748b" };
}

export function prioridadeInfo(prioridade: string) {
  return (
    PRIORIDADES.find((p) => p.value === prioridade) ?? {
      value: prioridade,
      label: prioridade,
      color: "#64748b",
    }
  );
}

export function statusLabel(status: string) {
  return STATUS.find((s) => s.value === status)?.label ?? status;
}

/** Data local (YYYY-MM-DD) sem depender de fuso. */
export function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function formatDataBR(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** "HH:MM:SS" -> "HH:MM" */
export function formatHora(hora: string | null) {
  if (!hora) return "";
  return hora.slice(0, 5);
}
