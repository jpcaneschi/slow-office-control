"use client";

import { useMemo, type ReactNode } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { BarChart3, Boxes, Tags, TrendingUp, ReceiptText, Package } from "lucide-react";
import { formatCurrency } from "@/lib/vendas-utils";
import { SensitiveValue, useDashboardPreferences } from "./dashboard-preferences";
import { DashboardCard } from "./dashboard-card";
import styles from "./dashboard-overview.module.css";

type Venda = {
  id: string; forma_pagamento: string; total: number | null;
  status: string; data_venda: string;
};
type Item = { venda_id: string; produto_id: string; quantidade: number; total_item: number };
type Produto = { id: string; nome: string; marca: string | null };
const CORES = ["#2563eb", "#06b6d4", "#6366f1", "#60a5fa", "#0e7490", "#a5b4fc"];
const PAGAMENTOS: Record<string, string> = {
  pix: "Pix", dinheiro: "Dinheiro", debito: "Débito", credito: "Crédito",
  cartao_credito: "Crédito", cartao_debito: "Débito", promissoria: "Promissória",
  crediario: "Crediário", misto: "Misto",
};

export function ExecutiveOverview({ vendas, itens, produtos, despesas, inicio, fim, loading = false, children }: {
  vendas: Venda[]; itens: Item[]; produtos: Produto[]; despesas: number;
  inicio: string; fim: string; loading?: boolean; children?: ReactNode;
}) {
  const { valoresVisiveis } = useDashboardPreferences();
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

  const ticket = dados.pedidos ? dados.receita / dados.pedidos : 0;
  const metrics = [
    { label: "Pedidos", value: String(dados.pedidos), icon: BarChart3 },
    { label: "Peças vendidas", value: String(dados.unidades), icon: Boxes },
    { label: "Faturamento", value: formatCurrency(dados.receita), icon: TrendingUp, money: true },
    { label: "Resultado simples", value: formatCurrency(dados.resultado), icon: Tags, money: true },
    { label: "Ticket médio", value: formatCurrency(ticket), icon: ReceiptText, money: true },
    { label: "Peças por pedido", value: dados.pedidos ? (dados.unidades / dados.pedidos).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "—", icon: Package },
  ];

  return (
    <div className={styles.overview} aria-busy={loading}>
      <section className={styles.metrics} aria-label="Indicadores do período">
        {metrics.map(({ label, value, icon: Icon, money }) => (
          <div className={styles.metric} key={label}>
            <div className={styles.metricHeading}><span>{label}</span><Icon size={16} aria-hidden="true" /></div>
            <p className={styles.metricValue}>{loading ? "…" : money ? <SensitiveValue>{value}</SensitiveValue> : value}</p>
          </div>
        ))}
      </section>

      <DashboardCard title="Resumo do período" className={styles.summary}>
        <dl className={styles.summaryRows}>
          {[
            { label: "Faturamento", value: dados.receita, sign: "", className: "" },
            { label: "Despesas pagas", value: despesas, sign: "−", className: "" },
            { label: "Resultado simples", value: dados.resultado, sign: "=", className: styles.summaryResult },
          ].map(({ label, value, sign, className }) => (
            <div key={label} className={`${styles.summaryRow} ${className}`}>
              <span className={styles.summarySign} aria-hidden="true">{sign || "R$"}</span>
              <div><dt>{label}</dt><dd>{loading ? "…" : <SensitiveValue>{formatCurrency(value)}</SensitiveValue>}</dd></div>
            </div>
          ))}
        </dl>
        <p className={styles.note}>Faturamento menos despesas pagas. Não desconta o custo dos produtos.</p>
      </DashboardCard>

      <DashboardCard title="Mix de pagamentos" subtitle="Valor dos pedidos por forma de pagamento" className={styles.payments}>
        {loading ? <p className={styles.empty}>Carregando pagamentos…</p> : dados.pagamentos.length === 0 ? <p className={styles.empty}>Sem vendas no período.</p> : (
          <div className={styles.paymentContent}>
            <div className={styles.donut} role="img" aria-label="Distribuição dos pagamentos; valores na legenda">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={dados.pagamentos} dataKey="valor" nameKey="nome" innerRadius="62%" outerRadius="88%" paddingAngle={2} stroke="var(--surface)" strokeWidth={2} isAnimationActive={false}>
                    {dados.pagamentos.map((p, i) => <Cell key={p.nome} fill={CORES[i % CORES.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value, name) => [valoresVisiveis ? formatCurrency(Number(value)) : "••••", PAGAMENTOS[String(name)] || String(name)]} contentStyle={{ background: "var(--surface)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }} itemStyle={{ color: "var(--foreground)" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className={styles.legend}>
              {dados.pagamentos.map((p, i) => (
                <li key={p.nome}>
                  <span className={styles.legendName}><i style={{ background: CORES[i % CORES.length] }} />{PAGAMENTOS[p.nome] || p.nome.replaceAll("_", " ") || "Não informado"}</span>
                  <strong><SensitiveValue>{formatCurrency(p.valor)}</SensitiveValue><small>{dados.receita > 0 ? `${(p.valor / dados.receita * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—"}</small></strong>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DashboardCard>

      <div className={styles.sales}>{children}</div>
      <DashboardCard title="Marcas com maior retorno" subtitle="Valor vendido no período" className={styles.brands}>
        {loading ? <p className={styles.empty}>Carregando marcas…</p> : dados.marcas.length === 0 ? <p className={styles.empty}>Sem vendas no período.</p> : (
          <ol className={styles.brandList}>
            {dados.marcas.map((marca, i) => (
              <li key={marca.nome}>
                <span className={styles.rank}>{String(i + 1).padStart(2, "0")}</span>
                <div className={styles.brandDetail}>
                  <div className={styles.brandHeading}><span>{marca.nome}</span><strong><SensitiveValue>{formatCurrency(marca.receita)}</SensitiveValue></strong></div>
                  <div className={styles.track}><div style={{ width: `${Math.max(0, marca.receita / Math.max(dados.marcas[0]?.receita || 1, 1) * 100)}%` }} /></div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </DashboardCard>
    </div>
  );
}
