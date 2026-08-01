import Link from "next/link";
import {
  CreditCard,
  Banknote,
  Zap,
  FileText,
  Wallet,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";
import { formatCurrency } from "@/lib/vendas-utils";

export type VendaRow = {
  id: string;
  cliente: string;
  pagamento: string; // forma_pagamento cru: pix | dinheiro | cartao | promissoria | misto
  valor: number;
  status: string; // concluida | cancelada | ...
  data: string; // já formatado (dd/mm hh:mm)
};

const AVATAR_COLORS = [
  "#2563eb", "#7c3aed", "#db2777", "#ea580c",
  "#0891b2", "#16a34a", "#4f46e5", "#c026d3",
];

const PAGAMENTO: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  pix: { label: "PIX", icon: Zap, color: "#0891b2" },
  dinheiro: { label: "Dinheiro", icon: Banknote, color: "#16a34a" },
  cartao: { label: "Cartão", icon: CreditCard, color: "#7c3aed" },
  promissoria: { label: "Promissória", icon: FileText, color: "#d97706" },
  misto: { label: "Misto", icon: Wallet, color: "#64748b" },
};

function iniciais(nome: string) {
  return (
    nome
      .split(" ")
      .slice(0, 2)
      .map((p) => p[0])
      .join("")
      .toUpperCase() || "?"
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    concluida: "bg-[#dcfce7] text-[#16a34a]",
    cancelada: "bg-[#fee2e2] text-[#dc2626]",
  };
  const rotulo: Record<string, string> = {
    concluida: "Concluída",
    cancelada: "Cancelada",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
        map[status] ?? "bg-[#f1f5f9] text-[#64748b]"
      }`}
    >
      {rotulo[status] ?? status}
    </span>
  );
}

export function RecentSales({
  vendas,
  totalQtd,
  totalValor,
  loading,
}: {
  vendas: VendaRow[];
  totalQtd: number;
  totalValor: number;
  loading: boolean;
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-[#e8ecf4] bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-bold text-[#0f172a]">Últimas vendas</h3>
        <Link
          href="/dashboard/vendas"
          className="text-sm font-semibold text-[#2563eb] transition hover:underline"
        >
          Ver todas
        </Link>
      </div>

      {loading ? (
        <div className="flex-1 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-11 w-full animate-pulse rounded-lg bg-[#f1f5f9]" />
          ))}
        </div>
      ) : vendas.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f1f5f9] text-[#94a3b8]">
            <ShoppingBag className="h-5 w-5" />
          </span>
          <p className="text-sm font-semibold text-[#475569]">Nenhuma venda ainda</p>
          <p className="text-xs text-[#94a3b8]">As vendas registradas aparecem aqui.</p>
        </div>
      ) : (
        <div className="-mx-2 flex-1 overflow-x-auto">
          <table className="w-full min-w-[440px] border-collapse">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-[#94a3b8]">
                <th className="px-2 pb-2 font-semibold">Cliente</th>
                <th className="px-2 pb-2 font-semibold">Pagamento</th>
                <th className="px-2 pb-2 font-semibold">Valor</th>
                <th className="px-2 pb-2 font-semibold">Status</th>
                <th className="px-2 pb-2 font-semibold">Data</th>
              </tr>
            </thead>
            <tbody>
              {vendas.map((v, i) => {
                const pg = PAGAMENTO[v.pagamento] ?? {
                  label: v.pagamento,
                  icon: Wallet,
                  color: "#64748b",
                };
                const PgIcon = pg.icon;
                return (
                  <tr
                    key={v.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Ver detalhes da venda de ${v.cliente}`}
                    className="cursor-pointer border-t border-[#f1f5f9] text-sm transition hover:bg-[#f8fafc] focus:outline-none focus-visible:bg-[#eff6ff]"
                    onClick={() => {
                      window.location.href = `/dashboard/vendas/${v.id}`;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        window.location.href = `/dashboard/vendas/${v.id}`;
                      }
                    }}
                  >
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                          style={{ backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
                        >
                          {iniciais(v.cliente)}
                        </span>
                        <span className="font-semibold text-[#0f172a]">{v.cliente}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5">
                      <span className="flex items-center gap-2 text-[#475569]">
                        <PgIcon className="h-4 w-4" style={{ color: pg.color }} />
                        {pg.label}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 font-semibold text-[#0f172a]">
                      {formatCurrency(v.valor)}
                    </td>
                    <td className="px-2 py-2.5">
                      <StatusBadge status={v.status} />
                    </td>
                    <td className="px-2 py-2.5 whitespace-nowrap text-[#64748b]">{v.data}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && vendas.length > 0 && (
        <div className="mt-4 flex items-center justify-between border-t border-[#eef2f7] pt-3 text-sm">
          <span className="text-[#64748b]">
            Vendas no período: <span className="font-bold text-[#0f172a]">{totalQtd}</span>
          </span>
          <span className="text-[#64748b]">
            Total:{" "}
            <span className="font-bold text-[#0f172a]">{formatCurrency(totalValor)}</span>
          </span>
        </div>
      )}
    </div>
  );
}
