"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/clientes", label: "Clientes" },
  { href: "/dashboard/produtos", label: "Produtos" },
  { href: "/dashboard/vendas", label: "Vendas" },
  { href: "/dashboard/condicional", label: "Condicional" },
  { href: "/dashboard/promissorias", label: "Promissórias" },
  { href: "/dashboard/financeiro", label: "Financeiro" },
  { href: "/dashboard/tatuagem", label: "Tatuagem" },
  { href: "/dashboard/relatorios", label: "Relatórios" },
  { href: "/dashboard/configuracoes", label: "Configurações" },
];

const mobileNavItems = [
  { href: "/dashboard", label: "Início" },
  { href: "/dashboard/clientes", label: "Clientes" },
  { href: "/dashboard/produtos", label: "Produtos" },
  { href: "/dashboard/vendas", label: "Vendas" },
  { href: "/dashboard/configuracoes", label: "Ajustes" },
];

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === href;
    }

    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-[#05070a] text-white">
      <div className="flex min-h-screen">
        <aside className="hidden w-[290px] shrink-0 border-r border-white/10 bg-[#0b0e13] xl:flex xl:flex-col">
          <div className="border-b border-white/10 px-6 py-6">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.38em] text-[#d4a93a]">
              Slow Office Control
            </p>

            <h1 className="mt-3 text-[30px] font-black tracking-tight text-white">
              Slow Office
            </h1>

            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Sistema interno premium para gestão da loja, clientes, vendas,
              estoque e operação diária.
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-5">
            <nav className="space-y-2">
              {navItems.map((item) => {
                const active = isActive(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`group flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-bold transition ${
                      active
                        ? "bg-[#121722] text-white shadow-[inset_0_0_0_1px_rgba(212,169,58,0.18)]"
                        : "text-zinc-400 hover:bg-white/[0.04] hover:text-white"
                    }`}
                  >
                    <span>{item.label}</span>

                    <span
                      className={`h-2.5 w-2.5 rounded-full transition ${
                        active
                          ? "bg-[#d4a93a]"
                          : "bg-transparent group-hover:bg-white/20"
                      }`}
                    />
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="border-t border-white/10 p-4">
            <div className="rounded-[26px] border border-[#d4a93a]/15 bg-[#11151c] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.28em] text-[#d4a93a]">
                Status do sistema
              </p>

              <p className="mt-3 text-lg font-black text-white">
                Painel ativo
              </p>

              <p className="mt-1 text-sm leading-6 text-zinc-400">
                Base pronta para clientes, estoque, vendas, promissórias,
                financeiro e próximos módulos.
              </p>

              <div className="mt-4 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <span className="text-sm font-semibold text-zinc-300">
                  Operando normalmente
                </span>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-white/10 bg-[#05070a]/88 backdrop-blur-xl">
            <div className="flex flex-col gap-4 px-4 py-4 md:px-6 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.3em] text-zinc-500">
                  Painel interno
                </p>

                <h2 className="mt-1 text-[28px] font-black tracking-tight text-white">
                  Slow Office Dashboard
                </h2>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap xl:items-center">
                <div className="rounded-2xl border border-white/10 bg-[#0f141b] px-4 py-3 text-sm font-semibold text-zinc-300">
                  Hoje
                </div>

                <button className="rounded-2xl border border-white/10 bg-[#0f141b] px-4 py-3 text-sm font-bold text-zinc-200 transition hover:bg-[#151b24]">
                  Exportar
                </button>

                <button className="rounded-2xl border border-[#d4a93a]/20 bg-[#d4a93a]/10 px-4 py-3 text-sm font-black text-[#f3d37a] transition hover:bg-[#d4a93a]/20">
                  Nova venda
                </button>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 md:px-6">
            <div className="mx-auto max-w-7xl">{children}</div>
          </main>

          <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0a0d12]/95 px-3 py-3 backdrop-blur xl:hidden">
            <div className="grid grid-cols-5 gap-2">
              {mobileNavItems.map((item) => {
                const active = isActive(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-2xl px-3 py-2 text-center text-[11px] font-black transition ${
                      active
                        ? "bg-[#d4a93a]/15 text-[#f3d37a]"
                        : "text-zinc-400 hover:bg-white/[0.04] hover:text-white"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
}