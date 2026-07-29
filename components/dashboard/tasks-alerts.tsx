import {
  Boxes,
  ListTodo,
  CalendarClock,
  HandCoins,
  ClipboardList,
  PhoneCall,
  ChevronRight,
  Clock,
  X,
  type LucideIcon,
} from "lucide-react";

type Alerta = {
  icon: LucideIcon;
  tint: string;
  title: string;
  subtitle: string;
  badge: string;
  badgeColor: string;
};

const ALERTAS: Alerta[] = [
  {
    icon: Boxes,
    tint: "#dc2626",
    title: "Estoque baixo",
    subtitle: "Produtos com estoque crítico",
    badge: "8 itens",
    badgeColor: "#dc2626",
  },
  {
    icon: ListTodo,
    tint: "#2563eb",
    title: "Tarefas do dia",
    subtitle: "Pendências para hoje",
    badge: "5 tarefas",
    badgeColor: "#2563eb",
  },
  {
    icon: CalendarClock,
    tint: "#d97706",
    title: "Próximos vencimentos",
    subtitle: "Vencem nos próximos 7 dias",
    badge: "R$ 12.450,00",
    badgeColor: "#d97706",
  },
  {
    icon: HandCoins,
    tint: "#16a34a",
    title: "Promissórias a receber",
    subtitle: "Vencem nos próximos 7 dias",
    badge: "R$ 8.930,00",
    badgeColor: "#16a34a",
  },
  {
    icon: ClipboardList,
    tint: "#2563eb",
    title: "Condicionais em aberto",
    subtitle: "Aguardando finalização",
    badge: "12 títulos",
    badgeColor: "#2563eb",
  },
  {
    icon: PhoneCall,
    tint: "#0891b2",
    title: "Clientes para retorno",
    subtitle: "Último contato há mais de 15 dias",
    badge: "18 clientes",
    badgeColor: "#0891b2",
  },
];

export function TasksAlerts() {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-[#e8ecf4] bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-bold text-[#0f172a]">Tarefas e alertas</h3>
        <button className="text-sm font-semibold text-[#2563eb] transition hover:underline">
          Ver todas
        </button>
      </div>

      <div className="flex-1 space-y-1">
        {ALERTAS.map((a) => {
          const Icon = a.icon;
          return (
            <button
              key={a.title}
              className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition hover:bg-[#f4f6fb]"
            >
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${a.tint}1a`, color: a.tint }}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-[#0f172a]">
                  {a.title}
                </span>
                <span className="block truncate text-xs text-[#64748b]">
                  {a.subtitle}
                </span>
              </span>
              <span
                className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold"
                style={{ backgroundColor: `${a.badgeColor}1a`, color: a.badgeColor }}
              >
                {a.badge}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[#cbd5e1]" />
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-xl bg-[#eff6ff] p-3.5">
        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-[#2563eb]" />
        <div className="flex-1">
          <p className="text-sm font-bold text-[#1e40af]">
            Mantenha seus cadastros e tarefas em dia
          </p>
          <p className="text-xs text-[#3b82f6]">
            Organização é o que impulsiona os resultados.
          </p>
        </div>
        <button className="text-[#93c5fd] transition hover:text-[#2563eb]">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
