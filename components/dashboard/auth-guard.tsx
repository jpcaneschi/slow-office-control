"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export function AuthGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<"checando" | "ok">("checando");

  useEffect(() => {
    let ativo = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return;
      if (data.session) setStatus("ok");
      else router.replace("/login");
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!ativo) return;
      if (session) setStatus("ok");
      else router.replace("/login");
    });

    return () => {
      ativo = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  if (status === "checando") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f6fb]">
        <Loader2 className="h-6 w-6 animate-spin text-[#2563eb]" />
      </div>
    );
  }

  return <>{children}</>;
}
