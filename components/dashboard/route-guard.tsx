"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePapel } from "@/components/dashboard/role-context";
import { podeAcessar } from "@/lib/permissoes";
import { rotaBloqueadaPorModulo } from "@/lib/modulos";

/**
 * Redireciona para /dashboard quando o papel atual não pode acessar a rota.
 * Só age depois que o papel foi carregado (evita redirecionar no flash inicial).
 */
export function RouteGuard({ children }: { children: React.ReactNode }) {
  const { papel, carregando, modulos, adminPlataforma } = usePapel();
  const pathname = usePathname();
  const router = useRouter();

  const bloqueado =
    !podeAcessar(papel, pathname) ||
    rotaBloqueadaPorModulo(pathname, modulos) ||
    (pathname.startsWith("/dashboard/acessos") && !adminPlataforma);
  const permitido = carregando || !bloqueado;

  useEffect(() => {
    if (!carregando && bloqueado) {
      router.replace("/dashboard");
    }
  }, [carregando, bloqueado, router]);

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
