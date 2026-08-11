"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Loader2,
  Users,
  Package,
  CalendarDays,
  ShoppingCart,
  ClipboardList,
  FileText,
  type LucideIcon,
} from "lucide-react";
import { buscarGlobal, type ResultadoBusca } from "@/lib/busca";

const ICONE: Record<ResultadoBusca["tipo"], LucideIcon> = {
  cliente: Users,
  produto: Package,
  evento: CalendarDays,
  venda: ShoppingCart,
  condicional: ClipboardList,
  promissoria: FileText,
};

function Realce({ texto, termo }: { texto: string; termo: string }) {
  const idx = texto.toLowerCase().indexOf(termo.toLowerCase());
  if (!termo || idx === -1) return <>{texto}</>;
  return (
    <>
      {texto.slice(0, idx)}
      <mark className="rounded bg-[#fef08a] px-0.5 text-inherit">
        {texto.slice(idx, idx + termo.length)}
      </mark>
      {texto.slice(idx + termo.length)}
    </>
  );
}

export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<ResultadoBusca[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);

  const termo = q.trim();

  // Debounce da busca (400ms), a partir de 2 caracteres.
  useEffect(() => {
    if (termo.length < 2) {
      setResultados([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setOpen(true);
    const meuReq = ++reqId.current;
    const id = setTimeout(async () => {
      const r = await buscarGlobal(termo);
      // Descarta resultado obsoleto: só aplica se ainda é a busca mais recente.
      if (meuReq !== reqId.current) return;
      setResultados(r);
      setSel(0);
      setLoading(false);
    }, 400);
    return () => clearTimeout(id);
  }, [termo]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function abrir(r: ResultadoBusca) {
    setOpen(false);
    setQ(""); // limpa a busca ao navegar para outro módulo
    reqId.current++; // invalida qualquer busca em voo
    router.push(r.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || resultados.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, resultados.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (resultados[sel]) abrir(resultados[sel]);
    }
  }

  // Agrupa por categoria mantendo o índice global (pra navegação por teclado).
  const grupos = useMemo(() => {
    const g: { categoria: string; itens: { r: ResultadoBusca; idx: number }[] }[] = [];
    resultados.forEach((r, idx) => {
      let grupo = g.find((x) => x.categoria === r.categoria);
      if (!grupo) {
        grupo = { categoria: r.categoria, itens: [] };
        g.push(grupo);
      }
      grupo.itens.push({ r, idx });
    });
    return g;
  }, [resultados]);

  return (
    <div
      ref={ref}
      className="relative order-last w-full md:order-none md:w-auto md:min-w-[320px] md:flex-1 md:max-w-md"
    >
      <div className="flex items-center gap-2 rounded-xl border border-[#e8ecf4] bg-[#f4f6fb] px-4 py-2.5 focus-within:border-[#2563eb] focus-within:bg-white">
        <Search className="h-4 w-4 shrink-0 text-[#94a3b8]" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => termo.length >= 2 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Buscar clientes, produtos, vendas, notas..."
          aria-label="Busca global"
          className="w-full bg-transparent text-sm text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none"
        />
        {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#94a3b8]" />}
      </div>

      {open && termo.length >= 2 && (
        <div className="absolute left-0 right-0 z-40 mt-2 max-h-[70vh] overflow-y-auto rounded-2xl border border-[#e8ecf4] bg-white py-2 shadow-[0_16px_44px_rgba(15,23,42,0.16)]">
          {loading ? (
            <p className="px-4 py-6 text-center text-sm text-[#94a3b8]">Buscando…</p>
          ) : resultados.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-[#94a3b8]">
              Nenhum resultado encontrado para “{termo}”.
            </p>
          ) : (
            grupos.map((grupo) => (
              <div key={grupo.categoria} className="mb-1">
                <p className="px-4 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-[#94a3b8]">
                  {grupo.categoria}
                </p>
                {grupo.itens.map(({ r, idx }) => {
                  const Icon = ICONE[r.tipo];
                  return (
                    <button
                      key={`${r.tipo}-${r.id}`}
                      onClick={() => abrir(r)}
                      onMouseEnter={() => setSel(idx)}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${
                        sel === idx ? "bg-[#eff6ff]" : "hover:bg-[#f4f6fb]"
                      }`}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f1f5f9] text-[#2563eb]">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-[#0f172a]">
                          <Realce texto={r.titulo} termo={termo} />
                        </span>
                        <span className="block truncate text-xs text-[#64748b]">
                          {r.subtitulo}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
