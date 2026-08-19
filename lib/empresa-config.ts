import { supabase } from "@/lib/supabase";
import { MODULOS_PADRAO } from "@/lib/modulos";

// Categorias e demais padrões usados quando a empresa ainda não configurou.
export const CATEGORIAS_PADRAO = [
  "Camiseta",
  "Calças",
  "Calçados",
  "Moletons & Jaquetas",
  "Bonés & Gorros",
  "Shorts",
  "Acessórios",
  "Bags & Mochilas",
  "Outro",
];

export type EmpresaConfig = {
  id: string | null;
  nome_operacao: string;
  pix_desconto: number;
  tatuagem_percentual: number;
  max_parcelas: number;
  condicional_prazo_dias: number;
  parcela_minima: number;
  promissoria_prazo_meses: number;
  categorias_produto: string[];
  responsaveis: string[];
  modulos_ativos: string[];
};

const CAMPOS =
  "id, nome_operacao, pix_desconto, tatuagem_percentual, max_parcelas, condicional_prazo_dias, parcela_minima, promissoria_prazo_meses, categorias_produto, responsaveis, modulos_ativos";

function normalizar(data: Record<string, unknown> | null): EmpresaConfig {
  const cats = (data?.categorias_produto as string[]) ?? [];
  const mods = (data?.modulos_ativos as string[]) ?? null;
  return {
    id: (data?.id as string) ?? null,
    nome_operacao: (data?.nome_operacao as string) || "",
    pix_desconto: Number(data?.pix_desconto ?? 5),
    tatuagem_percentual: Number(data?.tatuagem_percentual ?? 10),
    max_parcelas: Number(data?.max_parcelas ?? 6),
    condicional_prazo_dias: Number(data?.condicional_prazo_dias ?? 2),
    parcela_minima: Number(data?.parcela_minima ?? 0),
    promissoria_prazo_meses: Number(data?.promissoria_prazo_meses ?? 4),
    categorias_produto: cats.length ? cats : CATEGORIAS_PADRAO,
    responsaveis: (data?.responsaveis as string[]) ?? [],
    modulos_ativos: mods && mods.length ? mods : [...MODULOS_PADRAO],
  };
}

/**
 * Garante que o usuário logado tenha uma empresa (organization) + unidade +
 * membership "owner". Se já for membro de alguma, retorna a existente.
 * Retorna o id da empresa (ou null se sem sessão).
 */
export async function garantirEmpresa(
  nomeLoja: string
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.rpc("garantir_empresa", {
    p_nome: nomeLoja.trim() || "Minha empresa",
  });
  if (error) {
    console.error("Falha ao garantir empresa:", error.message);
    return null;
  }
  return (data as string | null) ?? null;
}

/** Carrega a configuração da empresa do usuário logado (com padrões). */
export async function carregarConfigEmpresa(): Promise<EmpresaConfig> {
  const { data } = await supabase
    .from("configuracoes")
    .select(CAMPOS)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return normalizar(data as Record<string, unknown> | null);
}
