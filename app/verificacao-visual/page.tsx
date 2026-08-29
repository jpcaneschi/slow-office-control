"use client";

import { useState } from "react";
import AdminPage from "@/app/admin/page";
import VendasPage from "@/app/dashboard/vendas/page";
import { AdminShell } from "@/components/admin/admin-shell";
import { DashboardHome } from "@/components/dashboard/dashboard-home";
import { PeriodProvider } from "@/components/dashboard/period-context";
import { RoleProvider } from "@/components/dashboard/role-context";

type Tela = "inicio" | "vendas" | "admin";

export default function VerificacaoVisualPage() {
  const [tela, setTela] = useState<Tela>("inicio");

  const seletor = (
    <div className="fixed bottom-2 right-2 z-[100] flex gap-1 rounded-xl bg-[#0f172a] p-1 shadow-xl">
      {(["inicio", "vendas", "admin"] as Tela[]).map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => setTela(item)}
          className={`rounded-lg px-3 py-2 text-xs font-bold ${
            tela === item ? "bg-white text-[#0f172a]" : "text-white"
          }`}
        >
          {item}
        </button>
      ))}
    </div>
  );

  if (tela === "admin") {
    return (
      <>
        <AdminShell>
          <AdminPage />
        </AdminShell>
        {seletor}
      </>
    );
  }

  return (
    <RoleProvider>
      <PeriodProvider>
        <main className="min-h-screen min-w-0 overflow-x-clip bg-[#f4f6fb] p-4 sm:p-8">
          <div className="mx-auto min-w-0 max-w-[1600px]">
            {tela === "inicio" ? <DashboardHome /> : <VendasPage />}
          </div>
        </main>
        {seletor}
      </PeriodProvider>
    </RoleProvider>
  );
}
