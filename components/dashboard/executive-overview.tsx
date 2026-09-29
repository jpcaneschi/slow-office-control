"use client";

import { useMemo, type ReactNode } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Tags, TrendingUp, ReceiptText, Wallet } from "lucide-react";
import { resumirDashboard, type VendaResumo, type ItemResumo, type ProdutoResumo } from "@/lib/dashboard-overview-utils";
import { nomeFormaPagamento } from "@/lib/relatorios-financeiros";
import { formatCurrency } from "@/lib/vendas-utils";
import { SensitiveValue, useDashboardPreferences } from "./dashboard-preferences";
import { DashboardCard } from "./dashboard-card";
import styles from "./dashboard-overview.module.css";

const CORES = ["#2563eb", "#06b6d4", "#6366f1", "#60a5fa", "#0e7490", "#a5b4fc"];
export function ExecutiveOverview({ vendas, itens, produtos, despesas, inicio, fim, loading = false, podeVerFinanceiro = true, children }: {
  vendas: VendaResumo[]; itens: ItemResumo[]; produtos: ProdutoResumo[]; despesas: number;
  inicio: string; fim: string; loading?: boolean; podeVerFinanceiro?: boolean; children?: ReactNode;
}) {
  const { valoresVisiveis } = useDashboardPreferences();
  const dados = useMemo(
    () => resumirDashboard(vendas, itens, produtos, despesas, inicio, fim),
    [vendas, itens, produtos, despesas, inicio, fim],
  );

  const ticket = dados.pedidos ? dados.receita / dados.pedidos : 0;
  const metrics = [
    { label: "Vendas do período", value: formatCurrency(dados.receita), icon: TrendingUp, detail: "Valor cheio dos pedidos concluídos" },
    ...(podeVerFinanceiro ? [
      { label: "Despesas pagas", value: formatCurrency(despesas), icon: Wallet, detail: "Fornecedores, despesas, folha e vales" },
      { label: "Resultado do período", value: formatCurrency(dados.resultado), icon: Tags, detail: "Vendas menos despesas pagas", result: true },
    ] : []),
    { label: "Ticket médio", value: formatCurrency(ticket), icon: ReceiptText, detail: "Valor médio por pedido" },
  ];

  return (
    <div className={styles.overview} aria-busy={loading}>
      <section className={styles.metrics} aria-label="Indicadores do período">
        {metrics.map(({ label, value, icon: Icon, detail, result }) => (
          <div className={`${styles.metric} ${result ? styles.resultMetric : ""}`} key={label}>
            <div className={styles.metricHeading}><span>{label}</span><Icon size={16} aria-hidden="true" /></div>
            <p className={styles.metricValue}>{loading ? "…" : <SensitiveValue>{value}</SensitiveValue>}</p>
            <p className={styles.metricDetail}>{detail}</p>
          </div>
        ))}
      </section>

      <div className={styles.activity} aria-label="Atividade da loja no período">
        <span><strong>{loading ? "…" : dados.pedidos}</strong> pedidos</span>
        <span><strong>{loading ? "…" : dados.unidades}</strong> peças vendidas</span>
        <span><strong>{loading ? "…" : dados.pedidos ? (dados.unidades / dados.pedidos).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "—"}</strong> peças por pedido</span>
        {podeVerFinanceiro && <p>Fornecedores entram nas despesas pagas; o custo individual do produto não é descontado.</p>}
      </div>

      <div className={styles.sales}>{children}</div>
      <DashboardCard title="Mix de pagamentos" subtitle="Valor dos pedidos por forma de pagamento" className={styles.payments}>
        {loading ? <p className={styles.empty}>Carregando pagamentos…</p> : dados.pagamentos.length === 0 ? <p className={styles.empty}>Sem vendas no período.</p> : (
          <div className={styles.paymentContent}>
            <div className={styles.donut} role="img" aria-label="Distribuição dos pagamentos; valores na legenda">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={dados.pagamentos} dataKey="valor" nameKey="nome" innerRadius="62%" outerRadius="88%" paddingAngle={2} stroke="var(--surface)" strokeWidth={2} isAnimationActive={false}>
                    {dados.pagamentos.map((p, i) => <Cell key={p.nome} fill={CORES[i % CORES.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value, name) => [valoresVisiveis ? formatCurrency(Number(value)) : "••••", nomeFormaPagamento(String(name))]} contentStyle={{ background: "var(--surface)", color: "var(--foreground)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }} itemStyle={{ color: "var(--foreground)" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className={styles.legend}>
              {dados.pagamentos.map((p, i) => (
                <li key={p.nome}>
                  <span className={styles.legendName}><i style={{ background: CORES[i % CORES.length] }} />{nomeFormaPagamento(p.nome)}</span>
                  <strong><SensitiveValue>{formatCurrency(p.valor)}</SensitiveValue><small>{dados.receita > 0 ? `${(p.valor / dados.receita * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—"}</small></strong>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DashboardCard>

      <DashboardCard title="Marcas mais vendidas" subtitle="Valor vendido, com descontos rateados" className={styles.brands}>
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
