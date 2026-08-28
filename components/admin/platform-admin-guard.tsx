"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export function PlatformAdminGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.rpc("is_platform_admin").then(({ data, error }) => {
      if (!active) return;
      if (!error && data === true) {
        setAuthorized(true);
        return;
      }
      router.replace("/dashboard");
    });
    return () => {
      active = false;
    };
  }, [router]);

  if (!authorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#07152f]">
        <div className="text-center text-white">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-[#60a5fa]" />
          <p className="mt-3 text-sm text-white/65">Validando acesso administrativo…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
