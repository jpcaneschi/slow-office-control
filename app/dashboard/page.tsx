import { ShoppingCart, CircleDollarSign, Wallet, FileText } from "lucide-react";
import { SalesPanel } from "@/components/dashboard/sales-panel";
import { MetricCard } from "@/components/dashboard/metric-card";
import { MiniCalendar } from "@/components/dashboard/mini-calendar";
import { RecentSales, type Venda } from "@/components/dashboard/recent-sales";
import { TasksAlerts } from "@/components/dashboard/tasks-alerts";

// ─── Dados de exemplo (espelham o modelo). Serão trocados por dados reais
//     do Supabase numa próxima etapa. ─────────────────────────────────────────
const vendas: Venda[] = [
  { cliente: "Mariana Santos", pagamento: "Crédito à vista", valor: 279.9, status: "Concluída", data: "30/05 10:42" },
  { cliente: "João Pereira", pagamento: "PIX", valor: 349.9, status: "Concluída", data: "30/05 10:15" },
  { cliente: "Ana Beatriz", pagamento: "Débito", valor: 189.9, status: "Concluída", data: "30/05 09:58" },
  { cliente: "Carlos Eduardo", pagamento: "Crédito 2x", valor: 159.8, status: "Parcelado", data: "30/05 09:31" },
  { cliente: "Patrícia Lima", pagamento: "PIX", valor: 199.9, status: "Concluída", data: "30/05 09:05" },
  { cliente: "Juliana Rocha", pagamento: "Crédito 3x", valor: 459.7, status: "Parcelado", data: "30/05 08:47" },
  { cliente: "Rafael Mendes", pagamento: "Débito", valor: 129.9, status: "Concluída", data: "30/05 08:22" },
  { cliente: "Camila Ferreira", pagamento: "PIX", valor: 89.9, status: "Concluída", data: "30/05 08:10" },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* ─── Gráfico principal (com seletor de período funcional) ──────── */}
      <SalesPanel />

      {/* ─── Cards de métrica ──────────────────────────────────────────── */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={ShoppingCart}
          tint="#2563eb"
          title="Vendas hoje"
          value="R$ 18.742,60"
          delta="12,4%"
          deltaLabel="vs ontem"
          spark={[3, 5, 4, 6, 5, 7, 6, 8]}
        />
        <MetricCard
          icon={CircleDollarSign}
          tint="#7c3aed"
          title="Faturamento do mês"
          value="R$ 432.118,30"
          delta="15,8%"
          deltaLabel="vs mês anterior"
          spark={[4, 4, 5, 5, 6, 6, 7, 8]}
        />
        <MetricCard
          icon={Wallet}
          tint="#0891b2"
          title="Contas a receber"
          value="R$ 158.732,40"
          delta="9,2%"
          deltaLabel="vs 7 dias anteriores"
          spark={[5, 4, 6, 5, 7, 6, 7, 7]}
        />
        <MetricCard
          icon={FileText}
          tint="#ea580c"
          title="Condicionais em aberto"
          value="R$ 64.980,10"
          delta="6,1%"
          deltaLabel="vs 7 dias anteriores"
          spark={[4, 5, 5, 4, 6, 5, 6, 7]}
        />
      </section>

      {/* ─── Calendário · Últimas vendas · Tarefas ─────────────────────── */}
      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[0.95fr_1.2fr_1fr]">
        <MiniCalendar />
        <RecentSales vendas={vendas} totalQtd={78} totalValor={18742.6} />
        <TasksAlerts />
      </section>
    </div>
  );
}
