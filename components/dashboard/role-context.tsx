"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/lib/supabase";
import { normalizarPapel, type Papel } from "@/lib/permissoes";
import { MODULOS_PADRAO } from "@/lib/modulos";

type Ctx = {
  papel: Papel;
  carregando: boolean;
  modulos: string[];
  adminPlataforma: boolean;
  recarregar: () => Promise<void>;
};
const RoleContext = createContext<Ctx | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [papel, setPapel] = useState<Papel>("owner");
  const [modulos, setModulos] = useState<string[]>(MODULOS_PADRAO);
  const [adminPlataforma, setAdminPlataforma] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setCarregando(false);
      return;
    }

    const [membroRes, cfgRes, adminRes] = await Promise.all([
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
      supabase.rpc("is_platform_admin"),
    ]);

    setPapel(normalizarPapel(membroRes.data?.papel as string | undefined));
    const mods = cfgRes.data?.modulos_ativos as string[] | null | undefined;
    // null/undefined = configuração antiga → usa padrão.
    // [] = usuário desligou TODOS os módulos opcionais → respeita lista vazia.
    setModulos(Array.isArray(mods) ? mods : MODULOS_PADRAO);
    setAdminPlataforma(adminRes.data === true);
    setCarregando(false);
  }, []);

  useEffect(() => {
    let ativo = true;
    (async () => {
      if (ativo) await carregar();
    })();
    return () => {
      ativo = false;
    };
  }, [carregar]);

  return (
    <RoleContext.Provider
      value={{
        papel,
        carregando,
        modulos,
        adminPlataforma,
        recarregar: carregar,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function usePapel() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("usePapel deve ser usado dentro de RoleProvider");
  return ctx;
}
