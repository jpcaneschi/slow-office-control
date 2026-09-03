"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Download,
  FileText,
  MessageCircle,
  Receipt,
  Sparkles,
  Wallet,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/dashboard/page-header";
import { RelatoriosFinanceiros } from "@/components/dashboard/relatorios-financeiros";
import { hojeISO, primeiroDiaMesISO } from "@/lib/datas";
import { compartilharPdfWhatsApp } from "@/lib/whatsapp-utils";
import {
  PromissoriaPdf,
  ValePdf,
  RepasseProfissionalPdf,
  type RepasseItem,
} from "@/components/pdf/relatorios-pdf";

type Tipo = "promissoria" | "vale" | "repasse";

type AtendimentoRef = {
  cliente_nome: string;
  profissional: string | null;
  data: string;
  valor: number;
  percentual: number;
};

type Funcionario = {
  id: string;
  nome: string;
  telefone: string | null;
};

const inputClass =
  "w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-sm text-[#0f172a] outline-none transition placeholder:text-[#94a3b8] focus:border-[#2563eb] focus:bg-white focus:ring-2 focus:ring-[#2563eb]/15";
const labelClass = "mb-1.5 block text-sm font-semibold text-[#475569]";
const cardClass =
  "rounded-3xl border border-[#eef2f7] bg-white p-6 shadow-[0_2px_12px_rgba(15,23,42,0.05)]";

function slug(s: string) {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "documento"
  );
}

const tipos: { key: Tipo; label: string; icon: typeof FileText }[] = [
  { key: "promissoria", label: "Promissória avulsa", icon: FileText },
  { key: "vale", label: "Vale avulso", icon: Receipt },
  { key: "repasse", label: "Repasse de serviços", icon: Sparkles },
];

export default function RelatoriosPage() {
  const [tipo, setTipo] = useState<Tipo>("promissoria");
  const [loja, setLoja] = useState("Nexo");
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [atendimentos, setAtendimentos] = useState<AtendimentoRef[]>([]);
  const [baixando, setBaixando] = useState(false);
  const [erro, setErro] = useState("");

  const [pDevedor, setPDevedor] = useState("");
  const [pCpf, setPCpf] = useState("");
  const [pValor, setPValor] = useState("");
  const [pVenc, setPVenc] = useState("");
  const [pCidade, setPCidade] = useState("");
  const [pEmissao, setPEmissao] = useState(hojeISO());
  const [pRef, setPRef] = useState("");

  const [vFunc, setVFunc] = useState("");
  const [vValor, setVValor] = useState("");
  const [vData, setVData] = useState(hojeISO());
  const [vMotivo, setVMotivo] = useState("");
  const [vDescontar, setVDescontar] = useState(true);

  const [rProfissional, setRProfissional] = useState("");
  const [rInicio, setRInicio] = useState(primeiroDiaMesISO());
  const [rFim, setRFim] = useState(hojeISO());

  useEffect(() => {
    (async () => {
      const [confRes, funcRes, clientesRes, servRes] = await Promise.all([
        supabase
          .from("configuracoes")
          .select("nome_operacao")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("funcionarios")
          .select("id,nome,telefone,ativo")
          .eq("ativo", true)
          .order("nome"),
        supabase.from("clientes").select("id,nome"),
        supabase
          .from("atendimentos_servico")
          .select("funcionario_id,cliente_id,profissional_nome,valor,percentual_loja,data"),
      ]);

      if (confRes.data?.nome_operacao) setLoja(confRes.data.nome_operacao);
      setFuncionarios(
        (funcRes.data || []).map((f) => ({
          id: f.id as string,
          nome: f.nome as string,
          telefone: (f.telefone as string | null) || null,
        }))
      );

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
      .filter((a) => (!rInicio || a.data >= rInicio) && (!rFim || a.data <= rFim))
      .map((a) => ({
        data: a.data,
        cliente: a.cliente_nome,
        valor: Number(a.valor) || 0,
        percentual: Number(a.percentual) || 0,
      }));
  }, [atendimentos, rProfissional, rInicio, rFim]);

  function construirDocumento(): { doc: React.ReactElement; nome: string } | null {
    setErro("");
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
        setErro("Informe o funcionário.");
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

  async function gerarBlob() {
    const resultado = construirDocumento();
    if (!resultado) return null;
    const { pdf } = await import("@react-pdf/renderer");
    const blob = await pdf(resultado.doc as Parameters<typeof pdf>[0]).toBlob();
    return { ...resultado, blob };
  }

  async function baixar() {
    setBaixando(true);
    try {
      const resultado = await gerarBlob();
      if (!resultado) return;
      const url = URL.createObjectURL(resultado.blob);
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

  async function enviarValeWhatsApp() {
    const funcionario = funcionarios.find(
      (f) => f.nome.trim().toLowerCase() === vFunc.trim().toLowerCase()
    );
    if (!funcionario?.telefone) {
      setErro("Cadastre o WhatsApp do funcionário antes de enviar o vale.");
      return;
    }
    setBaixando(true);
    try {
      const resultado = await gerarBlob();
      if (!resultado) return;
      await compartilharPdfWhatsApp({
        blob: resultado.blob,
        nomeArquivo: resultado.nome,
        telefone: funcionario.telefone,
        mensagem: `Olá, ${funcionario.nome}! Segue o seu comprovante de vale/adiantamento da ${loja}. 📄✅`,
      });
    } catch {
      setErro("Não foi possível preparar o PDF para o WhatsApp.");
    } finally {
      setBaixando(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          eyebrow="Análises e documentos"
          title="Relatórios / PDFs"
          description="Fechamento diário, semanal, mensal ou personalizado, calendário anual e documentos oficiais."
        />
        <Link
          href="/dashboard"
          className="rounded-xl border border-[#e8ecf4] bg-white px-4 py-2.5 text-sm font-semibold text-[#334155] transition hover:bg-[#f4f6fb]"
        >
          Voltar
        </Link>
      </div>

      <RelatoriosFinanceiros loja={loja} />

      <div className="pt-2">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2563eb]">
          Outros documentos
        </p>
        <h2 className="mt-1 text-2xl font-black tracking-tight text-[#0f172a]">
          Comprovantes avulsos
        </h2>
      </div>

      <div className="rounded-[28px] border border-[#bfdbfe] bg-[#eff6ff] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#2563eb]">
              <Wallet className="h-5 w-5" />
            </span>
            <div>
              <p className="font-black text-[#1e3a8a]">Folha salarial e comprovantes oficiais</p>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[#475569]">
                A folha usa pagamento real, comissão mensal fechada, vales e saldo transportado. Para evitar números diferentes, ela é gerada somente pela tela oficial de Folha.
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/folha"
            className="shrink-0 rounded-xl bg-[#2563eb] px-4 py-2.5 text-sm font-black text-white"
          >
            Abrir Folha e PDFs
          </Link>
        </div>
      </div>

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
          Loja no documento: <span className="font-bold text-[#0f172a]">{loja}</span>
        </div>

        {erro && (
          <div className="mb-5 rounded-xl border border-[#fecaca] bg-[#fef2f2] p-4 text-sm text-[#b91c1c]">
            {erro}
          </div>
        )}

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
              <input value={pCpf} onChange={(e) => setPCpf(e.target.value)} className={inputClass} />
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
              />
            </div>
            <div>
              <label className={labelClass}>Vencimento</label>
              <input type="date" value={pVenc} onChange={(e) => setPVenc(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Data de emissão</label>
              <input type="date" value={pEmissao} onChange={(e) => setPEmissao(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Cidade</label>
              <input value={pCidade} onChange={(e) => setPCidade(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Referência</label>
              <input value={pRef} onChange={(e) => setPRef(e.target.value)} className={inputClass} />
            </div>
          </div>
        )}

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
              />
            </div>
            <div>
              <label className={labelClass}>Data</label>
              <input type="date" value={vData} onChange={(e) => setVData(e.target.value)} className={inputClass} />
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>Motivo</label>
              <input
                value={vMotivo}
                onChange={(e) => setVMotivo(e.target.value)}
                className={inputClass}
                placeholder="Opcional"
              />
            </div>
            <label className="flex items-center gap-3 md:col-span-2">
              <input
                type="checkbox"
                checked={vDescontar}
                onChange={(e) => setVDescontar(e.target.checked)}
                className="h-5 w-5 accent-[#2563eb]"
              />
              <span className="text-sm text-[#475569]">Descontar em folha</span>
            </label>
          </div>
        )}

        {tipo === "repasse" && (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-3">
              <label className={labelClass}>Profissional</label>
              <select
                value={rProfissional}
                onChange={(e) => setRProfissional(e.target.value)}
                className={inputClass}
              >
                <option value="">Selecione…</option>
                {profissionais.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Início</label>
              <input type="date" value={rInicio} onChange={(e) => setRInicio(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Fim</label>
              <input type="date" value={rFim} onChange={(e) => setRFim(e.target.value)} className={inputClass} />
            </div>
            <div className="rounded-2xl bg-[#f8fafc] p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-[#64748b]">Atendimentos</p>
              <p className="mt-2 text-2xl font-black text-[#0f172a]">{repasseItens.length}</p>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3 border-t border-[#eef2f7] pt-5">
          <button
            onClick={baixar}
            disabled={baixando}
            className="flex items-center gap-2 rounded-xl bg-[#0f172a] px-5 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {baixando ? "Gerando…" : "Baixar PDF"}
          </button>
          {tipo === "vale" && (
            <button
              onClick={enviarValeWhatsApp}
              disabled={baixando}
              className="flex items-center gap-2 rounded-xl bg-[#16a34a] px-5 py-3 text-sm font-black text-white disabled:opacity-50"
            >
              <MessageCircle className="h-4 w-4" /> WhatsApp
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
