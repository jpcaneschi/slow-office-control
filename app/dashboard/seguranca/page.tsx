export default function SegurancaPage() {
  const items = [
    {
      title: "Supabase com RLS",
      text: "Todas as tabelas que guardam dados sensíveis precisam ter Row Level Security ligado.",
      status: "Obrigatório",
    },
    {
      title: "Chave pública no frontend",
      text: "Use apenas publishable key/anon key no client. Nunca coloque service role no navegador.",
      status: "Obrigatório",
    },
    {
      title: "HTTPS no deploy",
      text: "O sistema deve rodar em produção com HTTPS e domínio seguro na Vercel.",
      status: "Obrigatório",
    },
    {
      title: "Backups e exportação",
      text: "A estrutura deve continuar pronta para backup, exportação CSV e relatórios no futuro.",
      status: "Planejado",
    },
  ];

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium text-blue-400">Produção e segurança</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-zinc-100">
          Segurança / LGPD
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
          Esta área reúne as regras que protegem o sistema antes do deploy final.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <article
            key={item.title}
            className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-black tracking-tight text-white">
                {item.title}
              </h2>
              <span className="rounded-full border border-[#d4a93a]/20 bg-[#d4a93a]/10 px-3 py-1 text-xs font-bold text-[#f3d37a]">
                {item.status}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-400">{item.text}</p>
          </article>
        ))}
      </div>

      <div className="rounded-[30px] border border-[#d4a93a]/20 bg-[#d4a93a]/[0.06] p-6">
        <h2 className="text-xl font-black tracking-tight text-white">
          Checklist rápido antes do deploy
        </h2>
        <ul className="mt-4 space-y-3 text-sm leading-6 text-zinc-300">
          <li>• Confirmar RLS em todas as tabelas expostas.</li>
          <li>• Confirmar que o frontend usa apenas chave pública.</li>
          <li>• Confirmar que nenhuma key secreta está no client.</li>
          <li>• Rodar `npm run build` antes de subir para a Vercel.</li>
          <li>• Revisar o sistema no celular antes de publicar.</li>
        </ul>
      </div>
    </section>
  );
}