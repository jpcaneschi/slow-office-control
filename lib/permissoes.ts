// ─────────────────────────────────────────────────────────────────────────────
// Papéis e permissões (RBAC) — fonte única da verdade para o que cada função
// pode acessar. O gate de navegação e a guarda de rota usam `podeAcessar`.
// Enforcement de dados (RLS por papel) é um passo futuro; aqui é camada de app.
// ─────────────────────────────────────────────────────────────────────────────

export type Papel = "owner" | "gerente" | "caixa" | "financeiro";

export const PAPEIS: Papel[] = ["owner", "gerente", "caixa", "financeiro"];

export const PAPEL_LABEL: Record<Papel, string> = {
  owner: "Dono",
  gerente: "Gerente",
  caixa: "Caixa",
  financeiro: "Financeiro",
};

export const PAPEL_DESCRICAO: Record<Papel, string> = {
  owner: "Acesso total, incluindo equipe e configurações.",
  gerente: "Opera tudo do dia a dia; não gerencia equipe nem a empresa.",
  caixa: "Vendas, clientes, condicional e produtos. Sem financeiro.",
  financeiro: "Financeiro, promissórias e relatórios. Sem operar o caixa.",
};

// Seções que cada papel pode acessar (por href base do menu).
// "*" = tudo.
const ACESSO: Record<Papel, string[]> = {
  owner: ["*"],
  gerente: [
    "/dashboard",
    "/dashboard/vendas",
    "/dashboard/condicional",
    "/dashboard/promissorias",
    "/dashboard/clientes",
    "/dashboard/produtos",
    "/dashboard/financeiro",
    "/dashboard/funcionarios",
    "/dashboard/agenda",
    "/dashboard/tatuagem",
    "/dashboard/servicos",
    "/dashboard/relatorios",
    "/dashboard/tarefas-alertas",
  ],
  caixa: [
    "/dashboard",
    "/dashboard/vendas",
    "/dashboard/condicional",
    "/dashboard/clientes",
    "/dashboard/promissorias",
    "/dashboard/agenda",
  ],
  financeiro: [
    "/dashboard",
    "/dashboard/financeiro",
    "/dashboard/promissorias",
    "/dashboard/relatorios",
    "/dashboard/clientes",
  ],
};

export function normalizarPapel(valor: string | null | undefined): Papel {
  if (valor === "gerente" || valor === "caixa" || valor === "financeiro") {
    return valor;
  }
  return "owner";
}

/** O papel pode acessar a rota (pathname) informada? */
export function podeAcessar(papel: Papel, pathname: string): boolean {
  const lista = ACESSO[papel] || [];
  if (lista.includes("*")) return true;
  if (pathname === "/dashboard") return lista.includes("/dashboard");
  return lista.some(
    (base) =>
      base !== "/dashboard" &&
      (pathname === base || pathname.startsWith(base + "/"))
  );
}

/** Só o dono gerencia equipe/convites e a empresa. */
export function podeGerenciarEquipe(papel: Papel): boolean {
  return papel === "owner";
}

/** Quem pode ver custo/margem dos produtos (caixa não vê). */
export function podeVerCusto(papel: Papel): boolean {
  return papel === "owner" || papel === "gerente" || papel === "financeiro";
}

/** Cancelar venda é sensível (reverte estoque/financeiro) — só dono e gerente. */
export function podeCancelarVenda(papel: Papel): boolean {
  return papel === "owner" || papel === "gerente";
}
