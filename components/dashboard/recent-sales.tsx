import { CreditCard, Banknote, Zap } from "lucide-react";

type Pagamento = "PIX" | "Débito" | "Crédito à vista" | "Crédito 2x" | "Crédito 3x";
type StatusVenda = "Concluída" | "Parcelado";

export type Venda = {
  cliente: string;
  pagamento: Pagamento;
  valor: number;
  status: StatusVenda;
  data: string;
};

const AVATAR_COLORS = [
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#0891b2",
  "#16a34a",
  "#4f46e5",
  "#c026d3",
];

function iniciais(nome: string) {
  return nome
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function PagamentoIcone({ tipo }: { tipo: Pagamento }) {
  if (tipo === "PIX") {
    return <Zap className="h-4 w-4 text-[#0891b2]" />;
  }
  if (tipo === "Débito") {
    return <Banknote className="h-4 w-4 text-[#16a34a]" />;
  }
  return <CreditCard className="h-4 w-4 text-[#64748b]" />;
}

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function RecentSales({
  vendas,
  totalQtd,
  totalValor,
}: {
  vendas: Venda[];
  totalQtd: number;
  totalValor: number;
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-[#e8ecf4] bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-bold text-[#0f172a]">Últimas vendas</h3>
        <button className="text-sm font-semibold text-[#2563eb] transition hover:underline">
          Ver todas
        </button>
      </div>

      <div className="-mx-2 flex-1 overflow-x-auto">
        <table className="w-full min-w-[440px] border-collapse">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-[#94a3b8]">
              <th className="px-2 pb-2 font-semibold">Cliente</th>
              <th className="px-2 pb-2 font-semibold">Forma de pagamento</th>
              <th className="px-2 pb-2 font-semibold">Valor</th>
              <th className="px-2 pb-2 font-semibold">Status</th>
              <th className="px-2 pb-2 font-semibold">Data</th>
            </tr>
          </thead>
          <tbody>
            {vendas.map((v, i) => (
              <tr
                key={`${v.cliente}-${i}`}
                className="border-t border-[#f1f5f9] text-sm"
              >
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                      style={{
                        backgroundColor:
                          AVATAR_COLORS[i % AVATAR_COLORS.length],
                      }}
                    >
                      {iniciais(v.cliente)}
                    </span>
                    <span className="font-semibold text-[#0f172a]">
                      {v.cliente}
                    </span>
                  </div>
                </td>
                <td className="px-2 py-2.5">
                  <span className="flex items-center gap-2 text-[#475569]">
                    <PagamentoIcone tipo={v.pagamento} />
                    {v.pagamento}
                  </span>
                </td>
                <td className="px-2 py-2.5 font-semibold text-[#0f172a]">
                  {brl(v.valor)}
                </td>
                <td className="px-2 py-2.5">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                      v.status === "Concluída"
                        ? "bg-[#dcfce7] text-[#16a34a]"
                        : "bg-[#dbeafe] text-[#2563eb]"
                    }`}
                  >
                    {v.status}
                  </span>
                </td>
                <td className="px-2 py-2.5 whitespace-nowrap text-[#64748b]">
                  {v.data}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-[#eef2f7] pt-3 text-sm">
        <span className="text-[#64748b]">
          Total de vendas hoje: <span className="font-bold text-[#0f172a]">{totalQtd}</span>
        </span>
        <span className="text-[#64748b]">
          Total:{" "}
          <span className="font-bold text-[#0f172a]">{brl(totalValor)}</span>
        </span>
      </div>
    </div>
  );
}
