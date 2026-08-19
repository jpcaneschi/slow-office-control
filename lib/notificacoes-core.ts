// Lógica PURA das notificações (Área #8) — sem Supabase, para ser testável.
// A orquestração (fetch/insert/update) fica em lib/notificacoes.ts.

import { tipoInfo } from "@/lib/eventos-utils";
import {
  agregarEstoqueVariacoes,
  estoqueEfetivo,
  type ProdutoEstoque,
  type VariacaoEstoque,
} from "@/lib/estoque-utils";

export const LIMITE_ESTOQUE = 5;

export function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export type NovaNotificacao = {
  chave: string;
  tipo: string;
  titulo: string;
  descricao: string | null;
  href: string | null;
};

// Dados crus (já escopados por empresa pela RLS) que geram os alertas.
export type DadosAlerta = {
  produtos: (ProdutoEstoque & { nome: string; status: string | null })[];
  variacoes: VariacaoEstoque[];
  promissorias: { id: string; status: string; data_vencimento: string | null }[];
  condicionais: { id: string; status: string; data_limite: string | null }[];
  eventos: { id: string; titulo: string; tipo: string; status: string; data: string }[];
  clientes: { id: string; nome: string; data_nascimento: string | null }[];
};

/**
 * Recalcula, de forma PURA, as notificações que deveriam estar ATIVAS hoje a
 * partir das tabelas de origem. O estoque é o EFETIVO (agrega variações), então
 * produto de grade com estoque nas variações não dispara falso "estoque baixo".
 */
export function calcularAtivas(
  dados: DadosAlerta,
  hojeISO: string,
  em7ISO: string
): NovaNotificacao[] {
  const soma = agregarEstoqueVariacoes(dados.variacoes);
  const novas: NovaNotificacao[] = [];

  for (const p of dados.produtos) {
    if ((p.status || "ativo") !== "ativo") continue;
    // Produto de grade ainda sem variação não tem estoque definido: não alerta.
    if (p.tem_variacoes && soma[p.id] == null) continue;
    if (!p.tem_variacoes && p.estoque == null) continue;
    const atual = estoqueEfetivo(p, soma);
    if (atual <= LIMITE_ESTOQUE) {
      novas.push({
        chave: `estoque_baixo:${p.id}`,
        tipo: "estoque",
        titulo: "Estoque baixo",
        descricao: `${p.nome} está com ${atual} em estoque.`,
        href: "/dashboard/produtos",
      });
    }
  }

  for (const p of dados.promissorias) {
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

  for (const c of dados.condicionais) {
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

  for (const e of dados.eventos) {
    if (e.status !== "pendente") continue;
    const label = tipoInfo(e.tipo).label;
    if (e.data < hojeISO) {
      novas.push({
        chave: `evento_vencido:${e.id}`,
        tipo: "tarefa",
        titulo: `${label} em atraso`,
        descricao: e.titulo,
        href: "/dashboard/agenda",
      });
    } else if (e.data === hojeISO) {
      novas.push({
        chave: `evento_hoje:${e.id}:${hojeISO}`,
        tipo: "tarefa",
        titulo: `${label} de hoje`,
        descricao: e.titulo,
        href: "/dashboard/agenda",
      });
    }
  }

  const mesDia = hojeISO.slice(5); // MM-DD
  for (const cl of dados.clientes) {
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

  return novas;
}

export type ExistenteNotificacao = {
  chave: string;
  resolvida: boolean;
  lida: boolean;
};

export type PlanoSincronizacao = {
  inserir: NovaNotificacao[]; // condição nova → cria notificação ativa
  reativar: string[]; // chaves cuja condição voltou a valer → resolvida=false
  resolver: string[]; // chaves cuja condição deixou de valer → resolvida=true
};

/**
 * Diff PURO entre o que está no banco e o que deveria estar ativo agora.
 * A notificação NÃO é apagada quando a condição some — vira "resolvida"
 * (histórico preservado, mas fora dos contadores de alerta ativo). Se a
 * condição voltar, a mesma notificação é reativada.
 */
export function planejarSincronizacao(
  existentes: ExistenteNotificacao[],
  ativas: NovaNotificacao[]
): PlanoSincronizacao {
  const existentePorChave = new Map(existentes.map((e) => [e.chave, e]));
  const ativasSet = new Set(ativas.map((a) => a.chave));

  const inserir = ativas.filter((a) => !existentePorChave.has(a.chave));
  const reativar = existentes
    .filter((e) => e.resolvida && ativasSet.has(e.chave))
    .map((e) => e.chave);
  const resolver = existentes
    .filter((e) => !e.resolvida && !ativasSet.has(e.chave))
    .map((e) => e.chave);

  return { inserir, reativar, resolver };
}
