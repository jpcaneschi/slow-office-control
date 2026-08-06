import Link from "next/link";
import { ScrollReveal } from "@/components/landing/scroll-reveal";
import {
  ShoppingCart,
  Package,
  Users,
  CircleDollarSign,
  ClipboardList,
  CalendarDays,
  FileText,
  PenTool,
  ShieldCheck,
  Smartphone,
  ArrowRight,
  Check,
  X,
  Star,
  ChevronDown,
} from "lucide-react";

const recursos = [
  {
    icon: ShoppingCart,
    cor: "#2563eb",
    titulo: "Vendas",
    texto: "Registre vendas rápido, com desconto no Pix e parcelamento, e veja o caixa crescer em tempo real.",
  },
  {
    icon: Package,
    cor: "#7c3aed",
    titulo: "Produtos & Estoque",
    texto: "Catálogo completo com foto, custo e preço. O estoque baixa sozinho e avisa quando algo está acabando.",
  },
  {
    icon: Users,
    cor: "#db2777",
    titulo: "Clientes",
    texto: "Cadastro de clientes com histórico, aniversários e status — pra você atender melhor e vender mais.",
  },
  {
    icon: CircleDollarSign,
    cor: "#059669",
    titulo: "Financeiro",
    texto: "Receitas, despesas, contas fixas do mês e resultado. Saiba exatamente quanto entra e quanto sai.",
  },
  {
    icon: ClipboardList,
    cor: "#ea580c",
    titulo: "Condicional & Promissórias",
    texto: "Controle peças em condicional e vendas a prazo, com prazos e documentos organizados.",
  },
  {
    icon: CalendarDays,
    cor: "#0891b2",
    titulo: "Agenda & Lembretes",
    texto: "Calendário com vencimentos, aniversários e feriados — nada mais passa despercebido.",
  },
  {
    icon: FileText,
    cor: "#4f46e5",
    titulo: "Relatórios em PDF",
    texto: "Promissória, vale, folha e recibos prontos pra imprimir, com visual limpo em preto e branco.",
  },
  {
    icon: PenTool,
    cor: "#c026d3",
    titulo: "Área de serviços",
    texto: "Módulos extras como tatuagem, com repasse automático e integração direta com o financeiro.",
  },
];

const passos = [
  {
    n: "1",
    titulo: "Cadastre sua loja",
    texto: "Coloque seus produtos, preços e clientes — ou importe de onde você já vende.",
  },
  {
    n: "2",
    titulo: "Registre o dia a dia",
    texto: "Vendas, entradas e saídas de estoque, condicionais e promissórias, tudo em segundos.",
  },
  {
    n: "3",
    titulo: "Acompanhe tudo",
    texto: "Dashboard com faturamento, estoque e agenda, do computador ou do celular.",
  },
  {
    n: "4",
    titulo: "Gere documentos",
    texto: "Relatórios e recibos em PDF profissionais, prontos pra entregar ou imprimir.",
  },
];

const destaques = [
  {
    icon: ShieldCheck,
    titulo: "Seus dados, protegidos",
    texto: "Cada loja tem seu espaço isolado e seguro. Ninguém acessa o que é seu.",
  },
  {
    icon: Smartphone,
    titulo: "Funciona no celular",
    texto: "Painel responsivo — gerencie a loja de qualquer lugar, a qualquer hora.",
  },
  {
    icon: CircleDollarSign,
    titulo: "Visão de dono",
    texto: "Números claros do seu negócio pra decidir com segurança, sem achismo.",
  },
];

const depoimentos = [
  {
    nome: "Rafael Souza",
    papel: "Loja de streetwear",
    foto: "/depo-1.png",
    texto:
      "Antes eu vivia perdido em planilha. Agora vejo o estoque e o caixa em segundos — mudou minha rotina.",
  },
  {
    nome: "Camila Nunes",
    papel: "Boutique feminina",
    foto: "/depo-2.png",
    texto:
      "As promissórias e o condicional ficaram organizados de vez. Gerar os PDFs pra cliente é um clique.",
  },
  {
    nome: "Sérgio Almeida",
    papel: "Loja de calçados",
    foto: "/depo-3.png",
    texto:
      "Simples até pra mim, que não sou muito de tecnologia. Uso do balcão e do celular sem complicação.",
  },
];

const planos = [
  {
    nome: "Essencial",
    preco: "49",
    desc: "Pra começar a organizar a loja.",
    destaque: false,
    itens: [
      "Produtos e estoque",
      "Clientes e vendas",
      "Relatórios em PDF",
      "Acesso pelo celular",
    ],
  },
  {
    nome: "Profissional",
    preco: "89",
    desc: "O mais escolhido pelas lojas.",
    destaque: true,
    itens: [
      "Tudo do Essencial",
      "Financeiro completo",
      "Condicional e promissórias",
      "Agenda e lembretes",
      "Contas recorrentes",
    ],
  },
  {
    nome: "Avançado",
    preco: "149",
    desc: "Pra quem quer o máximo.",
    destaque: false,
    itens: [
      "Tudo do Profissional",
      "Área de serviços (tatuagem)",
      "Vários usuários",
      "Suporte prioritário",
    ],
  },
];

const faqs = [
  {
    q: "Preciso instalar alguma coisa?",
    a: "Não. O Nexo funciona direto no navegador, no computador ou no celular. É só entrar e usar.",
  },
  {
    q: "Meus dados ficam seguros?",
    a: "Sim. Cada loja tem seu espaço isolado, com acesso protegido por login. Ninguém vê os dados da sua loja além de você.",
  },
  {
    q: "Serve para qualquer tipo de loja?",
    a: "Sim. O Nexo foi feito pro comércio físico em geral — roupas, calçados, acessórios e serviços.",
  },
  {
    q: "Dá pra importar meus produtos?",
    a: "Dá. É possível importar seu catálogo, inclusive com as fotos, pra você não começar do zero.",
  },
  {
    q: "Consigo usar no celular?",
    a: "Consegue. O painel é responsivo e funciona bem no celular, pra você gerenciar de qualquer lugar.",
  },
  {
    q: "Como começo a usar?",
    a: "É só clicar em Entrar e acessar sua conta. Se ainda não tem acesso, fale com a gente que ajudamos você a começar.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-[#0f172a]">
      <ScrollReveal />
      {/* ─── Navegação ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-[#eef2f7] bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black tracking-tight text-[#1e40af]">
              Nexo
            </span>
            <span className="hidden text-[10px] font-bold uppercase tracking-[0.3em] text-[#94a3b8] sm:inline">
              Gestão
            </span>
          </div>
          <nav className="hidden items-center gap-8 text-sm font-semibold text-[#475569] md:flex">
            <a href="#recursos" className="transition hover:text-[#2563eb]">
              Recursos
            </a>
            <a href="#como-funciona" className="transition hover:text-[#2563eb]">
              Como funciona
            </a>
            <a href="#planos" className="transition hover:text-[#2563eb]">
              Planos
            </a>
            <a href="#contato" className="transition hover:text-[#2563eb]">
              Contato
            </a>
          </nav>
          <Link
            href="/login"
            className="rounded-full bg-[#2563eb] px-5 py-2.5 text-sm font-bold text-white shadow-[0_6px_18px_rgba(37,99,235,0.25)] transition hover:bg-[#1d4ed8]"
          >
            Entrar
          </Link>
        </div>
      </header>

      {/* ─── Hero ──────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#eff6ff] to-white" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#3b82f6]/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 top-40 h-64 w-64 rounded-full bg-[#7c3aed]/10 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 md:py-24 lg:grid-cols-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#2563eb]">
              Gestão para o comércio físico
            </p>
            <h1 className="mt-4 text-4xl font-black leading-[1.1] tracking-tight text-[#0f172a] md:text-5xl">
              Toda a sua loja em{" "}
              <span className="text-[#2563eb]">um só lugar</span>.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-[#475569]">
              O Nexo reúne vendas, estoque, clientes, financeiro e agenda num
              painel simples e seguro — feito para lojas de verdade, no lugar de
              planilhas soltas e cadernos.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-full bg-[#2563eb] px-6 py-3.5 text-sm font-bold text-white shadow-[0_10px_26px_rgba(37,99,235,0.30)] transition hover:bg-[#1d4ed8]"
              >
                Entrar no sistema <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#recursos"
                className="inline-flex items-center gap-2 rounded-full border border-[#e2e8f0] bg-white px-6 py-3.5 text-sm font-bold text-[#334155] transition hover:bg-[#f8fafc]"
              >
                Ver recursos
              </a>
            </div>
            <div className="mt-6 flex flex-wrap gap-2.5">
              {[
                { icon: Check, t: "Simples de usar" },
                { icon: Smartphone, t: "Acesso pelo celular" },
                { icon: ShieldCheck, t: "Dados protegidos" },
              ].map((c) => {
                const Ic = c.icon;
                return (
                  <span
                    key={c.t}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#e2e8f0] bg-white/70 px-3 py-1.5 text-xs font-semibold text-[#475569] backdrop-blur"
                  >
                    <Ic className="h-3.5 w-3.5 text-[#2563eb]" />
                    {c.t}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Foto (gerada) + cards flutuantes do painel */}
          <div className="relative mx-auto w-full max-w-md pb-6">
            <div className="overflow-hidden rounded-[28px] border-4 border-white bg-white shadow-[0_30px_60px_rgba(15,23,42,0.18)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/hero-pessoas.png"
                alt="Empreendedores de diferentes idades usando o Nexo"
                width={1024}
                height={1024}
                className="w-full"
              />
            </div>

            {/* Card flutuante: mini painel */}
            <div className="absolute -bottom-5 -left-4 w-44 rounded-2xl border border-[#eef2f7] bg-white/95 p-3 shadow-[0_16px_40px_rgba(15,23,42,0.18)] backdrop-blur">
              <p className="text-[10px] font-semibold text-[#94a3b8]">
                Vendas hoje
              </p>
              <p className="text-xl font-black text-[#2563eb]">R$ 1.240</p>
              <div className="mt-2 flex h-8 items-end gap-1">
                {[40, 70, 55, 85, 60, 95].map((h, i) => (
                  <div
                    key={i}
                    className="w-full rounded-t bg-gradient-to-t from-[#93c5fd] to-[#2563eb]"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            </div>

            {/* Badge flutuante: estoque */}
            <div className="absolute -right-3 top-6 rounded-2xl border border-[#eef2f7] bg-white/95 px-3 py-2 shadow-[0_16px_40px_rgba(15,23,42,0.16)] backdrop-blur">
              <p className="text-[10px] font-semibold text-[#94a3b8]">Estoque</p>
              <p className="text-sm font-black text-[#059669]">155 itens ✓</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Sobre ─────────────────────────────────────────────────── */}
      <section className="reveal mx-auto max-w-4xl px-5 py-16 text-center">
        <h2 className="text-2xl font-black tracking-tight text-[#0f172a] md:text-3xl">
          O que é o Nexo?
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-[#475569]">
          O Nexo é um sistema de gestão pensado para o comércio físico — lojas de
          roupa, calçados, acessórios e serviços. Em vez de informação espalhada
          em papéis e planilhas, você tem tudo organizado, integrado e seguro,
          acessível de qualquer lugar.
        </p>
      </section>

      {/* ─── Sem vs Com o Nexo ─────────────────────────────────────── */}
      <section className="bg-[#f8fafc] py-16">
        <div className="mx-auto max-w-5xl px-5">
          <h2 className="text-center text-2xl font-black tracking-tight text-[#0f172a] md:text-3xl">
            Do caos à clareza
          </h2>
          <div className="reveal mt-10 grid gap-6 md:grid-cols-2">
            <div className="rounded-3xl border border-[#fecaca] bg-white p-7">
              <p className="text-sm font-bold uppercase tracking-wide text-[#dc2626]">
                Sem o Nexo
              </p>
              <ul className="mt-5 space-y-3">
                {[
                  "Planilhas soltas e cadernos de anotação",
                  "Estoque no chute, sem saber o que tem",
                  "Promissória e vale em papel que some",
                  "Nenhuma visão real do caixa",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-3 text-[#475569]">
                    <X className="mt-0.5 h-5 w-5 shrink-0 text-[#f87171]" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-3xl border border-[#bbf7d0] bg-white p-7 shadow-[0_10px_30px_rgba(16,185,129,0.08)]">
              <p className="text-sm font-bold uppercase tracking-wide text-[#15803d]">
                Com o Nexo
              </p>
              <ul className="mt-5 space-y-3">
                {[
                  "Vendas, estoque e clientes integrados",
                  "Estoque em tempo real, com alertas",
                  "Documentos em PDF, sempre à mão",
                  "Dashboard financeiro com visão de dono",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-3 text-[#334155]">
                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-[#16a34a]" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Recursos ──────────────────────────────────────────────── */}
      <section id="recursos" className="mx-auto max-w-6xl px-5 py-20">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#2563eb]">
            Recursos
          </p>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-[#0f172a] md:text-3xl">
            Tudo que a sua loja precisa
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[#64748b]">
            Um sistema completo, sem precisar de dez ferramentas diferentes.
          </p>
        </div>
        <div className="reveal mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {recursos.map((r) => {
            const Icon = r.icon;
            return (
              <div
                key={r.titulo}
                className="rounded-3xl border border-[#eef2f7] bg-white p-6 shadow-[0_2px_12px_rgba(15,23,42,0.05)] transition hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(37,99,235,0.10)]"
              >
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: `${r.cor}1a`, color: r.cor }}
                >
                  <Icon className="h-6 w-6" />
                </span>
                <h3 className="mt-4 text-lg font-black text-[#0f172a]">
                  {r.titulo}
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#64748b]">{r.texto}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── Como funciona ─────────────────────────────────────────── */}
      <section id="como-funciona" className="bg-gradient-to-b from-[#1e40af] to-[#2563eb] py-20 text-white">
        <div className="mx-auto max-w-6xl px-5">
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-white/70">
              Como funciona
            </p>
            <h2 className="mt-3 text-2xl font-black tracking-tight md:text-3xl">
              Começar é simples
            </h2>
          </div>
          <div className="reveal mt-12 grid gap-6 md:grid-cols-4">
            {passos.map((p) => (
              <div
                key={p.n}
                className="rounded-3xl border border-white/15 bg-white/10 p-6 backdrop-blur"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-lg font-black text-[#2563eb]">
                  {p.n}
                </span>
                <h3 className="mt-4 text-lg font-black">{p.titulo}</h3>
                <p className="mt-2 text-sm leading-6 text-white/80">{p.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Destaques ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="reveal grid gap-6 md:grid-cols-3">
          {destaques.map((d) => {
            const Icon = d.icon;
            return (
              <div key={d.titulo} className="text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#2563eb]/10 text-[#2563eb]">
                  <Icon className="h-7 w-7" />
                </span>
                <h3 className="mt-4 text-lg font-black text-[#0f172a]">
                  {d.titulo}
                </h3>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-[#64748b]">
                  {d.texto}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── Depoimentos ───────────────────────────────────────────── */}
      <section className="bg-[#f8fafc] py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="reveal text-center">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#2563eb]">
              Depoimentos
            </p>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-[#0f172a] md:text-3xl">
              Quem usa, recomenda
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-[#64748b]">
              Lojistas que trocaram a papelada pela organização do Nexo.
            </p>
          </div>
          <div className="reveal mt-12 grid gap-6 md:grid-cols-3">
            {depoimentos.map((d) => (
              <div
                key={d.nome}
                className="rounded-3xl border border-[#eef2f7] bg-white p-6 shadow-[0_2px_12px_rgba(15,23,42,0.05)]"
              >
                <div className="flex items-center gap-0.5 text-[#f59e0b]">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Star key={i} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <p className="mt-4 leading-7 text-[#475569]">
                  &ldquo;{d.texto}&rdquo;
                </p>
                <div className="mt-5 flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={d.foto}
                    alt={d.nome}
                    width={44}
                    height={44}
                    className="h-11 w-11 rounded-full object-cover"
                  />
                  <div>
                    <p className="text-sm font-black text-[#0f172a]">{d.nome}</p>
                    <p className="text-xs text-[#64748b]">{d.papel}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Planos ────────────────────────────────────────────────── */}
      <section id="planos" className="bg-[#f8fafc] py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="reveal text-center">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#2563eb]">
              Planos
            </p>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-[#0f172a] md:text-3xl">
              Escolha o plano da sua loja
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-[#64748b]">
              Preços simples, sem surpresa. Cancele quando quiser.
            </p>
          </div>
          <div className="reveal mt-12 grid items-start gap-6 md:grid-cols-3">
            {planos.map((p) => (
              <div
                key={p.nome}
                className={`rounded-3xl border bg-white p-7 ${
                  p.destaque
                    ? "border-[#2563eb] shadow-[0_20px_50px_rgba(37,99,235,0.16)] ring-1 ring-[#2563eb]/20 md:-mt-2"
                    : "border-[#eef2f7] shadow-[0_2px_12px_rgba(15,23,42,0.05)]"
                }`}
              >
                {p.destaque && (
                  <span className="mb-3 inline-block rounded-full bg-[#2563eb] px-3 py-1 text-xs font-bold text-white">
                    Mais popular
                  </span>
                )}
                <h3 className="text-xl font-black text-[#0f172a]">{p.nome}</h3>
                <p className="mt-1 text-sm text-[#64748b]">{p.desc}</p>
                <p className="mt-5">
                  <span className="text-4xl font-black text-[#0f172a]">
                    R$ {p.preco}
                  </span>
                  <span className="text-sm text-[#94a3b8]">/mês</span>
                </p>
                <ul className="mt-6 space-y-2.5">
                  {p.itens.map((it) => (
                    <li
                      key={it}
                      className="flex items-start gap-2 text-sm text-[#475569]"
                    >
                      <Check className="mt-0.5 h-5 w-5 shrink-0 text-[#16a34a]" />
                      {it}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/login"
                  className={`mt-7 block rounded-full px-5 py-3 text-center text-sm font-bold transition ${
                    p.destaque
                      ? "bg-[#2563eb] text-white shadow-[0_10px_26px_rgba(37,99,235,0.30)] hover:bg-[#1d4ed8]"
                      : "border border-[#e2e8f0] text-[#334155] hover:bg-[#f8fafc]"
                  }`}
                >
                  Começar
                </Link>
              </div>
            ))}
          </div>
          <p className="reveal mt-6 text-center text-xs text-[#94a3b8]">
            * Valores ilustrativos — ajuste conforme o seu modelo de cobrança.
          </p>
        </div>
      </section>

      {/* ─── FAQ ───────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-5 py-20">
        <div className="reveal text-center">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#2563eb]">
            Dúvidas
          </p>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-[#0f172a] md:text-3xl">
            Perguntas frequentes
          </h2>
        </div>
        <div className="reveal mt-10 space-y-3">
          {faqs.map((f) => (
            <details
              key={f.q}
              className="group rounded-2xl border border-[#eef2f7] bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.04)]"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold text-[#0f172a] [&::-webkit-details-marker]:hidden">
                {f.q}
                <ChevronDown className="h-5 w-5 shrink-0 text-[#94a3b8] transition group-open:rotate-180" />
              </summary>
              <p className="mt-3 leading-7 text-[#64748b]">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ─── CTA final ─────────────────────────────────────────────── */}
      <section id="contato" className="px-5 pb-20">
        <div className="reveal mx-auto max-w-4xl rounded-[32px] bg-gradient-to-br from-[#1e40af] to-[#2563eb] px-8 py-14 text-center text-white shadow-[0_30px_60px_rgba(37,99,235,0.25)]">
          <h2 className="text-2xl font-black tracking-tight md:text-3xl">
            Pronto para organizar sua loja?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-white/85">
            Entre no Nexo e tenha o controle do seu negócio na palma da mão.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-bold text-[#2563eb] transition hover:bg-[#f0f4ff]"
            >
              Entrar agora <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="mailto:contato@nexo.com.br"
              className="inline-flex items-center gap-2 rounded-full border border-white/30 px-7 py-3.5 text-sm font-bold text-white transition hover:bg-white/10"
            >
              Falar com a gente
            </a>
          </div>
        </div>
      </section>

      {/* ─── Rodapé ────────────────────────────────────────────────── */}
      <footer className="border-t border-[#eef2f7] bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="text-xl font-black tracking-tight text-[#1e40af]">
              Nexo
            </span>
            <span className="text-xs text-[#94a3b8]">
              Gestão para o comércio físico
            </span>
          </div>
          <p className="text-sm text-[#94a3b8]">
            © {new Date().getFullYear()} Nexo. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
