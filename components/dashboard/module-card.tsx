import type { ReactNode } from "react";

type ModuleCardProps = {
  title: string;
  description: string;
  accent?: "gold" | "blue" | "red" | "purple" | "neutral";
  children?: ReactNode;
};

const accentMap = {
  gold: "border-[#fde68a] bg-[#fffbeb] text-[#b45309]",
  blue: "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]",
  red: "border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]",
  purple: "border-[#e9d5ff] bg-[#faf5ff] text-[#7c3aed]",
  neutral: "border-[#e8ecf4] bg-white text-[#0f172a]",
};

export function ModuleCard({
  title,
  description,
  accent = "neutral",
  children,
}: ModuleCardProps) {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] ${accentMap[accent]}`}
    >
      <p className="text-sm font-bold">{title}</p>

      <p className="mt-2 text-sm leading-6 text-[#64748b]">{description}</p>

      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
