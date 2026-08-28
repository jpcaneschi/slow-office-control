"use client";

import {
  type Ref,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import {
  filtrarOpcoesBuscaRapida,
  type OpcaoBuscaRapida,
} from "@/lib/busca-rapida";

type QuickSearchSelectProps = {
  label: string;
  value: string;
  options: OpcaoBuscaRapida[];
  onChange: (value: string) => void;
  placeholder: string;
  emptyMessage?: string;
  hint?: string;
  inputRef?: Ref<HTMLInputElement>;
  autoFocus?: boolean;
};

export function QuickSearchSelect({
  label,
  value,
  options,
  onChange,
  placeholder,
  emptyMessage = "Nenhum resultado encontrado.",
  hint,
  inputRef,
  autoFocus,
}: QuickSearchSelectProps) {
  const id = useId();
  const listId = `${id}-lista`;
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(
    () => options.find((option) => option.value === value),
    [options, value]
  );
  const [query, setQuery] = useState(selected?.label || "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const filtered = useMemo(
    () => filtrarOpcoesBuscaRapida(options, query, query.trim() ? 40 : 12),
    [options, query]
  );

  useEffect(() => {
    if (!open) setQuery(selected?.label || "");
  }, [open, selected?.label]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function selecionar(option: OpcaoBuscaRapida) {
    if (option.disabled) return;
    onChange(option.value);
    setQuery(option.label);
    setOpen(false);
  }

  function fechar() {
    setOpen(false);
    setQuery(selected?.label || "");
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget)) fechar();
      }}
    >
      <label htmlFor={id} className="mb-2 block text-sm text-[#475569]">
        {label}
      </label>

      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]"
        />
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={
            open && filtered[activeIndex]
              ? `${id}-opcao-${filtered[activeIndex].value || "vazio"}`
              : undefined
          }
          autoComplete="off"
          autoFocus={autoFocus}
          value={query}
          placeholder={placeholder}
          onFocus={(event) => {
            setOpen(true);
            event.currentTarget.select();
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              if (filtered.length > 0) {
                setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
              }
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter" && open && filtered[activeIndex]) {
              event.preventDefault();
              selecionar(filtered[activeIndex]);
            } else if (event.key === "Escape") {
              event.preventDefault();
              fechar();
            }
          }}
          className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] py-3 pl-11 pr-20 text-[#0f172a] outline-none transition placeholder:text-[#94a3b8] focus:border-[#93b4fb] focus:bg-white focus:ring-4 focus:ring-[#2563eb]/10"
        />

        {value && (
          <button
            type="button"
            aria-label={`Limpar ${label.toLocaleLowerCase("pt-BR")}`}
            onClick={() => {
              onChange("");
              setQuery("");
              setOpen(true);
            }}
            className="absolute right-10 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#94a3b8] transition hover:bg-[#e8ecf4] hover:text-[#475569]"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          aria-label={`${open ? "Fechar" : "Abrir"} opções de ${label.toLocaleLowerCase("pt-BR")}`}
          onClick={() => setOpen((current) => !current)}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#94a3b8] transition hover:bg-[#e8ecf4] hover:text-[#475569]"
        >
          <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {hint && <p className="mt-1.5 text-xs text-[#64748b]">{hint}</p>}

      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-[#dce4f2] bg-white p-1.5 shadow-[0_18px_45px_rgba(15,23,42,0.16)]"
        >
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-[#64748b]">
              {emptyMessage}
            </p>
          ) : (
            filtered.map((option, index) => {
              const active = index === activeIndex;
              const checked = option.value === value;
              return (
                <button
                  key={option.value || "vazio"}
                  id={`${id}-opcao-${option.value || "vazio"}`}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  disabled={option.disabled}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selecionar(option)}
                  className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    active ? "bg-[#eff6ff]" : "hover:bg-[#f8fafc]"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[#0f172a]">
                      {option.label}
                    </span>
                    {option.description && (
                      <span className="mt-0.5 block truncate text-xs text-[#64748b]">
                        {option.description}
                      </span>
                    )}
                  </span>
                  {checked && <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#2563eb]" />}
                </button>
              );
            })
          )}
          {!query.trim() && options.length > 12 && (
            <p className="border-t border-[#eef2f7] px-3 pb-1 pt-2 text-[11px] text-[#94a3b8]">
              Digite para pesquisar em todos os {options.length} registros.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
