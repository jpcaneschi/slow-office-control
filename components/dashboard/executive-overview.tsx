"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, Boxes, Tags, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/vendas-utils";

type Venda = {
  id: string;
  forma_pagamento: string;
  total: number | null;
  status: string;
  data_venda: string;
};
type Item = { venda_id: string; produto_id: string; quantidade: number; total_item: number };
type Produto = { id: string; nome: string; marca: string | null };

const CORES = ["#2563eb", "#06b6d4", "#8b5cf6", "#22c55e", "#f59e0b"];

export function ExecutiveOverview({
  vendas,
  itens,
  produtos,
  despesas,
  inicio,
  fim,
}: {
  vendas: Venda[];
  itens: Item[];
  produtos: Produto[];
  despesas: number;
  inicio: string;
  fim: string;
}) {
  const dados = useMemo(() => {
    const concluidas = vendas.filter(
      (v) => v.status === "concluida" && v.data_venda >= inicio && v.data_venda <= fim
    );
    const ids = new Set(concluidas.map((v) => v.id));
    const itensPeriodo = itens.filter((i) => ids.has(i.venda_id));
    const receita = concluidas.reduce((s, v) => s + Number(v.total || 0), 0);
    const unidades = itensPeriodo.reduce((s, i) => s + Number(i.quantidade || 0), 0);
    const porDia = new Map<string, number>();
    const porPagamento = new Map<string, number>();
    for (const venda of concluidas) {
      porDia.set(venda.data_venda, (porDia.get(venda.data_venda) || 0) + Number(venda.total || 0));
      porPagamento.set(venda.forma_pagamento, (porPagamento.get(venda.forma_pagamento) || 0) + Number(venda.total || 0));
    }
    const produtoPorId = new Map(produtos.map((p) => [p.id, p]));
    const marcas = new Map<string, { unidades: number; receita: number }>();
    for (const item of itensPeriodo) {
      const marca = produtoPorId.get(item.produto_id)?.marca?.trim() || "Sem marca";
      const atual = marcas.get(marca) || { unidades: 0, receita: 0 };
      atual.unidades += Number(item.quantidade || 0);
      atual.receita += Number(item.total_item || 0);
      marcas.set(marca, atual);
    }
    return {
      pedidos: concluidas.length,
      unidades,
      receita,
      resultado: receita - despesas,
      dias: [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([data, valor]) => ({
        data: data.slice(5).split("-").reverse().join("/"),
        valor,
      })),
      pagamentos: [...porPagamento.entries()].map(([nome, valor]) => ({ nome, valor })),
      marcas: [...marcas.entries()]
        .map(([nome, valor]) => ({ nome, ...valor }))
        .sort((a, b) => b.receita - a.receita)
        .slice(0, 5),
    };
  }, [vendas, itens, produtos, despesas, inicio, fim]);

  return (
    <section className="overflow-hidden rounded-[30px] border border-slate-800 bg-[#07111f] text-white shadow-2xl shadow-blue-950/20">
      <div className="flex flex-col gap-2 border-b border-white/10 bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-50">Visão executiva</p>
          <h2 className="text-xl font-black">Performance da Slow Office</h2>
        </div>
        <p className="text-xs font-semibold text-blue-50">{inicio.split("-").reverse().join("/")} — {fim.split("-").reverse().join("/")}</p>
      </div>

      <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[1.35fr_0.8fr]">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Pedidos", String(dados.pedidos), BarChart3],
              ["Peças vendidas", String(dados.unidades), Boxes],
              ["Faturamento", formatCurrency(dados.receita), TrendingUp],
              ["Resultado simples", formatCurrency(dados.resultado), Tags],
            ].map(([rotulo, valor, Icone]) => {
              const Icon = Icone as typeof BarChart3;
              return <div key={String(rotulo)} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                <Icon size={17} className="text-cyan-300" />
                <p className="mt-3 text-xs font-bold text-slate-400">{String(rotulo)}</p>
                <p className="mt-1 text-lg font-black tracking-tight">{String(valor)}</p>
              </div>;
            })}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="mb-3 flex items-center justify-between">
              <div><p className="font-black">Evolução de vendas</p><p className="text-xs text-slate-400">Valor vendido por dia</p></div>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dados.dias}>
                  <defs><linearGradient id="receitaBlue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#38bdf8" stopOpacity={0.55}/><stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/></linearGradient></defs>
                  <CartesianGrid stroke="rgba(148,163,184,.12)" vertical={false}/>
                  <XAxis dataKey="data" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false}/>
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} width={52}/>
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 12 }}/>
                  <Area type="monotone" dataKey="valor" stroke="#38bdf8" strokeWidth={3} fill="url(#receitaBlue)"/>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="font-black">Mix de pagamentos</p>
            <div className="mt-2 h-44">
              <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={dados.pagamentos} dataKey="valor" nameKey="nome" innerRadius={42} outerRadius={68} paddingAngle={3}>{dados.pagamentos.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]}/>)}</Pie><Tooltip formatter={(v) => formatCurrency(Number(v))} contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 12 }}/></PieChart></ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="font-black">Marcas com maior retorno</p>
            <div className="mt-4 space-y-3">
              {dados.marcas.map((marca, i) => <div key={marca.nome}>
                <div className="flex items-center justify-between gap-3 text-xs"><span className="truncate font-bold text-slate-300">{i + 1}. {marca.nome}</span><strong>{formatCurrency(marca.receita)}</strong></div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400" style={{ width: `${Math.max(8, (marca.receita / Math.max(dados.marcas[0]?.receita || 1, 1)) * 100)}%` }}/></div>
              </div>)}
              {dados.marcas.length === 0 && <p className="text-sm text-slate-400">Sem vendas no período.</p>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
