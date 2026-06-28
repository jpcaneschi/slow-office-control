type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export function PageHeader({
  eyebrow,
  title,
  description,
}: PageHeaderProps) {
  return (
    <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-6 md:p-7">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.32em] text-[#7da2ff]">
        {eyebrow}
      </p>

      <h1 className="mt-3 text-[30px] font-black tracking-tight text-white md:text-[36px]">
        {title}
      </h1>

      <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-400 md:text-[15px]">
        {description}
      </p>
    </div>
  );
}