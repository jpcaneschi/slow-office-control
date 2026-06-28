"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

type Cliente = {
  id: string;
  nome: string;
  telefone: string | null;
  cpf: string | null;
  status: string | null;
};

type StatusChartItem = {
  name: string;
  value: number;
};

type RevenuePoint = {
  name: string;
  faturamento: number;
};

const revenueData: RevenuePoint[] = [
  { name: "Sem 1", faturamento: 1800 },
  { name: "Sem 2", faturamento: 2400 },
  { name: "Sem 3", faturamento: 2100 },
  { name: "Sem 4", faturamento: 3200 },
  { name: "Sem 5", faturamento: 2800 },
  { name: "Sem 6", faturamento: 3600 },
];

const STATUS_COLORS = ["#d4a93a", "#7aa2ff", "#ef4444", "#8b5cf6"];

export default function DashboardPage() {
  const [clientesCount, setClientesCount] = useState(0);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function carregarResumo() {
      const [{ count }, clientesResult] = await Promise.all([
        supabase.from("clientes").select("*", { count: "exact", head: true }),
        supabase.from("clientes").select("id, nome, telefone, cpf, status"),
      ]);

      setClientesCount(count || 0);
      setClientes(clientesResult.data || []);
      setLoading(false);
    }

    carregarResumo();
  }, []);

  const clientesPorStatus = useMemo<StatusChartItem[]>(() => {
    const counts: Record<string, number> = {};

    clientes.forEach((cliente) => {
      const status = cliente.status?.trim() || "ativo";
      counts[status] = (counts[status] || 0) + 1;
    });

    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [clientes]);

  const clientesVip = useMemo(() => {
    return clientes.filter(
      (cliente) => (cliente.status || "").toLowerCase() === "vip"
    ).length;
  }, [clientes]);

  const clientesAtraso = useMemo(() => {
    return clientes.filter(
      (cliente) => (cliente.status || "").toLowerCase() === "em atraso"
    ).length;
  }, [clientes]);

  const ultimosClientes = useMemo(() => {
    return clientes.slice(0, 5);
  }, [clientes]);

  return (
    <div className="space-y-6 pb-24 xl:pb-0">
      <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <MetricCard
          title="Clientes cadastrados"
          value={loading ? "..." : String(clientesCount)}
          subtitle="Base ativa no sistema"
          accent="yellow"
        />
        <MetricCard
          title="Clientes VIP"
          value={loading ? "..." : String(clientesVip)}
          subtitle="Relacionamento prioritário"
          accent="blue"
        />
        <MetricCard
          title="Clientes em atraso"
          value={loading ? "..." : String(clientesAtraso)}
          subtitle="Acompanhamento imediato"
          accent="red"
        />
        <MetricCard
          title="Faturamento estimado"
          value="R$ 15.900"
          subtitle="Prévia visual da operação"
          accent="neutral"
        />
      </section>

      <section className="grid gap-6 2xl:grid-cols-[1.55fr_0.95fr]">
        <div className="rounded-[30px] border border-white/10 bg-[#0c1016] p-6 shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#d4a93a]">
                Performance
              </p>
              <h3 className="mt-2 text-2xl font-black tracking-tight text-white">
                Faturamento por período
              </h3>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Estrutura pronta para receber vendas reais do sistema.
              </p>
            </div>

            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-zinc-300">
              Últimas 6 semanas
            </span>
          </div>

          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#d4a93a" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#d4a93a" stopOpacity={0.02} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{
                    background: "#0b0f15",
                    border: "1px solid #1f2937",
                    borderRadius: 16,
                    color: "#fff",
                  }}
                  formatter={(value) => [`R$ ${value}`, "Faturamento"]}
                />
                <Area
                  type="monotone"
                  dataKey="faturamento"
                  stroke="#d4a93a"
                  strokeWidth={3}
                  fill="url(#colorRevenue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-[30px] border border-white/10 bg-[#0c1016] p-6 shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#7aa2ff]">
              Distribuição
            </p>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-white">
              Clientes por status
            </h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Leitura rápida da base atual.
            </p>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={clientesPorStatus}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={58}
                  outerRadius={95}
                  paddingAngle={4}
                >
                  {clientesPorStatus.map((entry, index) => (
                    <Cell
                      key={`cell-${entry.name}`}
                      fill={STATUS_COLORS[index % STATUS_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#0b0f15",
                    border: "1px solid #1f2937",
                    borderRadius: 16,
                    color: "#fff",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 grid gap-2">
            {clientesPorStatus.map((item, index) => (
              <div
                key={item.name}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor:
                        STATUS_COLORS[index % STATUS_COLORS.length],
                    }}
                  />
                  <span className="text-sm font-semibold text-zinc-200">
                    {item.name}
                  </span>
                </div>
                <span className="text-sm font-bold text-white">
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 2xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[30px] border border-white/10 bg-[#0c1016] p-6 shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#d4a93a]">
                CRM
              </p>
              <h3 className="mt-2 text-2xl font-black tracking-tight text-white">
                Últimos clientes
              </h3>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Visualização rápida da base recente.
              </p>
            </div>

            <Link
              href="/dashboard/clientes"
              className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.06]"
            >
              Ver todos
            </Link>
          </div>

          <div className="space-y-3">
            {ultimosClientes.map((cliente) => (
              <div
                key={cliente.id}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
              >
                <div>
                  <p className="text-sm font-bold text-white">{cliente.nome}</p>
                  <p className="mt-1 text-sm text-zinc-400">
                    {cliente.telefone || "Telefone não informado"}
                  </p>
                </div>
                <span className="rounded-full border border-white/10 bg-[#131925] px-3 py-1.5 text-xs font-bold text-zinc-200">
                  {cliente.status || "ativo"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[30px] border border-white/10 bg-[#0c1016] p-6 shadow-[0_10px_40px_rgba(0,0,0,0.35)]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#ef4444]">
              Atenção
            </p>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-white">
              Alertas operacionais
            </h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Painel preparado para promissórias, condicionais, calendário e
              prioridades do dia.
            </p>
          </div>

          <div className="mt-5 space-y-3">
            <AlertItem
              title="Clientes em atraso"
              description={`${clientesAtraso} cliente(s) exigem acompanhamento.`}
              tone="red"
            />
            <AlertItem
              title="Clientes VIP"
              description={`${clientesVip} cliente(s) com alto potencial de recompra.`}
              tone="yellow"
            />
            <AlertItem
              title="Campanhas comerciais"
              description="Estrutura pronta para Black Friday, Natal e ações sazonais."
              tone="blue"
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  accent,
}: {
  title: string;
  value: string;
  subtitle: string;
  accent: "yellow" | "blue" | "red" | "neutral";
}) {
  const accentMap = {
    yellow: "from-[#d4a93a]/18 to-transparent",
    blue: "from-[#7aa2ff]/18 to-transparent",
    red: "from-[#ef4444]/16 to-transparent",
    neutral: "from-white/10 to-transparent",
  };

  const lineMap = {
    yellow: "bg-[#d4a93a]",
    blue: "bg-[#7aa2ff]",
    red: "bg-[#ef4444]",
    neutral: "bg-zinc-500",
  };

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#0c1016] p-5 shadow-[0_10px_40px_rgba(0,0,0,0.28)]">
      <div
        className={`absolute inset-0 bg-gradient-to-br ${accentMap[accent]} opacity-80`}
      />
      <div className="relative">
        <span className={`mb-4 block h-1.5 w-14 rounded-full ${lineMap[accent]}`} />
        <p className="text-sm font-semibold text-zinc-400">{title}</p>
        <p className="mt-3 text-[34px] font-black tracking-tight text-white">
          {value}
        </p>
        <p className="mt-2 text-sm text-zinc-500">{subtitle}</p>
      </div>
    </div>
  );
}

function AlertItem({
  title,
  description,
  tone,
}: {
  title: string;
  description: string;
  tone: "yellow" | "red" | "blue";
}) {
  const toneMap = {
    yellow: "border-[#d4a93a]/20 bg-[#d4a93a]/10 text-[#f1d27a]",
    red: "border-red-500/20 bg-red-500/10 text-red-300",
    blue: "border-[#7aa2ff]/20 bg-[#7aa2ff]/10 text-[#9db8ff]",
  };

  return (
    <div className={`rounded-2xl border p-4 ${toneMap[tone]}`}>
      <p className="text-sm font-bold">{title}</p>
      <p className="mt-1 text-sm leading-6 opacity-90">{description}</p>
    </div>
  );
}