"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, MessageCircle, ReceiptText, WalletCards, LockKeyhole } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { usePeriod, isoToDate } from "@/components/dashboard/period-context";
import { supabase } from "@/lib/supabase";
import { carregarConfigEmpresa } from "@/lib/empresa-config";
import { calcularAcerto, rotuloBaseComissao } from "@/lib/comissao-utils";
import { calcularResultadoLoja } from "@/lib/resultado-loja-utils";
import { formatCurrency } from "@/lib/vendas-utils";
import { compartilharPdfWhatsApp } from "@/lib/whatsapp-utils";
import { FolhaSalarialPdf, ValePdf } from "@/components/pdf/relatorios-pdf";

type Funcionario = {
  id: string;
  nome: string;
  telefone: string | null;
  comissao_percentual: number | null;
  salario_fixo: number | null;
  comissao_base: "vendas_funcionario" | "faturamento_loja" | "lucro_loja" | null;
  frequencia_pagamento: "mensal" | "quinzenal" | "semanal" | null;
  dia_pagamento: number | null;
  ativo: boolean | null;
};

type Vale = {
  id: string;
  funcionario_id: string;
  valor: number;
  data: string;
  observacao: string | null;
};

type Venda = {
  id: string;
  funcionario_id: string | null;
  total: number | null;
  status: string;
  created_at: string;
};

type ItemCusto = { venda_id: string; quantidade: number; custo_unitario: number | null };
type Despesa = { valor: number; data: string };
type Servico = { funcionario_id: string | null; valor: number; percentual_loja: number; data: string };
type Pagamento = {
  id: string;
  funcionario_id: string;
  periodo_inicio: string;
  periodo_fim: string;
  data_pagamento: string;
  valor_liquido: number;
};
type ComissaoFechada = {
  id: string;
  funcionario_id: string;
  competencia_origem: string;
  competencia_pagamento: string;
  base_valor: number;
  percentual: number;
  valor: number;
};

type AcertoFolha = ReturnType<typeof calcularAcerto> & {
  comissaoFechada: boolean;
  competenciaOrigem?: string;
  percentualAplicado: number;
};

function hojeISO() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function slug(valor: string) {
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function referenciaPeriodo(inicio: string, fim: string) {
  return inicio.slice(0, 7) === fim.slice(0, 7) ? inicio.slice(0, 7) : `${inicio} a ${fim}`;
}

function primeiroDiaMes(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

function primeiroDiaMesAnterior(iso: string) {
  const [ano, mes] = iso.slice(0, 7).split("-").map(Number);
  const data = new Date(ano, mes - 2, 1);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-01`;
}

function ultimoDiaMes(iso: string) {
  const [ano, mes] = iso.slice(0, 7).split("-").map(Number);
  const data = new Date(ano, mes, 0);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

function mesAnoPt(iso: string) {
  const data = new Date(`${iso.slice(0, 10)}T12:00:00`);
  const texto = data.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export default function FolhaPage() {
  const { period } = usePeriod();
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [vales, setVales] = useState<Vale[]>([]);
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [itens, setItens] = useState<ItemCusto[]>([]);
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [comissoesFechadas, setComissoesFechadas] = useState<ComissaoFechada[]>([]);
  const [datasPagamento, setDatasPagamento] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [nomeLoja, setNomeLoja] = useState("Nexo");

  const janela = useMemo(() => {
    const ini = isoToDate(period.inicio);
    ini.setHours(0, 0, 0, 0);
    const fim = isoToDate(period.fim);
    fim.setHours(0, 0, 0, 0);
    fim.setDate(fim.getDate() + 1);
    return { ini: ini.getTime(), fim: fim.getTime() };
  }, [period]);

  const competenciaPagamento = primeiroDiaMes(period.inicio);
  const competenciaOrigem = primeiroDiaMesAnterior(period.inicio);
  const periodoEhMesCompleto = period.inicio === competenciaPagamento && period.fim === ultimoDiaMes(period.inicio);

  async function carregar() {
    setLoading(true);
    setErro("");
    const cfg = await carregarConfigEmpresa();
    setNomeLoja(cfg.nome_operacao || "Nexo");
    const [funcRes, valesRes, vendasRes, itensRes, despesasRes, servicosRes, pagamentosRes, comissoesRes] = await Promise.all([
      supabase.from("funcionarios").select("id, nome, telefone, comissao_percentual, salario_fixo, comissao_base, frequencia_pagamento, dia_pagamento, ativo").order("nome"),
      supabase.from("vales").select("id, funcionario_id, valor, data, observacao").order("data", { ascending: false }),
      supabase.from("vendas").select("id, funcionario_id, total, status, created_at"),
      supabase.from("venda_itens").select("venda_id, quantidade, custo_unitario"),
      supabase.from("despesas").select("valor, data"),
      supabase.from("atendimentos_servico").select("funcionario_id, valor, percentual_loja, data"),
      supabase.from("pagamentos_funcionario").select("id, funcionario_id, periodo_inicio, periodo_fim, data_pagamento, valor_liquido").order("data_pagamento", { ascending: false }),
      supabase.from("comissoes_fechadas").select("id, funcionario_id, competencia_origem, competencia_pagamento, base_valor, percentual, valor").order("competencia_origem", { ascending: false }),
    ]);
    const primeiroErro = funcRes.error || valesRes.error || vendasRes.error || itensRes.error || despesasRes.error || servicosRes.error;
    if (primeiroErro) setErro(primeiroErro.message);
    if (pagamentosRes.error && pagamentosRes.error.code !== "42P01") setErro(pagamentosRes.error.message);
    if (comissoesRes.error && comissoesRes.error.code !== "42P01") setErro(comissoesRes.error.message);
    setFuncionarios((funcRes.data as Funcionario[] | null) || []);
    setVales((valesRes.data as Vale[] | null) || []);
    setVendas((vendasRes.data as Venda[] | null) || []);
    setItens((itensRes.data as ItemCusto[] | null) || []);
    setDespesas((despesasRes.data as Despesa[] | null) || []);
    setServicos((servicosRes.data as Servico[] | null) || []);
    setPagamentos((pagamentosRes.data as Pagamento[] | null) || []);
    setComissoesFechadas((comissoesRes.data as ComissaoFechada[] | null) || []);
    setLoading(false);
  }

  useEffect(() => {
    carregar();
  }, [period.inicio, period.fim]);

  const dataNoPeriodo = (dataISO: string) => {
    const t = isoToDate(dataISO).getTime();
    return t >= janela.ini && t < janela.fim;
  };
  const vendaNoPeriodo = (venda: { created_at: string }) => {
    const t = new Date(venda.created_at).getTime();
    return t >= janela.ini && t < janela.fim;
  };

  const resultadoLoja = useMemo(
    () => calcularResultadoLoja({ vendas, itens, despesas, servicos }, { vendaNoPeriodo, dataNoPeriodo }),
    [vendas, itens, despesas, servicos, janela]
  );

  const acertos = useMemo(
    () => funcionarios.map((funcionario) => {
      const calculado = calcularAcerto(funcionario, { vendas, servicos, vales, resultadoLoja }, { vendaNoPeriodo, dataNoPeriodo });
      const snapshot = comissoesFechadas.find(
        (item) => item.funcionario_id === funcionario.id && item.competencia_pagamento === competenciaPagamento
      );

      if (funcionario.comissao_base === "lucro_loja" && periodoEhMesCompleto) {
        if (snapshot) {
          const acerto: AcertoFolha = {
            ...calculado,
            baseComissao: Number(snapshot.base_valor || 0),
            comissao: Number(snapshot.valor || 0),
            aPagar: calculado.aPagar - calculado.comissao + Number(snapshot.valor || 0),
            comissaoFechada: true,
            competenciaOrigem: snapshot.competencia_origem,
            percentualAplicado: Number(snapshot.percentual || 0),
          };
          return { funcionario, acerto };
        }

        const acerto: AcertoFolha = {
          ...calculado,
          baseComissao: 0,
          comissao: 0,
          aPagar: calculado.aPagar - calculado.comissao,
          comissaoFechada: false,
          competenciaOrigem,
          percentualAplicado: Number(funcionario.comissao_percentual || 0),
        };
        return { funcionario, acerto };
      }

      const acerto: AcertoFolha = {
        ...calculado,
        comissaoFechada: funcionario.comissao_base !== "lucro_loja",
        percentualAplicado: Number(funcionario.comissao_percentual || 0),
      };
      return { funcionario, acerto };
    }),
    [funcionarios, vendas, servicos, vales, resultadoLoja, janela, comissoesFechadas, competenciaPagamento, competenciaOrigem, periodoEhMesCompleto]
  );

  const valesPeriodo = useMemo(() => vales.filter((vale) => dataNoPeriodo(vale.data)), [vales, janela]);
  const possuiComissaoLucro = funcionarios.some((f) => f.ativo !== false && f.comissao_base === "lucro_loja" && Number(f.comissao_percentual || 0) > 0);
  const origemJaFechada = comissoesFechadas.some((item) => item.competencia_origem === competenciaOrigem);

  function pagamentoRegistrado(funcionarioId: string) {
    return pagamentos.find((p) => p.funcionario_id === funcionarioId && p.periodo_inicio === period.inicio && p.periodo_fim === period.fim);
  }

  async function fecharMesAnterior() {
    setErro("");
    setSucesso("");
    setProcessando("fechamento-comissao");
    const { data, error } = await supabase.rpc("fechar_comissoes_lucro_mes", {
      p_competencia: competenciaOrigem,
    });
    if (error) {
      setErro(error.message);
    } else {
      const qtd = Number(data || 0);
      setSucesso(
        qtd > 0
          ? `Comissão de ${mesAnoPt(competenciaOrigem)} fechada. O valor foi congelado e entrou na folha de ${mesAnoPt(competenciaPagamento)}.`
          : `A comissão de ${mesAnoPt(competenciaOrigem)} já estava fechada ou não há funcionário configurado nessa base.`
      );
    }
    setProcessando(null);
    await carregar();
  }

  async function blobFolha(funcionario: Funcionario, acerto: AcertoFolha, dataPagamento: string) {
    const { pdf } = await import("@react-pdf/renderer");
    const documento = (
      <FolhaSalarialPdf
        loja={nomeLoja}
        funcionario={funcionario.nome}
        referencia={referenciaPeriodo(period.inicio, period.fim)}
        periodoInicio={period.inicio}
        periodoFim={period.fim}
        salarioBase={acerto.salario}
        comissao={acerto.comissao}
        qtdVendas={acerto.qtdVendas}
        totalVendido={acerto.vendido}
        comissaoPct={acerto.percentualAplicado}
        repasseServicos={acerto.repasse}
        vales={acerto.vales}
        comissaoBaseLabel={rotuloBaseComissao(acerto.baseTipo)}
        baseComissaoValor={acerto.baseComissao}
        dataPagamento={dataPagamento}
      />
    );
    return pdf(documento as Parameters<typeof pdf>[0]).toBlob();
  }

  async function blobVale(vale: Vale, funcionario: Funcionario) {
    const { pdf } = await import("@react-pdf/renderer");
    const documento = <ValePdf loja={nomeLoja} funcionario={funcionario.nome} valor={Number(vale.valor || 0)} data={vale.data} motivo={vale.observacao || undefined} descontarEmFolha />;
    return pdf(documento as Parameters<typeof pdf>[0]).toBlob();
  }

  function baixar(blob: Blob, nome: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function gerarFolha(funcionario: Funcionario, acerto: AcertoFolha, compartilhar: boolean) {
    setErro("");
    setSucesso("");
    if (funcionario.comissao_base === "lucro_loja" && periodoEhMesCompleto && !acerto.comissaoFechada) {
      setErro(`Feche primeiro a comissão de ${mesAnoPt(competenciaOrigem)} para gerar a folha de ${mesAnoPt(competenciaPagamento)}.`);
      return;
    }
    const dataPagamento = datasPagamento[funcionario.id] || pagamentoRegistrado(funcionario.id)?.data_pagamento || hojeISO();
    setProcessando(`folha-${funcionario.id}`);
    try {
      const blob = await blobFolha(funcionario, acerto, dataPagamento);
      const nome = `folha-${slug(funcionario.nome)}-${period.inicio}.pdf`;
      if (compartilhar) {
        if (!funcionario.telefone) throw new Error("Cadastre o WhatsApp do funcionário para compartilhar.");
        const mensagem = `Olá, ${funcionario.nome}! 👋\n\nSegue o seu comprovante de pagamento da ${nomeLoja}, referente ao período de ${period.inicio} a ${period.fim}. 📄✅\n\nLíquido: ${formatCurrency(acerto.aPagar)}.\nData do pagamento: ${dataPagamento.split("-").reverse().join("/")}.`;
        await compartilharPdfWhatsApp({ blob, nomeArquivo: nome, telefone: funcionario.telefone, mensagem });
      } else baixar(blob, nome);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível gerar o PDF da folha.");
    } finally {
      setProcessando(null);
    }
  }

  async function registrarPagamento(funcionario: Funcionario, acerto: AcertoFolha) {
    setErro("");
    setSucesso("");
    if (funcionario.comissao_base === "lucro_loja" && periodoEhMesCompleto && !acerto.comissaoFechada) {
      setErro(`Feche primeiro a comissão de ${mesAnoPt(competenciaOrigem)} antes de registrar o pagamento.`);
      return;
    }
    const dataPagamento = datasPagamento[funcionario.id] || hojeISO();
    setProcessando(`pag-${funcionario.id}`);
    const { error } = await supabase.rpc("registrar_pagamento_funcionario", {
      p_funcionario_id: funcionario.id,
      p_periodo_inicio: period.inicio,
      p_periodo_fim: period.fim,
      p_data_pagamento: dataPagamento,
      p_valor_liquido: Math.max(0, acerto.aPagar),
      p_observacao: `Pagamento ${funcionario.frequencia_pagamento || "mensal"}`,
    });
    if (error) setErro(error.message);
    else setSucesso(`Pagamento de ${funcionario.nome} registrado em ${dataPagamento.split("-").reverse().join("/")}.`);
    setProcessando(null);
    await carregar();
  }

  async function gerarVale(vale: Vale, funcionario: Funcionario, compartilhar: boolean) {
    setErro("");
    setSucesso("");
    setProcessando(`vale-${vale.id}`);
    try {
      const blob = await blobVale(vale, funcionario);
      const nome = `vale-${slug(funcionario.nome)}-${vale.data}.pdf`;
      if (compartilhar) {
        if (!funcionario.telefone) throw new Error("Cadastre o WhatsApp do funcionário para compartilhar.");
        const mensagem = `Olá, ${funcionario.nome}! 👋\n\nSegue o comprovante do seu vale/adiantamento da ${nomeLoja}. 📄\nValor: ${formatCurrency(Number(vale.valor || 0))}\nData: ${vale.data.split("-").reverse().join("/")}.`;
        await compartilharPdfWhatsApp({ blob, nomeArquivo: nome, telefone: funcionario.telefone, mensagem });
      } else baixar(blob, nome);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível gerar o PDF do vale.");
    } finally {
      setProcessando(null);
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader eyebrow="Equipe e folha" title="Folha e comprovantes" description="Registre a data real do pagamento e gere PDFs de folha e vales para baixar ou enviar pelo WhatsApp." />

      {erro && <div className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-4 text-sm text-[#b91c1c]">{erro}</div>}
      {sucesso && <div className="rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] p-4 text-sm text-[#15803d]">{sucesso}</div>}

      {possuiComissaoLucro && periodoEhMesCompleto && (
        <div className={`rounded-[26px] border p-5 ${origemJaFechada ? "border-[#bbf7d0] bg-[#f0fdf4]" : "border-[#fde68a] bg-[#fffbeb]"}`}>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl ${origemJaFechada ? "bg-[#dcfce7] text-[#15803d]" : "bg-[#fef3c7] text-[#b45309]"}`}><LockKeyhole className="h-5 w-5" /></span>
              <div>
                <p className={`font-black ${origemJaFechada ? "text-[#166534]" : "text-[#92400e]"}`}>Comissão sobre lucro: {mesAnoPt(competenciaOrigem)} → {mesAnoPt(competenciaPagamento)}</p>
                <p className={`mt-1 text-sm ${origemJaFechada ? "text-[#15803d]" : "text-[#a16207]"}`}>{origemJaFechada ? "Fechamento concluído. A base e o percentual ficaram congelados para esta folha." : "O lucro do mês anterior precisa ser fechado antes do pagamento. Depois de fechado, alterações posteriores não mudam esse valor."}</p>
              </div>
            </div>
            {!origemJaFechada && (
              <button type="button" onClick={fecharMesAnterior} disabled={!!processando} className="rounded-xl bg-[#b45309] px-4 py-2.5 text-sm font-black text-white hover:bg-[#92400e] disabled:opacity-50">{processando === "fechamento-comissao" ? "Fechando..." : `Fechar ${mesAnoPt(competenciaOrigem)}`}</button>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[26px] border border-[#e8ecf4] bg-white p-5"><p className="text-sm font-bold text-[#475569]">Lucro da loja no período</p><p className="mt-3 text-2xl font-black text-[#0f172a]">{formatCurrency(resultadoLoja.lucro)}</p></div>
        <div className="rounded-[26px] border border-[#e8ecf4] bg-white p-5"><p className="text-sm font-bold text-[#475569]">Vales no período</p><p className="mt-3 text-2xl font-black text-[#0f172a]">{formatCurrency(valesPeriodo.reduce((s, v) => s + Number(v.valor || 0), 0))}</p></div>
        <div className="rounded-[26px] border border-[#e8ecf4] bg-white p-5"><p className="text-sm font-bold text-[#475569]">Pagamentos registrados</p><p className="mt-3 text-2xl font-black text-[#0f172a]">{pagamentos.filter((p) => p.periodo_inicio === period.inicio && p.periodo_fim === period.fim).length}</p></div>
      </div>

      <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
        <div className="flex items-center gap-3"><ReceiptText className="h-5 w-5 text-[#2563eb]" /><div><h2 className="text-xl font-black text-[#0f172a]">Fechamento da equipe</h2><p className="text-sm text-[#64748b]">Comissão sobre lucro é fechada no fim do mês e entra somente no mês seguinte. As demais bases seguem o período selecionado.</p></div></div>
        {loading ? <p className="mt-5 text-sm text-[#64748b]">Carregando...</p> : (
          <div className="mt-5 space-y-4">
            {acertos.map(({ funcionario, acerto }) => {
              const registrado = pagamentoRegistrado(funcionario.id);
              return (
                <div key={funcionario.id} className="rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2"><p className="font-black text-[#0f172a]">{funcionario.nome}</p>{registrado && <span className="rounded-full border border-[#bbf7d0] bg-[#f0fdf4] px-2.5 py-1 text-[11px] font-bold text-[#15803d]">pago em {registrado.data_pagamento.split("-").reverse().join("/")}</span>}{funcionario.comissao_base === "lucro_loja" && periodoEhMesCompleto && <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${acerto.comissaoFechada ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]" : "border-[#fde68a] bg-[#fffbeb] text-[#b45309]"}`}>{acerto.comissaoFechada ? `comissão de ${mesAnoPt(acerto.competenciaOrigem || competenciaOrigem)}` : "aguardando fechamento"}</span>}</div>
                      <p className="mt-1 text-sm text-[#64748b]">{acerto.percentualAplicado}% sobre {rotuloBaseComissao(acerto.baseTipo)} · base {formatCurrency(acerto.baseComissao)} · comissão {formatCurrency(acerto.comissao)}</p>
                      <p className="mt-1 text-sm text-[#64748b]">Salário {formatCurrency(acerto.salario)} + serviços {formatCurrency(acerto.repasse)} − vales {formatCurrency(acerto.vales)} = <strong className="text-[#0f172a]">{formatCurrency(acerto.aPagar)}</strong></p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input type="date" value={datasPagamento[funcionario.id] || registrado?.data_pagamento || hojeISO()} onChange={(e) => setDatasPagamento((atual) => ({ ...atual, [funcionario.id]: e.target.value }))} className="rounded-xl border border-[#e8ecf4] bg-white px-3 py-2 text-sm" />
                      <button type="button" onClick={() => registrarPagamento(funcionario, acerto)} disabled={!!processando} className="rounded-xl bg-[#2563eb] px-3 py-2 text-xs font-black text-white disabled:opacity-50">Registrar pagamento</button>
                      <button type="button" onClick={() => gerarFolha(funcionario, acerto, false)} disabled={!!processando} className="flex items-center gap-1.5 rounded-xl border border-[#dbeafe] bg-white px-3 py-2 text-xs font-black text-[#1d4ed8]"><Download className="h-4 w-4" /> PDF</button>
                      <button type="button" onClick={() => gerarFolha(funcionario, acerto, true)} disabled={!!processando} className="flex items-center gap-1.5 rounded-xl border border-[#bbf7d0] bg-white px-3 py-2 text-xs font-black text-[#15803d]"><MessageCircle className="h-4 w-4" /> WhatsApp</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
        <div className="flex items-center gap-3"><WalletCards className="h-5 w-5 text-[#b45309]" /><div><h2 className="text-xl font-black text-[#0f172a]">Vales do período</h2><p className="text-sm text-[#64748b]">Cada vale pode virar PDF e ser enviado ao funcionário.</p></div></div>
        {valesPeriodo.length === 0 ? <p className="mt-5 text-sm text-[#64748b]">Nenhum vale neste período.</p> : (
          <div className="mt-5 space-y-3">
            {valesPeriodo.map((vale) => {
              const funcionario = funcionarios.find((f) => f.id === vale.funcionario_id);
              if (!funcionario) return null;
              return <div key={vale.id} className="flex flex-col gap-3 rounded-2xl border border-[#fde68a] bg-[#fffbeb] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black text-[#92400e]">{funcionario.nome} · {formatCurrency(Number(vale.valor || 0))}</p><p className="mt-1 text-sm text-[#a16207]">{vale.data.split("-").reverse().join("/")}{vale.observacao ? ` · ${vale.observacao}` : ""}</p></div><div className="flex gap-2"><button type="button" onClick={() => gerarVale(vale, funcionario, false)} disabled={!!processando} className="flex items-center gap-1.5 rounded-xl border border-[#fde68a] bg-white px-3 py-2 text-xs font-black text-[#92400e]"><Download className="h-4 w-4" /> PDF</button><button type="button" onClick={() => gerarVale(vale, funcionario, true)} disabled={!!processando} className="flex items-center gap-1.5 rounded-xl bg-[#16a34a] px-3 py-2 text-xs font-black text-white"><MessageCircle className="h-4 w-4" /> WhatsApp</button></div></div>;
            })}
          </div>
        )}
      </div>
    </section>
  );
}
