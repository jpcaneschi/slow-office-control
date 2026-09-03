"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Download,
  FileCheck2,
  LoaderCircle,
  LockKeyhole,
  ReceiptText,
  ShoppingBag,
  WalletCards,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatDataBR, hojeISO, parseDataLocal, toISOLocal } from "@/lib/datas";
import {
  agruparMovimentosPorDia,
  nomeFormaPagamento,
  nomeTipoMovimento,
  normalizarResumo,
  numeroSeguro,
  periodoDoPreset,
  resumoFinanceiroVazio,
  type FechamentoFinanceiro,
  type MovimentoFinanceiro,
  type PeriodoPreset,
  type ResumoFinanceiroPeriodo,
  type ResumoMes,
} from "@/lib/relatorios-financeiros";
import { RelatorioFinanceiroPdf } from "@/components/pdf/relatorios-pdf";

const presets: { id: Exclude<PeriodoPreset, "personalizado">; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "semana", label: "Esta semana" },
  { id: "mes", label: "Este mês" },
  { id: "mes_anterior", label: "Mês passado" },
  { id: "ano", label: "Este ano" },
];

const meses = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const inputClass =
  "w-full rounded-xl border border-[#dfe6f0] bg-white px-3 py-2.5 text-sm font-semibold text-[#0f172a] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10";

function brl(valor: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(numeroSeguro(valor));
}

function ultimoDiaMes(isoMes: string) {
  const data = parseDataLocal(`${isoMes.slice(0, 7)}-01`);
  data.setMonth(data.getMonth() + 1);
  data.setDate(0);
  return toISOLocal(data);
}

function normalizarMovimento(linha: Record<string, unknown>): MovimentoFinanceiro {
  return {
    id: String(linha.id || ""),
    data: String(linha.data || "").slice(0, 10),
    natureza: linha.natureza as MovimentoFinanceiro["natureza"],
    tipo: String(linha.tipo || ""),
    descricao: String(linha.descricao || "Movimentação"),
    detalhe: linha.detalhe ? String(linha.detalhe) : null,
    forma_pagamento: linha.forma_pagamento ? String(linha.forma_pagamento) : null,
    valor: numeroSeguro(linha.valor),
    status: String(linha.status || ""),
  };
}

export function RelatoriosFinanceiros({ loja }: { loja: string }) {
  const periodoInicial = periodoDoPreset("mes");
  const [preset, setPreset] = useState<PeriodoPreset>("mes");
  const [inicio, setInicio] = useState(periodoInicial.inicio);
  const [fim, setFim] = useState(periodoInicial.fim);
  const [ano, setAno] = useState(Number(periodoInicial.inicio.slice(0, 4)));
  const [resumo, setResumo] = useState<ResumoFinanceiroPeriodo>(resumoFinanceiroVazio);
  const [movimentos, setMovimentos] = useState<MovimentoFinanceiro[]>([]);
  const [resumosMes, setResumosMes] = useState<ResumoMes[]>([]);
  const [fechamentos, setFechamentos] = useState<FechamentoFinanceiro[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [baixando, setBaixando] = useState(false);
  const [fechando, setFechando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const carregar = useCallback(async () => {
    if (!inicio || !fim || fim < inicio) {
      setErro("Confira as datas do período.");
      return;
    }
    setCarregando(true);
    setErro("");

    const [resumoRes, movimentosRes, mesesRes, fechamentosRes] = await Promise.all([
      supabase.rpc("relatorio_financeiro_periodo", {
        p_inicio: inicio,
        p_fim: fim,
      }),
      supabase.rpc("relatorio_movimentos_periodo", {
        p_inicio: inicio,
        p_fim: fim,
      }),
      supabase.rpc("relatorio_meses_ano", { p_ano: ano }),
      supabase
        .from("fechamentos_financeiros")
        .select(
          "id,periodo_inicio,periodo_fim,tipo,fechado_em,created_at,vendas_brutas,vendas_quantidade,entradas_vendas,recebimentos_promissorias,receita_servicos,entradas_total,despesas_operacionais_pagas,compras_pagas,folha_vales_pagos,saidas_total,resultado_caixa,despesas_pendentes"
        )
        .order("periodo_fim", { ascending: false })
        .limit(24),
    ]);

    const primeiroErro =
      resumoRes.error || movimentosRes.error || mesesRes.error || fechamentosRes.error;
    if (primeiroErro) {
      setErro(primeiroErro.message);
      setCarregando(false);
      return;
    }

    const linhaResumo = Array.isArray(resumoRes.data)
      ? resumoRes.data[0]
      : resumoRes.data;
    setResumo(normalizarResumo(linhaResumo));
    setMovimentos(
      ((movimentosRes.data || []) as Record<string, unknown>[]).map(normalizarMovimento)
    );
    setResumosMes(
      ((mesesRes.data || []) as Record<string, unknown>[]).map((linha) => ({
        mes: String(linha.mes || "").slice(0, 10),
        entradas_total: numeroSeguro(linha.entradas_total),
        saidas_total: numeroSeguro(linha.saidas_total),
        resultado_caixa: numeroSeguro(linha.resultado_caixa),
        vendas_brutas: numeroSeguro(linha.vendas_brutas),
        vendas_quantidade: numeroSeguro(linha.vendas_quantidade),
      }))
    );
    setFechamentos(
      ((fechamentosRes.data || []) as Record<string, unknown>[]).map((linha) => ({
        id: String(linha.id),
        periodo_inicio: String(linha.periodo_inicio).slice(0, 10),
        periodo_fim: String(linha.periodo_fim).slice(0, 10),
        tipo: linha.tipo as FechamentoFinanceiro["tipo"],
        fechado_em: String(linha.fechado_em).slice(0, 10),
        created_at: String(linha.created_at),
        ...normalizarResumo(linha),
      }))
    );
    setCarregando(false);
  }, [ano, fim, inicio]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const fechamentoAtual = useMemo(
    () =>
      fechamentos.find(
        (fechamento) =>
          fechamento.periodo_inicio === inicio && fechamento.periodo_fim === fim
      ) || null,
    [fechamentos, fim, inicio]
  );
  const grupos = useMemo(() => agruparMovimentosPorDia(movimentos), [movimentos]);

  function aplicarPreset(novoPreset: Exclude<PeriodoPreset, "personalizado">) {
    const periodo = periodoDoPreset(novoPreset);
    setPreset(novoPreset);
    setInicio(periodo.inicio);
    setFim(periodo.fim);
    setAno(Number(periodo.inicio.slice(0, 4)));
    setSucesso("");
  }

  function abrirMes(mesISO: string) {
    const mesInicio = `${mesISO.slice(0, 7)}-01`;
    setPreset("personalizado");
    setInicio(mesInicio);
    setFim(ultimoDiaMes(mesInicio));
    setAno(Number(mesInicio.slice(0, 4)));
    setSucesso("");
  }

  async function gerarPdf() {
    setBaixando(true);
    setErro("");
    try {
      const { pdf } = await import("@react-pdf/renderer");
      const documento = (
        <RelatorioFinanceiroPdf
          loja={loja}
          periodoInicio={inicio}
          periodoFim={fim}
          resumo={resumo}
          movimentos={movimentos}
          fechadoEm={fechamentoAtual?.fechado_em}
        />
      );
      const blob = await pdf(documento).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `relatorio-financeiro-${inicio}-a-${fim}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErro("Não foi possível gerar o PDF deste período.");
    } finally {
      setBaixando(false);
    }
  }

  async function fecharPeriodo() {
    if (fechamentoAtual) return;
    const confirmou = window.confirm(
      `Fechar o período de ${formatDataBR(inicio)} a ${formatDataBR(fim)}? O fechamento guarda um retrato dos números e não altera vendas, estoque ou contas.`
    );
    if (!confirmou) return;

    setFechando(true);
    setErro("");
    setSucesso("");
    const { error } = await supabase.rpc("fechar_periodo_financeiro", {
      p_inicio: inicio,
      p_fim: fim,
      p_fechado_em: fim,
    });
    if (error) setErro(error.message);
    else {
      setSucesso("Período fechado e guardado no histórico.");
      await carregar();
    }
    setFechando(false);
  }

  const podeFechar = fim <= hojeISO();

  return (
    <section className="space-y-5">
      <div className="overflow-hidden rounded-[30px] border border-[#dbe7fb] bg-white shadow-[0_8px_30px_rgba(15,57,130,0.06)]">
        <div className="bg-gradient-to-r from-[#071d43] via-[#0b3c91] to-[#1167e8] px-5 py-6 text-white sm:px-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[#bcd4ff]">
                <CalendarDays className="h-4 w-4" /> Fechamento financeiro
              </div>
              <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
                Relatório por período
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#dbeafe]">
                Vendas, entradas efetivamente recebidas, contas pagas, compras e resultado de caixa — dia a dia e no PDF.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={gerarPdf}
                disabled={baixando || carregando}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-[#0b3c91] disabled:opacity-60"
              >
                {baixando ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {baixando ? "Gerando PDF…" : "Baixar PDF completo"}
              </button>
              <button
                type="button"
                onClick={fecharPeriodo}
                disabled={fechando || carregando || !podeFechar || Boolean(fechamentoAtual)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-black text-white disabled:opacity-55"
              >
                {fechamentoAtual ? <CheckCircle2 className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}
                {fechamentoAtual
                  ? `Fechado em ${formatDataBR(fechamentoAtual.fechado_em)}`
                  : fechando
                    ? "Fechando…"
                    : "Fechar período"}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-5 p-4 sm:p-6">
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {presets.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => aplicarPreset(item.id)}
                className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-black transition ${
                  preset === item.id
                    ? "border-[#2563eb] bg-[#2563eb] text-white"
                    : "border-[#dfe6f0] bg-white text-[#475569] hover:border-[#93b4f8]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="text-xs font-black uppercase tracking-wide text-[#64748b]">
              Data inicial
              <input
                type="date"
                value={inicio}
                onChange={(event) => {
                  setPreset("personalizado");
                  setInicio(event.target.value);
                  setAno(Number(event.target.value.slice(0, 4)) || ano);
                }}
                className={`${inputClass} mt-1.5`}
              />
            </label>
            <label className="text-xs font-black uppercase tracking-wide text-[#64748b]">
              Data final
              <input
                type="date"
                value={fim}
                onChange={(event) => {
                  setPreset("personalizado");
                  setFim(event.target.value);
                }}
                className={`${inputClass} mt-1.5`}
              />
            </label>
            <button
              type="button"
              onClick={carregar}
              disabled={carregando}
              className="min-h-11 rounded-xl bg-[#0f172a] px-5 py-2.5 text-sm font-black text-white disabled:opacity-60"
            >
              {carregando ? "Atualizando…" : "Aplicar período"}
            </button>
          </div>

          {erro && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
              {erro}
            </div>
          )}
          {sucesso && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
              {sucesso}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <ResumoCard label="Vendas" valor={resumo.vendas_brutas} detalhe={`${resumo.vendas_quantidade} pedidos`} icon={<ShoppingBag />} />
            <ResumoCard label="Recebido" valor={resumo.entradas_total} detalhe="Entrou no caixa" icon={<ArrowDownLeft />} positivo />
            <ResumoCard label="Pago" valor={resumo.saidas_total} detalhe="Saiu do caixa" icon={<ArrowUpRight />} />
            <ResumoCard label="Compras" valor={resumo.compras_pagas} detalhe="Fornecedores pagos" icon={<ReceiptText />} />
            <ResumoCard label="Pendentes" valor={resumo.despesas_pendentes} detalhe="Ainda a pagar" icon={<WalletCards />} />
            <ResumoCard label="Resultado" valor={resumo.resultado_caixa} detalhe="Recebido − pago" icon={<FileCheck2 />} resultado />
          </div>

          <div className="rounded-2xl border border-[#e8edf5] bg-[#f8fafc] p-4 text-xs leading-5 text-[#64748b]">
            <strong className="text-[#0f172a]">Leitura correta:</strong> “Vendas” mostra os pedidos concluídos. “Recebido” considera o dia em que o dinheiro entrou — inclusive parcelas de promissórias — e “Pago” considera a data real do pagamento da conta.
          </div>
        </div>
      </div>

      <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2563eb]">Visão anual</p>
            <h3 className="mt-1 text-xl font-black text-[#0f172a]">Resultado mês a mês</h3>
          </div>
          <label className="flex items-center gap-2 text-sm font-bold text-[#475569]">
            Ano
            <input
              type="number"
              min="2000"
              max="2100"
              value={ano}
              onChange={(event) => setAno(Number(event.target.value) || ano)}
              className="w-24 rounded-xl border border-[#dfe6f0] px-3 py-2 text-center text-[#0f172a] outline-none focus:border-[#2563eb]"
            />
          </label>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }, (_, indice) => {
            const linha = resumosMes.find(
              (item) => Number(item.mes.slice(5, 7)) === indice + 1
            );
            const resultado = linha?.resultado_caixa || 0;
            const mesIso = `${ano}-${String(indice + 1).padStart(2, "0")}-01`;
            const fechado = fechamentos.find(
              (item) => item.periodo_inicio === mesIso && item.tipo === "mensal"
            );
            return (
              <button
                key={mesIso}
                type="button"
                onClick={() => abrirMes(mesIso)}
                className="rounded-2xl border border-[#e8edf5] bg-[#fbfcfe] p-4 text-left transition hover:border-[#93b4f8] hover:bg-white"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-black text-[#0f172a]">{meses[indice]}</p>
                  {fechado && <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="Mês fechado" />}
                </div>
                <p className={`mt-3 text-lg font-black ${resultado < 0 ? "text-red-600" : "text-emerald-700"}`}>
                  {brl(resultado)}
                </p>
                <p className="mt-1 text-[11px] text-[#64748b]">
                  Entrou {brl(linha?.entradas_total || 0)} · saiu {brl(linha?.saidas_total || 0)}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-4 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2563eb]">Dia a dia</p>
            <h3 className="mt-1 text-xl font-black text-[#0f172a]">Tudo que vendeu, entrou e saiu</h3>
          </div>
          <p className="text-xs font-semibold text-[#64748b]">
            {formatDataBR(inicio)} a {formatDataBR(fim)}
          </p>
        </div>

        <div className="mt-5 space-y-3">
          {carregando ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm font-bold text-[#64748b]">
              <LoaderCircle className="h-5 w-5 animate-spin" /> Carregando movimentos…
            </div>
          ) : grupos.length === 0 ? (
            <div className="rounded-2xl bg-[#f8fafc] p-6 text-center text-sm text-[#64748b]">
              Nenhuma movimentação encontrada neste período.
            </div>
          ) : (
            grupos.map((grupo) => {
              const vendido = grupo.itens
                .filter((item) => item.natureza === "venda")
                .reduce((total, item) => total + item.valor, 0);
              const entradas = grupo.itens
                .filter((item) => item.natureza === "entrada")
                .reduce((total, item) => total + item.valor, 0);
              const saidas = grupo.itens
                .filter((item) => item.natureza === "saida")
                .reduce((total, item) => total + item.valor, 0);
              return (
                <details key={grupo.data} className="group overflow-hidden rounded-2xl border border-[#e8edf5]" open={grupos.length <= 7}>
                  <summary className="cursor-pointer list-none bg-[#f8fafc] p-4 [&::-webkit-details-marker]:hidden">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="font-black text-[#0f172a]">{formatDataBR(grupo.data)}</p>
                      <div className="grid grid-cols-3 gap-3 text-right text-xs">
                        <div><p className="text-[#94a3b8]">Vendido</p><p className="font-black text-[#0f172a]">{brl(vendido)}</p></div>
                        <div><p className="text-[#94a3b8]">Recebido</p><p className="font-black text-emerald-700">{brl(entradas)}</p></div>
                        <div><p className="text-[#94a3b8]">Pago</p><p className="font-black text-red-600">{brl(saidas)}</p></div>
                      </div>
                    </div>
                  </summary>
                  <div className="divide-y divide-[#eef2f7]">
                    {grupo.itens.map((movimento) => (
                      <div key={movimento.id} className="grid gap-2 p-4 sm:grid-cols-[115px_1fr_120px] sm:items-center">
                        <div>
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${
                            movimento.natureza === "entrada"
                              ? "bg-emerald-50 text-emerald-700"
                              : movimento.natureza === "saida"
                                ? "bg-red-50 text-red-700"
                                : "bg-blue-50 text-blue-700"
                          }`}>
                            {movimento.natureza === "venda" ? "Venda" : movimento.natureza === "entrada" ? "Entrada" : "Saída"}
                          </span>
                          <p className="mt-1 text-[11px] font-bold text-[#64748b]">{nomeTipoMovimento(movimento.tipo)}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-black text-[#0f172a]">{movimento.descricao}</p>
                          <p className="mt-1 break-words text-xs leading-5 text-[#64748b]">{movimento.detalhe || "Sem detalhe"} · {nomeFormaPagamento(movimento.forma_pagamento)}</p>
                        </div>
                        <p className={`text-left text-sm font-black sm:text-right ${
                          movimento.natureza === "saida" ? "text-red-600" : movimento.natureza === "entrada" ? "text-emerald-700" : "text-[#0f172a]"
                        }`}>
                          {movimento.natureza === "saida" ? "− " : movimento.natureza === "entrada" ? "+ " : ""}{brl(movimento.valor)}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })
          )}
        </div>
      </div>

      {fechamentos.length > 0 && (
        <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-4 sm:p-6">
          <h3 className="text-lg font-black text-[#0f172a]">Histórico de fechamentos</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {fechamentos.slice(0, 6).map((fechamento) => (
              <button
                key={fechamento.id}
                type="button"
                onClick={() => {
                  setPreset("personalizado");
                  setInicio(fechamento.periodo_inicio);
                  setFim(fechamento.periodo_fim);
                  setAno(Number(fechamento.periodo_inicio.slice(0, 4)));
                }}
                className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-left"
              >
                <div className="flex items-center gap-2 text-emerald-700"><CheckCircle2 className="h-4 w-4" /><span className="text-xs font-black uppercase">Fechado</span></div>
                <p className="mt-2 text-sm font-black text-[#0f172a]">{formatDataBR(fechamento.periodo_inicio)} a {formatDataBR(fechamento.periodo_fim)}</p>
                <p className="mt-1 text-xs text-[#64748b]">Resultado preservado: {brl(fechamento.resultado_caixa)}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ResumoCard({
  label,
  valor,
  detalhe,
  icon,
  positivo = false,
  resultado = false,
}: {
  label: string;
  valor: number;
  detalhe: string;
  icon: React.ReactElement;
  positivo?: boolean;
  resultado?: boolean;
}) {
  const corValor = resultado
    ? valor < 0
      ? "text-red-600"
      : "text-emerald-700"
    : positivo
      ? "text-emerald-700"
      : "text-[#0f172a]";
  return (
    <div className="min-w-0 rounded-2xl border border-[#e8edf5] bg-white p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[11px] font-black uppercase tracking-wide text-[#64748b]">{label}</p>
        <span className="shrink-0 text-[#2563eb] [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      </div>
      <p className={`mt-2 truncate text-base font-black sm:text-lg ${corValor}`}>{brl(valor)}</p>
      <p className="mt-1 truncate text-[10px] text-[#94a3b8]">{detalhe}</p>
    </div>
  );
}
