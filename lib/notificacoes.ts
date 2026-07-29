import { supabase } from "@/lib/supabase";

export type Notificacao = {
  id: string;
  chave: string;
  tipo: string;
  titulo: string;
  descricao: string | null;
  href: string | null;
  lida: boolean;
  created_at: string;
};

const LIMITE_ESTOQUE = 5;

function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

type NovaNotificacao = {
  chave: string;
  tipo: string;
  titulo: string;
  descricao: string | null;
  href: string | null;
};

/**
 * Recalcula as condições de alerta a partir das tabelas existentes e insere
 * apenas as notificações que ainda não existem (dedupe pela coluna `chave`).
 */
export async function sincronizarNotificacoes(): Promise<void> {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const hojeISO = toISO(hoje);
  const em7 = new Date(hoje);
  em7.setDate(em7.getDate() + 7);
  const em7ISO = toISO(em7);

  const [prodRes, promRes, condRes, evRes, cliRes] = await Promise.all([
    supabase.from("produtos").select("id, nome, estoque, status"),
    supabase.from("promissorias").select("id, status, data_vencimento"),
    supabase.from("condicionais").select("id, status, data_limite"),
    supabase.from("eventos").select("id, titulo, tipo, status, data"),
    supabase.from("clientes").select("id, nome, data_nascimento"),
  ]);

  const novas: NovaNotificacao[] = [];

  for (const p of (prodRes.data as { id: string; nome: string; estoque: number | null; status: string | null }[]) || []) {
    if ((p.status || "ativo") === "ativo" && p.estoque != null && p.estoque <= LIMITE_ESTOQUE) {
      novas.push({
        chave: `estoque_baixo:${p.id}`,
        tipo: "estoque",
        titulo: "Estoque baixo",
        descricao: `${p.nome} está com ${p.estoque} em estoque.`,
        href: "/dashboard/produtos",
      });
    }
  }

  for (const p of (promRes.data as { id: string; status: string; data_vencimento: string | null }[]) || []) {
    if (p.status !== "em_aberto" || !p.data_vencimento) continue;
    if (p.data_vencimento < hojeISO) {
      novas.push({
        chave: `prom_vencida:${p.id}`,
        tipo: "promissoria",
        titulo: "Promissória vencida",
        descricao: "Uma promissória em aberto passou do vencimento.",
        href: "/dashboard/promissorias",
      });
    } else if (p.data_vencimento <= em7ISO) {
      novas.push({
        chave: `prom_vencer:${p.id}`,
        tipo: "promissoria",
        titulo: "Promissória a vencer",
        descricao: "Uma promissória vence nos próximos 7 dias.",
        href: "/dashboard/promissorias",
      });
    }
  }

  for (const c of (condRes.data as { id: string; status: string; data_limite: string | null }[]) || []) {
    if (c.status !== "aberto" || !c.data_limite) continue;
    if (c.data_limite < hojeISO) {
      novas.push({
        chave: `cond_atrasada:${c.id}`,
        tipo: "condicional",
        titulo: "Condicional atrasada",
        descricao: "O prazo de retorno de uma condicional já passou.",
        href: "/dashboard/condicional",
      });
    }
  }

  for (const e of (evRes.data as { id: string; titulo: string; tipo: string; status: string; data: string }[]) || []) {
    if (e.tipo !== "tarefa" || e.status !== "pendente") continue;
    if (e.data < hojeISO) {
      novas.push({
        chave: `tarefa_vencida:${e.id}`,
        tipo: "tarefa",
        titulo: "Tarefa vencida",
        descricao: e.titulo,
        href: "/dashboard/agenda",
      });
    }
  }

  const mesDia = hojeISO.slice(5); // MM-DD
  for (const cl of (cliRes.data as { id: string; nome: string; data_nascimento: string | null }[]) || []) {
    if (!cl.data_nascimento) continue;
    if (cl.data_nascimento.slice(5) === mesDia) {
      novas.push({
        chave: `aniversario:${cl.id}:${hojeISO}`,
        tipo: "aniversario",
        titulo: "Aniversário de cliente",
        descricao: `Hoje é aniversário de ${cl.nome}.`,
        href: "/dashboard/clientes",
      });
    }
  }

  if (novas.length === 0) return;

  // Insere só as novas; conflito na chave é ignorado (sem duplicar).
  await supabase
    .from("notificacoes")
    .upsert(novas, { onConflict: "chave", ignoreDuplicates: true });
}

export async function marcarComoLida(id: string) {
  await supabase.from("notificacoes").update({ lida: true }).eq("id", id);
}

export async function marcarTodasComoLidas() {
  await supabase.from("notificacoes").update({ lida: true }).eq("lida", false);
}
