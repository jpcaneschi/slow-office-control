type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export function PageHeader({ eyebrow, title, description }: PageHeaderProps) {
  return (
    <div>
      <p className="text-[11px] font-extrabold uppercase tracking-[0.28em] text-[#2563eb]">
        {eyebrow}
      </p>

      <h1 className="mt-2 text-3xl font-black tracking-tight text-[#0f172a]">
        {title}
      </h1>

      <p className="mt-2 max-w-3xl text-sm leading-7 text-[#64748b]">
        {description}
      </p>
    </div>
  );
}
