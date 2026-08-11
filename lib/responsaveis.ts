import { supabase } from "@/lib/supabase";
import { carregarConfigEmpresa } from "@/lib/empresa-config";

// Fonte unificada de "responsáveis" = funcionários ativos (via RPC que expõe só
// id+nome, sem salário) + responsáveis legados da config (compatibilidade).

export type ResponsavelRef = { id: string; nome: string };

/** Funcionários ativos (id + nome) — seguro para qualquer papel. */
export async function carregarFuncionariosResponsaveis(): Promise<ResponsavelRef[]> {
  const { data } = await supabase.rpc("listar_responsaveis");
  return (data || []).map((f: { id: string; nome: string }) => ({
    id: f.id,
    nome: f.nome,
  }));
}

/** Lista de NOMES para os seletores (funcionários + legados da config, dedup). */
export async function carregarNomesResponsaveis(): Promise<string[]> {
  const [funcs, cfg] = await Promise.all([
    carregarFuncionariosResponsaveis(),
    carregarConfigEmpresa(),
  ]);
  const set = new Set<string>();
  for (const f of funcs) if (f.nome) set.add(f.nome);
  for (const r of cfg.responsaveis || []) if (r) set.add(r);
  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
}
