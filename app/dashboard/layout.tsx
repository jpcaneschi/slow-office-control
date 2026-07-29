"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
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
  ShieldCheck,
  Settings,
  Search,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { PeriodProvider } from "@/components/dashboard/period-context";
import { PeriodFilter } from "@/components/dashboard/period-filter";
import { NotificationsBell } from "@/components/dashboard/notifications-bell";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/clientes", label: "Clientes", icon: Users },
  { href: "/dashboard/produtos", label: "Produtos", icon: Package },
  { href: "/dashboard/vendas", label: "Vendas", icon: ShoppingCart },
  { href: "/dashboard/condicional", label: "Condicional", icon: ClipboardList },
  { href: "/dashboard/promissorias", label: "Promissórias", icon: FileText },
  { href: "/dashboard/financeiro", label: "Financeiro", icon: CircleDollarSign },
  { href: "/dashboard/tatuagem", label: "Tatuagem", icon: PenTool },
  { href: "/dashboard/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/dashboard/seguranca", label: "Segurança", icon: ShieldCheck },
  { href: "/dashboard/configuracoes", label: "Configurações", icon: Settings },
];

const mobileNavItems: NavItem[] = [
  { href: "/dashboard", label: "Início", icon: LayoutDashboard },
  { href: "/dashboard/clientes", label: "Clientes", icon: Users },
  { href: "/dashboard/produtos", label: "Produtos", icon: Package },
  { href: "/dashboard/vendas", label: "Vendas", icon: ShoppingCart },
  { href: "/dashboard/configuracoes", label: "Ajustes", icon: Settings },
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href);

  const currentLabel =
    navItems.find((item) => isActive(item.href))?.label ?? "Dashboard";

  return (
    <PeriodProvider>
    <div className="min-h-screen bg-[#f4f6fb] text-[#0f172a]">
      <div className="flex min-h-screen">
        {/* ─── Menu lateral (azul) ─────────────────────────────────────── */}
        <aside className="relative hidden w-[260px] shrink-0 overflow-hidden bg-gradient-to-b from-[#1e40af] to-[#2563eb] xl:flex xl:flex-col">
          {/* Logo */}
          <div className="px-6 pt-7 pb-6">
            <p className="text-[22px] font-black leading-[1.05] tracking-tight text-white">
              SLOW
              <br />
              OFFICE
            </p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.42em] text-white/70">
              Control
            </p>
          </div>

          {/* Navegação */}
          <nav className="flex-1 space-y-1.5 overflow-y-auto px-4 pb-8">
            {navItems.map((item) => {
              const active = isActive(item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                    active
                      ? "bg-white text-[#2563eb] shadow-sm"
                      : "text-white/80 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

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

        {/* ─── Coluna principal ────────────────────────────────────────── */}
        <div className="flex min-h-screen flex-1 flex-col">
          {/* Cabeçalho */}
          <header className="sticky top-0 z-30 border-b border-[#e8ecf4] bg-white/85 backdrop-blur-xl">
            <div className="flex flex-wrap items-center gap-4 px-4 py-4 md:px-8">
              <h1 className="text-2xl font-black tracking-tight text-[#0f172a]">
                {currentLabel}
              </h1>

              {/* Barra de busca */}
              <div className="order-last flex w-full items-center gap-2 rounded-xl border border-[#e8ecf4] bg-[#f4f6fb] px-4 py-2.5 md:order-none md:w-auto md:min-w-[320px] md:flex-1 md:max-w-md">
                <Search className="h-4 w-4 shrink-0 text-[#94a3b8]" />
                <input
                  type="text"
                  placeholder="Buscar clientes, produtos, pedidos, notas..."
                  className="w-full bg-transparent text-sm text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none"
                />
              </div>

              <div className="ml-auto flex items-center gap-3">
                {/* Seletor de período global */}
                <div className="hidden sm:block">
                  <PeriodFilter />
                </div>

                {/* Notificações */}
                <NotificationsBell />

                {/* Perfil */}
                <button className="flex items-center gap-2.5 rounded-xl border border-[#e8ecf4] bg-white py-1.5 pl-1.5 pr-3 transition hover:bg-[#f4f6fb]">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#1e40af] to-[#2563eb] text-sm font-bold text-white">
                    RO
                  </span>
                  <span className="hidden text-left leading-tight sm:block">
                    <span className="block text-sm font-bold text-[#0f172a]">
                      Rafael Oliveira
                    </span>
                    <span className="block text-xs text-[#64748b]">
                      Gerente Geral
                    </span>
                  </span>
                  <ChevronDown className="hidden h-4 w-4 text-[#94a3b8] sm:block" />
                </button>
              </div>
            </div>
          </header>

          {/* Conteúdo */}
          <main className="flex-1 px-4 py-6 pb-24 md:px-8 xl:pb-6">
            <div className="mx-auto max-w-[1400px]">{children}</div>
          </main>

          {/* Navegação inferior (mobile) */}
          <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e8ecf4] bg-white/95 px-2 py-2 backdrop-blur xl:hidden">
            <div className="grid grid-cols-5 gap-1">
              {mobileNavItems.map((item) => {
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
        </div>
      </div>
    </div>
    </PeriodProvider>
  );
}
