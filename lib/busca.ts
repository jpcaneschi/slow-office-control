import { supabase } from "@/lib/supabase";

export type ResultadoBusca = {
  id: string;
  tipo:
    | "cliente"
    | "produto"
    | "venda"
    | "promissoria"
    | "despesa"
    | "funcionario";
  categoria: string;
  titulo: string;
  subtitulo: string;
  href: string;
  relevancia?: number;
};

/**
 * Busca global única e tenant-safe. A RPC roda como SECURITY INVOKER e usa
 * current_org_id(), então a própria consulta já nasce isolada por empresa.
 */
export async function buscarGlobal(termo: string): Promise<ResultadoBusca[]> {
  const q = termo.trim();
  if (q.length < 2) return [];

  const { data, error } = await supabase.rpc("busca_global", {
    p_termo: q,
    p_limite: 40,
  });

  if (error) {
    console.error("Falha na busca global:", error.message);
    return [];
  }

  return ((data as ResultadoBusca[] | null) || []).map((item) => ({
    ...item,
    subtitulo: item.subtitulo || "",
  }));
}
