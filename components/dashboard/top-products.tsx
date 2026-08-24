import Link from "next/link";
import { Trophy } from "lucide-react";
import { formatCurrency } from "@/lib/vendas-utils";
import type { ProdutoMaisVendido } from "@/lib/mais-vendidos-utils";

export function TopProducts({
  produtos,
  loading,
}: {
  produtos: ProdutoMaisVendido[];
  loading: boolean;
}) {
  const top = produtos.slice(0, 5);
  const maior = Math.max(1, ...top.map((produto) => produto.quantidade));

  return (
    <section className="rounded-3xl border border-[#eef2f7] bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-[#fff7ed] p-2.5 text-[#ea580c]">
            <Trophy className="h-5 w-5" />
          </span>
          <div>
            <h3 className="font-black text-[#0f172a]">Produtos mais vendidos</h3>
            <p className="text-xs text-[#64748b]">Ranking do período selecionado</p>
          </div>
        </div>
        <Link href="/dashboard/vendas" className="text-xs font-bold text-[#2563eb] hover:underline">
          Ver vendas
        </Link>
      </div>

      {loading ? (
        <p className="mt-5 text-sm text-[#64748b]">Calculando ranking...</p>
      ) : top.length === 0 ? (
        <p className="mt-5 text-sm text-[#64748b]">Nenhum produto vendido neste período.</p>
      ) : (
        <div className="mt-5 space-y-4">
          {top.map((produto, indice) => (
            <div key={produto.produtoId}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <p className="min-w-0 truncate font-bold text-[#0f172a]">
                  <span className="mr-2 text-[#94a3b8]">{indice + 1}º</span>
                  {produto.nome}
                </p>
                <p className="shrink-0 text-xs text-[#64748b]">
                  <b className="text-[#0f172a]">{produto.quantidade}</b> un. · {formatCurrency(produto.faturamento)}
                </p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#eff6ff]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#2563eb] to-[#60a5fa]"
                  style={{ width: `${Math.max(6, (produto.quantidade / maior) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
