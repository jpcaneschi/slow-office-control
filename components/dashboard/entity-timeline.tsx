"use client";

import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  ClipboardList,
  Package,
  RotateCcw,
  ShoppingCart,
  Sparkles,
  WalletCards,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { formatCurrency } from "@/lib/vendas-utils";
import { SensitiveValue } from "@/components/dashboard/dashboard-preferences";

export type TimelineItem = {
  id: string;
  data: string;
  tipo: string;
  titulo: string;
  detalhe: string | null;
  valor: number | null;
  quantidade: number | null;
  href: string | null;
};

const CONFIG: Record<string, { icon: LucideIcon; cor: string }> = {
  venda: { icon: ShoppingCart, cor: "#16a34a" },
  pagamento: { icon: WalletCards, cor: "#2563eb" },
  recebimento: { icon: Banknote, cor: "#059669" },
  promissoria: { icon: WalletCards, cor: "#f59e0b" },
  condicional: { icon: ClipboardList, cor: "#d97706" },
  retorno: { icon: RotateCcw, cor: "#0891b2" },
  servico: { icon: Sparkles, cor: "#7c3aed" },
  estoque: { icon: Package, cor: "#475569" },
  entrada: { icon: ArrowDownToLine, cor: "#2563eb" },
  saida: { icon: ArrowUpFromLine, cor: "#dc2626" },
  cancelamento: { icon: XCircle, cor: "#dc2626" },
};

function dataHora(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function EntityTimeline({
  items,
  vazio = "Ainda não há movimentações neste histórico.",
}: {
  items: TimelineItem[];
  vazio?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-[28px] border border-dashed border-[#dbe3ef] bg-white p-8 text-center text-sm text-[#64748b]">
        {vazio}
      </div>
    );
  }

  return (
    <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-5 sm:p-6">
      <div className="space-y-0">
        {items.map((item, index) => {
          const info = CONFIG[item.tipo] ?? { icon: Package, cor: "#64748b" };
          const Icon = info.icon;
          const conteudo = (
            <div className="flex min-w-0 flex-1 items-start justify-between gap-4 rounded-2xl px-3 py-3 transition hover:bg-[#f8fafc]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-black text-[#0f172a]">{item.titulo}</p>
                  {item.quantidade != null && Number(item.quantidade) !== 0 && (
                    <span className="rounded-full bg-[#f1f5f9] px-2 py-0.5 text-[11px] font-bold text-[#475569]">
                      {Number(item.quantidade)} un.
                    </span>
                  )}
                </div>
                {item.detalhe && (
                  <p className="mt-0.5 text-sm leading-5 text-[#64748b]">{item.detalhe}</p>
                )}
                <p className="mt-1 text-xs font-semibold text-[#94a3b8]">{dataHora(item.data)}</p>
              </div>
              {item.valor != null && Number(item.valor) !== 0 && (
                <p className="shrink-0 text-sm font-black text-[#0f172a]">
                  <SensitiveValue>{formatCurrency(Number(item.valor))}</SensitiveValue>
                </p>
              )}
            </div>
          );

          return (
            <div key={item.id} className="relative flex gap-3 sm:gap-4">
              <div className="relative flex w-10 shrink-0 justify-center">
                {index < items.length - 1 && (
                  <span className="absolute bottom-0 top-10 w-px bg-[#e2e8f0]" />
                )}
                <span
                  className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full border-4 border-white"
                  style={{ backgroundColor: `${info.cor}18`, color: info.cor }}
                >
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              {item.href ? (
                <Link href={item.href} className="min-w-0 flex-1">
                  {conteudo}
                </Link>
              ) : (
                conteudo
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
