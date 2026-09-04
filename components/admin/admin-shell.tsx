"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { NexoLogo } from "@/components/brand/nexo-logo";
import { DashboardPreferenceControls } from "@/components/dashboard/dashboard-preferences";

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
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
    <div className="min-h-screen min-w-0 bg-[#f4f6fb] text-[#0f172a]">
      <header className="sticky top-0 z-30 border-b border-[#dfe6f1] bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[1600px] items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Link href="/admin" className="flex min-w-0 items-center gap-3">
            <span className="nexo-logo-surface inline-flex shrink-0 rounded-xl bg-white px-2 py-1">
              <NexoLogo priority className="h-8 w-auto" />
            </span>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.15em] text-[#2563eb]">
                  Admin
                </span>
              </div>
              <p className="hidden text-xs text-[#64748b] sm:block">
                Administração da plataforma
              </p>
            </div>
          </Link>

          <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
            <DashboardPreferenceControls />
            <span className="hidden max-w-56 truncate text-xs font-semibold text-[#64748b] md:block">
              {email}
            </span>
            <Link
              href="/"
              className="rounded-xl border border-[#dbe4f0] bg-white px-3 py-2 text-xs font-bold text-[#334155] transition hover:bg-[#f8fafc]"
            >
              Ver site
            </Link>
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              aria-label="Sair da administração"
              className="inline-flex items-center gap-2 rounded-xl border border-[#dbe4f0] bg-white p-2 text-xs font-bold text-[#475569] transition hover:border-[#fecaca] hover:bg-[#fef2f2] hover:text-[#b91c1c] disabled:opacity-50 sm:px-3"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">{signingOut ? "Saindo…" : "Sair"}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="min-w-0 overflow-x-clip px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="mx-auto min-w-0 max-w-[1500px]">{children}</div>
      </main>
    </div>
  );
}
