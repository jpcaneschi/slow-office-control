import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/vendas-utils";

export type ResultadoBusca = {
  id: string;
  tipo: "cliente" | "produto" | "evento" | "venda" | "condicional" | "promissoria";
  categoria: string;
  titulo: string;
  subtitulo: string;
  href: string;
};

function dataBR(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(
    d.getMonth() + 1
  ).padStart(2, "0")}/${d.getFullYear()}`;
}

/**
 * Busca global nos módulos. O RLS garante que só retornam dados da empresa
 * do usuário logado.
 */
export async function buscarGlobal(termo: string): Promise<ResultadoBusca[]> {
  const t = `%${termo}%`;

  const [cliRes, prodRes, evRes] = await Promise.all([
    supabase.from("clientes").select("id, nome, telefone").ilike("nome", t).limit(6),
    supabase
      .from("produtos")
      .select("id, nome, preco, estoque")
      .ilike("nome", t)
      .limit(6),
    supabase
      .from("eventos")
      .select("id, titulo, tipo, data")
      .ilike("titulo", t)
      .limit(6),
  ]);

  const clientes =
    (cliRes.data as { id: string; nome: string; telefone: string | null }[]) || [];
  const produtos =
    (prodRes.data as {
      id: string;
      nome: string;
      preco: number | null;
      estoque: number | null;
    }[]) || [];
  const eventos =
    (evRes.data as { id: string; titulo: string; tipo: string; data: string }[]) ||
    [];

  const clienteIds = clientes.map((c) => c.id);
  const nomePorId = new Map(clientes.map((c) => [c.id, c.nome]));

  let vendas: { id: string; cliente_id: string; total: number | null }[] = [];
  let condicionais: { id: string; cliente_id: string; status: string }[] = [];
  let promissorias: {
    id: string;
    cliente_id: string;
    valor_total: number | null;
    status: string;
  }[] = [];

  // Registros ligados aos clientes encontrados (ex.: busca por nome do cliente).
  if (clienteIds.length > 0) {
    const [vRes, cRes, pRes] = await Promise.all([
      supabase
        .from("vendas")
        .select("id, cliente_id, total")
        .in("cliente_id", clienteIds)
        .eq("status", "concluida")
        .limit(4),
      supabase
        .from("condicionais")
        .select("id, cliente_id, status")
        .in("cliente_id", clienteIds)
        .limit(4),
      supabase
        .from("promissorias")
        .select("id, cliente_id, valor_total, status")
        .in("cliente_id", clienteIds)
        .limit(4),
    ]);
    vendas = (vRes.data as typeof vendas) || [];
    condicionais = (cRes.data as typeof condicionais) || [];
    promissorias = (pRes.data as typeof promissorias) || [];
  }

  const out: ResultadoBusca[] = [];

  for (const c of clientes) {
    out.push({
      id: c.id,
      tipo: "cliente",
      categoria: "Clientes",
      titulo: c.nome,
      subtitulo: c.telefone || "Sem telefone",
      href: "/dashboard/clientes",
    });
  }

  for (const p of produtos) {
    out.push({
      id: p.id,
      tipo: "produto",
      categoria: "Produtos",
      titulo: p.nome,
      subtitulo: `${formatCurrency(Number(p.preco || 0))} · ${p.estoque ?? 0} em estoque`,
      href: "/dashboard/produtos",
    });
  }

  for (const e of eventos) {
    out.push({
      id: e.id,
      tipo: "evento",
      categoria: "Agenda",
      titulo: e.titulo,
      subtitulo: `${e.tipo} · ${dataBR(e.data)}`,
      href: "/dashboard/agenda",
    });
  }

  for (const v of vendas) {
    out.push({
      id: v.id,
      tipo: "venda",
      categoria: "Vendas",
      titulo: `Venda — ${nomePorId.get(v.cliente_id) || "cliente"}`,
      subtitulo: formatCurrency(Number(v.total || 0)),
      href: "/dashboard/vendas",
    });
  }

  for (const c of condicionais) {
    out.push({
      id: c.id,
      tipo: "condicional",
      categoria: "Condicionais",
      titulo: `Condicional — ${nomePorId.get(c.cliente_id) || "cliente"}`,
      subtitulo: c.status,
      href: "/dashboard/condicional",
    });
  }

  for (const p of promissorias) {
    out.push({
      id: p.id,
      tipo: "promissoria",
      categoria: "Promissórias",
      titulo: `Promissória — ${nomePorId.get(p.cliente_id) || "cliente"}`,
      subtitulo: `${formatCurrency(Number(p.valor_total || 0))} · ${p.status}`,
      href: "/dashboard/promissorias",
    });
  }

  return out;
}
