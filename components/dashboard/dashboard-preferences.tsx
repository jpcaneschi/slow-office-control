"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Eye, EyeOff, Moon, Sun } from "lucide-react";
import {
  DASHBOARD_THEME_STORAGE_KEY,
  DASHBOARD_VALUES_STORAGE_KEY,
  contemValorMonetario,
  normalizarTemaDashboard,
  normalizarVisibilidadeValores,
  serializarVisibilidadeValores,
  type DashboardTheme,
} from "@/lib/dashboard-preferences";

type DashboardPreferencesContextValue = {
  theme: DashboardTheme;
  valoresVisiveis: boolean;
  setTheme: (theme: DashboardTheme) => void;
  setValoresVisiveis: (visible: boolean) => void;
};

const DashboardPreferencesContext =
  createContext<DashboardPreferencesContextValue | null>(null);

const THEME_TRANSITION_DURATION_MS = 180;
let themeTransitionTimeout: number | undefined;

function aplicarPreferenciasNoDocumento(
  theme: DashboardTheme,
  valoresVisiveis: boolean,
  animarTema = false
) {
  const root = document.documentElement;

  if (animarTema && root.dataset.nexoTheme !== theme) {
    root.dataset.nexoThemeTransition = "active";
    // Garante que o navegador capture o tema atual antes de animar o próximo.
    void root.offsetWidth;
    window.clearTimeout(themeTransitionTimeout);
    themeTransitionTimeout = window.setTimeout(() => {
      delete root.dataset.nexoThemeTransition;
      themeTransitionTimeout = undefined;
    }, THEME_TRANSITION_DURATION_MS + 60);
  }

  root.dataset.nexoTheme = theme;
  root.dataset.nexoValues =
    serializarVisibilidadeValores(valoresVisiveis);
}

function atualizarMarcacaoMonetaria(element: Element) {
  if (
    element.matches(
      "script, style, input, textarea, select, option, [contenteditable='true']"
    )
  ) {
    return;
  }

  const textoDireto = Array.from(element.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? "")
    .join(" ");

  element.classList.toggle(
    "nexo-auto-sensitive-value",
    contemValorMonetario(textoDireto)
  );
}

function marcarValoresMonetarios(root: ParentNode) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const elementos = new Set<Element>();
  let current = walker.nextNode();
  while (current) {
    const parent = current.parentElement;
    if (parent) elementos.add(parent);
    current = walker.nextNode();
  }

  elementos.forEach(atualizarMarcacaoMonetaria);
}

export function DashboardPreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<DashboardTheme>("light");
  const [valoresVisiveis, setValoresVisiveisState] = useState(true);

  useEffect(() => {
    const temaSalvo = normalizarTemaDashboard(
      window.localStorage.getItem(DASHBOARD_THEME_STORAGE_KEY) ??
        document.documentElement.dataset.nexoTheme
    );
    const valoresSalvos = normalizarVisibilidadeValores(
      window.localStorage.getItem(DASHBOARD_VALUES_STORAGE_KEY) ??
        document.documentElement.dataset.nexoValues
    );

    setThemeState(temaSalvo);
    setValoresVisiveisState(valoresSalvos);
    aplicarPreferenciasNoDocumento(temaSalvo, valoresSalvos);

    function sincronizarEntreAbas(event: StorageEvent) {
      if (
        event.key !== DASHBOARD_THEME_STORAGE_KEY &&
        event.key !== DASHBOARD_VALUES_STORAGE_KEY
      ) {
        return;
      }

      const proximoTema = normalizarTemaDashboard(
        window.localStorage.getItem(DASHBOARD_THEME_STORAGE_KEY)
      );
      const proximosValores = normalizarVisibilidadeValores(
        window.localStorage.getItem(DASHBOARD_VALUES_STORAGE_KEY)
      );
      setThemeState(proximoTema);
      setValoresVisiveisState(proximosValores);
      aplicarPreferenciasNoDocumento(proximoTema, proximosValores);
    }

    window.addEventListener("storage", sincronizarEntreAbas);
    return () => window.removeEventListener("storage", sincronizarEntreAbas);
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(themeTransitionTimeout);
      delete document.documentElement.dataset.nexoThemeTransition;
    },
    []
  );

  useEffect(() => {
    const dashboard = document.querySelector(".nexo-dashboard");
    if (!dashboard) return;

    marcarValoresMonetarios(dashboard);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          if (mutation.target instanceof Element) {
            atualizarMarcacaoMonetaria(mutation.target);
          }
          continue;
        }

        if (mutation.type === "characterData") {
          const parent = mutation.target.parentElement;
          if (parent) atualizarMarcacaoMonetaria(parent);
          continue;
        }

        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            const parent = node.parentElement;
            if (parent) atualizarMarcacaoMonetaria(parent);
          } else if (node instanceof Element) {
            atualizarMarcacaoMonetaria(node);
            marcarValoresMonetarios(node);
          }
        }
      }
    });

    observer.observe(dashboard, {
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class"],
      subtree: true,
    });
    return () => observer.disconnect();
  }, []);

  const setTheme = useCallback((nextTheme: DashboardTheme) => {
    setThemeState(nextTheme);
    window.localStorage.setItem(DASHBOARD_THEME_STORAGE_KEY, nextTheme);
    aplicarPreferenciasNoDocumento(
      nextTheme,
      normalizarVisibilidadeValores(
        document.documentElement.dataset.nexoValues
      ),
      true
    );
  }, []);

  const setValoresVisiveis = useCallback((visible: boolean) => {
    setValoresVisiveisState(visible);
    window.localStorage.setItem(
      DASHBOARD_VALUES_STORAGE_KEY,
      serializarVisibilidadeValores(visible)
    );
    aplicarPreferenciasNoDocumento(
      normalizarTemaDashboard(document.documentElement.dataset.nexoTheme),
      visible
    );
  }, []);

  const value = useMemo(
    () => ({ theme, valoresVisiveis, setTheme, setValoresVisiveis }),
    [theme, valoresVisiveis, setTheme, setValoresVisiveis]
  );

  return (
    <DashboardPreferencesContext.Provider value={value}>
      {children}
    </DashboardPreferencesContext.Provider>
  );
}

export function useDashboardPreferences() {
  const context = useContext(DashboardPreferencesContext);
  if (!context) {
    throw new Error(
      "useDashboardPreferences precisa estar dentro de DashboardPreferencesProvider"
    );
  }
  return context;
}

export function SensitiveValue({
  children,
  className = "",
  placeholder = "••••",
}: {
  children: ReactNode;
  className?: string;
  placeholder?: string;
}) {
  const { valoresVisiveis } = useDashboardPreferences();

  return (
    <span
      className={`nexo-sensitive-value ${className}`.trim()}
      aria-label={valoresVisiveis ? undefined : "Valor oculto"}
    >
      <span aria-hidden={valoresVisiveis ? undefined : "true"}>
        {valoresVisiveis ? children : placeholder}
      </span>
    </span>
  );
}

export function DashboardPreferenceControls() {
  const { theme, valoresVisiveis, setTheme, setValoresVisiveis } =
    useDashboardPreferences();

  const privacyLabel = valoresVisiveis ? "Ocultar valores" : "Mostrar valores";
  const themeLabel = theme === "light" ? "Ativar tema escuro" : "Ativar tema claro";

  return (
    <div
      className="nexo-preference-controls flex shrink-0 items-center gap-1 rounded-xl border border-[#e8ecf4] bg-white p-1 shadow-sm"
      role="group"
      aria-label="Preferências de visualização"
    >
      <button
        type="button"
        onClick={() => setValoresVisiveis(!valoresVisiveis)}
        aria-label={privacyLabel}
        title={privacyLabel}
        aria-pressed={!valoresVisiveis}
        className="nexo-preference-button inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#475569] transition hover:bg-[#f4f6fb] hover:text-[#2563eb]"
      >
        {valoresVisiveis ? (
          <Eye className="h-[18px] w-[18px]" />
        ) : (
          <EyeOff className="h-[18px] w-[18px]" />
        )}
      </button>
      <span
        className="nexo-preference-separator h-5 w-px bg-[#e8ecf4]"
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        aria-label={themeLabel}
        title={themeLabel}
        aria-pressed={theme === "dark"}
        className="nexo-preference-button nexo-theme-button inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#475569] transition hover:bg-[#f4f6fb] hover:text-[#2563eb]"
      >
        {theme === "light" ? (
          <Moon className="h-[18px] w-[18px]" />
        ) : (
          <Sun className="h-[18px] w-[18px]" />
        )}
      </button>
    </div>
  );
}
