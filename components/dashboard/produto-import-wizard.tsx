"use client";

import { useRef, useState } from "react";
import { Upload, X, AlertTriangle, CheckCircle2 } from "lucide-react";
import { parseCSV } from "@/lib/csv";
import {
  sugerirMapeamento,
  estruturarImportacao,
  planejarImportacao,
  type Mapeamento,
  type Confianca,
  type ProdutoImport,
} from "@/lib/csv-importador";

export type RelatorioImport = {
  criados: number;
  ignorados: number;
  erros: { linha?: number; motivo: string }[];
};

type Etapa = "upload" | "mapear" | "revisar" | "relatorio";

const OPCOES_CAMPO: { v: string; l: string }[] = [
  { v: "nome", l: "Nome do produto" },
  { v: "marca", l: "Marca" },
  { v: "categoria", l: "Categoria" },
  { v: "preco", l: "Preço de venda" },
  { v: "custo", l: "Custo" },
  { v: "estoque", l: "Estoque / Quantidade" },
  { v: "status", l: "Status" },
  { v: "sku", l: "SKU / Referência" },
  { v: "codigo_barras", l: "Código de barras" },
  { v: "atributo:Tamanho", l: "Atributo: Tamanho" },
  { v: "atributo:Cor", l: "Atributo: Cor" },
  { v: "atributo:Numeração", l: "Atributo: Numeração" },
  { v: "atributo:Voltagem", l: "Atributo: Voltagem" },
  { v: "__custom__", l: "Atributo personalizado…" },
  { v: "ignorar", l: "Ignorar esta coluna" },
];

const CONFIANCA_ESTILO: Record<Confianca, string> = {
  alta: "bg-[#f0fdf4] text-[#15803d]",
  media: "bg-[#fefce8] text-[#a16207]",
  baixa: "bg-[#fef2f2] text-[#b91c1c]",
};
const CONFIANCA_LABEL: Record<Confianca, string> = {
  alta: "alta",
  media: "média",
  baixa: "baixa",
};

function detectarSeparador(primeiraLinha: string): string {
  const v = (primeiraLinha.match(/,/g) || []).length;
  const pv = (primeiraLinha.match(/;/g) || []).length;
  return pv > v ? ";" : ",";
}

export function ProdutoImportWizard({
  nomesExistentes,
  onImportar,
  onConcluido,
}: {
  nomesExistentes: string[];
  onImportar: (produtos: ProdutoImport[]) => Promise<RelatorioImport>;
  onConcluido?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [aberto, setAberto] = useState(false);
  const [etapa, setEtapa] = useState<Etapa>("upload");
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [separador, setSeparador] = useState(",");
  const [headers, setHeaders] = useState<string[]>([]);
  const [linhas, setLinhas] = useState<Record<string, string>[]>([]);
  const [mapeamento, setMapeamento] = useState<Mapeamento>({});
  const [customNome, setCustomNome] = useState<Record<string, string>>({});
  const [erro, setErro] = useState("");
  const [importando, setImportando] = useState(false);
  const [relatorio, setRelatorio] = useState<RelatorioImport | null>(null);

  function fechar() {
    setAberto(false);
    setEtapa("upload");
    setNomeArquivo("");
    setHeaders([]);
    setLinhas([]);
    setMapeamento({});
    setCustomNome({});
    setErro("");
    setRelatorio(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setErro("");
    // Limite simples de tamanho (5 MB) para evitar travar o navegador.
    if (arquivo.size > 5 * 1024 * 1024) {
      setErro("Arquivo muito grande (máx. 5 MB).");
      return;
    }
    try {
      const texto = await arquivo.text();
      const registros = parseCSV(texto);
      if (registros.length === 0) {
        setErro("Arquivo vazio ou sem linhas de dados.");
        return;
      }
      const primeiraLinha = texto.replace(/^﻿/, "").split(/\r?\n/)[0] || "";
      const hs = Object.keys(registros[0]);
      setNomeArquivo(arquivo.name);
      setSeparador(detectarSeparador(primeiraLinha));
      setHeaders(hs);
      setLinhas(registros);
      setMapeamento(sugerirMapeamento(hs));
      setCustomNome({});
      setEtapa("mapear");
      setAberto(true);
    } catch {
      setErro("Não foi possível ler o arquivo.");
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  // Valor exibido no <select> a partir do campo mapeado.
  function valorSelect(header: string): string {
    const campo = mapeamento[header]?.campo ?? "ignorar";
    if (OPCOES_CAMPO.some((o) => o.v === campo)) return campo;
    if (campo.startsWith("atributo:")) return "__custom__";
    return "ignorar";
  }

  function alterarMapeamento(header: string, valorSel: string) {
    setMapeamento((prev) => {
      let campo = valorSel;
      if (valorSel === "__custom__") {
        const nome = (customNome[header] || "").trim();
        campo = nome ? `atributo:${nome}` : "ignorar";
      }
      return { ...prev, [header]: { campo, confianca: prev[header]?.confianca ?? "baixa" } };
    });
  }

  function alterarCustom(header: string, nome: string) {
    setCustomNome((prev) => ({ ...prev, [header]: nome }));
    setMapeamento((prev) => ({
      ...prev,
      [header]: {
        campo: nome.trim() ? `atributo:${nome.trim()}` : "ignorar",
        confianca: prev[header]?.confianca ?? "baixa",
      },
    }));
  }

  const estrutura = etapa === "revisar" || etapa === "relatorio"
    ? estruturarImportacao(linhas, mapeamento)
    : null;
  const plano = estrutura ? planejarImportacao(estrutura.produtos, nomesExistentes) : [];
  const aCriar = plano.filter((p) => p.acao === "criar").length;
  const aIgnorar = plano.filter((p) => p.acao === "ignorar_existente").length;

  function irParaRevisar() {
    const temNome = Object.values(mapeamento).some((m) => m.campo === "nome");
    if (!temNome) {
      setErro("Escolha qual coluna é o Nome do produto antes de continuar.");
      return;
    }
    setErro("");
    setEtapa("revisar");
  }

  async function confirmarImportacao() {
    if (!estrutura) return;
    setImportando(true);
    setErro("");
    try {
      const rel = await onImportar(estrutura.produtos);
      setRelatorio(rel);
      setEtapa("relatorio");
      onConcluido?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao importar.");
    }
    setImportando(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-2 rounded-xl border border-[#2563eb]/20 bg-[#2563eb]/10 px-3 py-2 text-sm font-semibold text-[#2563eb] transition hover:bg-[#2563eb]/20"
      >
        <Upload className="h-4 w-4" /> Importar CSV
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={aoEscolherArquivo}
        className="hidden"
      />
      {erro && !aberto && (
        <p className="mt-1 text-xs font-semibold text-[#b91c1c]">{erro}</p>
      )}

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[24px] border border-[#e8ecf4] bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#e8ecf4] px-6 py-4">
              <div>
                <h2 className="text-lg font-black tracking-tight text-[#0f172a]">
                  Importar produtos por CSV
                </h2>
                <p className="text-xs text-[#64748b]">
                  {nomeArquivo} · separador &quot;{separador}&quot; · {linhas.length} linha(s)
                </p>
              </div>
              <button
                type="button"
                onClick={fechar}
                className="rounded-xl p-2 text-[#64748b] hover:bg-[#f4f6fb]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {erro && (
                <div className="mb-4 rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-3 text-sm text-[#b91c1c]">
                  {erro}
                </div>
              )}

              {/* Etapa: mapear */}
              {etapa === "mapear" && (
                <div className="space-y-5">
                  <p className="text-sm text-[#475569]">
                    Confira para onde vai cada coluna. Nada é importado sem sua
                    confirmação. Linhas com o mesmo nome viram variações (grade).
                  </p>
                  <div className="space-y-2">
                    {headers.map((h) => (
                      <div
                        key={h}
                        className="grid grid-cols-1 items-center gap-2 rounded-xl border border-[#e8ecf4] bg-[#f8fafc] p-3 sm:grid-cols-[1fr_auto_1.2fr]"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#0f172a]">
                            {h}
                          </p>
                          <p className="truncate text-xs text-[#94a3b8]">
                            ex.: {linhas[0]?.[h] || "—"}
                          </p>
                        </div>
                        <span
                          className={`justify-self-start rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            CONFIANCA_ESTILO[mapeamento[h]?.confianca ?? "baixa"]
                          }`}
                        >
                          {CONFIANCA_LABEL[mapeamento[h]?.confianca ?? "baixa"]}
                        </span>
                        <div className="flex flex-col gap-1">
                          <select
                            value={valorSelect(h)}
                            onChange={(e) => alterarMapeamento(h, e.target.value)}
                            className="w-full rounded-xl border border-[#e8ecf4] bg-white px-3 py-2 text-sm outline-none"
                          >
                            {OPCOES_CAMPO.map((o) => (
                              <option key={o.v} value={o.v}>
                                {o.l}
                              </option>
                            ))}
                          </select>
                          {valorSelect(h) === "__custom__" && (
                            <input
                              value={
                                customNome[h] ??
                                (mapeamento[h]?.campo.startsWith("atributo:")
                                  ? mapeamento[h].campo.slice("atributo:".length)
                                  : "")
                              }
                              onChange={(e) => alterarCustom(h, e.target.value)}
                              placeholder="Nome do atributo (ex.: Sabor)"
                              className="w-full rounded-xl border border-[#e8ecf4] bg-white px-3 py-2 text-sm outline-none"
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Etapa: revisar (dry-run) */}
              {etapa === "revisar" && estrutura && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <ResumoCard rotulo="Serão criados" valor={aCriar} tom="ok" />
                    <ResumoCard rotulo="Já existem (ignorados)" valor={aIgnorar} tom="neutro" />
                    <ResumoCard
                      rotulo="Variações"
                      valor={estrutura.produtos.reduce((a, p) => a + p.variacoes.length, 0)}
                      tom="neutro"
                    />
                    <ResumoCard rotulo="Erros" valor={estrutura.erros.length} tom="erro" />
                  </div>

                  {aIgnorar > 0 && (
                    <p className="text-xs text-[#64748b]">
                      Produtos já cadastrados (mesmo nome) são ignorados —
                      reenviar o arquivo não duplica.
                    </p>
                  )}

                  {estrutura.produtos.length > 0 && (
                    <div>
                      <p className="mb-2 text-sm font-bold text-[#0f172a]">
                        Prévia dos produtos
                      </p>
                      <div className="space-y-1.5">
                        {estrutura.produtos.slice(0, 20).map((p, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between gap-2 rounded-xl border border-[#e8ecf4] bg-[#f8fafc] px-3 py-2 text-sm"
                          >
                            <span className="truncate text-[#0f172a]">
                              {p.nome}
                              {p.marca ? ` · ${p.marca}` : ""}
                            </span>
                            <span className="shrink-0 text-xs text-[#64748b]">
                              {p.temVariacoes
                                ? `${p.variacoes.length} variação(ões)`
                                : `${p.estoque} un`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {(estrutura.erros.length > 0 || estrutura.avisos.length > 0) && (
                    <div className="rounded-2xl border border-[#fde68a] bg-[#fffbeb] p-3">
                      <p className="flex items-center gap-1.5 text-sm font-bold text-[#a16207]">
                        <AlertTriangle className="h-4 w-4" /> Avisos por linha
                      </p>
                      <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-[#78350f]">
                        {estrutura.erros.map((er, i) => (
                          <li key={`e${i}`}>
                            Linha {er.linha}: {er.motivo}
                          </li>
                        ))}
                        {estrutura.avisos.map((av, i) => (
                          <li key={`a${i}`} className="text-[#92400e]/80">
                            Linha {av.linha}: {av.motivo}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Etapa: relatório */}
              {etapa === "relatorio" && relatorio && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] p-4 text-[#15803d]">
                    <CheckCircle2 className="h-5 w-5" />
                    <p className="text-sm font-bold">
                      {relatorio.criados} produto(s) criado(s) ·{" "}
                      {relatorio.ignorados} ignorado(s)
                    </p>
                  </div>
                  {relatorio.erros.length > 0 && (
                    <div className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-3">
                      <p className="text-sm font-bold text-[#b91c1c]">
                        {relatorio.erros.length} erro(s):
                      </p>
                      <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-[#b91c1c]">
                        {relatorio.erros.map((er, i) => (
                          <li key={i}>
                            {er.linha ? `Linha ${er.linha}: ` : ""}
                            {er.motivo}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Rodapé com ações */}
            <div className="flex items-center justify-between gap-2 border-t border-[#e8ecf4] px-6 py-4">
              <button
                type="button"
                onClick={fechar}
                className="rounded-xl border border-[#e8ecf4] bg-white px-4 py-2 text-sm font-semibold text-[#334155] hover:bg-[#f4f6fb]"
              >
                {etapa === "relatorio" ? "Fechar" : "Cancelar"}
              </button>
              <div className="flex gap-2">
                {etapa === "revisar" && (
                  <button
                    type="button"
                    onClick={() => setEtapa("mapear")}
                    className="rounded-xl border border-[#e8ecf4] bg-white px-4 py-2 text-sm font-semibold text-[#334155] hover:bg-[#f4f6fb]"
                  >
                    Voltar
                  </button>
                )}
                {etapa === "mapear" && (
                  <button
                    type="button"
                    onClick={irParaRevisar}
                    className="rounded-xl bg-[#2563eb] px-4 py-2 text-sm font-bold text-white hover:bg-[#1d4ed8]"
                  >
                    Revisar
                  </button>
                )}
                {etapa === "revisar" && (
                  <button
                    type="button"
                    onClick={confirmarImportacao}
                    disabled={importando || aCriar === 0}
                    className="rounded-xl bg-[#2563eb] px-4 py-2 text-sm font-bold text-white hover:bg-[#1d4ed8] disabled:opacity-60"
                  >
                    {importando ? "Importando..." : `Importar ${aCriar}`}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ResumoCard({
  rotulo,
  valor,
  tom,
}: {
  rotulo: string;
  valor: number;
  tom: "ok" | "erro" | "neutro";
}) {
  const cor =
    tom === "ok"
      ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]"
      : tom === "erro"
      ? "border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]"
      : "border-[#e8ecf4] bg-[#f8fafc] text-[#0f172a]";
  return (
    <div className={`rounded-2xl border p-3 ${cor}`}>
      <p className="text-2xl font-black tracking-tight">{valor}</p>
      <p className="text-xs font-semibold opacity-80">{rotulo}</p>
    </div>
  );
}
