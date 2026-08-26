"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Boxes, Package, ShoppingCart } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/dashboard/page-header";
import { EntityTimeline, type TimelineItem } from "@/components/dashboard/entity-timeline";
import { formatCurrency } from "@/lib/vendas-utils";

type Produto = {
  id: string;
  nome: string;
  marca: string | null;
  categoria: string | null;
  preco: number | null;
  estoque: number | null;
  status: string | null;
  tem_variacoes: boolean | null;
};

type Variacao = {
  id: string;
  tamanho: string | null;
  cor: string | null;
  sku: string | null;
  codigo_barras: string | null;
  preco: number | null;
  estoque: number | null;
  status: string | null;
};

export default function ProdutoHistoricoPage() {
  const params = useParams<{ id: string }>();
  const produtoId = params?.id as string;
  const [produto, setProduto] = useState<Produto | null>(null);
  const [variacoes, setVariacoes] = useState<Variacao[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!produtoId) return;
    (async () => {
      setLoading(true);
      setErro("");
      const [pRes, vRes, tRes] = await Promise.all([
        supabase
          .from("produtos")
          .select("id,nome,marca,categoria,preco,estoque,status,tem_variacoes")
          .eq("id", produtoId)
          .maybeSingle(),
        supabase
          .from("produto_variacoes")
          .select("id,tamanho,cor,sku,codigo_barras,preco,estoque,status")
          .eq("produto_id", produtoId)
          .order("tamanho"),
        supabase.rpc("timeline_produto", { p_produto_id: produtoId }),
      ]);
      const e = pRes.error || vRes.error || tRes.error;
      if (e) setErro(e.message);
      setProduto((pRes.data as Produto | null) || null);
      setVariacoes((vRes.data as Variacao[] | null) || []);
      setTimeline((tRes.data as TimelineItem[] | null) || []);
      setLoading(false);
    })();
  }, [produtoId]);

  const estoque = useMemo(() => {
    if (!produto) return 0;
    if (produto.tem_variacoes) {
      return variacoes.reduce((s, v) => s + Number(v.estoque || 0), 0);
    }
    return Number(produto.estoque || 0);
  }, [produto, variacoes]);

  const vendidos = useMemo(
    () =>
      timeline
        .filter((i) => i.tipo === "venda")
        .reduce((s, i) => s + Number(i.quantidade || 0), 0),
    [timeline]
  );

  if (loading) {
    return <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6 text-sm text-[#64748b]">Carregando histórico do produto...</div>;
  }

  return (
    <section className="space-y-6">
      <Link href="/dashboard/produtos" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#2563eb] hover:underline">
        <ArrowLeft className="h-4 w-4" /> Voltar aos produtos
      </Link>

      <PageHeader
        eyebrow="Produto"
        title={produto?.nome || "Produto"}
        description={
          produto
            ? [produto.marca, produto.categoria, produto.status].filter(Boolean).join(" · ")
            : "Produto não encontrado"
        }
      />

      {erro && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div>}

      {produto && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Resumo icon={Package} label="Preço" valor={formatCurrency(Number(produto.preco || 0))} />
            <Resumo icon={Boxes} label="Estoque atual" valor={`${estoque} un.`} />
            <Resumo icon={ShoppingCart} label="Unidades vendidas" valor={`${vendidos} un.`} />
          </div>

          {variacoes.length > 0 && (
            <div className="rounded-[28px] border border-[#e8ecf4] bg-white p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="font-black text-[#0f172a]">Grade atual</h2>
                <span className="text-xs font-semibold text-[#64748b]">{variacoes.length} variações</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {variacoes.map((v) => (
                  <span key={v.id} className="rounded-xl border border-[#e8ecf4] bg-[#f8fafc] px-3 py-2 text-xs text-[#475569]">
                    <b className="text-[#0f172a]">{[v.tamanho, v.cor].filter(Boolean).join(" · ") || "Variação"}</b>
                    {v.sku ? ` · ${v.sku}` : ""} · {Number(v.estoque || 0)} em estoque
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-3">
              <h2 className="text-lg font-black text-[#0f172a]">Linha do tempo</h2>
              <p className="text-sm text-[#64748b]">Vendas, condicionais e movimentações de estoque em ordem cronológica.</p>
            </div>
            <EntityTimeline items={timeline} />
          </div>
        </>
      )}
    </section>
  );
}

function Resumo({ icon: Icon, label, valor }: { icon: typeof Package; label: string; valor: string }) {
  return (
    <div className="rounded-[26px] border border-[#e8ecf4] bg-white p-5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eff6ff] text-[#2563eb]"><Icon className="h-4 w-4" /></span>
      <p className="mt-3 text-xs font-bold uppercase tracking-wide text-[#94a3b8]">{label}</p>
      <p className="mt-1 text-xl font-black text-[#0f172a]">{valor}</p>
    </div>
  );
}
