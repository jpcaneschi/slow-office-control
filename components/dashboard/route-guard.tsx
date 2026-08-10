"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePapel } from "@/components/dashboard/role-context";
import { podeAcessar } from "@/lib/permissoes";

/**
 * Redireciona para /dashboard quando o papel atual não pode acessar a rota.
 * Só age depois que o papel foi carregado (evita redirecionar no flash inicial).
 */
export function RouteGuard({ children }: { children: React.ReactNode }) {
  const { papel, carregando } = usePapel();
  const pathname = usePathname();
  const router = useRouter();

  const permitido = carregando || podeAcessar(papel, pathname);

  useEffect(() => {
    if (!carregando && !podeAcessar(papel, pathname)) {
      router.replace("/dashboard");
    }
  }, [carregando, papel, pathname, router]);

  if (!permitido) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-6 text-center">
        <div>
          <p className="text-lg font-black text-[#0f172a]">Acesso restrito</p>
          <p className="mt-2 text-sm text-[#64748b]">
            Seu perfil não tem permissão para esta área. Redirecionando…
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
