// Módulos OPCIONAIS por empresa (o núcleo é sempre ligado).

export const MODULOS_OPCIONAIS = ["tatuagem", "servicos", "condicional"] as const;
export type Modulo = (typeof MODULOS_OPCIONAIS)[number];

export const MODULO_LABEL: Record<string, string> = {
  tatuagem: "Tatuagem",
  servicos: "Serviços",
  condicional: "Condicional",
};

export const MODULO_DESCRICAO: Record<string, string> = {
  tatuagem: "Atendimentos de tatuagem com repasse ao tatuador.",
  servicos: "Serviços genéricos (corte, conserto, etc.) com % da loja.",
  condicional: "Peças deixadas com o cliente para prova/retorno.",
};

// href base -> módulo (só rotas de módulos opcionais).
const MODULO_POR_ROTA: Record<string, Modulo> = {
  "/dashboard/tatuagem": "tatuagem",
  "/dashboard/servicos": "servicos",
  "/dashboard/condicional": "condicional",
};

/** A rota pertence a um módulo desligado? (para esconder no menu / bloquear). */
export function rotaBloqueadaPorModulo(
  pathname: string,
  modulos: string[]
): boolean {
  for (const base of Object.keys(MODULO_POR_ROTA)) {
    if (pathname === base || pathname.startsWith(base + "/")) {
      return !modulos.includes(MODULO_POR_ROTA[base]);
    }
  }
  return false;
}

export const MODULOS_PADRAO: string[] = [...MODULOS_OPCIONAIS];
