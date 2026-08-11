"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  Users,
  Package,
  ShoppingCart,
  ClipboardList,
  FileText,
  CircleDollarSign,
  PenTool,
  BarChart3,
  CalendarDays,
  Settings,
  UserCog,
  Sparkles,
  CreditCard,
  ShieldCheck,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import { PeriodProvider } from "@/components/dashboard/period-context";
import { PeriodFilter } from "@/components/dashboard/period-filter";
import { NotificationsBell } from "@/components/dashboard/notifications-bell";
import { UserMenu } from "@/components/dashboard/user-menu";
import { AuthGuard } from "@/components/dashboard/auth-guard";
import { GlobalSearch } from "@/components/dashboard/global-search";
import { RoleProvider, usePapel } from "@/components/dashboard/role-context";
import { RouteGuard } from "@/components/dashboard/route-guard";
import { podeAcessar } from "@/lib/permissoes";
import { rotaBloqueadaPorModulo } from "@/lib/modulos";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const navGroups: { titulo?: string; itens: NavItem[] }[] = [
  {
    itens: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    titulo: "Operação",
    itens: [
      { href: "/dashboard/vendas", label: "Vendas", icon: ShoppingCart },
      { href: "/dashboard/condicional", label: "Condicional", icon: ClipboardList },
      { href: "/dashboard/promissorias", label: "Promissórias", icon: FileText },
    ],
  },
  {
    titulo: "Cadastros",
    itens: [
      { href: "/dashboard/clientes", label: "Clientes", icon: Users },
      { href: "/dashboard/produtos", label: "Produtos", icon: Package },
    ],
  },
  {
    titulo: "Gestão",
    itens: [
      { href: "/dashboard/financeiro", label: "Financeiro", icon: CircleDollarSign },
      { href: "/dashboard/funcionarios", label: "Funcionários", icon: UserCog },
      { href: "/dashboard/agenda", label: "Agenda", icon: CalendarDays },
      { href: "/dashboard/tatuagem", label: "Tatuagem", icon: PenTool },
      { href: "/dashboard/servicos", label: "Serviços", icon: Sparkles },
      { href: "/dashboard/relatorios", label: "Relatórios", icon: BarChart3 },
    ],
  },
  {
    titulo: "Sistema",
    itens: [
      { href: "/dashboard/assinatura", label: "Assinatura", icon: CreditCard },
      { href: "/dashboard/auditoria", label: "Auditoria", icon: ShieldCheck },
      { href: "/dashboard/configuracoes", label: "Configurações", icon: Settings },
    ],
  },
];

const navItems: NavItem[] = navGroups.flatMap((g) => g.itens);

const mobileNavItems: NavItem[] = [
  { href: "/dashboard", label: "Início", icon: LayoutDashboard },
  { href: "/dashboard/clientes", label: "Clientes", icon: Users },
  { href: "/dashboard/produtos", label: "Produtos", icon: Package },
  { href: "/dashboard/vendas", label: "Vendas", icon: ShoppingCart },
  { href: "/dashboard/configuracoes", label: "Ajustes", icon: Settings },
];

function NavSections({
  isActive,
  onNavigate,
}: {
  isActive: (href: string) => boolean;
  onNavigate?: () => void;
}) {
  const { papel, modulos } = usePapel();
  const gruposVisiveis = navGroups
    .map((grupo) => ({
      ...grupo,
      itens: grupo.itens.filter(
        (item) =>
          podeAcessar(papel, item.href) &&
          !rotaBloqueadaPorModulo(item.href, modulos)
      ),
    }))
    .filter((grupo) => grupo.itens.length > 0);

  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-4 pb-8">
      {gruposVisiveis.map((grupo, i) => (
        <div key={i} className="space-y-1">
          {grupo.titulo && (
            <p className="px-4 pb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-white/45">
              {grupo.titulo}
            </p>
          )}
          {grupo.itens.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={`flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
                  active
                    ? "bg-white text-[#2563eb] shadow-[0_8px_18px_rgba(0,0,0,0.18)]"
                    : "text-white/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function MobileBottomNav({
  isActive,
}: {
  isActive: (href: string) => boolean;
}) {
  const { papel, modulos } = usePapel();
  const itens = mobileNavItems.filter(
    (item) =>
      podeAcessar(papel, item.href) &&
      !rotaBloqueadaPorModulo(item.href, modulos)
  );
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e8ecf4] bg-white/95 px-2 py-2 backdrop-blur xl:hidden">
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${itens.length}, minmax(0, 1fr))` }}
      >
        {itens.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-[11px] font-semibold transition ${
                active
                  ? "bg-[#2563eb]/10 text-[#2563eb]"
                  : "text-[#64748b] hover:bg-[#f4f6fb]"
              }`}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href);

  const currentLabel =
    navItems.find((item) => isActive(item.href))?.label ??
    (pathname.startsWith("/dashboard/tarefas-alertas")
      ? "Tarefas e alertas"
      : "Dashboard");

  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileNavOpen(false);
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, []);

  return (
    <AuthGuard>
    <RoleProvider>
    <PeriodProvider>
    <div className="min-h-screen bg-[#f4f6fb] text-[#0f172a]">
      <div className="flex min-h-screen">
        {/* ─── Menu lateral (azul) ─────────────────────────────────────── */}
        <aside className="relative hidden w-[260px] shrink-0 overflow-hidden bg-gradient-to-b from-[#1e40af] to-[#2563eb] xl:flex xl:flex-col">
          {/* Logo */}
          <div className="px-6 pt-7 pb-6">
            <p className="text-[30px] font-black leading-none tracking-tight text-white">
              Nexo
            </p>
            <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.42em] text-white/70">
              Gestão
            </p>
          </div>

          {/* Navegação */}
          <NavSections isActive={isActive} />

          {/* Ondinha decorativa no rodapé */}
          <svg
            className="pointer-events-none absolute inset-x-0 bottom-0 h-32 w-full text-white/10"
            viewBox="0 0 400 120"
            fill="none"
            preserveAspectRatio="none"
          >
            <path
              d="M0 60 Q 100 20 200 60 T 400 60 V120 H0 Z"
              fill="currentColor"
            />
            <path
              d="M0 80 Q 100 45 200 80 T 400 80 V120 H0 Z"
              fill="currentColor"
            />
          </svg>
        </aside>

        {/* ─── Menu lateral mobile (gaveta) ────────────────────────────── */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 xl:hidden" role="dialog" aria-modal="true">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setMobileNavOpen(false)}
            />
            <aside className="absolute left-0 top-0 flex h-full w-[264px] flex-col overflow-y-auto bg-gradient-to-b from-[#1e40af] to-[#2563eb]">
              <div className="flex items-start justify-between px-6 pt-6 pb-5">
                <div>
                  <p className="text-[30px] font-black leading-none tracking-tight text-white">
                    Nexo
                  </p>
                  <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.42em] text-white/70">
                    Gestão
                  </p>
                </div>
                <button
                  onClick={() => setMobileNavOpen(false)}
                  aria-label="Fechar menu"
                  className="rounded-lg p-1.5 text-white/80 transition hover:bg-white/10"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <NavSections
                isActive={isActive}
                onNavigate={() => setMobileNavOpen(false)}
              />
            </aside>
          </div>
        )}

        {/* ─── Coluna principal ────────────────────────────────────────── */}
        <div className="flex min-h-screen flex-1 flex-col">
          {/* Cabeçalho */}
          <header className="sticky top-0 z-30 border-b border-[#e8ecf4] bg-white/85 backdrop-blur-xl">
            <div className="flex flex-wrap items-center gap-4 px-4 py-4 md:px-8">
              <button
                onClick={() => setMobileNavOpen(true)}
                aria-label="Abrir menu"
                className="-ml-1 rounded-lg p-1.5 text-[#334155] transition hover:bg-[#f4f6fb] xl:hidden"
              >
                <Menu className="h-6 w-6" />
              </button>
              <h1 className="text-2xl font-black tracking-tight text-[#0f172a]">
                {currentLabel}
              </h1>

              {/* Busca global */}
              <GlobalSearch />

              <div className="ml-auto flex items-center gap-3">
                {/* Seletor de período global */}
                <div className="hidden sm:block">
                  <PeriodFilter />
                </div>

                {/* Notificações */}
                <NotificationsBell />

                {/* Perfil */}
                <UserMenu />
              </div>
            </div>
          </header>

          {/* Conteúdo */}
          <main className="flex-1 px-4 py-6 pb-24 md:px-8 xl:pb-6">
            <div className="mx-auto max-w-[1400px]">
              <RouteGuard>{children}</RouteGuard>
            </div>
          </main>

          {/* Navegação inferior (mobile) */}
          <MobileBottomNav isActive={isActive} />
        </div>
      </div>
    </div>
    </PeriodProvider>
    </RoleProvider>
    </AuthGuard>
  );
}
