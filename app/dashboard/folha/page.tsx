"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Download,
  LockKeyhole,
  MessageCircle,
  ReceiptText,
  WalletCards,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { supabase } from "@/lib/supabase";
import { carregarConfigEmpresa } from "@/lib/empresa-config";
import { calcularAcerto, rotuloBaseComissao } from "@/lib/comissao-utils";
import { formatCurrency } from "@/lib/vendas-utils";
import { compartilharPdfWhatsApp } from "@/lib/whatsapp-utils";
import { FolhaSalarialPdf, ValePdf } from "@/components/pdf/relatorios-pdf";
import {
  distribuirValor,
  gerarDatasPagamentoMes,
  proximaCompetencia,
  type FrequenciaPagamento,
  type ParcelaAgenda,
} from "@/lib/agenda-pagamentos-utils";

type Funcionario = {
  id: string;
  nome: string;
  telefone: string | null;
  comissao_percentual: number | null;
  salario_fixo: number | null;
  comissao_base: "vendas_funcionario" | "faturamento_loja" | "lucro_loja" | null;
  frequencia_pagamento: FrequenciaPagamento | null;
  dia_pagamento: number | null;
  dia_pagamento_2: number | null;
  dia_semana_pagamento: number | null;
  ativo: boolean | null;
};

type Vale = {
  id: string;
  funcionario_id: string;
  valor: number;
  data: string;
  observacao: string | null;
  desconto_modo: string | null;
  desconto_parcelas: number | null;
};

type ValeDesconto = {
  id: string;
  vale_id: string;
  funcionario_id: string;
  competencia: string;
  parcela_pagamento: number;
  data_prevista: string;
  sequencia: number;
  total_divisoes: number;
  valor: number;
  status: string;
  pagamento_funcionario_id: string | null;
};

type Venda = {
  id: string;
  funcionario_id: string | null;
  total: number | null;
  status: string;
  created_at: string;
};

type Servico = {
  funcionario_id: string | null;
  valor: number;
  percentual_loja: number;
  data: string;
};

type Pagamento = {
  id: string;
  funcionario_id: string;
  periodo_inicio: string;
  periodo_fim: string;
  data_prevista: string | null;
  data_pagamento: string;
  parcela_numero: number;
  total_parcelas: number;
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

type ResumoFinanceiro = {
  vendas_contratadas: number;
  faturamento_recebido: number;
  despesas_previstas: number;
  resultado_projetado: number;
};

type AcertoMes = ReturnType<typeof calcularAcerto> & {
  comissaoFechada: boolean;
  competenciaOrigem?: string;
  percentualAplicado: number;
};

type ParcelaFolha = {
  agenda: ParcelaAgenda;
  salario: number;
  comissao: number;
  repasse: number;
  vales: number;
  liquidoBase: number;
  ajusteSaldo: number;
  liquido: number;
  ultima: boolean;
  registrado?: Pagamento;
  saldoTransportado: number;
};

const resumoVazio: ResumoFinanceiro = {
  vendas_contratadas: 0,
  faturamento_recebido: 0,
  despesas_previstas: 0,
  resultado_projetado: 0,
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
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function ultimoDiaMes(competencia: string) {
  const [ano, mes] = competencia.slice(0, 7).split("-").map(Number);
  const d = new Date(ano, mes, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function mesAnoPt(iso: string) {
  const data = new Date(`${iso.slice(0, 10)}T12:00:00`);
  const texto = data.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function dataBR(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function chaveParcela(funcionarioId: string, parcelaNumero: number) {
  return `${funcionarioId}-${parcelaNumero}`;
}

export default function FolhaPage() {
  const [competenciaMes, setCompetenciaMes] = useState(hojeISO().slice(0, 7));
  const competencia = `${competenciaMes}-01`;
  const periodoInicio = competencia;
  const periodoFim = ultimoDiaMes(competencia);
  const competenciaOrigem = proximaCompetencia(competencia, -1);

  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [vales, setVales] = useState<Vale[]>([]);
  const [descontosVale, setDescontosVale] = useState<ValeDesconto[]>([]);
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [comissoesFechadas, setComissoesFechadas] = useState<ComissaoFechada[]>([]);
  const [resumoFinanceiro, setResumoFinanceiro] = useState<ResumoFinanceiro>(resumoVazio);
  const [datasPagamento, setDatasPagamento] = useState<Record<string, string>>({});
  const [valoresPagamento, setValoresPagamento] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [nomeLoja, setNomeLoja] = useState("Nexo");

  async function carregar() {
    setLoading(true);
    setErro("");
    const cfg = await carregarConfigEmpresa();
    setNomeLoja(cfg.nome_operacao || "Nexo");

    await supabase.rpc("gerar_vales_recorrentes", { p_competencia: competencia });

    const [
      funcRes,
      valesRes,
      descontosRes,
      vendasRes,
      servicosRes,
      pagamentosRes,
      comissoesRes,
      resumoRes,
    ] = await Promise.all([
      supabase
        .from("funcionarios")
        .select(
          "id, nome, telefone, comissao_percentual, salario_fixo, comissao_base, frequencia_pagamento, dia_pagamento, dia_pagamento_2, dia_semana_pagamento, ativo"
        )
        .order("nome"),
      supabase
        .from("vales")
        .select(
          "id, funcionario_id, valor, data, observacao, desconto_modo, desconto_parcelas"
        )
        .order("data", { ascending: false }),
      supabase
        .from("vale_descontos")
        .select(
          "id, vale_id, funcionario_id, competencia, parcela_pagamento, data_prevista, sequencia, total_divisoes, valor, status, pagamento_funcionario_id"
        )
        .order("data_prevista", { ascending: true }),
      supabase.from("vendas").select("id, funcionario_id, total, status, created_at"),
      supabase
        .from("atendimentos_servico")
        .select("funcionario_id, valor, percentual_loja, data"),
      supabase
        .from("pagamentos_funcionario")
        .select(
          "id, funcionario_id, periodo_inicio, periodo_fim, data_prevista, data_pagamento, parcela_numero, total_parcelas, valor_liquido"
        )
        .order("data_pagamento", { ascending: false }),
      supabase
        .from("comissoes_fechadas")
        .select(
          "id, funcionario_id, competencia_origem, competencia_pagamento, base_valor, percentual, valor"
        )
        .order("competencia_origem", { ascending: false }),
      supabase.rpc("resumo_financeiro_mes", { p_competencia: competencia }),
    ]);

    const primeiroErro =
      funcRes.error ||
      valesRes.error ||
      descontosRes.error ||
      vendasRes.error ||
      servicosRes.error ||
      pagamentosRes.error ||
      comissoesRes.error ||
      resumoRes.error;

    if (primeiroErro) setErro(primeiroErro.message);

    setFuncionarios((funcRes.data as Funcionario[] | null) || []);
    setVales((valesRes.data as Vale[] | null) || []);
    setDescontosVale((descontosRes.data as ValeDesconto[] | null) || []);
    setVendas((vendasRes.data as Venda[] | null) || []);
    setServicos((servicosRes.data as Servico[] | null) || []);
    setPagamentos((pagamentosRes.data as Pagamento[] | null) || []);
    setComissoesFechadas((comissoesRes.data as ComissaoFechada[] | null) || []);
    const resumoLinha = Array.isArray(resumoRes.data) ? resumoRes.data[0] : resumoRes.data;
    setResumoFinanceiro({
      vendas_contratadas: Number(resumoLinha?.vendas_contratadas || 0),
      faturamento_recebido: Number(resumoLinha?.faturamento_recebido || 0),
      despesas_previstas: Number(resumoLinha?.despesas_previstas || 0),
      resultado_projetado: Number(resumoLinha?.resultado_projetado || 0),
    });
    setLoading(false);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competenciaMes]);

  const dentroCompetencia = (dataISO: string) =>
    dataISO.slice(0, 10) >= periodoInicio && dataISO.slice(0, 10) <= periodoFim;

  const vendaNoMes = (venda: { created_at: string }) =>
    dentroCompetencia((venda.created_at || "").slice(0, 10));

  const acertosMes = useMemo(() => {
    const resultadoUnificado = {
      faturamento: Number(resumoFinanceiro.vendas_contratadas || 0),
      lucro: Number(resumoFinanceiro.resultado_projetado || 0),
    };

    return funcionarios.map((funcionario) => {
      const calculado = calcularAcerto(
        funcionario,
        { vendas, servicos, vales: [], resultadoLoja: resultadoUnificado },
        { vendaNoPeriodo: vendaNoMes, dataNoPeriodo: dentroCompetencia }
      );
      const snapshot = comissoesFechadas.find(
        (item) =>
          item.funcionario_id === funcionario.id &&
          item.competencia_pagamento === competencia
      );

      if (funcionario.comissao_base === "lucro_loja") {
        const acerto: AcertoMes = {
          ...calculado,
          baseComissao: Number(snapshot?.base_valor || 0),
          comissao: Number(snapshot?.valor || 0),
          aPagar:
            calculado.salario + calculado.repasse + Number(snapshot?.valor || 0),
          comissaoFechada: Boolean(snapshot),
          competenciaOrigem: snapshot?.competencia_origem || competenciaOrigem,
          percentualAplicado: Number(
            snapshot?.percentual ?? funcionario.comissao_percentual ?? 0
          ),
        };
        return { funcionario, acerto };
      }

      const acerto: AcertoMes = {
        ...calculado,
        aPagar: calculado.salario + calculado.comissao + calculado.repasse,
        comissaoFechada: true,
        percentualAplicado: Number(funcionario.comissao_percentual || 0),
      };
      return { funcionario, acerto };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    funcionarios,
    vendas,
    servicos,
    resumoFinanceiro,
    comissoesFechadas,
    competenciaMes,
  ]);

  const possuiComissaoLucro = funcionarios.some(
    (f) =>
      f.ativo !== false &&
      f.comissao_base === "lucro_loja" &&
      Number(f.comissao_percentual || 0) > 0
  );
  const origemJaFechada = comissoesFechadas.some(
    (item) => item.competencia_origem === competenciaOrigem
  );

  function descontosDaParcela(funcionarioId: string, parcelaNumero: number) {
    return descontosVale.filter(
      (d) =>
        d.funcionario_id === funcionarioId &&
        d.competencia === competencia &&
        Number(d.parcela_pagamento) === Number(parcelaNumero) &&
        d.status !== "cancelado"
    );
  }

  function pagamentoRegistrado(funcionarioId: string, parcelaNumero: number) {
    return pagamentos.find(
      (p) =>
        p.funcionario_id === funcionarioId &&
        p.periodo_inicio === periodoInicio &&
        p.periodo_fim === periodoFim &&
        Number(p.parcela_numero || 1) === Number(parcelaNumero)
    );
  }

  function montarParcelas(funcionario: Funcionario, acerto: AcertoMes): ParcelaFolha[] {
    const agenda = gerarDatasPagamentoMes(funcionario, competencia);
    const salarios = distribuirValor(Number(acerto.salario || 0), agenda.length);
    const bonificacoes = distribuirValor(Number(acerto.comissao || 0), agenda.length);
    let saldoTransportado = 0;

    return agenda.map((item, indice) => {
      const ultima = indice === agenda.length - 1;
      const comissao = Number(bonificacoes[indice] || 0);
      const repasse = ultima ? Number(acerto.repasse || 0) : 0;
      const vales = descontosDaParcela(funcionario.id, item.parcela_numero).reduce(
        (s, d) => s + Number(d.valor || 0),
        0
      );
      const salario = Number(salarios[indice] || 0);
      const liquidoBase = salario + comissao + repasse - vales;
      const ajusteSaldo = saldoTransportado;
      const devidoComSaldo = Math.max(0, liquidoBase + ajusteSaldo);
      const registrado = pagamentoRegistrado(funcionario.id, item.parcela_numero);

      if (registrado) {
        const valorPago = Number(registrado.valor_liquido || 0);
        saldoTransportado = devidoComSaldo - valorPago;
        return {
          agenda: item,
          salario,
          comissao,
          repasse,
          vales,
          liquidoBase,
          ajusteSaldo,
          liquido: valorPago,
          ultima,
          registrado,
          saldoTransportado,
        };
      }

      saldoTransportado = 0;
      return {
        agenda: item,
        salario,
        comissao,
        repasse,
        vales,
        liquidoBase,
        ajusteSaldo,
        liquido: devidoComSaldo,
        ultima,
        saldoTransportado: 0,
      };
    });
  }

  function podeProcessarComissao(
    funcionario: Funcionario,
    acerto: AcertoMes,
    parcela: ParcelaFolha
  ) {
    if (
      funcionario.comissao_base === "lucro_loja" &&
      !acerto.comissaoFechada
    ) {
      setErro(
        `Feche primeiro a bonificação de ${mesAnoPt(
          competenciaOrigem
        )} antes de registrar pagamentos de ${mesAnoPt(competencia)}.`
      );
      return false;
    }
    return true;
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
          ? `Bonificação de ${mesAnoPt(
              competenciaOrigem
            )} fechada e distribuída nos pagamentos de ${mesAnoPt(competencia)}.`
          : `A bonificação de ${mesAnoPt(
              competenciaOrigem
            )} já estava fechada ou não há funcionário configurado nessa base.`
      );
    }
    setProcessando(null);
    await carregar();
  }

  async function blobFolha(
    funcionario: Funcionario,
    acerto: AcertoMes,
    parcela: ParcelaFolha,
    dataPagamento: string
  ) {
    const { pdf } = await import("@react-pdf/renderer");

    let salarioPdf = parcela.salario + Math.max(0, parcela.ajusteSaldo);
    let descontoAjuste = Math.max(0, -parcela.ajusteSaldo);
    const natural =
      salarioPdf + parcela.comissao + parcela.repasse - parcela.vales - descontoAjuste;

    if (parcela.registrado) {
      const diferenca = natural - parcela.liquido;
      if (diferenca > 0) descontoAjuste += diferenca;
      if (diferenca < 0) salarioPdf += Math.abs(diferenca);
    }

    const documento = (
      <FolhaSalarialPdf
        loja={nomeLoja}
        funcionario={funcionario.nome}
        referencia={`${mesAnoPt(competencia)} · pagamento ${parcela.agenda.parcela_numero}/${parcela.agenda.total_parcelas}`}
        periodoInicio={periodoInicio}
        periodoFim={periodoFim}
        salarioBase={salarioPdf}
        comissao={parcela.comissao}
        qtdVendas={parcela.ultima ? acerto.qtdVendas : 0}
        totalVendido={parcela.ultima ? acerto.vendido : 0}
        comissaoPct={parcela.ultima ? acerto.percentualAplicado : 0}
        repasseServicos={parcela.repasse}
        vales={parcela.vales}
        outrosDescontos={descontoAjuste}
        outrosDescontosLabel="Ajuste / saldo de pagamento anterior"
        comissaoBaseLabel={rotuloBaseComissao(acerto.baseTipo)}
        baseComissaoValor={parcela.ultima ? acerto.baseComissao : 0}
        dataPagamento={dataPagamento}
      />
    );
    return pdf(documento as Parameters<typeof pdf>[0]).toBlob();
  }

  async function blobVale(vale: Vale, funcionario: Funcionario) {
    const { pdf } = await import("@react-pdf/renderer");
    const documento = (
      <ValePdf
        loja={nomeLoja}
        funcionario={funcionario.nome}
        valor={Number(vale.valor || 0)}
        data={vale.data}
        motivo={vale.observacao || undefined}
        descontarEmFolha
      />
    );
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

  async function gerarFolha(
    funcionario: Funcionario,
    acerto: AcertoMes,
    parcela: ParcelaFolha,
    compartilhar: boolean
  ) {
    setErro("");
    setSucesso("");
    if (!podeProcessarComissao(funcionario, acerto, parcela)) return;

    const chave = chaveParcela(funcionario.id, parcela.agenda.parcela_numero);
    const dataPagamento =
      datasPagamento[chave] ||
      parcela.registrado?.data_pagamento ||
      parcela.agenda.data_pagamento;
    setProcessando(`folha-${chave}`);

    try {
      const blob = await blobFolha(funcionario, acerto, parcela, dataPagamento);
      const nome = `folha-${slug(funcionario.nome)}-${competenciaMes}-${parcela.agenda.parcela_numero}de${parcela.agenda.total_parcelas}.pdf`;
      if (compartilhar) {
        if (!funcionario.telefone) {
          throw new Error("Cadastre o WhatsApp do funcionário para compartilhar.");
        }
        const mensagem = `Olá, ${funcionario.nome}! 👋\n\nSegue o seu comprovante da ${nomeLoja}, pagamento ${parcela.agenda.parcela_numero}/${parcela.agenda.total_parcelas} de ${mesAnoPt(competencia)}. 📄✅\n\nValor: ${formatCurrency(Math.max(0, parcela.liquido))}.\nData: ${dataBR(dataPagamento)}.`;
        await compartilharPdfWhatsApp({
          blob,
          nomeArquivo: nome,
          telefone: funcionario.telefone,
          mensagem,
        });
      } else {
        baixar(blob, nome);
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível gerar o PDF da folha.");
    } finally {
      setProcessando(null);
    }
  }

  async function registrarPagamento(
    funcionario: Funcionario,
    acerto: AcertoMes,
    parcela: ParcelaFolha
  ) {
    setErro("");
    setSucesso("");
    if (!podeProcessarComissao(funcionario, acerto, parcela)) return;

    const chave = chaveParcela(funcionario.id, parcela.agenda.parcela_numero);
    const dataPagamento =
      datasPagamento[chave] ||
      parcela.registrado?.data_pagamento ||
      parcela.agenda.data_pagamento;
    const valorDigitado =
      valoresPagamento[chave] ?? String(parcela.registrado?.valor_liquido ?? parcela.liquido);
    const valorReal = Number(String(valorDigitado).replace(",", "."));

    if (!Number.isFinite(valorReal) || valorReal < 0) {
      setErro("Informe um valor realmente pago válido.");
      return;
    }

    setProcessando(`pag-${chave}`);
    const { error } = await supabase.rpc("registrar_pagamento_funcionario_parcela", {
      p_funcionario_id: funcionario.id,
      p_competencia: competencia,
      p_data_prevista: parcela.agenda.data_pagamento,
      p_parcela_numero: parcela.agenda.parcela_numero,
      p_total_parcelas: parcela.agenda.total_parcelas,
      p_data_pagamento: dataPagamento,
      p_valor_liquido: valorReal,
      p_observacao: `Pagamento ${parcela.agenda.parcela_numero}/${parcela.agenda.total_parcelas} · ${funcionario.frequencia_pagamento || "mensal"}`,
    });

    if (error) {
      setErro(error.message);
    } else {
      setSucesso(
        `${funcionario.nome}: ${formatCurrency(valorReal)} registrados no pagamento ${parcela.agenda.parcela_numero}/${parcela.agenda.total_parcelas} em ${dataBR(dataPagamento)}.`
      );
      setValoresPagamento((atual) => {
        const proximo = { ...atual };
        delete proximo[chave];
        return proximo;
      });
    }
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
        if (!funcionario.telefone) {
          throw new Error("Cadastre o WhatsApp do funcionário para compartilhar.");
        }
        const plano = descontosVale
          .filter((d) => d.vale_id === vale.id && d.status !== "cancelado")
          .map(
            (d) => `${dataBR(d.data_prevista)} (${formatCurrency(Number(d.valor || 0))})`
          )
          .join(", ");
        const mensagem = `Olá, ${funcionario.nome}! 👋\n\nSegue o comprovante do seu vale/adiantamento da ${nomeLoja}. 📄\nValor: ${formatCurrency(Number(vale.valor || 0))}\nData: ${dataBR(vale.data)}.${plano ? `\nDesconto programado: ${plano}.` : ""}`;
        await compartilharPdfWhatsApp({
          blob,
          nomeArquivo: nome,
          telefone: funcionario.telefone,
          mensagem,
        });
      } else {
        baixar(blob, nome);
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível gerar o PDF do vale.");
    } finally {
      setProcessando(null);
    }
  }

  const descontosCompetencia = descontosVale.filter(
    (d) => d.competencia === competencia && d.status !== "cancelado"
  );
  const valesCompetencia = descontosCompetencia.reduce(
    (s, d) => s + Number(d.valor || 0),
    0
  );
  const pagamentosCompetencia = pagamentos.filter(
    (p) => p.periodo_inicio === periodoInicio && p.periodo_fim === periodoFim
  );

  const totalFolhaMes = useMemo(
    () =>
      acertosMes
        .filter(({ funcionario }) => funcionario.ativo !== false)
        .reduce(
          (total, { funcionario, acerto }) =>
            total + montarParcelas(funcionario, acerto).reduce((s, p) => s + p.liquido, 0),
          0
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [acertosMes, descontosVale, pagamentos, competenciaMes]
  );

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Equipe e folha"
        title="Folha e pagamentos"
        description="Pagamentos reais, vales e comissão mensal usando a mesma base do Financeiro."
      />

      {erro && (
        <div className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-4 text-sm text-[#b91c1c]">
          {erro}
        </div>
      )}
      {sucesso && (
        <div className="rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] p-4 text-sm text-[#15803d]">
          {sucesso}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-[26px] border border-[#dbeafe] bg-[#eff6ff] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <CalendarDays className="mt-0.5 h-5 w-5 text-[#2563eb]" />
          <div>
            <p className="font-black text-[#1e3a8a]">Competência da folha</p>
            <p className="mt-1 text-sm text-[#475569]">
              Mensal = 1 pagamento · Quinzenal = 2 · Semanal = todas as datas configuradas.
            </p>
          </div>
        </div>
        <input
          type="month"
          value={competenciaMes}
          onChange={(e) => setCompetenciaMes(e.target.value)}
          className="rounded-xl border border-[#bfdbfe] bg-white px-3 py-2.5 text-sm font-bold text-[#1e40af] outline-none"
        />
      </div>

      {possuiComissaoLucro && (
        <div
          className={`rounded-[26px] border p-5 ${
            origemJaFechada
              ? "border-[#bbf7d0] bg-[#f0fdf4]"
              : "border-[#fde68a] bg-[#fffbeb]"
          }`}
        >
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl ${
                  origemJaFechada
                    ? "bg-[#dcfce7] text-[#15803d]"
                    : "bg-[#fef3c7] text-[#b45309]"
                }`}
              >
                <LockKeyhole className="h-5 w-5" />
              </span>
              <div>
                <p
                  className={
                    origemJaFechada ? "font-black text-[#166534]" : "font-black text-[#92400e]"
                  }
                >
                  Bonificação mensal: {mesAnoPt(competenciaOrigem)} → {mesAnoPt(competencia)}
                </p>
                <p
                  className={`mt-1 text-sm ${
                    origemJaFechada ? "text-[#15803d]" : "text-[#a16207]"
                  }`}
                >
                  {origemJaFechada
                    ? "Fechamento concluído. A bonificação ficou congelada e é dividida entre os pagamentos desta competência."
                    : "O valor oficial nasce no fechamento do mês anterior e depois é dividido junto com o salário do mês seguinte."}
                </p>
              </div>
            </div>
            {!origemJaFechada && (
              <button
                type="button"
                onClick={fecharMesAnterior}
                disabled={!!processando}
                className="rounded-xl bg-[#b45309] px-4 py-2.5 text-sm font-black text-white hover:bg-[#92400e] disabled:opacity-50"
              >
                {processando === "fechamento-comissao"
                  ? "Fechando..."
                  : `Fechar ${mesAnoPt(competenciaOrigem)}`}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[26px] border border-[#e8ecf4] bg-white p-5">
          <p className="text-sm font-bold text-[#475569]">Folha do mês</p>
          <p className="mt-3 text-2xl font-black text-[#0f172a]">
            {formatCurrency(totalFolhaMes)}
          </p>
          <p className="mt-1 text-xs text-[#94a3b8]">Pago + valores que ainda faltam.</p>
        </div>
        <div className="rounded-[26px] border border-[#e8ecf4] bg-white p-5">
          <p className="text-sm font-bold text-[#475569]">Vales programados</p>
          <p className="mt-3 text-2xl font-black text-[#0f172a]">
            {formatCurrency(valesCompetencia)}
          </p>
          <p className="mt-1 text-xs text-[#94a3b8]">Descontados nas parcelas escolhidas.</p>
        </div>
        <div className="rounded-[26px] border border-[#e8ecf4] bg-white p-5">
          <p className="text-sm font-bold text-[#475569]">Pagamentos registrados</p>
          <p className="mt-3 text-2xl font-black text-[#0f172a]">
            {pagamentosCompetencia.length}
          </p>
          <p className="mt-1 text-xs text-[#94a3b8]">Registros efetivamente pagos no mês.</p>
        </div>
      </div>

      <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
        <div className="flex items-center gap-3">
          <ReceiptText className="h-5 w-5 text-[#2563eb]" />
          <div>
            <h2 className="text-xl font-black text-[#0f172a]">
              Pagamentos de {mesAnoPt(competencia)}
            </h2>
            <p className="text-sm text-[#64748b]">
              Informe o valor realmente pago. Se for diferente do previsto, a diferença passa para o próximo pagamento.
            </p>
          </div>
        </div>

        {loading ? (
          <p className="mt-5 text-sm text-[#64748b]">Carregando...</p>
        ) : funcionarios.filter((f) => f.ativo !== false).length === 0 ? (
          <p className="mt-5 text-sm text-[#64748b]">Nenhum funcionário ativo.</p>
        ) : (
          <div className="mt-6 space-y-6">
            {acertosMes
              .filter(({ funcionario }) => funcionario.ativo !== false)
              .map(({ funcionario, acerto }) => {
                const parcelas = montarParcelas(funcionario, acerto);
                const pagoMes = parcelas
                  .filter((p) => p.registrado)
                  .reduce((s, p) => s + p.liquido, 0);
                const restanteMes = parcelas
                  .filter((p) => !p.registrado)
                  .reduce((s, p) => s + p.liquido, 0);

                return (
                  <div
                    key={funcionario.id}
                    className="rounded-[26px] border border-[#e8ecf4] bg-[#f8fafc]/70 p-5"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-lg font-black text-[#0f172a]">{funcionario.nome}</p>
                        <p className="mt-1 text-sm text-[#64748b]">
                          {funcionario.frequencia_pagamento === "quinzenal"
                            ? "Quinzenal"
                            : funcionario.frequencia_pagamento === "semanal"
                              ? "Semanal"
                              : "Mensal"}
                          {" · "}
                          {Number(acerto.percentualAplicado || 0)}% sobre {rotuloBaseComissao(acerto.baseTipo)}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-right">
                        <div className="rounded-xl bg-white px-3 py-2">
                          <p className="text-[10px] font-bold uppercase text-[#94a3b8]">Já pago</p>
                          <p className="mt-1 font-black text-[#15803d]">{formatCurrency(pagoMes)}</p>
                        </div>
                        <div className="rounded-xl bg-white px-3 py-2">
                          <p className="text-[10px] font-bold uppercase text-[#94a3b8]">Ainda falta</p>
                          <p className="mt-1 font-black text-[#1d4ed8]">{formatCurrency(restanteMes)}</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 xl:grid-cols-2">
                      {parcelas.map((parcela) => {
                        const chave = chaveParcela(
                          funcionario.id,
                          parcela.agenda.parcela_numero
                        );
                        const descontos = descontosDaParcela(
                          funcionario.id,
                          parcela.agenda.parcela_numero
                        );
                        const registrado = parcela.registrado;
                        const valorCampo =
                          valoresPagamento[chave] ??
                          String(
                            Number(registrado?.valor_liquido ?? parcela.liquido).toFixed(2)
                          );

                        return (
                          <div
                            key={chave}
                            className="rounded-2xl border border-[#e8ecf4] bg-white p-4"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="font-black text-[#0f172a]">
                                  {dataBR(parcela.agenda.data_pagamento)} · pagamento {parcela.agenda.parcela_numero}/{parcela.agenda.total_parcelas}
                                </p>
                                <p className="mt-1 text-xs text-[#64748b]">Data prevista</p>
                              </div>
                              {registrado ? (
                                <span className="rounded-full border border-[#bbf7d0] bg-[#f0fdf4] px-2.5 py-1 text-[11px] font-bold text-[#15803d]">
                                  pago {formatCurrency(parcela.liquido)} em {dataBR(registrado.data_pagamento)}
                                </span>
                              ) : (
                                <span className="rounded-full border border-[#fed7aa] bg-[#fff7ed] px-2.5 py-1 text-[11px] font-bold text-[#c2410c]">
                                  pendente
                                </span>
                              )}
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                              <p className="text-[#64748b]">
                                Salário: <strong className="text-[#0f172a]">{formatCurrency(parcela.salario)}</strong>
                              </p>
                              <p className="text-[#64748b]">
                                {funcionario.comissao_base === "lucro_loja" ? "Bonificação" : "Comissão"}: <strong className="text-[#15803d]">{formatCurrency(parcela.comissao)}</strong>
                              </p>
                              <p className="text-[#64748b]">
                                Serviços: <strong className="text-[#15803d]">{formatCurrency(parcela.repasse)}</strong>
                              </p>
                              <p className="text-[#64748b]">
                                Vales: <strong className="text-[#b45309]">− {formatCurrency(parcela.vales)}</strong>
                              </p>
                            </div>

                            {Math.abs(parcela.ajusteSaldo) > 0.009 && (
                              <div className="mt-3 rounded-xl border border-[#bfdbfe] bg-[#eff6ff] p-3 text-xs text-[#1e40af]">
                                Ajuste trazido do pagamento anterior: <strong>{parcela.ajusteSaldo > 0 ? "+" : "−"}{formatCurrency(Math.abs(parcela.ajusteSaldo))}</strong>.
                              </div>
                            )}

                            {registrado && Math.abs(parcela.saldoTransportado) > 0.009 && (
                              <div className="mt-3 rounded-xl border border-[#fde68a] bg-[#fffbeb] p-3 text-xs text-[#92400e]">
                                {parcela.saldoTransportado > 0
                                  ? `${formatCurrency(parcela.saldoTransportado)} ficaram pendentes e foram levados para o próximo pagamento.`
                                  : `${formatCurrency(Math.abs(parcela.saldoTransportado))} foram pagos a mais e serão compensados no próximo pagamento.`}
                              </div>
                            )}

                            {descontos.length > 0 && (
                              <div className="mt-3 rounded-xl border border-[#fde68a] bg-[#fffbeb] p-3">
                                <p className="text-xs font-black uppercase tracking-wide text-[#92400e]">
                                  Descontos de vale
                                </p>
                                <div className="mt-2 space-y-1">
                                  {descontos.map((d) => (
                                    <p key={d.id} className="text-xs text-[#a16207]">
                                      {d.total_divisoes > 1
                                        ? `${d.sequencia}/${d.total_divisoes} · `
                                        : ""}
                                      {formatCurrency(Number(d.valor || 0))} · {d.status === "aplicado" ? "aplicado" : "pendente"}
                                    </p>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="mt-4 rounded-xl bg-[#eff6ff] p-3">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-sm font-bold text-[#1e40af]">
                                  Valor previsto nesta parcela
                                </span>
                                <strong className="text-lg text-[#1d4ed8]">
                                  {formatCurrency(Math.max(0, registrado ? parcela.liquido : parcela.liquido))}
                                </strong>
                              </div>
                            </div>

                            <div className="mt-4 grid gap-2 sm:grid-cols-2">
                              <div>
                                <label className="mb-1 block text-[11px] font-bold text-[#64748b]">
                                  Data do pagamento
                                </label>
                                <input
                                  type="date"
                                  value={
                                    datasPagamento[chave] ||
                                    registrado?.data_pagamento ||
                                    parcela.agenda.data_pagamento
                                  }
                                  onChange={(e) =>
                                    setDatasPagamento((atual) => ({
                                      ...atual,
                                      [chave]: e.target.value,
                                    }))
                                  }
                                  className="w-full rounded-xl border border-[#e8ecf4] bg-white px-3 py-2 text-sm"
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-[11px] font-bold text-[#64748b]">
                                  Valor realmente pago
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={valorCampo}
                                  onChange={(e) =>
                                    setValoresPagamento((atual) => ({
                                      ...atual,
                                      [chave]: e.target.value,
                                    }))
                                  }
                                  className="w-full rounded-xl border border-[#e8ecf4] bg-white px-3 py-2 text-sm font-bold text-[#0f172a]"
                                />
                              </div>
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => registrarPagamento(funcionario, acerto, parcela)}
                                disabled={!!processando}
                                className="rounded-xl bg-[#2563eb] px-3 py-2 text-xs font-black text-white disabled:opacity-40"
                              >
                                {registrado ? "Atualizar pagamento" : "Registrar pagamento"}
                              </button>
                              <button
                                type="button"
                                onClick={() => gerarFolha(funcionario, acerto, parcela, false)}
                                disabled={!!processando}
                                className="flex items-center gap-1.5 rounded-xl border border-[#dbeafe] bg-white px-3 py-2 text-xs font-black text-[#1d4ed8] disabled:opacity-40"
                              >
                                <Download className="h-4 w-4" /> PDF
                              </button>
                              <button
                                type="button"
                                onClick={() => gerarFolha(funcionario, acerto, parcela, true)}
                                disabled={!!processando}
                                className="flex items-center gap-1.5 rounded-xl border border-[#bbf7d0] bg-white px-3 py-2 text-xs font-black text-[#15803d] disabled:opacity-40"
                              >
                                <MessageCircle className="h-4 w-4" /> WhatsApp
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
        <div className="flex items-center gap-3">
          <WalletCards className="h-5 w-5 text-[#b45309]" />
          <div>
            <h2 className="text-xl font-black text-[#0f172a]">Vales e plano de desconto</h2>
            <p className="text-sm text-[#64748b]">
              Confira em qual pagamento cada vale será descontado.
            </p>
          </div>
        </div>

        {vales.length === 0 ? (
          <p className="mt-5 text-sm text-[#64748b]">Nenhum vale registrado.</p>
        ) : (
          <div className="mt-5 space-y-3">
            {vales.slice(0, 30).map((vale) => {
              const funcionario = funcionarios.find((f) => f.id === vale.funcionario_id);
              if (!funcionario) return null;
              const plano = descontosVale.filter(
                (d) => d.vale_id === vale.id && d.status !== "cancelado"
              );
              return (
                <div
                  key={vale.id}
                  className="flex flex-col gap-3 rounded-2xl border border-[#fde68a] bg-[#fffbeb] p-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div>
                    <p className="font-black text-[#92400e]">
                      {funcionario.nome} · {formatCurrency(Number(vale.valor || 0))}
                    </p>
                    <p className="mt-1 text-sm text-[#a16207]">
                      Emitido em {dataBR(vale.data)}
                      {vale.observacao ? ` · ${vale.observacao}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {plano.length === 0 ? (
                        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-[#a16207]">
                          legado · sem plano novo
                        </span>
                      ) : (
                        plano.map((d) => (
                          <span
                            key={d.id}
                            className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-[#92400e]"
                          >
                            {dataBR(d.data_prevista)} · {formatCurrency(Number(d.valor || 0))}
                            {d.total_divisoes > 1
                              ? ` · ${d.sequencia}/${d.total_divisoes}`
                              : ""}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => gerarVale(vale, funcionario, false)}
                      disabled={!!processando}
                      className="flex items-center gap-1.5 rounded-xl border border-[#fde68a] bg-white px-3 py-2 text-xs font-black text-[#92400e]"
                    >
                      <Download className="h-4 w-4" /> PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => gerarVale(vale, funcionario, true)}
                      disabled={!!processando}
                      className="flex items-center gap-1.5 rounded-xl bg-[#16a34a] px-3 py-2 text-xs font-black text-white"
                    >
                      <MessageCircle className="h-4 w-4" /> WhatsApp
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
