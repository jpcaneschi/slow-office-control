"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  Building2,
  CreditCard,
  History,
  LogOut,
  MailPlus,
  Menu,
  ShieldCheck,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

const links = [
  { href: "#visao-geral", label: "Visão geral", icon: Activity },
  { href: "#clientes", label: "Clientes e acessos", icon: Building2 },
  { href: "#mensalidades", label: "Mensalidades", icon: CreditCard },
  { href: "#convites", label: "Adicionar acesso", icon: MailPlus },
  { href: "#historico", label: "Histórico", icon: History },
];

function AdminNavigation({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="mt-8 space-y-1 px-3">
      {links.map((item) => {
        const Icon = item.icon;
        return (
          <a
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <Icon className="h-[18px] w-[18px]" />
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email || ""));
  }, []);

  async function signOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-[#f4f6fb] text-[#0f172a]">
      <div className="flex min-h-screen">
        <aside className="hidden w-[270px] shrink-0 flex-col bg-[#07152f] lg:flex">
          <div className="border-b border-white/10 px-6 py-7">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#2563eb] text-white shadow-lg shadow-blue-950/30">
                <ShieldCheck className="h-6 w-6" />
              </span>
              <div>
                <p className="text-xl font-black tracking-tight text-white">Nexo Admin</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#60a5fa]">
                  Plataforma
                </p>
              </div>
            </div>
          </div>
          <AdminNavigation />
          <div className="mt-auto border-t border-white/10 p-4">
            <p className="truncate px-2 text-xs text-white/50">{email}</p>
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" />
              {signingOut ? "Saindo…" : "Sair"}
            </button>
          </div>
        </aside>

        {menuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
            <button
              type="button"
              aria-label="Fechar menu administrativo"
              className="absolute inset-0 bg-black/45"
              onClick={() => setMenuOpen(false)}
            />
            <aside className="relative flex h-full w-[280px] flex-col bg-[#07152f] shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-5">
                <div className="flex items-center gap-2.5 text-white">
                  <ShieldCheck className="h-6 w-6 text-[#60a5fa]" />
                  <span className="font-black">Nexo Admin</span>
                </div>
                <button
                  type="button"
                  aria-label="Fechar menu"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg p-2 text-white/70 hover:bg-white/10"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <AdminNavigation onNavigate={() => setMenuOpen(false)} />
            </aside>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-[#e5eaf2] bg-white/90 backdrop-blur-xl">
            <div className="flex h-[76px] items-center gap-3 px-4 sm:px-6 lg:px-8">
              <button
                type="button"
                aria-label="Abrir menu administrativo"
                onClick={() => setMenuOpen(true)}
                className="rounded-xl p-2 text-[#334155] hover:bg-[#f4f6fb] lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div>
                <p className="font-black tracking-tight text-[#0f172a] sm:text-lg">
                  Central da plataforma
                </p>
                <p className="hidden text-xs text-[#64748b] sm:block">
                  Acessos, planos e cobrança dos clientes Nexo
                </p>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <span className="hidden max-w-56 truncate text-xs font-semibold text-[#64748b] md:block">
                  {email}
                </span>
                <Link
                  href="/"
                  className="rounded-xl border border-[#dbe4f0] bg-white px-3 py-2 text-xs font-bold text-[#334155] transition hover:bg-[#f8fafc]"
                >
                  Ver site
                </Link>
              </div>
            </div>
          </header>

          <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <div className="mx-auto max-w-[1500px]">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
