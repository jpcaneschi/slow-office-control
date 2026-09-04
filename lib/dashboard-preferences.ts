export const DASHBOARD_THEME_STORAGE_KEY = "nexo.dashboard.theme.v1";
export const DASHBOARD_VALUES_STORAGE_KEY = "nexo.dashboard.values.v1";

export type DashboardTheme = "light" | "dark";

const PADRAO_VALOR_MONETARIO = /R\$\s*[+−-]?\s*\d/i;

export function normalizarTemaDashboard(value: unknown): DashboardTheme {
  return value === "dark" ? "dark" : "light";
}

export function normalizarVisibilidadeValores(value: unknown): boolean {
  return value !== "hidden";
}

export function serializarVisibilidadeValores(visible: boolean) {
  return visible ? "visible" : "hidden";
}

export function contemValorMonetario(value: unknown) {
  return typeof value === "string" && PADRAO_VALOR_MONETARIO.test(value);
}
