import type { ReactNode } from "react";

type ModuleCardProps = {
  title: string;
  description: string;
  accent?: "gold" | "blue" | "red" | "purple" | "neutral";
  children?: ReactNode;
};

const accentMap = {
  gold: "border-[#d4a93a]/20 bg-[#d4a93a]/[0.06] text-[#f3d37a]",
  blue: "border-[#7da2ff]/20 bg-[#7da2ff]/[0.06] text-[#9bb7ff]",
  red: "border-red-500/20 bg-red-500/[0.06] text-red-300",
  purple: "border-purple-500/20 bg-purple-500/[0.06] text-purple-300",
  neutral: "border-white/10 bg-[#0f141b] text-white",
};

export function ModuleCard({
  title,
  description,
  accent = "neutral",
  children,
}: ModuleCardProps) {
  return (
    <div
      className={`rounded-[28px] border p-5 shadow-[0_10px_30px_rgba(0,0,0,0.18)] ${accentMap[accent]}`}
    >
      <p className="text-sm font-bold">{title}</p>

      <p className="mt-2 text-sm leading-6 text-zinc-300">{description}</p>

      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}