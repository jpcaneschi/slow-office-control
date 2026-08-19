"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Boxes,
  HandCoins,
  ClipboardList,
  ListTodo,
  Gift,
  CheckCheck,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  sincronizarNotificacoes,
  marcarComoLida,
  marcarTodasComoLidas,
  type Notificacao,
} from "@/lib/notificacoes";

const ICONE: Record<string, { icon: LucideIcon; color: string }> = {
  estoque: { icon: Boxes, color: "#dc2626" },
  promissoria: { icon: HandCoins, color: "#16a34a" },
  condicional: { icon: ClipboardList, color: "#0891b2" },
  tarefa: { icon: ListTodo, color: "#2563eb" },
  aniversario: { icon: Gift, color: "#db2777" },
};

function tempoAtras(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} d`;
}

export function NotificationsBell() {
  const router = useRouter();
  const [notifs, setNotifs] = useState<Notificacao[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    await sincronizarNotificacoes();
    const { data } = await supabase
      .from("notificacoes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);
    setNotifs((data as Notificacao[]) || []);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  // "Alerta ativo" = ainda não lido E cuja condição ainda vale (não resolvida).
  // Notificação resolvida (ex.: estoque reposto) fica no histórico mas não conta.
  const alertasAtivos = notifs.filter((n) => !n.lida && !n.resolvida).length;

  async function abrirNotificacao(n: Notificacao) {
    if (!n.lida) {
      setNotifs((prev) => prev.map((x) => (x.id === n.id ? { ...x, lida: true } : x)));
      await marcarComoLida(n.id);
    }
    setOpen(false);
    if (n.href) router.push(n.href);
  }

  async function lerTodas() {
    setNotifs((prev) => prev.map((x) => ({ ...x, lida: true })));
    await marcarTodasComoLidas();
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Notificações"
        aria-expanded={open}
        className="relative rounded-xl border border-[#e8ecf4] bg-white p-2.5 text-[#475569] transition hover:bg-[#f4f6fb] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
      >
        <Bell className="h-5 w-5" />
        {alertasAtivos > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#2563eb] px-1 text-[11px] font-bold text-white">
            {alertasAtivos > 9 ? "9+" : alertasAtivos}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(92vw,360px)] overflow-hidden rounded-2xl border border-[#e8ecf4] bg-white shadow-[0_16px_44px_rgba(15,23,42,0.16)]">
          <div className="flex items-center justify-between border-b border-[#eef2f7] px-4 py-3">
            <h4 className="text-sm font-bold text-[#0f172a]">Notificações</h4>
            {notifs.some((n) => !n.lida) && (
              <button
                onClick={lerTodas}
                className="flex items-center gap-1 text-xs font-semibold text-[#2563eb] transition hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Marcar todas como lidas
              </button>
            )}
          </div>

          <div className="max-h-[380px] overflow-y-auto">
            {notifs.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f1f5f9] text-[#94a3b8]">
                  <Bell className="h-5 w-5" />
                </span>
                <p className="text-sm font-semibold text-[#475569]">Sem notificações</p>
                <p className="text-xs text-[#94a3b8]">Você está em dia. 🎉</p>
              </div>
            ) : (
              notifs.map((n) => {
                const info = ICONE[n.tipo] ?? { icon: Bell, color: "#64748b" };
                const Icon = info.icon;
                return (
                  <button
                    key={n.id}
                    onClick={() => abrirNotificacao(n)}
                    className={`flex w-full items-start gap-3 border-b border-[#f1f5f9] px-4 py-3 text-left transition hover:bg-[#f8fafc] ${
                      n.resolvida ? "opacity-60" : n.lida ? "" : "bg-[#eff6ff]/40"
                    }`}
                  >
                    <span
                      className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                      style={{ backgroundColor: `${info.color}1a`, color: info.color }}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[#0f172a]">{n.titulo}</span>
                        {n.resolvida ? (
                          <span className="rounded-full bg-[#f0fdf4] px-1.5 py-0.5 text-[10px] font-bold text-[#15803d]">
                            Resolvida
                          </span>
                        ) : (
                          !n.lida && (
                            <span className="h-2 w-2 shrink-0 rounded-full bg-[#2563eb]" />
                          )
                        )}
                      </span>
                      {n.descricao && (
                        <span className="mt-0.5 block text-xs text-[#64748b]">
                          {n.descricao}
                        </span>
                      )}
                      <span className="mt-0.5 block text-[11px] text-[#94a3b8]">
                        {tempoAtras(n.created_at)}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
