"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  assinaturaPermiteAcesso,
  type AssinaturaAcesso,
} from "@/lib/assinaturas-utils";

export function SubscriptionGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [estado, setEstado] = useState<"checando" | "liberado" | "bloqueado">(
    "checando"
  );

  useEffect(() => {
    let ativo = true;
    supabase
      .from("subscriptions")
      .select("status, provider, current_period_end")
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!ativo) return;
        // Em falha transitória, o RLS do banco continua sendo a fronteira real.
        const liberado = error
          ? true
          : assinaturaPermiteAcesso(data as AssinaturaAcesso | null);
        setEstado(liberado ? "liberado" : "bloqueado");
        if (!liberado && pathname !== "/dashboard/assinatura") {
          router.replace("/dashboard/assinatura");
        }
      });

    return () => {
      ativo = false;
    };
  }, [pathname, router]);

  if (estado === "checando") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f6fb]">
        <Loader2 className="h-6 w-6 animate-spin text-[#2563eb]" />
      </div>
    );
  }

  if (estado === "bloqueado" && pathname !== "/dashboard/assinatura") {
    return null;
  }

  return <>{children}</>;
}
