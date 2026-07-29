type ModuleEmptyStateProps = {
  title: string;
  description: string;
  nextStep: string;
};

export function ModuleEmptyState({
  title,
  description,
  nextStep,
}: ModuleEmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-[#cbd5e1] bg-white p-6 md:p-8">
      <div className="max-w-2xl">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.3em] text-[#94a3b8]">
          Estrutura preparada
        </p>

        <h2 className="mt-3 text-2xl font-black tracking-tight text-[#0f172a]">
          {title}
        </h2>

        <p className="mt-3 text-sm leading-7 text-[#64748b]">{description}</p>

        <div className="mt-5 rounded-xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-4">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#2563eb]">
            Próximo passo
          </p>
          <p className="mt-2 text-sm leading-6 text-[#475569]">{nextStep}</p>
        </div>
      </div>
    </div>
  );
}
