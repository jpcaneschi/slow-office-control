"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ShoppingCart, CircleDollarSign, Wallet, FileText } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/vendas-utils";
import { SalesPanel, type VendaLite } from "@/components/dashboard/sales-panel";
import { MetricCard } from "@/components/dashboard/metric-card";
import { MiniCalendar } from "@/components/dashboard/mini-calendar";
import { RecentSales, type VendaRow } from "@/components/dashboard/recent-sales";
import { TasksAlerts } from "@/components/dashboard/tasks-alerts";
import { usePeriod, presetRange, isoToDate } from "@/components/dashboard/period-context";

type Venda = {
  id: string;
  cliente_id: string | null;
  forma_pagamento: string;
  total: number | null;
  status: string;
  created_at: string;
};

type Cliente = { id: string; nome: string };
type Promissoria = { valor_total: number | null; status: string };
type Condicional = { id: string; status: string };
type AtendimentoTat = {
  data: string;
  valor: number | null;
  percentual: number | null;
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Soma o total das vendas concluídas com created_at em [inicio, fimExclusivo). */
function somaConcluidas(vendas: Venda[], inicio: Date, fimExclusivo: Date) {
  const ini = inicio.getTime();
  const f = fimExclusivo.getTime();
  return vendas
    .filter((v) => v.status === "concluida")
    .filter((v) => {
      const t = new Date(v.created_at).getTime();
      return t >= ini && t < f;
    })
    .reduce((acc, v) => acc + Number(v.total || 0), 0);
}

/** Soma o repasse da loja (valor × %/100) dos atendimentos de tatuagem em [inicio, fimExclusivo). */
function somaRepasse(atends: AtendimentoTat[], inicio: Date, fimExclusivo: Date) {
  const ini = inicio.getTime();
  const f = fimExclusivo.getTime();
  return atends
    .filter((a) => {
      const t = isoToDate(a.data).getTime();
      return t >= ini && t < f;
    })
    .reduce(
      (acc, a) =>
        acc + ((Number(a.valor) || 0) * (Number(a.percentual) || 0)) / 100,
      0
    );
}

function variacao(atual: number, anterior: number) {
  if (anterior <= 0) return atual > 0 ? 100 : 0;
  return ((atual - anterior) / anterior) * 100;
}

export default function DashboardPage() {
  const { period } = usePeriod();
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [promissorias, setPromissorias] = useState<Promissoria[]>([]);
  const [condicionais, setCondicionais] = useState<Condicional[]>([]);
  const [atendimentos, setAtendimentos] = useState<AtendimentoTat[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");

    const [vendasRes, clientesRes, promissoriasRes, condicionaisRes, atendRes] =
      await Promise.all([
        supabase
          .from("vendas")
          .select("id, cliente_id, forma_pagamento, total, status, created_at")
          .order("created_at", { ascending: false }),
        supabase.from("clientes").select("id, nome"),
        supabase.from("promissorias").select("valor_total, status"),
        supabase.from("condicionais").select("id, status"),
        supabase
          .from("tatuagem_atendimentos")
          .select("data, valor, percentual"),
      ]);

    const primeiroErro =
      vendasRes.error ||
      clientesRes.error ||
      promissoriasRes.error ||
      condicionaisRes.error ||
      atendRes.error;
    if (primeiroErro) setErro(primeiroErro.message);

    setVendas(vendasRes.data || []);
    setClientes(clientesRes.data || []);
    setPromissorias(promissoriasRes.data || []);
    setCondicionais(condicionaisRes.data || []);
    setAtendimentos(atendRes.data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const clienteNome = useMemo(() => {
    const map = new Map<string, string>();
    clientes.forEach((c) => map.set(c.id, c.nome));
    return map;
  }, [clientes]);

  // Janela do período selecionado (fim exclusivo = dia seguinte).
  const janela = useMemo(() => {
    const inicio = startOfDay(isoToDate(period.inicio));
    const fim = startOfDay(isoToDate(period.fim));
    fim.setDate(fim.getDate() + 1);
    const anteriorFim = inicio;
    const anteriorInicio = new Date(inicio.getTime() - (fim.getTime() - inicio.getTime()));
    const ehHoje = period.inicio === presetRange("hoje").inicio && period.fim === presetRange("hoje").fim;
    return { inicio, fim, anteriorInicio, anteriorFim, ehHoje };
  }, [period]);

  const metricas = useMemo(() => {
    const agora = new Date();
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const inicioProxMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 1);
    const inicioMesAnterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);

    const vendasPeriodo = somaConcluidas(vendas, janela.inicio, janela.fim);
    const vendasPeriodoAnterior = somaConcluidas(
      vendas,
      janela.anteriorInicio,
      janela.anteriorFim
    );
    const qtdPeriodo = vendas.filter((v) => {
      const t = new Date(v.created_at).getTime();
      return (
        v.status === "concluida" &&
        t >= janela.inicio.getTime() &&
        t < janela.fim.getTime()
      );
    }).length;

    const faturamentoMes =
      somaConcluidas(vendas, inicioMes, inicioProxMes) +
      somaRepasse(atendimentos, inicioMes, inicioProxMes);
    const faturamentoMesAnterior =
      somaConcluidas(vendas, inicioMesAnterior, inicioMes) +
      somaRepasse(atendimentos, inicioMesAnterior, inicioMes);

    const contasReceber = promissorias
      .filter((p) => p.status === "em_aberto")
      .reduce((acc, p) => acc + Number(p.valor_total || 0), 0);

    const condicionaisAbertas = condicionais.filter((c) => c.status === "aberto").length;

    // sparkline: faturamento diário dos últimos 7 dias
    const hoje = startOfDay(agora);
    const spark: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const dia = new Date(hoje);
      dia.setDate(dia.getDate() - i);
      const prox = new Date(dia);
      prox.setDate(prox.getDate() + 1);
      spark.push(somaConcluidas(vendas, dia, prox));
    }

    return {
      vendasPeriodo,
      qtdPeriodo,
      deltaVendas: variacao(vendasPeriodo, vendasPeriodoAnterior),
      faturamentoMes,
      deltaFaturamento: variacao(faturamentoMes, faturamentoMesAnterior),
      contasReceber,
      condicionaisAbertas,
      spark,
    };
  }, [vendas, promissorias, condicionais, atendimentos, janela]);

  const ultimasVendas: VendaRow[] = useMemo(() => {
    return vendas
      .filter((v) => {
        const t = new Date(v.created_at).getTime();
        return t >= janela.inicio.getTime() && t < janela.fim.getTime();
      })
      .slice(0, 8)
      .map((v) => {
        const d = new Date(v.created_at);
        const data = `${String(d.getDate()).padStart(2, "0")}/${String(
          d.getMonth() + 1
        ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
          d.getMinutes()
        ).padStart(2, "0")}`;
        return {
          id: v.id,
          cliente: (v.cliente_id && clienteNome.get(v.cliente_id)) || "Sem cliente",
          pagamento: v.forma_pagamento,
          valor: Number(v.total || 0),
          status: v.status,
          data,
        };
      });
  }, [vendas, clienteNome, janela]);

  const vendasLite: VendaLite[] = useMemo(
    () =>
      vendas.map((v) => ({
        total: v.total,
        status: v.status,
        created_at: v.created_at,
      })),
    [vendas]
  );

  return (
    <div className="space-y-6">
      {erro && (
        <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">
          Não foi possível carregar alguns dados: {erro}
        </div>
      )}

      {/* ─── Gráfico principal (dados reais, período global) ─────────────── */}
      <SalesPanel vendas={vendasLite} loading={loading} onRefresh={carregar} />

      {/* ─── Cards de métrica (reais + clicáveis) ───────────────────────── */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={ShoppingCart}
          tint="#2563eb"
          title={janela.ehHoje ? "Vendas hoje" : "Vendas no período"}
          value={loading ? "…" : formatCurrency(metricas.vendasPeriodo)}
          delta={loading ? undefined : metricas.deltaVendas}
          deltaLabel={janela.ehHoje ? "vs ontem" : "vs período anterior"}
          spark={metricas.spark}
          href="/dashboard/vendas"
          ariaLabel="Ver vendas"
        />
        <MetricCard
          icon={CircleDollarSign}
          tint="#7c3aed"
          title="Faturamento do mês"
          value={loading ? "…" : formatCurrency(metricas.faturamentoMes)}
          delta={loading ? undefined : metricas.deltaFaturamento}
          deltaLabel="vs mês anterior"
          spark={metricas.spark}
          href="/dashboard/financeiro"
          ariaLabel="Ver financeiro"
        />
        <MetricCard
          icon={Wallet}
          tint="#0891b2"
          title="Contas a receber"
          value={loading ? "…" : formatCurrency(metricas.contasReceber)}
          href="/dashboard/promissorias?status=em_aberto"
          ariaLabel="Ver promissórias a receber"
        />
        <MetricCard
          icon={FileText}
          tint="#ea580c"
          title="Condicionais em aberto"
          value={loading ? "…" : String(metricas.condicionaisAbertas)}
          href="/dashboard/condicional?status=aberto"
          ariaLabel="Ver condicionais em aberto"
        />
      </section>

      {/* ─── Calendário · Últimas vendas · Tarefas ─────────────────────── */}
      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[0.95fr_1.2fr_1fr]">
        <MiniCalendar />
        <RecentSales
          vendas={ultimasVendas}
          totalQtd={metricas.qtdPeriodo}
          totalValor={metricas.vendasPeriodo}
          loading={loading}
        />
        <TasksAlerts />
      </section>
    </div>
  );
}
