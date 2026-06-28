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
    <div className="rounded-[30px] border border-dashed border-white/10 bg-white/[0.03] p-6 md:p-8">
      <div className="max-w-2xl">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.3em] text-zinc-500">
          Estrutura preparada
        </p>

        <h2 className="mt-3 text-2xl font-black tracking-tight text-white">
          {title}
        </h2>

        <p className="mt-3 text-sm leading-7 text-zinc-400">
          {description}
        </p>

        <div className="mt-5 rounded-2xl border border-white/10 bg-[#0f141b] px-4 py-4">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#d4a93a]">
            Próximo passo
          </p>
          <p className="mt-2 text-sm leading-6 text-zinc-300">{nextStep}</p>
        </div>
      </div>
    </div>
  );
}