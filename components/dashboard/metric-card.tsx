import { ArrowUpRight, type LucideIcon } from "lucide-react";

type MetricCardProps = {
  icon: LucideIcon;
  /** cor de destaque em hex, ex: "#2563eb" */
  tint: string;
  title: string;
  value: string;
  delta: string;
  deltaLabel: string;
  spark: number[];
};

/** Mini gráfico (sparkline) desenhado como SVG, sem dependências. */
function Sparkline({ points, color }: { points: number[]; color: string }) {
  const w = 100;
  const h = 30;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / range) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="h-8 w-full"
    >
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function MetricCard({
  icon: Icon,
  tint,
  title,
  value,
  delta,
  deltaLabel,
  spark,
}: MetricCardProps) {
  return (
    <div className="rounded-2xl border border-[#e8ecf4] bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
      <div className="flex items-start gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${tint}1a`, color: tint }}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[#64748b]">{title}</p>
          <p className="mt-1 text-2xl font-black tracking-tight text-[#0f172a]">
            {value}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-xs">
        <span className="inline-flex items-center gap-0.5 font-bold text-[#16a34a]">
          <ArrowUpRight className="h-3.5 w-3.5" />
          {delta}
        </span>
        <span className="text-[#94a3b8]">{deltaLabel}</span>
      </div>

      <div className="mt-2">
        <Sparkline points={spark} color={tint} />
      </div>
    </div>
  );
}
