// Lógica PURA das notificações — sem Supabase, para ser testável.
// A orquestração (fetch/insert/update) fica em lib/notificacoes.ts.

import { tipoInfo } from "@/lib/eventos-utils";
import {
  agregarEstoqueVariacoes,
  estoqueEfetivo,
  type ProdutoEstoque,
  type VariacaoEstoque,
} from "@/lib/estoque-utils";

// Alerta realmente crítico: quando restam no máximo 2 unidades.
export const LIMITE_ESTOQUE = 2;

export function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function somarDiasISO(iso: string, dias: number) {
  const [a, m, d] = iso.split("-").map(Number);
  const data = new Date(a, m - 1, d);
  data.setDate(data.getDate() + dias);
  return toISO(data);
}

function brl(valor: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(valor || 0));
}

function dataBR(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export type NovaNotificacao = {
  chave: string;
  tipo: string;
  titulo: string;
  descricao: string | null;
  href: string | null;
};

export type DadosAlerta = {
  produtos: (ProdutoEstoque & { nome: string; status: string | null })[];
  variacoes: VariacaoEstoque[];
  promissorias: { id: string; status: string; data_vencimento: string | null }[];
  condicionais: { id: string; status: string; data_limite: string | null }[];
  eventos: { id: string; titulo: string; tipo: string; status: string; data: string }[];
  clientes: { id: string; nome: string; data_nascimento: string | null }[];
  despesas: {
    id: string;
    status: string | null;
    data_vencimento: string | null;
    fornecedor: string | null;
    descricao: string;
    valor: number | null;
  }[];
};

/** Recalcula as notificações que deveriam estar ativas hoje. */
export function calcularAtivas(
  dados: DadosAlerta,
  hojeISO: string,
  em7ISO: string
): NovaNotificacao[] {
  const soma = agregarEstoqueVariacoes(dados.variacoes);
  const novas: NovaNotificacao[] = [];
  const em3ISO = somarDiasISO(hojeISO, 3);

  for (const p of dados.produtos) {
    if ((p.status || "ativo") !== "ativo") continue;
    if (p.tem_variacoes && soma[p.id] == null) continue;
    if (!p.tem_variacoes && p.estoque == null) continue;
    const atual = estoqueEfetivo(p, soma);
    if (atual <= LIMITE_ESTOQUE) {
      novas.push({
        chave: `estoque_baixo:${p.id}`,
        tipo: "estoque",
        titulo: atual <= 0 ? "Produto sem estoque" : "Estoque crítico",
        descricao: `${p.nome} está com ${atual} em estoque.`,
        href: `/dashboard/produtos/${p.id}`,
      });
    }
  }

  for (const d of dados.despesas || []) {
    if ((d.status || "pago") === "pago" || !d.data_vencimento || !d.fornecedor) continue;
    if (d.data_vencimento < hojeISO) {
      novas.push({
        chave: `fornecedor_vencido:${d.id}`,
        tipo: "fornecedor",
        titulo: "Boleto de fornecedor vencido",
        descricao: `${d.fornecedor} · ${brl(d.valor)} · venceu em ${dataBR(d.data_vencimento)}.`,
        href: "/dashboard/financeiro",
      });
    } else if (d.data_vencimento <= em3ISO) {
      novas.push({
        chave: `fornecedor_vencer:${d.id}`,
        tipo: "fornecedor",
        titulo: "Boleto de fornecedor a vencer",
        descricao: `${d.fornecedor} · ${brl(d.valor)} · vence em ${dataBR(d.data_vencimento)}.`,
        href: "/dashboard/financeiro",
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

  const mesDia = hojeISO.slice(5);
  for (const cl of dados.clientes) {
    if (!cl.data_nascimento) continue;
    if (cl.data_nascimento.slice(5) === mesDia) {
      novas.push({
        chave: `aniversario:${cl.id}:${hojeISO}`,
        tipo: "aniversario",
        titulo: "Aniversário de cliente",
        descricao: `Hoje é aniversário de ${cl.nome}.`,
        href: `/dashboard/clientes/${cl.id}`,
      });
    }
  }

  return novas;
}

export type ExistenteNotificacao = {
  chave: string;
  resolvida: boolean;
  lida: boolean;
  tipo?: string;
  titulo?: string;
  descricao?: string | null;
  href?: string | null;
};

export type PlanoSincronizacao = {
  inserir: NovaNotificacao[];
  atualizar: NovaNotificacao[];
  reativar: string[];
  resolver: string[];
};

export function planejarSincronizacao(
  existentes: ExistenteNotificacao[],
  ativas: NovaNotificacao[]
): PlanoSincronizacao {
  const existentePorChave = new Map(existentes.map((e) => [e.chave, e]));
  const ativasSet = new Set(ativas.map((a) => a.chave));

  const inserir = ativas.filter((a) => !existentePorChave.has(a.chave));
  const atualizar = ativas.filter((ativa) => {
    const existente = existentePorChave.get(ativa.chave);
    if (!existente) return false;
    const temSnapshot =
      existente.tipo !== undefined ||
      existente.titulo !== undefined ||
      existente.descricao !== undefined ||
      existente.href !== undefined;
    if (!temSnapshot) return false;
    return (
      existente.tipo !== ativa.tipo ||
      existente.titulo !== ativa.titulo ||
      existente.descricao !== ativa.descricao ||
      existente.href !== ativa.href
    );
  });
  const reativar = existentes
    .filter((e) => e.resolvida && ativasSet.has(e.chave))
    .map((e) => e.chave);
  const resolver = existentes
    .filter((e) => !e.resolvida && !ativasSet.has(e.chave))
    .map((e) => e.chave);

  return { inserir, atualizar, reativar, resolver };
}
