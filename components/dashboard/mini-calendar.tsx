import { ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAYS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

// Maio/2024 começa numa quarta-feira (índice 3, contando a partir de domingo).
const FIRST_WEEKDAY = 3;
const DAYS_IN_MONTH = 31;
const TODAY = 30;

// Pontinhos de eventos em alguns dias (cor por tipo).
const EVENT_DOTS: Record<number, string[]> = {
  2: ["#7c3aed"],
  7: ["#d97706"],
  11: ["#d97706"],
  14: ["#7c3aed"],
  17: ["#16a34a"],
  21: ["#2563eb"],
  24: ["#16a34a"],
  28: ["#dc2626"],
};

const LEGEND = [
  { label: "Aniversários", count: 2, color: "#7c3aed" },
  { label: "Promissórias", count: 3, color: "#16a34a" },
  { label: "Vencimentos", count: 4, color: "#dc2626" },
  { label: "Condicionais", count: 2, color: "#2563eb" },
  { label: "Tarefas", count: 5, color: "#d97706" },
  { label: "Retornos", count: 2, color: "#0ea5e9" },
];

type Cell = { day: number; muted: boolean };

function buildCells(): Cell[] {
  const cells: Cell[] = [];
  // cauda do mês anterior (abril termina em 30)
  for (let i = FIRST_WEEKDAY - 1; i >= 0; i--) {
    cells.push({ day: 30 - i, muted: true });
  }
  for (let d = 1; d <= DAYS_IN_MONTH; d++) {
    cells.push({ day: d, muted: false });
  }
  // início do próximo mês para completar a última semana
  let next = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ day: next++, muted: true });
  }
  return cells;
}

export function MiniCalendar() {
  const cells = buildCells();

  return (
    <div className="flex h-full flex-col rounded-2xl border border-[#e8ecf4] bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-bold text-[#0f172a]">Maio 2024</h3>
        <div className="flex items-center gap-1">
          <button className="rounded-lg p-1.5 text-[#64748b] transition hover:bg-[#f4f6fb]">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button className="rounded-lg p-1.5 text-[#64748b] transition hover:bg-[#f4f6fb]">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button className="ml-1 rounded-lg border border-[#e8ecf4] px-2.5 py-1 text-xs font-semibold text-[#2563eb] transition hover:bg-[#f4f6fb]">
            Hoje
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((w) => (
          <span key={w} className="py-1 text-[10px] font-bold text-[#94a3b8]">
            {w}
          </span>
        ))}

        {cells.map((cell, i) => {
          const isToday = !cell.muted && cell.day === TODAY;
          const dots = cell.muted ? [] : EVENT_DOTS[cell.day] ?? [];

          return (
            <div
              key={i}
              className="flex flex-col items-center justify-start py-1"
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${
                  isToday
                    ? "bg-[#2563eb] font-bold text-white"
                    : cell.muted
                    ? "text-[#cbd5e1]"
                    : "font-medium text-[#334155]"
                }`}
              >
                {cell.day}
              </span>
              <span className="mt-0.5 flex h-1.5 gap-0.5">
                {dots.map((c, di) => (
                  <span
                    key={di}
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-y-2 border-t border-[#eef2f7] pt-4">
        {LEGEND.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-xs">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-[#64748b]">{item.label}</span>
            <span className="font-bold text-[#0f172a]">{item.count}</span>
          </div>
        ))}
      </div>

      <button className="mt-4 text-center text-sm font-semibold text-[#2563eb] transition hover:underline">
        Ver agenda completa →
      </button>
    </div>
  );
}
