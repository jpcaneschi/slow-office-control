"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import { normalizarPapel, type Papel } from "@/lib/permissoes";

type Ctx = { papel: Papel; carregando: boolean };
const RoleContext = createContext<Ctx | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  // Otimista como "owner" enquanto carrega (a maioria dos usuários é dona);
  // a guarda de rota só age depois de `carregando` virar false.
  const [papel, setPapel] = useState<Papel>("owner");
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (ativo) setCarregando(false);
        return;
      }
      const { data } = await supabase
        .from("organization_members")
        .select("papel")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (!ativo) return;
      setPapel(normalizarPapel(data?.papel as string | undefined));
      setCarregando(false);
    })();
    return () => {
      ativo = false;
    };
  }, []);

  return (
    <RoleContext.Provider value={{ papel, carregando }}>
      {children}
    </RoleContext.Provider>
  );
}

export function usePapel() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("usePapel deve ser usado dentro de RoleProvider");
  return ctx;
}
