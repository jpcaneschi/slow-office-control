import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  FileCheck2,
  FileText,
  LockKeyhole,
  MessageCircle,
  PackageCheck,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Store,
  TrendingUp,
  UserCheck,
  Users,
  WalletCards,
} from "lucide-react";

const WHATSAPP = (process.env.NEXT_PUBLIC_WHATSAPP || "").replace(/\D/g, "");
const CONTATO_EMAIL = process.env.NEXT_PUBLIC_CONTATO_EMAIL || "";

const contatoHref = WHATSAPP
  ? `https://wa.me/${WHATSAPP}?text=Ol%C3%A1!%20Quero%20conhecer%20o%20Nexo.`
  : CONTATO_EMAIL
    ? `mailto:${CONTATO_EMAIL}?subject=Quero%20conhecer%20o%20Nexo`
    : "/login?novo=1";

const modulos = [
  {
    icon: ShoppingCart,
    titulo: "Vendas e caixa",
    texto: "Pix, dinheiro, cartão, promissória e pagamento misto com estoque integrado.",
    cor: "bg-[#eaf1ff] text-[#2563eb]",
  },
  {
    icon: Boxes,
    titulo: "Produtos e estoque",
    texto: "Grade por cor e tamanho, custos, preços e alertas de estoque baixo.",
    cor: "bg-[#f3e8ff] text-[#7c3aed]",
  },
  {
    icon: Users,
    titulo: "Clientes",
    texto: "Histórico de compras, aniversários, contatos e relacionamento em um só lugar.",
    cor: "bg-[#fce7f3] text-[#db2777]",
  },
  {
    icon: CircleDollarSign,
    titulo: "Financeiro",
    texto: "Entradas, despesas, contas recorrentes, taxas e visão clara do resultado.",
    cor: "bg-[#dcfce7] text-[#059669]",
  },
  {
    icon: ClipboardCheck,
    titulo: "Condicional",
    texto: "Peças fora da loja, prazos, devoluções e conversão em venda sem improviso.",
    cor: "bg-[#ffedd5] text-[#ea580c]",
  },
  {
    icon: FileText,
    titulo: "Promissórias e PDFs",
    texto: "Parcelas, recebimentos e documentos organizados, prontos para imprimir.",
    cor: "bg-[#e0e7ff] text-[#4f46e5]",
  },
  {
    icon: CalendarDays,
    titulo: "Agenda e alertas",
    texto: "Vencimentos, tarefas, aniversários e compromissos que não passam batido.",
    cor: "bg-[#cffafe] text-[#0891b2]",
  },
  {
    icon: ShieldCheck,
    titulo: "Equipe e auditoria",
    texto: "Permissões por função e histórico das ações sensíveis realizadas no sistema.",
    cor: "bg-[#f1f5f9] text-[#334155]",
  },
];

const faqs = [
  {
    q: "O Nexo funciona no celular?",
    a: "Sim. O painel é responsivo e pode ser usado no computador, tablet ou celular, direto pelo navegador.",
  },
  {
    q: "Uma loja consegue ver os dados de outra?",
    a: "Não. Cada empresa opera em um espaço isolado no banco, com controle de acesso por usuário e função.",
  },
  {
    q: "Como uma nova loja recebe acesso?",
    a: "A loja envia uma solicitação e a equipe Nexo analisa o cadastro. O acesso não é liberado automaticamente.",
  },
  {
    q: "Consigo gerar documentos?",
    a: "Sim. O sistema possui relatórios e documentos em PDF para rotinas como promissórias, vales e recibos.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#f7f9fc] text-[#0b1426]">
      <header className="sticky top-0 z-50 border-b border-[#dfe7f2] bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#155eef] text-white shadow-[0_8px_20px_rgba(21,94,239,0.25)]">
              <Store className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-xl font-black leading-none tracking-tight">Nexo</span>
              <span className="mt-1 block text-[9px] font-extrabold uppercase tracking-[0.32em] text-[#7b8aa3]">
                Gestão
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-bold text-[#4b5b73] lg:flex">
            <a href="#produto" className="transition hover:text-[#155eef]">Produto</a>
            <a href="#recursos" className="transition hover:text-[#155eef]">Recursos</a>
            <a href="#seguranca" className="transition hover:text-[#155eef]">Segurança</a>
            <a href="#duvidas" className="transition hover:text-[#155eef]">Dúvidas</a>
          </nav>

          <div className="flex items-center gap-2.5">
            <Link
              href="/login"
              className="rounded-xl px-3 py-2 text-sm font-extrabold text-[#34425a] transition hover:bg-[#f1f5fb]"
            >
              Entrar
            </Link>
            <a
              href={contatoHref}
              className="hidden items-center gap-2 rounded-xl bg-[#155eef] px-4 py-2.5 text-sm font-extrabold text-white shadow-[0_10px_24px_rgba(21,94,239,0.25)] transition hover:bg-[#0f4ed4] sm:inline-flex"
            >
              Falar com a gente <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-[#dfe7f2] bg-[#07152f] text-white">
          <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.06)_1px,transparent_1px)] [background-size:52px_52px]" />
          <div className="pointer-events-none absolute -left-40 top-12 h-96 w-96 rounded-full bg-[#155eef]/35 blur-3xl" />
          <div className="pointer-events-none absolute -right-32 bottom-0 h-80 w-80 rounded-full bg-[#06b6d4]/20 blur-3xl" />

          <div className="relative mx-auto grid max-w-7xl gap-14 px-5 py-16 lg:grid-cols-[0.88fr_1.12fr] lg:items-center lg:px-8 lg:py-24">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-xs font-bold text-[#bcd0ff]">
                <Sparkles className="h-3.5 w-3.5" /> Gestão completa para lojas físicas
              </div>
              <h1 className="mt-6 max-w-2xl text-4xl font-black leading-[1.06] tracking-[-0.04em] sm:text-5xl xl:text-6xl">
                Sua operação inteira, clara e sob controle.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-[#b8c5da] sm:text-lg sm:leading-8">
                Vendas, estoque, clientes e financeiro trabalhando juntos para você enxergar a loja como ela realmente está.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href={contatoHref}
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3.5 text-sm font-black text-[#0f4ed4] transition hover:bg-[#edf3ff]"
                >
                  Conhecer o Nexo <ArrowRight className="h-4 w-4" />
                </a>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-5 py-3.5 text-sm font-black text-white transition hover:bg-white/10"
                >
                  Já sou cliente
                </Link>
              </div>

              <div className="mt-8 grid max-w-lg gap-3 text-sm text-[#d5deed] sm:grid-cols-2">
                {[
                  "Acesso por aprovação",
                  "Dados isolados por loja",
                  "Permissões por funcionário",
                  "Documentos em PDF",
                ].map((item) => (
                  <span key={item} className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#22c55e]/15 text-[#6ee7a8]">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <ProductDashboardPreview />
          </div>
        </section>

        <section className="border-b border-[#dfe7f2] bg-white">
          <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-y divide-[#e5ebf4] px-5 lg:grid-cols-4 lg:divide-y-0 lg:px-8">
            {[
              { icon: ShoppingBag, titulo: "Operação integrada", texto: "Do balcão ao financeiro" },
              { icon: Smartphone, titulo: "Acesso responsivo", texto: "Computador e celular" },
              { icon: FileCheck2, titulo: "Documentos prontos", texto: "PDFs para o dia a dia" },
              { icon: LockKeyhole, titulo: "Ambiente protegido", texto: "RLS e perfis de acesso" },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.titulo} className="flex min-h-32 items-center gap-3 px-4 py-6 lg:px-7">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#eef4ff] text-[#155eef]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block text-sm font-black text-[#14213a]">{item.titulo}</span>
                    <span className="mt-1 block text-xs leading-5 text-[#718096]">{item.texto}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section id="produto" className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
          <div className="grid gap-12 lg:grid-cols-[0.78fr_1.22fr] lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#155eef]">Visão de dono</p>
              <h2 className="mt-4 text-3xl font-black leading-tight tracking-[-0.03em] text-[#101c32] sm:text-4xl">
                Abra o painel e saiba o que precisa de atenção.
              </h2>
              <p className="mt-5 text-base leading-7 text-[#607089]">
                O Nexo transforma o movimento da loja em indicadores fáceis de entender. Menos procura por informação, mais decisão com contexto.
              </p>
              <div className="mt-7 space-y-4">
                {[
                  { icon: TrendingUp, t: "Faturamento e resultado do período" },
                  { icon: PackageCheck, t: "Estoque crítico e produtos mais vendidos" },
                  { icon: WalletCards, t: "Contas, promissórias e despesas próximas" },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.t} className="flex items-center gap-3 rounded-2xl border border-[#e3eaf4] bg-white p-4 shadow-[0_8px_24px_rgba(15,34,67,0.04)]">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eef4ff] text-[#155eef]">
                        <Icon className="h-5 w-5" />
                      </span>
                      <p className="text-sm font-extrabold text-[#34425a]">{item.t}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <OperationsBoard />
          </div>
        </section>

        <section id="recursos" className="border-y border-[#dfe7f2] bg-white py-20 lg:py-28">
          <div className="mx-auto max-w-7xl px-5 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#155eef]">Uma plataforma, várias rotinas</p>
              <h2 className="mt-4 text-3xl font-black tracking-[-0.03em] text-[#101c32] sm:text-4xl">
                Tudo conversa. Nada fica solto.
              </h2>
              <p className="mt-4 leading-7 text-[#607089]">
                Cada módulo foi pensado para refletir o trabalho real de uma loja, sem transformar tarefas simples em burocracia.
              </p>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {modulos.map((modulo) => {
                const Icon = modulo.icon;
                return (
                  <article key={modulo.titulo} className="group rounded-[24px] border border-[#e3eaf4] bg-[#fbfcfe] p-5 transition hover:-translate-y-1 hover:border-[#b9cdf7] hover:bg-white hover:shadow-[0_18px_42px_rgba(15,34,67,0.08)]">
                    <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${modulo.cor}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-5 text-base font-black text-[#14213a]">{modulo.titulo}</h3>
                    <p className="mt-2 text-sm leading-6 text-[#718096]">{modulo.texto}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="seguranca" className="bg-[#08172f] py-20 text-white lg:py-28">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 lg:grid-cols-2 lg:items-center lg:px-8">
            <SecurityDiagram />
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#8fb2ff]">Multiempresa com isolamento</p>
              <h2 className="mt-4 text-3xl font-black leading-tight tracking-[-0.03em] sm:text-4xl">
                Cada loja no seu espaço. Cada pessoa no seu papel.
              </h2>
              <p className="mt-5 max-w-xl leading-7 text-[#b8c5da]">
                O acesso aos dados é filtrado no banco e na aplicação. Uma empresa não recebe autorização para consultar registros de outra.
              </p>
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {[
                  { icon: Store, t: "Dados separados por empresa" },
                  { icon: UserCheck, t: "Dono, gerente, caixa e financeiro" },
                  { icon: ShieldCheck, t: "Políticas RLS no banco" },
                  { icon: ClipboardCheck, t: "Auditoria de ações sensíveis" },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.t} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <Icon className="h-5 w-5 shrink-0 text-[#78a3ff]" />
                      <p className="text-sm font-bold text-[#e3eaf6]">{item.t}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-20 lg:px-8 lg:py-28">
          <div className="grid overflow-hidden rounded-[32px] border border-[#dfe7f2] bg-white shadow-[0_24px_60px_rgba(15,34,67,0.08)] lg:grid-cols-2">
            <div className="p-7 sm:p-10 lg:p-12">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eef4ff] text-[#155eef]">
                <ReceiptText className="h-6 w-6" />
              </span>
              <h2 className="mt-6 text-3xl font-black tracking-[-0.03em] text-[#101c32]">Documentos que saem prontos.</h2>
              <p className="mt-4 max-w-lg leading-7 text-[#607089]">
                Gere PDFs limpos para as rotinas que precisam ir para o papel ou ser compartilhadas com o cliente.
              </p>
              <div className="mt-7 flex flex-wrap gap-2">
                {["Promissória", "Vale", "Recibo", "Relatório"].map((item) => (
                  <span key={item} className="rounded-full border border-[#dbe4f0] bg-[#f8fafe] px-3 py-1.5 text-xs font-extrabold text-[#53627a]">
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <PdfPreview />
          </div>
        </section>

        <section id="duvidas" className="border-y border-[#dfe7f2] bg-white py-20">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 lg:grid-cols-[0.7fr_1.3fr] lg:px-8">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#155eef]">Perguntas frequentes</p>
              <h2 className="mt-4 text-3xl font-black tracking-[-0.03em] text-[#101c32]">Antes de começar</h2>
              <p className="mt-4 leading-7 text-[#607089]">Ficou com outra dúvida? Fale diretamente com a equipe Nexo.</p>
            </div>
            <div className="space-y-3">
              {faqs.map((faq) => (
                <details key={faq.q} className="group rounded-2xl border border-[#e3eaf4] bg-[#fbfcfe] p-5 open:bg-white open:shadow-[0_12px_28px_rgba(15,34,67,0.06)]">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-black text-[#263650] [&::-webkit-details-marker]:hidden">
                    {faq.q}
                    <ChevronDown className="h-5 w-5 shrink-0 text-[#718096] transition group-open:rotate-180" />
                  </summary>
                  <p className="mt-3 pr-8 text-sm leading-6 text-[#607089]">{faq.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section id="contato" className="px-5 py-20 lg:px-8 lg:py-24">
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[34px] bg-[#155eef] px-6 py-14 text-center text-white shadow-[0_28px_70px_rgba(21,94,239,0.28)] sm:px-12">
            <div className="pointer-events-none absolute -left-16 -top-20 h-64 w-64 rounded-full border-[44px] border-white/10" />
            <div className="pointer-events-none absolute -bottom-24 -right-12 h-64 w-64 rounded-full bg-[#06b6d4]/25 blur-2xl" />
            <div className="relative">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#c8d9ff]">Pronto para organizar a operação?</p>
              <h2 className="mx-auto mt-4 max-w-3xl text-3xl font-black tracking-[-0.03em] sm:text-4xl">
                Veja como o Nexo se encaixa na rotina da sua loja.
              </h2>
              <p className="mx-auto mt-4 max-w-xl leading-7 text-[#e2eaff]">
                O acesso é analisado individualmente para manter a plataforma organizada e segura.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <a href={contatoHref} className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-black text-[#0f4ed4] transition hover:bg-[#edf3ff]">
                  <MessageCircle className="h-4 w-4" /> Falar com a equipe
                </a>
                <Link href="/login" className="rounded-xl border border-white/25 px-6 py-3.5 text-sm font-black text-white transition hover:bg-white/10">
                  Entrar no sistema
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#dfe7f2] bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-8 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <div className="flex items-center gap-2 text-[#14213a]">
            <Store className="h-5 w-5 text-[#155eef]" />
            <span className="font-black">Nexo Gestão</span>
          </div>
          <p className="text-xs text-[#7b8aa3]">© {new Date().getFullYear()} Nexo. Gestão para o comércio físico.</p>
        </div>
      </footer>
    </div>
  );
}

function ProductDashboardPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[720px]">
      <div className="overflow-hidden rounded-[24px] border border-white/15 bg-[#f5f7fb] shadow-[0_34px_90px_rgba(0,0,0,0.42)]">
        <div className="flex h-10 items-center gap-1.5 border-b border-[#dce4ef] bg-white px-4">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff6b6b]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#ffd166]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#4fd1a1]" />
          <span className="ml-4 h-4 w-40 rounded-full bg-[#edf1f7]" />
        </div>
        <div className="flex min-h-[390px]">
          <aside className="hidden w-40 shrink-0 bg-[#123f9a] p-4 sm:block">
            <p className="text-lg font-black">Nexo</p>
            <div className="mt-7 space-y-2">
              {["Visão geral", "Vendas", "Produtos", "Clientes", "Financeiro"].map((item, index) => (
                <div key={item} className={`rounded-lg px-2.5 py-2 text-[10px] font-bold ${index === 0 ? "bg-white text-[#155eef]" : "text-white/65"}`}>
                  {item}
                </div>
              ))}
            </div>
          </aside>
          <div className="min-w-0 flex-1 p-4 text-[#14213a] sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-[#8190a7]">Bom dia, Slow Office</p>
                <p className="mt-0.5 text-base font-black">Visão geral</p>
              </div>
              <span className="rounded-lg border border-[#dfe6f0] bg-white px-2.5 py-1.5 text-[9px] font-bold text-[#53627a]">Este mês</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              {[
                { l: "Faturamento", v: "R$ 18.450", c: "text-[#155eef]" },
                { l: "Vendas", v: "127", c: "text-[#7c3aed]" },
                { l: "Ticket médio", v: "R$ 145", c: "text-[#059669]" },
                { l: "Estoque baixo", v: "8 itens", c: "text-[#dc2626]" },
              ].map((card) => (
                <div key={card.l} className="rounded-xl border border-[#e2e8f1] bg-white p-3">
                  <p className="text-[8px] font-bold text-[#8a98ad]">{card.l}</p>
                  <p className={`mt-1 text-sm font-black ${card.c}`}>{card.v}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-[1.45fr_.85fr]">
              <div className="rounded-xl border border-[#e2e8f1] bg-white p-3.5">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black">Vendas por dia</p>
                  <TrendingUp className="h-3.5 w-3.5 text-[#22c55e]" />
                </div>
                <div className="mt-5 flex h-24 items-end gap-2">
                  {[42, 64, 51, 78, 58, 88, 74, 96, 81, 100].map((height, index) => (
                    <div key={index} className="flex-1 rounded-t-sm bg-gradient-to-t from-[#9cbcff] to-[#155eef]" style={{ height: `${height}%` }} />
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-[7px] font-bold text-[#9aa7ba]"><span>01</span><span>05</span><span>10</span><span>15</span><span>20</span></div>
              </div>
              <div className="rounded-xl border border-[#e2e8f1] bg-white p-3.5">
                <p className="text-[10px] font-black">Estoque crítico</p>
                <div className="mt-3 space-y-3">
                  {[
                    ["Camiseta Basic", "2 un.", "bg-[#155eef]"],
                    ["Calça Wide", "1 un.", "bg-[#7c3aed]"],
                    ["Moletom Class", "3 un.", "bg-[#06b6d4]"],
                  ].map(([nome, qtd, cor]) => (
                    <div key={nome} className="flex items-center gap-2">
                      <span className={`h-7 w-7 rounded-lg ${cor}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[8px] font-bold">{nome}</span>
                        <span className="block text-[7px] text-[#9aa7ba]">{qtd}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-5 -left-3 rounded-2xl border border-[#dce5f2] bg-white px-4 py-3 text-[#14213a] shadow-[0_16px_40px_rgba(0,0,0,0.22)] sm:-left-8">
        <p className="text-[9px] font-bold text-[#8190a7]">Venda registrada</p>
        <p className="mt-1 text-sm font-black text-[#059669]">+ R$ 189,90</p>
      </div>
      <div className="absolute -right-3 -top-4 flex items-center gap-2 rounded-2xl border border-[#254e9d] bg-[#102f6c] px-4 py-3 shadow-xl sm:-right-6">
        <ShieldCheck className="h-5 w-5 text-[#78a3ff]" />
        <span className="text-[10px] font-black text-white">Dados protegidos</span>
      </div>
    </div>
  );
}

function OperationsBoard() {
  return (
    <div className="rounded-[30px] border border-[#dfe7f2] bg-[#edf3fb] p-4 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-[22px] bg-[#155eef] p-6 text-white sm:row-span-2">
          <BarChart3 className="h-7 w-7 text-[#bcd0ff]" />
          <p className="mt-10 text-xs font-bold text-[#c8d9ff]">Resultado estimado</p>
          <p className="mt-2 text-3xl font-black">R$ 8.720</p>
          <div className="mt-6 h-2 rounded-full bg-white/15"><div className="h-2 w-[72%] rounded-full bg-white" /></div>
          <p className="mt-2 text-[10px] text-[#c8d9ff]">72% da meta do mês</p>
        </div>
        <div className="rounded-[22px] border border-[#dfe7f2] bg-white p-5">
          <div className="flex items-center justify-between"><p className="text-xs font-black text-[#14213a]">Contas da semana</p><WalletCards className="h-5 w-5 text-[#ea580c]" /></div>
          <p className="mt-5 text-2xl font-black text-[#14213a]">R$ 2.480</p>
          <p className="mt-1 text-xs text-[#8190a7]">4 vencimentos próximos</p>
        </div>
        <div className="rounded-[22px] border border-[#dfe7f2] bg-white p-5">
          <div className="flex items-center justify-between"><p className="text-xs font-black text-[#14213a]">Tarefas hoje</p><CalendarDays className="h-5 w-5 text-[#7c3aed]" /></div>
          <div className="mt-4 space-y-2">
            {["Conferir estoque", "Cobrar promissória"].map((item, index) => (
              <div key={item} className="flex items-center gap-2 text-[11px] font-bold text-[#53627a]"><span className={`h-2 w-2 rounded-full ${index ? "bg-[#f59e0b]" : "bg-[#22c55e]"}`} />{item}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SecurityDiagram() {
  return (
    <div className="rounded-[30px] border border-white/10 bg-white/5 p-6 sm:p-8">
      <div className="mx-auto flex max-w-md flex-col items-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-[24px] border border-[#6f99ef]/40 bg-[#155eef] shadow-[0_18px_50px_rgba(21,94,239,0.35)]">
          <LockKeyhole className="h-9 w-9" />
        </div>
        <div className="h-10 w-px bg-gradient-to-b from-[#6f99ef] to-white/15" />
        <div className="w-full rounded-2xl border border-white/10 bg-[#10284f] p-4 text-center">
          <p className="text-xs font-black text-[#dbe6fb]">Camada de autorização</p>
          <p className="mt-1 text-[10px] text-[#8fa3c2]">Sessão + empresa + papel + módulo</p>
        </div>
        <div className="grid h-10 w-2/3 grid-cols-3"><span className="border-r border-white/15" /><span className="border-x border-white/15" /><span className="border-l border-white/15" /></div>
        <div className="grid w-full grid-cols-3 gap-3">
          {["Loja A", "Loja B", "Loja C"].map((loja, index) => (
            <div key={loja} className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
              <Store className={`mx-auto h-5 w-5 ${index === 0 ? "text-[#78a3ff]" : index === 1 ? "text-[#67e8f9]" : "text-[#c4b5fd]"}`} />
              <p className="mt-2 text-[10px] font-black">{loja}</p>
              <p className="mt-1 text-[8px] text-[#7f93b3]">dados isolados</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PdfPreview() {
  return (
    <div className="flex min-h-[360px] items-center justify-center bg-[#edf3fb] p-8">
      <div className="w-full max-w-[330px] rotate-[-2deg] rounded-md border border-[#cad4e2] bg-white p-6 shadow-[0_20px_50px_rgba(15,34,67,0.16)]">
        <div className="flex items-start justify-between border-b-2 border-[#14213a] pb-4">
          <div><p className="text-lg font-black text-[#14213a]">NEXO</p><p className="text-[8px] font-bold tracking-[0.2em] text-[#718096]">DOCUMENTO</p></div>
          <FileText className="h-6 w-6 text-[#14213a]" />
        </div>
        <p className="mt-5 text-xs font-black text-[#14213a]">RECIBO DE PAGAMENTO</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {["Cliente", "Data", "Referência", "Valor"].map((item) => (
            <div key={item} className="rounded border border-[#d9e0ea] p-2"><p className="text-[7px] font-bold uppercase text-[#8a98ad]">{item}</p><div className="mt-2 h-1.5 rounded bg-[#dfe5ed]" /></div>
          ))}
        </div>
        <div className="mt-4 space-y-2">{[100, 82, 94].map((width) => <div key={width} className="h-1.5 rounded bg-[#e5eaf1]" style={{ width: `${width}%` }} />)}</div>
        <div className="mt-8 flex justify-between gap-5"><div className="flex-1 border-t border-[#94a3b8] pt-1 text-center text-[7px] text-[#718096]">Responsável</div><div className="flex-1 border-t border-[#94a3b8] pt-1 text-center text-[7px] text-[#718096]">Cliente</div></div>
      </div>
    </div>
  );
}
