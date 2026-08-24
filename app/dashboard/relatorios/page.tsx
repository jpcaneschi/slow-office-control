"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FileText, Receipt, Wallet, Sparkles, Download } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/dashboard/page-header";
import { hojeISO, primeiroDiaMesISO } from "@/lib/datas";
import { calcularAcerto } from "@/lib/comissao-utils";
import { montarFolha } from "@/lib/folha-utils";
import {
  PromissoriaPdf,
  ValePdf,
  FolhaSalarialPdf,
  RepasseProfissionalPdf,
  type RepasseItem,
} from "@/components/pdf/relatorios-pdf";

type Tipo = "promissoria" | "vale" | "folha" | "repasse";

type AtendimentoRef = {
  cliente_nome: string;
  profissional: string | null;
  data: string;
  valor: number;
  percentual: number;
};

const inputClass =
  "w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-sm text-[#0f172a] outline-none transition placeholder:text-[#94a3b8] focus:border-[#2563eb] focus:bg-white focus:ring-2 focus:ring-[#2563eb]/15";
const labelClass = "mb-1.5 block text-sm font-semibold text-[#475569]";
const cardClass =
  "rounded-3xl border border-[#eef2f7] bg-white p-6 shadow-[0_2px_12px_rgba(15,23,42,0.05)]";

function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(n) ? n : 0);
}
function hoje() {
  return hojeISO();
}
function primeiroDiaMes() {
  return primeiroDiaMesISO();
}
function refMesAno() {
  const s = new Date().toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function slug(s: string) {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "documento"
  );
}

const tipos: { key: Tipo; label: string; icon: typeof FileText }[] = [
  { key: "promissoria", label: "Promissória", icon: FileText },
  { key: "vale", label: "Vale", icon: Receipt },
  { key: "folha", label: "Folha salarial", icon: Wallet },
  { key: "repasse", label: "Repasse de serviços", icon: Sparkles },
];

export default function RelatoriosPage() {
  const [tipo, setTipo] = useState<Tipo>("promissoria");
  const [loja, setLoja] = useState("");
  const [atendimentos, setAtendimentos] = useState<AtendimentoRef[]>([]);
  const [baixando, setBaixando] = useState(false);
  const [erro, setErro] = useState("");

  // Dados reais para Vale / Folha
  const [funcionarios, setFuncionarios] = useState<
    { id: string; nome: string; comissao_percentual: number; salario_fixo: number }[]
  >([]);
  const [valesReais, setValesReais] = useState<
    { funcionario_id: string; valor: number; data: string }[]
  >([]);
  const [vendasFolha, setVendasFolha] = useState<
    { funcionario_id: string | null; total: number; status: string; created_at: string }[]
  >([]);
  const [servFolha, setServFolha] = useState<
    { funcionario_id: string | null; valor: number; percentual_loja: number; data: string }[]
  >([]);

  // Promissória
  const [pDevedor, setPDevedor] = useState("");
  const [pCpf, setPCpf] = useState("");
  const [pValor, setPValor] = useState("");
  const [pVenc, setPVenc] = useState("");
  const [pCidade, setPCidade] = useState("");
  const [pEmissao, setPEmissao] = useState(hoje());
  const [pRef, setPRef] = useState("");

  // Vale
  const [vFunc, setVFunc] = useState("");
  const [vValor, setVValor] = useState("");
  const [vData, setVData] = useState(hoje());
  const [vMotivo, setVMotivo] = useState("");
  const [vDescontar, setVDescontar] = useState(true);

  // Folha
  const [fFuncId, setFFuncId] = useState("");
  const [fInicio, setFInicio] = useState(primeiroDiaMes());
  const [fFim, setFFim] = useState(hoje());
  const [fFunc, setFFunc] = useState("");
  const [fCargo, setFCargo] = useState("");
  const [fRef, setFRef] = useState(refMesAno());
  const [fBase, setFBase] = useState("");
  // Outros descontos (faltas etc.) — opcional. Comissão/serviços/vales vêm dos
  // registros reais (fonte única), não de digitação manual desconectada.
  const [fOutros, setFOutros] = useState("");
  const [fOutrosLabel, setFOutrosLabel] = useState("");

  // Repasse
  const [rProfissional, setRProfissional] = useState("");
  const [rInicio, setRInicio] = useState(primeiroDiaMes());
  const [rFim, setRFim] = useState(hoje());

  useEffect(() => {
    (async () => {
      const [confRes, funcRes, clientesRes, valesRes, vendasRes, servRes] =
        await Promise.all([
          supabase
            .from("configuracoes")
            .select("nome_operacao")
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("funcionarios")
            .select("id, nome, comissao_percentual, salario_fixo, ativo")
            .order("nome"),
          supabase.from("clientes").select("id, nome"),
          supabase.from("vales").select("funcionario_id, valor, data"),
          supabase
            .from("vendas")
            .select("funcionario_id, total, status, created_at"),
          supabase
            .from("atendimentos_servico")
            .select(
              "funcionario_id, cliente_id, profissional_nome, valor, percentual_loja, data"
            ),
        ]);
      if (confRes.data?.nome_operacao) setLoja(confRes.data.nome_operacao);
      const nomesFuncionarios = new Map(
        (funcRes.data || []).map((f) => [f.id as string, f.nome as string])
      );
      const nomesClientes = new Map(
        (clientesRes.data || []).map((c) => [c.id as string, c.nome as string])
      );
      setAtendimentos(
        (servRes.data || []).map((a) => ({
          cliente_nome:
            nomesClientes.get(a.cliente_id as string) || "Cliente não informado",
          profissional:
            a.profissional_nome ||
            nomesFuncionarios.get(a.funcionario_id as string) ||
            null,
          data: a.data,
          valor: Number(a.valor || 0),
          percentual: Number(a.percentual_loja || 0),
        }))
      );
      setFuncionarios(
        (funcRes.data || [])
          .filter((f) => f.ativo !== false)
          .map((f) => ({
            id: f.id as string,
            nome: f.nome as string,
            comissao_percentual: Number(f.comissao_percentual || 0),
            salario_fixo: Number(f.salario_fixo || 0),
          }))
      );
      setValesReais(valesRes.data || []);
      setVendasFolha(vendasRes.data || []);
      setServFolha(
        (servRes.data || []).map((a) => ({
          funcionario_id: a.funcionario_id,
          valor: Number(a.valor || 0),
          percentual_loja: Number(a.percentual_loja || 0),
          data: a.data,
        }))
      );
    })();
  }, []);

  const profissionais = useMemo(() => {
    const set = new Set<string>();
    atendimentos.forEach((a) => a.profissional && set.add(a.profissional));
    return Array.from(set).sort();
  }, [atendimentos]);

  const repasseItens = useMemo<RepasseItem[]>(() => {
    return atendimentos
      .filter((a) => a.profissional && a.profissional === rProfissional)
      .filter(
        (a) =>
          (!rInicio || a.data >= rInicio) && (!rFim || a.data <= rFim)
      )
      .map((a) => ({
        data: a.data,
        cliente: a.cliente_nome,
        valor: Number(a.valor) || 0,
        percentual: Number(a.percentual) || 0,
      }));
  }, [atendimentos, rProfissional, rInicio, rFim]);

  const repasseTotalLoja = useMemo(
    () =>
      repasseItens.reduce(
        (s, it) => s + (it.valor * it.percentual) / 100,
        0
      ),
    [repasseItens]
  );

  // Folha real: salário + comissão (vendas) + repasse (serviços) − vales, no período.
  const folhaCalc = useMemo(() => {
    const f = funcionarios.find((x) => x.id === fFuncId);
    if (!f) return null;
    const noPeriodo = (d: string) =>
      (!fInicio || d >= fInicio) && (!fFim || d <= fFim);
    // Fonte única (mesma fórmula/exclusões da tela de Funcionários e do PDF).
    const a = calcularAcerto(
      f,
      { vendas: vendasFolha, servicos: servFolha, vales: valesReais },
      {
        vendaNoPeriodo: (v) => noPeriodo((v.created_at || "").slice(0, 10)),
        dataNoPeriodo: (d) => noPeriodo(d),
      }
    );
    return {
      nome: f.nome,
      salario: f.salario_fixo,
      comissaoPct: f.comissao_percentual,
      qtdVendas: a.qtdVendas,
      vendido: a.vendido,
      comissaoVendas: a.comissao,
      repasseServicos: a.repasse,
      vales: a.vales,
    };
  }, [funcionarios, fFuncId, fInicio, fFim, vendasFolha, servFolha, valesReais]);

  // Ao trocar de funcionário/período, preenche nome/salário com dados reais.
  useEffect(() => {
    if (!folhaCalc) return;
    setFFunc(folhaCalc.nome);
    setFBase(String(folhaCalc.salario));
  }, [folhaCalc]);

  function construirDocumento(): { doc: React.ReactElement; nome: string } | null {
    if (tipo === "promissoria") {
      if (!pDevedor.trim()) {
        setErro("Informe o nome do devedor.");
        return null;
      }
      return {
        doc: (
          <PromissoriaPdf
            loja={loja}
            devedor={pDevedor.trim()}
            cpf={pCpf.trim()}
            valor={Number(pValor) || 0}
            vencimento={pVenc}
            cidade={pCidade.trim()}
            dataEmissao={pEmissao}
            referencia={pRef.trim()}
          />
        ),
        nome: `promissoria-${slug(pDevedor)}.pdf`,
      };
    }
    if (tipo === "vale") {
      if (!vFunc.trim()) {
        setErro("Informe o nome do funcionário.");
        return null;
      }
      return {
        doc: (
          <ValePdf
            loja={loja}
            funcionario={vFunc.trim()}
            valor={Number(vValor) || 0}
            data={vData}
            motivo={vMotivo.trim()}
            descontarEmFolha={vDescontar}
          />
        ),
        nome: `vale-${slug(vFunc)}.pdf`,
      };
    }
    if (tipo === "folha") {
      if (!fFunc.trim()) {
        setErro("Informe o nome do funcionário.");
        return null;
      }
      return {
        doc: (
          <FolhaSalarialPdf
            loja={loja}
            funcionario={fFunc.trim()}
            cargo={fCargo.trim()}
            referencia={fRef.trim()}
            periodoInicio={fInicio}
            periodoFim={fFim}
            salarioBase={Number(fBase) || 0}
            comissao={folhaCalc?.comissaoVendas || 0}
            qtdVendas={folhaCalc?.qtdVendas || 0}
            totalVendido={folhaCalc?.vendido || 0}
            comissaoPct={folhaCalc?.comissaoPct || 0}
            repasseServicos={folhaCalc?.repasseServicos || 0}
            vales={folhaCalc?.vales || 0}
            outrosDescontos={Number(fOutros) || 0}
            outrosDescontosLabel={fOutrosLabel.trim()}
          />
        ),
        nome: `recibo-${slug(fFunc)}.pdf`,
      };
    }
    // repasse
    if (!rProfissional) {
      setErro("Selecione um profissional.");
      return null;
    }
    if (repasseItens.length === 0) {
      setErro("Nenhum atendimento desse profissional no período selecionado.");
      return null;
    }
    return {
      doc: (
        <RepasseProfissionalPdf
          loja={loja}
          profissional={rProfissional}
          periodoInicio={rInicio}
          periodoFim={rFim}
          itens={repasseItens}
        />
      ),
      nome: `repasse-${slug(rProfissional)}.pdf`,
    };
  }

  async function baixar() {
    setErro("");
    const resultado = construirDocumento();
    if (!resultado) return;

    setBaixando(true);
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const blob = await pdf(
        resultado.doc as Parameters<typeof pdf>[0]
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = resultado.nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErro("Não foi possível gerar o PDF. Tente novamente.");
    } finally {
      setBaixando(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          eyebrow="Documentos"
          title="Relatórios / PDFs"
          description="Gere documentos em preto e branco, prontos para imprimir em folha branca."
        />
        <Link
          href="/dashboard"
          className="rounded-xl border border-[#e8ecf4] bg-white px-4 py-2.5 text-sm font-semibold text-[#334155] transition hover:bg-[#f4f6fb]"
        >
          Voltar
        </Link>
      </div>

      {/* Seletor de tipo */}
      <div className="flex flex-wrap gap-2">
        {tipos.map((t) => {
          const Icon = t.icon;
          const ativo = tipo === t.key;
          return (
            <button
              key={t.key}
              onClick={() => {
                setTipo(t.key);
                setErro("");
              }}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
                ativo
                  ? "border-[#2563eb] bg-[#2563eb] text-white"
                  : "border-[#e8ecf4] bg-white text-[#334155] hover:bg-[#f4f6fb]"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className={cardClass}>
        <div className="mb-5 rounded-xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-sm text-[#475569]">
          Loja no documento:{" "}
          <span className="font-bold text-[#0f172a]">{loja}</span>{" "}
          <span className="text-[#94a3b8]">
            (altere em Configurações → Negócio → Nome da loja)
          </span>
        </div>

        {erro && (
          <div className="mb-5 rounded-xl border border-[#fecaca] bg-[#fef2f2] p-4 text-sm text-[#b91c1c]">
            {erro}
          </div>
        )}

        {/* ── Promissória ── */}
        {tipo === "promissoria" && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className={labelClass}>Nome do devedor</label>
              <input
                value={pDevedor}
                onChange={(e) => setPDevedor(e.target.value)}
                className={inputClass}
                placeholder="Quem assina a promissória"
              />
            </div>
            <div>
              <label className={labelClass}>CPF / documento</label>
              <input
                value={pCpf}
                onChange={(e) => setPCpf(e.target.value)}
                className={inputClass}
                placeholder="000.000.000-00"
              />
            </div>
            <div>
              <label className={labelClass}>Valor (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={pValor}
                onChange={(e) => setPValor(e.target.value)}
                className={inputClass}
                placeholder="0,00"
              />
            </div>
            <div>
              <label className={labelClass}>Vencimento</label>
              <input
                type="date"
                value={pVenc}
                onChange={(e) => setPVenc(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Data de emissão</label>
              <input
                type="date"
                value={pEmissao}
                onChange={(e) => setPEmissao(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Cidade</label>
              <input
                value={pCidade}
                onChange={(e) => setPCidade(e.target.value)}
                className={inputClass}
                placeholder="Cidade da emissão"
              />
            </div>
            <div>
              <label className={labelClass}>Referência (opcional)</label>
              <input
                value={pRef}
                onChange={(e) => setPRef(e.target.value)}
                className={inputClass}
                placeholder="Ex: compra parcelada"
              />
            </div>
          </div>
        )}

        {/* ── Vale ── */}
        {tipo === "vale" && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className={labelClass}>Funcionário</label>
              <input
                list="rel-funcionarios"
                value={vFunc}
                onChange={(e) => setVFunc(e.target.value)}
                className={inputClass}
                placeholder="Nome do funcionário"
              />
              <datalist id="rel-funcionarios">
                {funcionarios.map((f) => (
                  <option key={f.id} value={f.nome} />
                ))}
              </datalist>
            </div>
            <div>
              <label className={labelClass}>Valor (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={vValor}
                onChange={(e) => setVValor(e.target.value)}
                className={inputClass}
                placeholder="0,00"
              />
            </div>
            <div>
              <label className={labelClass}>Data</label>
              <input
                type="date"
                value={vData}
                onChange={(e) => setVData(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>Motivo (opcional)</label>
              <input
                value={vMotivo}
                onChange={(e) => setVMotivo(e.target.value)}
                className={inputClass}
                placeholder="Ex: adiantamento quinzenal"
              />
            </div>
            <label className="flex items-center gap-3 md:col-span-2">
              <input
                type="checkbox"
                checked={vDescontar}
                onChange={(e) => setVDescontar(e.target.checked)}
                className="h-5 w-5 accent-[#2563eb]"
              />
              <span className="text-sm text-[#475569]">
                Descontar do próximo pagamento
              </span>
            </label>
          </div>
        )}

        {/* ── Folha salarial ── */}
        {tipo === "folha" && (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={labelClass}>Funcionário</label>
              {funcionarios.length > 0 ? (
                <select
                  value={fFuncId}
                  onChange={(e) => setFFuncId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Selecione…</option>
                  {funcionarios.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={fFunc}
                  onChange={(e) => setFFunc(e.target.value)}
                  className={inputClass}
                  placeholder="Nome do funcionário"
                />
              )}
            </div>
            <div>
              <label className={labelClass}>Cargo (opcional)</label>
              <input
                value={fCargo}
                onChange={(e) => setFCargo(e.target.value)}
                className={inputClass}
                placeholder="Ex: Vendedor"
              />
            </div>
            <div>
              <label className={labelClass}>Referência</label>
              <input
                value={fRef}
                onChange={(e) => setFRef(e.target.value)}
                className={inputClass}
                placeholder="Ex: Agosto/2026"
              />
            </div>
            <div>
              <label className={labelClass}>Período — início</label>
              <input
                type="date"
                value={fInicio}
                onChange={(e) => setFInicio(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Período — fim</label>
              <input
                type="date"
                value={fFim}
                onChange={(e) => setFFim(e.target.value)}
                className={inputClass}
              />
            </div>
            {folhaCalc && (
              <div className="rounded-xl border border-[#e8ecf4] bg-[#f8fafc] p-4 text-sm text-[#475569] md:col-span-2">
                Dados reais do período ({folhaCalc.qtdVendas} venda
                {folhaCalc.qtdVendas === 1 ? "" : "s"} · {brl(folhaCalc.vendido)}{" "}
                a {folhaCalc.comissaoPct}%): comissão{" "}
                <b>{brl(folhaCalc.comissaoVendas)}</b> · serviços{" "}
                <b>{brl(folhaCalc.repasseServicos)}</b> · vales{" "}
                <b>{brl(folhaCalc.vales)}</b>. Esses valores entram no recibo
                automaticamente.
              </div>
            )}
            <div>
              <label className={labelClass}>Salário base (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={fBase}
                onChange={(e) => setFBase(e.target.value)}
                className={inputClass}
                placeholder="0,00"
              />
            </div>
            <div className="hidden md:block" />
            <div>
              <label className={labelClass}>Outros descontos (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={fOutros}
                onChange={(e) => setFOutros(e.target.value)}
                className={inputClass}
                placeholder="0,00 (ex.: faltas)"
              />
            </div>
            <div>
              <label className={labelClass}>Descrição do desconto</label>
              <input
                value={fOutrosLabel}
                onChange={(e) => setFOutrosLabel(e.target.value)}
                className={inputClass}
                placeholder="Ex: faltas"
              />
            </div>
            <div className="rounded-xl border border-[#2563eb]/20 bg-[#eff6ff] p-4 md:col-span-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[#2563eb]">
                  Total líquido
                </span>
                <span className="text-lg font-black text-[#1d4ed8]">
                  {brl(
                    montarFolha({
                      salarioBase: Number(fBase) || 0,
                      comissao: folhaCalc?.comissaoVendas || 0,
                      qtdVendas: folhaCalc?.qtdVendas || 0,
                      repasseServicos: folhaCalc?.repasseServicos || 0,
                      vales: folhaCalc?.vales || 0,
                      outrosDescontos: Number(fOutros) || 0,
                    }).liquido
                  )}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Repasse de serviços ── */}
        {tipo === "repasse" && (
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className={labelClass}>Profissional</label>
              <select
                value={rProfissional}
                onChange={(e) => setRProfissional(e.target.value)}
                className={inputClass}
              >
                <option value="">Selecione…</option>
                {profissionais.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Início</label>
              <input
                type="date"
                value={rInicio}
                onChange={(e) => setRInicio(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Fim</label>
              <input
                type="date"
                value={rFim}
                onChange={(e) => setRFim(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="rounded-xl border border-[#e8ecf4] bg-[#f8fafc] p-4 md:col-span-3">
              {profissionais.length === 0 ? (
                <p className="text-sm text-[#64748b]">
                  Nenhum atendimento de serviço cadastrado ainda. Registre em{" "}
                  <Link href="/dashboard/servicos" className="font-semibold text-[#2563eb]">
                    Serviços
                  </Link>
                  .
                </p>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <span className="text-[#64748b]">
                    Atendimentos no período:{" "}
                    <span className="font-bold text-[#0f172a]">
                      {repasseItens.length}
                    </span>
                  </span>
                  <span className="text-[#64748b]">
                    Total a repassar à loja:{" "}
                    <span className="font-bold text-[#1d4ed8]">
                      {brl(repasseTotalLoja)}
                    </span>
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Baixar */}
        <button
          type="button"
          onClick={baixar}
          disabled={baixando}
          className="mt-6 flex items-center gap-2 rounded-xl bg-[#2563eb] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
        >
          <Download className="h-4 w-4" />
          {baixando ? "Gerando PDF..." : "Baixar PDF"}
        </button>
      </div>
    </div>
  );
}
