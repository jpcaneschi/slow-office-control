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
import { MODULOS_PADRAO } from "@/lib/modulos";

type Ctx = { papel: Papel; carregando: boolean; modulos: string[] };
const RoleContext = createContext<Ctx | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  // Otimista como "owner" enquanto carrega (a maioria dos usuários é dona);
  // a guarda de rota só age depois de `carregando` virar false.
  const [papel, setPapel] = useState<Papel>("owner");
  const [modulos, setModulos] = useState<string[]>(MODULOS_PADRAO);
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
      const [membroRes, cfgRes] = await Promise.all([
        supabase
          .from("organization_members")
          .select("papel")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle(),
        supabase
          .from("configuracoes")
          .select("modulos_ativos")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);
      if (!ativo) return;
      setPapel(normalizarPapel(membroRes.data?.papel as string | undefined));
      const mods = cfgRes.data?.modulos_ativos as string[] | null;
      setModulos(mods && mods.length ? mods : MODULOS_PADRAO);
      setCarregando(false);
    })();
    return () => {
      ativo = false;
    };
  }, []);

  return (
    <RoleContext.Provider value={{ papel, carregando, modulos }}>
      {children}
    </RoleContext.Provider>
  );
}

export function usePapel() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("usePapel deve ser usado dentro de RoleProvider");
  return ctx;
}
