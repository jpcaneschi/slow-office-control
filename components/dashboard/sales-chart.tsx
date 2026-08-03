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

// Gera uma escala "redonda" (0, passo, 2·passo…) que se ajusta ao maior valor,
// em vez de um teto fixo. Ex.: max ~600 → passo 200; max ~80k → passo 20k.
function escalaBonita(max: number, permitir25 = true) {
  if (!Number.isFinite(max) || max <= 0) {
    return { max: 100, ticks: [0, 25, 50, 75, 100] };
  }
  const bruto = max / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(bruto)));
  const norm = bruto / mag;
  let passo: number;
  if (norm <= 1) passo = 1;
  else if (norm <= 2) passo = 2;
  else if (permitir25 && norm <= 2.5) passo = 2.5;
  else if (norm <= 5) passo = 5;
  else passo = 10;
  passo *= mag;
  const topo = Math.ceil(max / passo) * passo;
  const ticks: number[] = [];
  for (let v = 0; v <= topo + passo / 1000; v += passo) {
    ticks.push(Math.round(v * 100) / 100);
  }
  return { max: topo, ticks };
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { payload: SalesPoint }[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  const ticket = d.pedidos > 0 ? d.faturamento / d.pedidos : 0;
  return (
    <div className="rounded-xl border border-[#e8ecf4] bg-white px-3 py-2 shadow-[0_12px_30px_rgba(15,23,42,0.12)]">
      <p className="text-xs font-bold text-[#0f172a]">{label}</p>
      <p className="mt-1 text-xs text-[#64748b]">
        Faturamento:{" "}
        <span className="font-semibold text-[#0f172a]">{brl(d.faturamento)}</span>
      </p>
      <p className="text-xs text-[#64748b]">
        Pedidos: <span className="font-semibold text-[#0f172a]">{d.pedidos}</span>
      </p>
      <p className="text-xs text-[#64748b]">
        Ticket médio:{" "}
        <span className="font-semibold text-[#0f172a]">{brl(ticket)}</span>
      </p>
    </div>
  );
}

export function SalesChart({ data }: { data: SalesPoint[] }) {
  const maxFat = data.length ? Math.max(...data.map((d) => d.faturamento)) : 0;
  const maxPed = data.length ? Math.max(...data.map((d) => d.pedidos)) : 0;
  const escalaFat = escalaBonita(maxFat);
  const escalaPed = escalaBonita(maxPed, false);
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
            tickFormatter={(v: number) =>
              v === 0
                ? "R$ 0"
                : v >= 1000
                ? `R$ ${(v / 1000).toLocaleString("pt-BR")}k`
                : `R$ ${v.toLocaleString("pt-BR")}`
            }
            domain={[0, escalaFat.max]}
            ticks={escalaFat.ticks}
          />

          {/* Eixo direito — pedidos */}
          <YAxis
            yAxisId="right"
            orientation="right"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#94a3b8", fontSize: 11 }}
            domain={[0, escalaPed.max]}
            ticks={escalaPed.ticks}
            allowDecimals={false}
          />

          <Tooltip
            cursor={{ fill: "rgba(37,99,235,0.05)" }}
            content={<CustomTooltip />}
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
