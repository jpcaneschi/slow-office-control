"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, ShoppingBag } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/vendas-utils";
import { formatDataHoraBR } from "@/lib/datas";

type Venda = {
  id: string;
  cliente_id: string | null;
  responsavel: string | null;
  forma_pagamento: string;
  desconto_pix: number | null;
  subtotal: number | null;
  desconto: number | null;
  total: number | null;
  parcelas: number | null;
  taxa: number | null;
  valor_liquido: number | null;
  valor_recebido: number | null;
  troco: number | null;
  entrada_forma: string | null;
  motivo_cancelamento: string | null;
  observacao: string | null;
  status: string;
  created_at: string;
};

type Item = {
  id: string;
  produto_id: string;
  variacao_id: string | null;
  quantidade: number;
  preco_unitario: number;
  total_item: number;
};

const PAGAMENTO: Record<string, string> = {
  pix: "PIX",
  dinheiro: "Dinheiro",
  cartao: "Cartão",
  promissoria: "Promissória",
  misto: "Misto",
};

const cardClass =
  "rounded-3xl border border-[#eef2f7] bg-white p-6 shadow-[0_2px_12px_rgba(15,23,42,0.05)]";

export default function VendaDetalhePage() {
  const params = useParams();
  const id = String(params.id);

  const [venda, setVenda] = useState<Venda | null>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [clienteNome, setClienteNome] = useState<string>("");
  const [produtoNome, setProdutoNome] = useState<Map<string, string>>(new Map());
  const [variacaoNome, setVariacaoNome] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [naoEncontrada, setNaoEncontrada] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    setNaoEncontrada(false);

    const { data: v } = await supabase
      .from("vendas")
      .select(
        "id, cliente_id, responsavel, forma_pagamento, desconto_pix, subtotal, desconto, total, parcelas, taxa, valor_liquido, valor_recebido, troco, entrada_forma, motivo_cancelamento, observacao, status, created_at"
      )
      .eq("id", id)
      .maybeSingle();

    if (!v) {
      setNaoEncontrada(true);
      setLoading(false);
      return;
    }
    setVenda(v as Venda);

    const [itensRes, cliRes] = await Promise.all([
      supabase
        .from("venda_itens")
        .select("id, produto_id, variacao_id, quantidade, preco_unitario, total_item")
        .eq("venda_id", id),
      v.cliente_id
        ? supabase.from("clientes").select("nome").eq("id", v.cliente_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const itensData = (itensRes.data as Item[]) || [];
    setItens(itensData);
    setClienteNome((cliRes.data as { nome?: string } | null)?.nome || "Sem cliente");

    const produtoIds = [...new Set(itensData.map((i) => i.produto_id))];
    if (produtoIds.length) {
      const { data: prods } = await supabase
        .from("produtos")
        .select("id, nome")
        .in("id", produtoIds);
      const map = new Map<string, string>();
      (prods as { id: string; nome: string }[] | null)?.forEach((p) =>
        map.set(p.id, p.nome)
      );
      setProdutoNome(map);
    }

    const variacaoIds = [
      ...new Set(itensData.map((i) => i.variacao_id).filter(Boolean)),
    ] as string[];
    if (variacaoIds.length) {
      const { data: vars } = await supabase
        .from("produto_variacoes")
        .select("id, tamanho, cor")
        .in("id", variacaoIds);
      const vmap = new Map<string, string>();
      (vars as { id: string; tamanho: string | null; cor: string | null }[] | null)?.forEach(
        (v) =>
          vmap.set(
            v.id,
            [v.tamanho, v.cor].filter(Boolean).join(" · ") || "Variação"
          )
      );
      setVariacaoNome(vmap);
    }

    setLoading(false);
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const dataHora = venda ? formatDataHoraBR(venda.created_at) : "";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.28em] text-[#2563eb]">
            Operação comercial
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-[#0f172a]">
            Detalhes da venda
          </h1>
        </div>
        <Link
          href="/dashboard/vendas"
          className="flex items-center gap-1.5 rounded-xl border border-[#e8ecf4] bg-white px-4 py-2.5 text-sm font-semibold text-[#334155] transition hover:bg-[#f4f6fb]"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
      </div>

      {loading ? (
        <div className={`${cardClass} flex items-center justify-center py-16`}>
          <Loader2 className="h-6 w-6 animate-spin text-[#2563eb]" />
        </div>
      ) : naoEncontrada || !venda ? (
        <div className={`${cardClass} flex flex-col items-center gap-2 py-16 text-center`}>
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f1f5f9] text-[#94a3b8]">
            <ShoppingBag className="h-6 w-6" />
          </span>
          <p className="text-sm font-semibold text-[#475569]">Venda não encontrada</p>
          <p className="text-xs text-[#94a3b8]">
            Ela pode ter sido removida ou não pertence à sua conta.
          </p>
        </div>
      ) : (
        <>
          {/* Resumo */}
          <div className={cardClass}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Campo rotulo="Cliente" valor={clienteNome} />
              <Campo rotulo="Vendedor" valor={venda.responsavel || "—"} />
              <Campo
                rotulo="Forma de pagamento"
                valor={PAGAMENTO[venda.forma_pagamento] || venda.forma_pagamento}
              />
              <Campo rotulo="Data e horário" valor={dataHora} />
              <div>
                <p className="text-xs font-semibold text-[#94a3b8]">Status</p>
                <span
                  className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                    venda.status === "concluida"
                      ? "bg-[#dcfce7] text-[#16a34a]"
                      : venda.status === "cancelada"
                      ? "bg-[#fee2e2] text-[#dc2626]"
                      : "bg-[#f1f5f9] text-[#64748b]"
                  }`}
                >
                  {venda.status}
                </span>
              </div>
            </div>
            {/* Detalhes do pagamento (snapshot) */}
            <div className="mt-4 grid gap-4 border-t border-[#eef2f7] pt-4 sm:grid-cols-2 lg:grid-cols-3">
              {venda.forma_pagamento === "cartao" && (
                <>
                  <Campo rotulo="Parcelas" valor={`${venda.parcelas || 1}x`} />
                  <Campo rotulo="Taxa" valor={`${Number(venda.taxa || 0)}%`} />
                  <Campo
                    rotulo="Valor líquido (após taxa)"
                    valor={formatCurrency(Number(venda.valor_liquido || 0))}
                  />
                </>
              )}
              {venda.forma_pagamento === "dinheiro" && (
                <>
                  <Campo
                    rotulo="Valor recebido"
                    valor={formatCurrency(Number(venda.valor_recebido || 0))}
                  />
                  <Campo
                    rotulo="Troco"
                    valor={formatCurrency(Number(venda.troco || 0))}
                  />
                </>
              )}
              {venda.forma_pagamento === "misto" && (
                <>
                  <Campo
                    rotulo="Entrada (paga agora)"
                    valor={formatCurrency(Number(venda.valor_recebido || 0))}
                  />
                  <Campo
                    rotulo="Forma da entrada"
                    valor={PAGAMENTO[venda.entrada_forma || ""] || venda.entrada_forma || "—"}
                  />
                </>
              )}
            </div>

            {venda.status === "cancelada" && venda.motivo_cancelamento && (
              <div className="mt-4 rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-3 text-sm text-[#b91c1c]">
                <b>Motivo do cancelamento:</b> {venda.motivo_cancelamento}
              </div>
            )}

            {venda.observacao && (
              <div className="mt-4 border-t border-[#eef2f7] pt-4">
                <p className="text-xs font-semibold text-[#94a3b8]">Observações</p>
                <p className="mt-1 text-sm text-[#334155]">{venda.observacao}</p>
              </div>
            )}
          </div>

          {/* Itens */}
          <div className={cardClass}>
            <h3 className="mb-4 text-base font-bold text-[#0f172a]">Itens</h3>
            {itens.length === 0 ? (
              <p className="text-sm text-[#94a3b8]">Nenhum item registrado nesta venda.</p>
            ) : (
              <div className="-mx-2 overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse">
                  <thead>
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-[#94a3b8]">
                      <th className="px-2 pb-2">Produto</th>
                      <th className="px-2 pb-2">Qtd.</th>
                      <th className="px-2 pb-2">Preço unit.</th>
                      <th className="px-2 pb-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((it) => (
                      <tr key={it.id} className="border-t border-[#f1f5f9] text-sm">
                        <td className="px-2 py-2.5 font-semibold text-[#0f172a]">
                          {produtoNome.get(it.produto_id) || "Produto"}
                          {it.variacao_id && variacaoNome.get(it.variacao_id) && (
                            <span className="ml-2 rounded-full bg-[#eff6ff] px-2 py-0.5 text-xs font-semibold text-[#1d4ed8]">
                              {variacaoNome.get(it.variacao_id)}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-[#475569]">{it.quantidade}</td>
                        <td className="px-2 py-2.5 text-[#475569]">
                          {formatCurrency(Number(it.preco_unitario || 0))}
                        </td>
                        <td className="px-2 py-2.5 font-semibold text-[#0f172a]">
                          {formatCurrency(Number(it.total_item || 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Valores */}
          <div className={`${cardClass} sm:max-w-sm sm:ml-auto`}>
            <Linha rotulo="Subtotal" valor={formatCurrency(Number(venda.subtotal || 0))} />
            <Linha rotulo="Desconto" valor={`- ${formatCurrency(Number(venda.desconto || 0))}`} />
            <Linha
              rotulo="Desconto Pix"
              valor={`- ${formatCurrency(Number(venda.desconto_pix || 0))}`}
            />
            <div className="mt-2 flex items-center justify-between border-t border-[#eef2f7] pt-3">
              <span className="text-sm font-bold text-[#0f172a]">Total</span>
              <span className="text-xl font-black text-[#0f172a]">
                {formatCurrency(Number(venda.total || 0))}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-[#94a3b8]">{rotulo}</p>
      <p className="mt-1 text-sm font-semibold text-[#0f172a]">{valor}</p>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-[#64748b]">{rotulo}</span>
      <span className="font-semibold text-[#0f172a]">{valor}</span>
    </div>
  );
}
