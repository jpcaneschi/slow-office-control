"use client";

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
  Cell,
} from "recharts";

export type SalesPoint = {
  dia: string;
  faturamento: number;
  pedidos: number;
};

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function SalesChart({ data }: { data: SalesPoint[] }) {
  const maxFat = Math.max(...data.map((d) => d.faturamento));
  // Com muitos dias as barras ficam finas e escondemos os rótulos pra não poluir.
  const many = data.length > 8;
  const barSize = data.length > 16 ? 10 : many ? 18 : 38;

  return (
    <div className="h-[340px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 28, right: 16, left: 8, bottom: 8 }}>
          <defs>
            <linearGradient id="barFat" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#93c5fd" />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />

          <XAxis
            dataKey="dia"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#64748b", fontSize: 12 }}
            minTickGap={12}
            dy={6}
          />

          {/* Eixo esquerdo — faturamento */}
          <YAxis
            yAxisId="left"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            tickFormatter={(v: number) => (v === 0 ? "R$ 0" : `R$ ${v / 1000}k`)}
            domain={[0, 80000]}
            ticks={[0, 20000, 40000, 60000, 80000]}
          />

          {/* Eixo direito — pedidos */}
          <YAxis
            yAxisId="right"
            orientation="right"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
          />

          <Tooltip
            cursor={{ fill: "rgba(37,99,235,0.05)" }}
            contentStyle={{
              background: "#ffffff",
              border: "1px solid #e8ecf4",
              borderRadius: 14,
              boxShadow: "0 12px 30px rgba(15,23,42,0.10)",
              fontSize: 13,
            }}
            labelStyle={{ color: "#0f172a", fontWeight: 700 }}
            formatter={(value, name) => {
              const num = typeof value === "number" ? value : Number(value);
              return name === "faturamento"
                ? [brl(num), "Faturamento"]
                : [num, "Pedidos"];
            }}
          />

          <Bar
            yAxisId="left"
            dataKey="faturamento"
            radius={[8, 8, 0, 0]}
            barSize={barSize}
            fill="url(#barFat)"
          >
            {data.map((d) => (
              <Cell
                key={d.dia}
                fill={d.faturamento === maxFat ? "#2563eb" : "url(#barFat)"}
              />
            ))}
            {!many && (
              <LabelList
                dataKey="faturamento"
                position="top"
                formatter={(v) => `R$ ${(Number(v) / 1000).toFixed(2).replace(".", ",")}k`}
                style={{ fill: "#475569", fontSize: 10, fontWeight: 600 }}
              />
            )}
          </Bar>

          <Line
            yAxisId="right"
            type="monotone"
            dataKey="pedidos"
            stroke="#2563eb"
            strokeWidth={2.5}
            dot={many ? false : { r: 4, fill: "#ffffff", stroke: "#2563eb", strokeWidth: 2 }}
            activeDot={{ r: 6 }}
          >
            {!many && (
              <LabelList
                dataKey="pedidos"
                position="top"
                style={{ fill: "#1e40af", fontSize: 11, fontWeight: 700 }}
              />
            )}
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
