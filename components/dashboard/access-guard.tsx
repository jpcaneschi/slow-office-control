"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { acessoPermiteEntrada } from "@/lib/acesso-utils";

export function AccessGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [estado, setEstado] = useState<"checando" | "liberado">("checando");

  useEffect(() => {
    let ativo = true;

    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!ativo || !user) return;

      const [pedidoRes, adminRes] = await Promise.all([
        supabase
          .from("access_requests")
          .select("status")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase.rpc("is_platform_admin"),
      ]);

      if (!ativo) return;
      if (
        adminRes.data === true ||
        (!pedidoRes.error && acessoPermiteEntrada(pedidoRes.data?.status))
      ) {
        setEstado("liberado");
        return;
      }

      const status =
        pedidoRes.data?.status === "rejeitado" ? "rejeitado" : "pendente";
      await supabase.auth.signOut();
      router.replace(`/login?status=${status}`);
    })();

    return () => {
      ativo = false;
    };
  }, [router]);

  if (estado === "checando") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f6fb]">
        <Loader2 className="h-6 w-6 animate-spin text-[#2563eb]" />
      </div>
    );
  }

  return <>{children}</>;
}
