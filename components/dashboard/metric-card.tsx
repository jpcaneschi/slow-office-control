import Link from "next/link";
import { ArrowUpRight, ArrowDownRight, ChevronRight, type LucideIcon } from "lucide-react";

type MetricCardProps = {
  icon: LucideIcon;
  /** cor de destaque em hex, ex: "#2563eb" */
  tint: string;
  title: string;
  value: string;
  /** variação percentual (opcional), ex: "12,4%". Positivo = verde, negativo = vermelho. */
  delta?: number;
  deltaLabel?: string;
  /** série para o mini-gráfico (opcional) */
  spark?: number[];
  /** se informado, o card inteiro vira um link para esta rota */
  href?: string;
  /** texto de acessibilidade do link */
  ariaLabel?: string;
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
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-8 w-full">
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
  href,
  ariaLabel,
}: MetricCardProps) {
  const inner = (
    <>
      <div className="flex items-start gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
          style={{ backgroundColor: `${tint}1a`, color: tint }}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[#64748b]">{title}</p>
          <p className="mt-1 text-2xl font-black tracking-tight text-[#0f172a]">
            {value}
          </p>
        </div>
        {href && (
          <ChevronRight className="h-4 w-4 shrink-0 text-[#cbd5e1] transition group-hover:text-[#2563eb]" />
        )}
      </div>

      {typeof delta === "number" && (
        <div className="mt-3 flex items-center gap-1.5 text-xs">
          <span
            className={`inline-flex items-center gap-0.5 font-bold ${
              delta >= 0 ? "text-[#16a34a]" : "text-[#dc2626]"
            }`}
          >
            {delta >= 0 ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" />
            )}
            {Math.abs(delta).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
          </span>
          {deltaLabel && <span className="text-[#94a3b8]">{deltaLabel}</span>}
        </div>
      )}

      {spark && spark.length > 1 && (
        <div className="mt-2">
          <Sparkline points={spark} color={tint} />
        </div>
      )}
    </>
  );

  const baseClass =
    "block rounded-3xl border border-[#eef2f7] bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.05)]";

  if (href) {
    return (
      <Link
        href={href}
        aria-label={ariaLabel ?? title}
        className={`group ${baseClass} cursor-pointer transition hover:-translate-y-0.5 hover:border-[#c7d7fb] hover:shadow-[0_8px_24px_rgba(37,99,235,0.10)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2`}
      >
        {inner}
      </Link>
    );
  }

  return <div className={baseClass}>{inner}</div>;
}
