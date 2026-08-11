"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { baixarCSV, parseCSV } from "@/lib/csv";

type Celula = string | number | null | undefined;

export function CsvTools({
  nomeArquivo,
  headers,
  linhas,
  onImportar,
  ajuda,
}: {
  nomeArquivo: string;
  headers: string[];
  linhas: Celula[][];
  onImportar: (linhas: Record<string, string>[]) => Promise<{
    ok: number;
    erro?: string;
  }>;
  ajuda?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");
  const [importando, setImportando] = useState(false);

  async function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setStatus("");
    setImportando(true);
    try {
      const texto = await arquivo.text();
      const registros = parseCSV(texto);
      if (registros.length === 0) {
        setStatus("Arquivo vazio ou sem linhas de dados.");
      } else {
        const res = await onImportar(registros);
        setStatus(
          res.erro
            ? `Erro: ${res.erro}`
            : `${res.ok} registro(s) importado(s) com sucesso.`
        );
      }
    } catch {
      setStatus("Não foi possível ler o arquivo.");
    }
    setImportando(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => baixarCSV(nomeArquivo, headers, linhas)}
          className="inline-flex items-center gap-2 rounded-xl border border-[#e8ecf4] bg-white px-3 py-2 text-sm font-semibold text-[#334155] transition hover:bg-[#f4f6fb]"
        >
          <Download className="h-4 w-4" /> Exportar CSV
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={importando}
          className="inline-flex items-center gap-2 rounded-xl border border-[#2563eb]/20 bg-[#2563eb]/10 px-3 py-2 text-sm font-semibold text-[#2563eb] transition hover:bg-[#2563eb]/20 disabled:opacity-60"
        >
          <Upload className="h-4 w-4" />
          {importando ? "Importando..." : "Importar CSV"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={aoEscolherArquivo}
          className="hidden"
        />
      </div>
      {ajuda && <p className="text-xs text-[#94a3b8]">{ajuda}</p>}
      {status && (
        <p
          className={`text-xs font-semibold ${
            status.startsWith("Erro") || status.startsWith("Não")
              ? "text-[#b91c1c]"
              : "text-[#15803d]"
          }`}
        >
          {status}
        </p>
      )}
    </div>
  );
}
