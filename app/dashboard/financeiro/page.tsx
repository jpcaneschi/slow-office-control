"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  Clock3,
  Landmark,
  ReceiptText,
  WalletCards,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/dashboard/page-header";
import { usePeriod, isoToDate } from "@/components/dashboard/period-context";
import { hojeISO } from "@/lib/datas";
import { carregarNomesResponsaveis } from "@/lib/responsaveis";

type Venda = {
  id: string;
  created_at: string;
  total: number;
  status: string | null;
};

type ItemVenda = {
  venda_id: string;
  produto_id: string;
  variacao_id: string | null;
  quantidade: number;
  custo_unitario: number | null;
};

type Produto = { id: string; custo: number };
type Variacao = { id: string; custo: number | null };

type Despesa = {
  id: string;
  despesa_recorrente_id: string | null;
  competencia: string | null;
  descricao: string;
  categoria: string;
  valor: number;
  data: string;
  responsavel: string | null;
  observacao: string | null;
};

type Recorrente = {
  id: string;
  descricao: string;
  categoria: string;
  valor: number;
  dia_vencimento: number;
  ativo: boolean;
};

type Funcionario = {
  id: string;
  nome: string;
  salario_fixo: number;
  frequencia_pagamento: "mensal" | "quinzenal" | "semanal";
  ativo: boolean | null;
};

type Pagamento = {
  id: string;
  funcionario_id: string;
  periodo_inicio: string;
  periodo_fim: string;
  data_pagamento: string;
  data_prevista: string | null;
  valor_liquido: number;
  parcela_numero: number;
  total_parcelas: number;
};

type AgendaPagamento = {
  competencia: string;
  data_pagamento: string;
  parcela_numero: number;
  total_parcelas: number;
};

type Vale = {
  id: string;
  funcionario_id: string;
  valor: number;
  data: string;
};

type ValeDesconto = {
  id: string;
  funcionario_id: string;
  competencia: string;
  parcela_pagamento: number;
  data_prevista: string;
  valor: number;
  status: string;
};

type ComissaoFechada = {
  funcionario_id: string;
  competencia_pagamento: string;
  valor: number;
};

type Servico = {
  funcionario_id: string | null;
  valor: number;
  percentual_loja: number;
  data: string;
};

type TatuagemLegado = {
  valor: number | null;
  percentual: number | null;
  data: string | null;
};

type ContaRecorrenteMes = {
  id: string;
  descricao: string;
  categoria: string;
  dataPrevista: string;
  valorPrevisto: number;
  pago: boolean;
  dataPagamento?: string;
  valorPago?: number;
};

type ParcelaEquipe = {
  id: string;
  funcionarioId: string;
  funcionario: string;
  dataPrevista: string;
  parcela: number;
  totalParcelas: number;
  valor: number;
  valorBase: number;
  vales: number;
  pago: boolean;
  dataPagamento?: string;
  valorPago?: number;
  ajusteSaldo: number;
};

const categorias = [
  "Aluguel",
  "Energia / Água",
  "Telefone / Internet",
  "Fornecedor",
  "Compra de mercadoria",
  "Marketing",
  "Transporte",
  "Embalagem",
  "Sistema",
  "Imposto",
  "Funcionário",
  "Outros",
];

const inputCls =
  "w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-sm text-[#0f172a] outline-none focus:border-[#2563eb] focus:bg-white";

function brl(valor: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(valor || 0));
}

function dataBR(iso: string) {
  if (!iso) return "—";
  return iso.slice(0, 10).split("-").reverse().join("/");
}

function ultimoDiaMes(competencia: string) {
  const [ano, mes] = competencia.slice(0, 7).split("-").map(Number);
  const d = new Date(ano, mes, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function dataVencimento(competencia: string, dia: number) {
  const [ano, mes] = competencia.slice(0, 7).split("-").map(Number);
  const ultimo = new Date(ano, mes, 0).getDate();
  return `${ano}-${String(mes).padStart(2, "0")}-${String(
    Math.min(ultimo, Math.max(1, Number(dia || 1)))
  ).padStart(2, "0")}`;
}

function distribuir(valor: number, quantidade: number) {
  const n = Math.max(1, quantidade);
  const centavos = Math.round(Number(valor || 0) * 100);
  const base = Math.floor(centavos / n);
  const resto = centavos - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i === n - 1 ? resto : 0)) / 100);
}

function ehCompraEstoque(d: Despesa) {
  const categoria = (d.categoria || "").toLowerCase();
  const descricao = (d.descricao || "").toLowerCase();
  return categoria.includes("mercadoria") || descricao.includes("compra de mercadoria");
}

export default function FinanceiroPage() {
  const { period } = usePeriod();
  const competencia = `${period.inicio.slice(0, 7)}-01`;
  const competenciaFim = ultimoDiaMes(competencia);
  const competenciaPrefix = competencia.slice(0, 7);

  const [vendas, setVendas] = useState<Venda[]>([]);
  const [itens, setItens] = useState<ItemVenda[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [variacoes, setVariacoes] = useState<Variacao[]>([]);
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [recorrentes, setRecorrentes] = useState<Recorrente[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [vales, setVales] = useState<Vale[]>([]);
  const [descontosVale, setDescontosVale] = useState<ValeDesconto[]>([]);
  const [comissoes, setComissoes] = useState<ComissaoFechada[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [tatuagemLegado, setTatuagemLegado] = useState<TatuagemLegado[]>([]);
  const [agendaFolha, setAgendaFolha] = useState<Record<string, AgendaPagamento[]>>({});
  const [responsaveis, setResponsaveis] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [detalhes, setDetalhes] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [processandoConta, setProcessandoConta] = useState<string | null>(null);

  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState("Outros");
  const [valor, setValor] = useState("");
  const [data, setData] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [observacao, setObservacao] = useState("");

  const [rDescricao, setRDescricao] = useState("");
  const [rCategoria, setRCategoria] = useState("Aluguel");
  const [rValor, setRValor] = useState("");
  const [rDia, setRDia] = useState("5");

  const janela = useMemo(() => {
    const ini = isoToDate(period.inicio);
    ini.setHours(0, 0, 0, 0);
    const fim = isoToDate(period.fim);
    fim.setHours(0, 0, 0, 0);
    fim.setDate(fim.getDate() + 1);
    return { ini: ini.getTime(), fim: fim.getTime() };
  }, [period]);

  const noPeriodo = (iso: string) => {
    const t = isoToDate((iso || "").slice(0, 10)).getTime();
    return t >= janela.ini && t < janela.fim;
  };

  async function carregar() {
    setLoading(true);
    setErro("");

    const [
      vendasRes,
      itensRes,
      produtosRes,
      variacoesRes,
      despesasRes,
      recorrentesRes,
      funcionariosRes,
      pagamentosRes,
      valesRes,
      descontosRes,
      comissoesRes,
      servicosRes,
      tatuagemRes,
    ] = await Promise.all([
      supabase.from("vendas").select("id, created_at, total, status").order("created_at", { ascending: false }),
      supabase.from("venda_itens").select("venda_id, produto_id, variacao_id, quantidade, custo_unitario"),
      supabase.from("produtos").select("id, custo"),
      supabase.from("produto_variacoes").select("id, custo"),
      supabase
        .from("despesas")
        .select("id, despesa_recorrente_id, competencia, descricao, categoria, valor, data, responsavel, observacao")
        .order("data", { ascending: false }),
      supabase
        .from("despesas_recorrentes")
        .select("id, descricao, categoria, valor, dia_vencimento, ativo")
        .order("dia_vencimento"),
      supabase
        .from("funcionarios")
        .select("id, nome, salario_fixo, frequencia_pagamento, ativo")
        .order("nome"),
      supabase
        .from("pagamentos_funcionario")
        .select("id, funcionario_id, periodo_inicio, periodo_fim, data_pagamento, data_prevista, valor_liquido, parcela_numero, total_parcelas")
        .order("data_pagamento", { ascending: false }),
      supabase.from("vales").select("id, funcionario_id, valor, data").order("data", { ascending: false }),
      supabase
        .from("vale_descontos")
        .select("id, funcionario_id, competencia, parcela_pagamento, data_prevista, valor, status")
        .order("data_prevista"),
      supabase
        .from("comissoes_fechadas")
        .select("funcionario_id, competencia_pagamento, valor"),
      supabase
        .from("atendimentos_servico")
        .select("funcionario_id, valor, percentual_loja, data"),
      supabase.from("tatuagem_atendimentos").select("valor, percentual, data"),
    ]);

    const primeiroErro =
      vendasRes.error ||
      itensRes.error ||
      produtosRes.error ||
      variacoesRes.error ||
      despesasRes.error ||
      recorrentesRes.error ||
      funcionariosRes.error ||
      pagamentosRes.error ||
      valesRes.error ||
      descontosRes.error ||
      comissoesRes.error ||
      servicosRes.error;

    if (primeiroErro) setErro(primeiroErro.message);

    setVendas((vendasRes.data as Venda[] | null) || []);
    setItens((itensRes.data as ItemVenda[] | null) || []);
    setProdutos((produtosRes.data as Produto[] | null) || []);
    setVariacoes((variacoesRes.data as Variacao[] | null) || []);
    setDespesas((despesasRes.data as Despesa[] | null) || []);
    setRecorrentes((recorrentesRes.data as Recorrente[] | null) || []);
    setFuncionarios((funcionariosRes.data as Funcionario[] | null) || []);
    setPagamentos((pagamentosRes.data as Pagamento[] | null) || []);
    setVales((valesRes.data as Vale[] | null) || []);
    setDescontosVale((descontosRes.data as ValeDesconto[] | null) || []);
    setComissoes((comissoesRes.data as ComissaoFechada[] | null) || []);
    setServicos((servicosRes.data as Servico[] | null) || []);
    setTatuagemLegado((tatuagemRes.data as TatuagemLegado[] | null) || []);

    const ativos = ((funcionariosRes.data as Funcionario[] | null) || []).filter(
      (f) => f.ativo !== false
    );
    const agendas: Record<string, AgendaPagamento[]> = {};
    await Promise.all(
      ativos.map(async (f) => {
        const { data: agenda } = await supabase.rpc("agenda_pagamentos_funcionario", {
          p_funcionario_id: f.id,
          p_competencia: competencia,
        });
        agendas[f.id] = (agenda as AgendaPagamento[] | null) || [];
      })
    );
    setAgendaFolha(agendas);
    setResponsaveis(await carregarNomesResponsaveis());
    setLoading(false);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.inicio, period.fim]);

  const vendasConcluidas = useMemo(
    () => vendas.filter((v) => v.status === "concluida" && noPeriodo(v.created_at)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vendas, janela]
  );
  const idsConcluidas = useMemo(
    () => new Set(vendasConcluidas.map((v) => v.id)),
    [vendasConcluidas]
  );

  const receitaVendas = useMemo(
    () => vendasConcluidas.reduce((s, v) => s + Number(v.total || 0), 0),
    [vendasConcluidas]
  );

  const receitaServicos = useMemo(
    () =>
      servicos
        .filter((s) => noPeriodo(s.data))
        .reduce(
          (acc, s) =>
            acc + Number(s.valor || 0) * (Number(s.percentual_loja || 0) / 100),
          0
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [servicos, janela]
  );

  const receitaTatuagem = useMemo(
    () =>
      tatuagemLegado
        .filter((t) => t.data && noPeriodo(t.data))
        .reduce(
          (acc, t) => acc + Number(t.valor || 0) * (Number(t.percentual || 0) / 100),
          0
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tatuagemLegado, janela]
  );

  const faturamento = receitaVendas + receitaServicos + receitaTatuagem;

  const custoProdutoMap = useMemo(
    () => new Map(produtos.map((p) => [p.id, Number(p.custo || 0)])),
    [produtos]
  );
  const custoVariacaoMap = useMemo(
    () => new Map(variacoes.map((v) => [v.id, Number(v.custo || 0)])),
    [variacoes]
  );

  const custoProdutos = useMemo(
    () =>
      itens
        .filter((item) => idsConcluidas.has(item.venda_id))
        .reduce((acc, item) => {
          const snapshot = Number(item.custo_unitario || 0);
          const fallback = item.variacao_id
            ? Number(custoVariacaoMap.get(item.variacao_id) || 0)
            : Number(custoProdutoMap.get(item.produto_id) || 0);
          return acc + (snapshot > 0 ? snapshot : fallback) * Number(item.quantidade || 0);
        }, 0),
    [itens, idsConcluidas, custoProdutoMap, custoVariacaoMap]
  );

  const despesasPeriodo = useMemo(
    () => despesas.filter((d) => noPeriodo(d.data)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [despesas, janela]
  );

  const comprasEstoque = useMemo(
    () =>
      despesasPeriodo
        .filter(ehCompraEstoque)
        .reduce((s, d) => s + Number(d.valor || 0), 0),
    [despesasPeriodo]
  );

  const despesasRecorrentesPagasPeriodo = useMemo(
    () =>
      despesasPeriodo
        .filter((d) => Boolean(d.despesa_recorrente_id))
        .reduce((s, d) => s + Number(d.valor || 0), 0),
    [despesasPeriodo]
  );

  const outrasOperacionais = useMemo(
    () =>
      despesasPeriodo
        .filter((d) => !d.despesa_recorrente_id && !ehCompraEstoque(d))
        .reduce((s, d) => s + Number(d.valor || 0), 0),
    [despesasPeriodo]
  );

  const pagamentosCompetencia = useMemo(
    () =>
      pagamentos.filter(
        (p) => p.periodo_inicio === competencia && p.periodo_fim === competenciaFim
      ),
    [pagamentos, competencia, competenciaFim]
  );

  const folhaPagaPeriodo = useMemo(
    () =>
      pagamentos
        .filter((p) => noPeriodo(p.data_pagamento))
        .reduce((s, p) => s + Number(p.valor_liquido || 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pagamentos, janela]
  );

  const valesEmitidosPeriodo = useMemo(
    () =>
      vales
        .filter((v) => noPeriodo(v.data))
        .reduce((s, v) => s + Number(v.valor || 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vales, janela]
  );

  const contasRecorrentesMes = useMemo<ContaRecorrenteMes[]>(() => {
    return recorrentes
      .filter((r) => r.ativo)
      .map((r) => {
        const pago = despesas.find(
          (d) =>
            d.despesa_recorrente_id === r.id &&
            ((d.competencia || "").startsWith(competenciaPrefix) ||
              (d.data || "").startsWith(competenciaPrefix))
        );
        return {
          id: r.id,
          descricao: r.descricao,
          categoria: r.categoria,
          dataPrevista: dataVencimento(competencia, r.dia_vencimento),
          valorPrevisto: Number(r.valor || 0),
          pago: Boolean(pago),
          dataPagamento: pago?.data,
          valorPago: pago ? Number(pago.valor || 0) : undefined,
        };
      })
      .sort((a, b) => a.dataPrevista.localeCompare(b.dataPrevista));
  }, [recorrentes, despesas, competencia, competenciaPrefix]);

  const descontosCompetencia = useMemo(
    () =>
      descontosVale.filter(
        (d) => d.competencia === competencia && d.status !== "cancelado"
      ),
    [descontosVale, competencia]
  );

  const parcelasEquipe = useMemo<ParcelaEquipe[]>(() => {
    const linhas: ParcelaEquipe[] = [];

    funcionarios
      .filter((f) => f.ativo !== false)
      .forEach((funcionario) => {
        const agenda = [...(agendaFolha[funcionario.id] || [])].sort((a, b) =>
          a.data_pagamento.localeCompare(b.data_pagamento)
        );
        if (agenda.length === 0) return;

        const salarios = distribuir(Number(funcionario.salario_fixo || 0), agenda.length);
        const comissao = Number(
          comissoes.find(
            (c) =>
              c.funcionario_id === funcionario.id &&
              c.competencia_pagamento === competencia
          )?.valor || 0
        );
        const repasse = servicos
          .filter(
            (s) =>
              s.funcionario_id === funcionario.id &&
              (s.data || "").startsWith(competenciaPrefix)
          )
          .reduce(
            (acc, s) =>
              acc +
              Number(s.valor || 0) *
                (1 - Number(s.percentual_loja || 0) / 100),
            0
          );

        let saldoTransportado = 0;

        agenda.forEach((ag, indice) => {
          const ultima = indice === agenda.length - 1;
          const valesParcela = descontosCompetencia
            .filter(
              (d) =>
                d.funcionario_id === funcionario.id &&
                Number(d.parcela_pagamento) === Number(ag.parcela_numero)
            )
            .reduce((s, d) => s + Number(d.valor || 0), 0);

          const base =
            Number(salarios[indice] || 0) +
            (ultima ? comissao + repasse : 0) -
            valesParcela;
          const devidoComSaldo = Math.max(0, base + saldoTransportado);
          const registrado = pagamentosCompetencia.find(
            (p) =>
              p.funcionario_id === funcionario.id &&
              Number(p.parcela_numero || 1) === Number(ag.parcela_numero)
          );

          if (registrado) {
            const pago = Number(registrado.valor_liquido || 0);
            const diferenca = devidoComSaldo - pago;
            linhas.push({
              id: `${funcionario.id}-${ag.parcela_numero}`,
              funcionarioId: funcionario.id,
              funcionario: funcionario.nome,
              dataPrevista: ag.data_pagamento,
              parcela: ag.parcela_numero,
              totalParcelas: ag.total_parcelas,
              valor: pago,
              valorBase: base,
              vales: valesParcela,
              pago: true,
              dataPagamento: registrado.data_pagamento,
              valorPago: pago,
              ajusteSaldo: saldoTransportado,
            });
            saldoTransportado = diferenca;
          } else {
            linhas.push({
              id: `${funcionario.id}-${ag.parcela_numero}`,
              funcionarioId: funcionario.id,
              funcionario: funcionario.nome,
              dataPrevista: ag.data_pagamento,
              parcela: ag.parcela_numero,
              totalParcelas: ag.total_parcelas,
              valor: devidoComSaldo,
              valorBase: base,
              vales: valesParcela,
              pago: false,
              ajusteSaldo: saldoTransportado,
            });
            saldoTransportado = 0;
          }
        });
      });

    return linhas.sort((a, b) => a.dataPrevista.localeCompare(b.dataPrevista));
  }, [
    funcionarios,
    agendaFolha,
    pagamentosCompetencia,
    descontosCompetencia,
    comissoes,
    servicos,
    competencia,
    competenciaPrefix,
  ]);

  const folhaPrevistaBruta = useMemo(() => {
    return funcionarios
      .filter((f) => f.ativo !== false)
      .reduce((acc, f) => {
        const comissao = Number(
          comissoes.find(
            (c) =>
              c.funcionario_id === f.id && c.competencia_pagamento === competencia
          )?.valor || 0
        );
        const repasse = servicos
          .filter(
            (s) =>
              s.funcionario_id === f.id &&
              (s.data || "").startsWith(competenciaPrefix)
          )
          .reduce(
            (soma, s) =>
              soma +
              Number(s.valor || 0) *
                (1 - Number(s.percentual_loja || 0) / 100),
            0
          );
        return acc + Number(f.salario_fixo || 0) + comissao + repasse;
      }, 0);
  }, [funcionarios, comissoes, servicos, competencia, competenciaPrefix]);

  const valesDescontadosCompetencia = useMemo(
    () => descontosCompetencia.reduce((s, d) => s + Number(d.valor || 0), 0),
    [descontosCompetencia]
  );

  const folhaPagaCompetencia = useMemo(
    () => pagamentosCompetencia.reduce((s, p) => s + Number(p.valor_liquido || 0), 0),
    [pagamentosCompetencia]
  );

  const recorrentesPrevistas = useMemo(
    () => contasRecorrentesMes.reduce((s, c) => s + c.valorPrevisto, 0),
    [contasRecorrentesMes]
  );
  const recorrentesPagas = useMemo(
    () =>
      contasRecorrentesMes
        .filter((c) => c.pago)
        .reduce((s, c) => s + Number(c.valorPago ?? c.valorPrevisto), 0),
    [contasRecorrentesMes]
  );
  const recorrentesPendentes = useMemo(
    () =>
      contasRecorrentesMes
        .filter((c) => !c.pago)
        .reduce((s, c) => s + c.valorPrevisto, 0),
    [contasRecorrentesMes]
  );

  const equipePendente = useMemo(
    () => parcelasEquipe.filter((p) => !p.pago).reduce((s, p) => s + p.valor, 0),
    [parcelasEquipe]
  );

  const compromissosPrevistos =
    recorrentesPrevistas + folhaPrevistaBruta + outrasOperacionais;
  const compromissosPagos =
    recorrentesPagas +
    folhaPagaCompetencia +
    valesDescontadosCompetencia +
    outrasOperacionais;
  const compromissosPendentes = recorrentesPendentes + equipePendente;

  const margemAposProdutos = faturamento - custoProdutos;
  const resultadoProjetado = margemAposProdutos - compromissosPrevistos;
  const despesasOperacionaisRealizadas =
    despesasRecorrentesPagasPeriodo +
    outrasOperacionais +
    folhaPagaPeriodo +
    valesEmitidosPeriodo;
  const resultadoRealizado =
    faturamento - custoProdutos - despesasOperacionaisRealizadas;
  const saidaCaixa =
    despesasPeriodo.reduce((s, d) => s + Number(d.valor || 0), 0) +
    folhaPagaPeriodo +
    valesEmitidosPeriodo;
  const caixaPeriodo = faturamento - saidaCaixa;

  const cobertura =
    compromissosPrevistos > 0
      ? Math.max(0, (margemAposProdutos / compromissosPrevistos) * 100)
      : 100;
  const coberturaVisual = Math.min(100, cobertura);
  const faltaEmpatar = Math.max(0, compromissosPrevistos - margemAposProdutos);
  const sobraDepoisEmpate = Math.max(0, margemAposProdutos - compromissosPrevistos);

  const contasPendentes = useMemo(() => {
    const fixas = contasRecorrentesMes
      .filter((c) => !c.pago)
      .map((c) => ({
        id: `r-${c.id}`,
        tipo: "fixa" as const,
        titulo: c.descricao,
        subtitulo: `${c.categoria} · vence ${dataBR(c.dataPrevista)}`,
        valor: c.valorPrevisto,
        recorrenteId: c.id,
      }));
    const equipe = parcelasEquipe
      .filter((p) => !p.pago)
      .map((p) => ({
        id: `f-${p.id}`,
        tipo: "equipe" as const,
        titulo: `${p.funcionario} · pagamento ${p.parcela}/${p.totalParcelas}`,
        subtitulo: `${dataBR(p.dataPrevista)}${
          p.vales > 0 ? ` · vale ${brl(p.vales)}` : ""
        }${
          Math.abs(p.ajusteSaldo) > 0.009
            ? ` · ajuste de saldo ${p.ajusteSaldo > 0 ? "+" : "−"}${brl(
                Math.abs(p.ajusteSaldo)
              )}`
            : ""
        }`,
        valor: p.valor,
      }));
    return [...fixas, ...equipe].sort((a, b) => a.subtitulo.localeCompare(b.subtitulo));
  }, [contasRecorrentesMes, parcelasEquipe]);

  const contasPagas = useMemo(() => {
    const fixas = contasRecorrentesMes
      .filter((c) => c.pago)
      .map((c) => ({
        id: `r-${c.id}`,
        titulo: c.descricao,
        subtitulo: `${c.categoria} · pago ${dataBR(c.dataPagamento || c.dataPrevista)}`,
        valor: Number(c.valorPago ?? c.valorPrevisto),
      }));
    const equipe = parcelasEquipe
      .filter((p) => p.pago)
      .map((p) => ({
        id: `f-${p.id}`,
        titulo: `${p.funcionario} · pagamento ${p.parcela}/${p.totalParcelas}`,
        subtitulo: `Pago ${dataBR(p.dataPagamento || p.dataPrevista)}`,
        valor: Number(p.valorPago ?? p.valor),
      }));
    return [...fixas, ...equipe];
  }, [contasRecorrentesMes, parcelasEquipe]);

  async function registrarDespesa() {
    setErro("");
    setSucesso("");
    const numero = Number(valor);
    if (!descricao.trim() || !Number.isFinite(numero) || numero <= 0) {
      setErro("Informe descrição e valor válidos.");
      return;
    }
    setSalvando(true);
    const { error } = await supabase.from("despesas").insert({
      descricao: descricao.trim(),
      categoria,
      valor: numero,
      data: data || hojeISO(),
      responsavel: responsavel || null,
      observacao: observacao.trim() || null,
    });
    if (error) {
      setErro(error.message);
    } else {
      setDescricao("");
      setCategoria("Outros");
      setValor("");
      setData("");
      setResponsavel("");
      setObservacao("");
      setSucesso("Despesa paga registrada.");
      await carregar();
    }
    setSalvando(false);
  }

  async function adicionarRecorrente() {
    setErro("");
    setSucesso("");
    const numero = Number(rValor);
    const dia = Number(rDia);
    if (!rDescricao.trim() || !Number.isFinite(numero) || numero <= 0) {
      setErro("Informe a conta recorrente e o valor.");
      return;
    }
    setSalvando(true);
    const { error } = await supabase.from("despesas_recorrentes").insert({
      descricao: rDescricao.trim(),
      categoria: rCategoria,
      valor: numero,
      dia_vencimento: Math.min(31, Math.max(1, dia || 5)),
      ativo: true,
    });
    if (error) {
      setErro(error.message);
    } else {
      setRDescricao("");
      setRValor("");
      setRDia("5");
      setSucesso("Conta recorrente criada. Ela ficará pendente até você marcar como paga.");
      await carregar();
    }
    setSalvando(false);
  }

  async function marcarRecorrentePaga(recorrenteId: string) {
    setErro("");
    setSucesso("");
    setProcessandoConta(recorrenteId);
    const { error } = await supabase.rpc("lancar_despesa_recorrente", {
      p_recorrente_id: recorrenteId,
      p_competencia: competencia,
    });
    if (error) {
      setErro(error.message);
    } else {
      setSucesso("Conta marcada como paga e lançada nas despesas do mês.");
      await carregar();
    }
    setProcessandoConta(null);
  }

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Gestão financeira"
        title="Financeiro"
        description="Veja o resultado do mês, o que ainda falta pagar e quanto falta para a operação chegar ao ponto de equilíbrio."
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Faturamento", faturamento, `Vendas ${brl(receitaVendas)} · serviços ${brl(receitaServicos + receitaTatuagem)}`],
          ["Custo dos produtos", custoProdutos, "Custo das peças efetivamente vendidas"],
          ["Contas previstas", compromissosPrevistos, "Fixas + equipe + despesas adicionadas"],
          ["Resultado projetado", resultadoProjetado, "Se todas as contas previstas do mês forem consideradas"],
          ["Caixa realizado", caixaPeriodo, "Entradas menos tudo o que já saiu de dinheiro"],
        ].map(([label, value, subtitle]) => (
          <div key={String(label)} className="rounded-[28px] border border-[#e8ecf4] bg-white p-5">
            <p className="text-sm font-bold text-[#475569]">{String(label)}</p>
            <p className="mt-3 text-2xl font-black tracking-tight text-[#0f172a]">
              {brl(Number(value))}
            </p>
            <p className="mt-2 text-xs leading-5 text-[#94a3b8]">{String(subtitle)}</p>
          </div>
        ))}
      </div>

      <div className="rounded-[30px] border border-[#dbeafe] bg-gradient-to-br from-[#eff6ff] to-white p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <CircleDollarSign className="h-5 w-5 text-[#2563eb]" />
              <p className="text-sm font-black uppercase tracking-wide text-[#1d4ed8]">
                Ponto de equilíbrio · {competenciaPrefix.split("-").reverse().join("/")}
              </p>
            </div>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-[#0f172a]">
              {faltaEmpatar > 0
                ? `Faltam ${brl(faltaEmpatar)} de margem para empatar o mês.`
                : `Ponto de equilíbrio atingido. Sobra ${brl(sobraDepoisEmpate)}.`}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#64748b]">
              A régua usa o faturamento menos o custo automático dos produtos vendidos e compara essa margem com aluguel, equipe, luz, sistemas e demais despesas operacionais previstas.
            </p>
          </div>
          <div className="grid min-w-[280px] grid-cols-2 gap-3">
            <div className="rounded-2xl border border-[#dbeafe] bg-white p-4">
              <p className="text-xs font-bold text-[#64748b]">Margem após produtos</p>
              <p className="mt-2 text-lg font-black text-[#0f172a]">{brl(margemAposProdutos)}</p>
            </div>
            <div className="rounded-2xl border border-[#dbeafe] bg-white p-4">
              <p className="text-xs font-bold text-[#64748b]">Meta de contas</p>
              <p className="mt-2 text-lg font-black text-[#0f172a]">{brl(compromissosPrevistos)}</p>
            </div>
          </div>
        </div>
        <div className="mt-5 h-3 overflow-hidden rounded-full bg-[#dbeafe]">
          <div
            className="h-full rounded-full bg-[#2563eb] transition-all"
            style={{ width: `${coberturaVisual}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-xs font-bold text-[#64748b]">
          <span>{Math.round(cobertura)}% coberto</span>
          <span>100% = mês empatado</span>
        </div>
      </div>

      <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-[#0f172a]">Contas do mês</h2>
            <p className="mt-1 text-sm text-[#64748b]">
              O status é manual. Conta recorrente só vira paga quando você marcar; funcionário só vira pago quando o pagamento for registrado na folha.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-[#f8fafc] px-4 py-3">
              <p className="text-[11px] font-bold uppercase text-[#94a3b8]">Previsto</p>
              <p className="mt-1 font-black text-[#0f172a]">{brl(compromissosPrevistos)}</p>
            </div>
            <div className="rounded-2xl bg-[#f0fdf4] px-4 py-3">
              <p className="text-[11px] font-bold uppercase text-[#16a34a]">Pago</p>
              <p className="mt-1 font-black text-[#166534]">{brl(compromissosPagos)}</p>
            </div>
            <div className="rounded-2xl bg-[#fff7ed] px-4 py-3">
              <p className="text-[11px] font-bold uppercase text-[#c2410c]">Pendente</p>
              <p className="mt-1 font-black text-[#9a3412]">{brl(compromissosPendentes)}</p>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <div>
            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-[#c2410c]" />
              <h3 className="font-black text-[#9a3412]">Ainda falta pagar</h3>
            </div>
            <div className="mt-3 space-y-2.5">
              {contasPendentes.length === 0 ? (
                <div className="rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] p-4 text-sm font-semibold text-[#15803d]">
                  Nenhuma conta recorrente ou parcela de funcionário pendente nesta competência.
                </div>
              ) : (
                contasPendentes.map((conta) => (
                  <div key={conta.id} className="flex flex-col gap-3 rounded-2xl border border-[#fed7aa] bg-[#fff7ed] p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-black text-[#0f172a]">{conta.titulo}</p>
                      <p className="mt-1 text-xs text-[#9a3412]">{conta.subtitulo}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <strong className="text-sm text-[#9a3412]">{brl(conta.valor)}</strong>
                      {conta.tipo === "fixa" ? (
                        <button
                          type="button"
                          onClick={() => marcarRecorrentePaga(conta.recorrenteId)}
                          disabled={processandoConta === conta.recorrenteId}
                          className="rounded-xl bg-[#2563eb] px-3 py-2 text-xs font-black text-white disabled:opacity-50"
                        >
                          {processandoConta === conta.recorrenteId ? "Salvando..." : "Marcar paga"}
                        </button>
                      ) : (
                        <Link
                          href="/dashboard/folha"
                          className="rounded-xl border border-[#dbeafe] bg-white px-3 py-2 text-xs font-black text-[#1d4ed8]"
                        >
                          Abrir folha
                        </Link>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[#16a34a]" />
              <h3 className="font-black text-[#166534]">Já pago</h3>
            </div>
            <div className="mt-3 space-y-2.5">
              {contasPagas.length === 0 ? (
                <div className="rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] p-4 text-sm text-[#64748b]">
                  Nenhuma conta fixa ou parcela de funcionário foi marcada como paga nesta competência.
                </div>
              ) : (
                contasPagas.map((conta) => (
                  <div key={conta.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] p-4">
                    <div className="min-w-0">
                      <p className="font-black text-[#0f172a]">{conta.titulo}</p>
                      <p className="mt-1 text-xs text-[#15803d]">{conta.subtitulo}</p>
                    </div>
                    <strong className="shrink-0 text-sm text-[#166534]">{brl(conta.valor)}</strong>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
        <button
          type="button"
          onClick={() => setDetalhes((atual) => !atual)}
          className="flex w-full items-center justify-between gap-4 text-left"
        >
          <div>
            <h2 className="text-xl font-black text-[#0f172a]">Despesas e composição do resultado</h2>
            <p className="mt-1 text-sm text-[#64748b]">
              Abra para entender exatamente de onde saiu cada valor.
            </p>
          </div>
          {detalhes ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </button>

        {detalhes && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            {[
              ["Custo dos produtos vendidos", custoProdutos, "Automático por item vendido"],
              ["Fixas já pagas", despesasRecorrentesPagasPeriodo, "Aluguel, luz, sistema etc."],
              ["Folha já paga", folhaPagaPeriodo, "Pagamentos registrados"],
              ["Vales adiantados", valesEmitidosPeriodo, "Saída de caixa antecipada"],
              ["Despesas acrescentadas", outrasOperacionais, "Taxas, marketing, impostos etc."],
              ["Compra de mercadoria", comprasEstoque, "Sai do caixa, sem duplicar o custo da venda"],
            ].map(([label, value, subtitle]) => (
              <div key={String(label)} className="rounded-2xl bg-[#f8fafc] p-4">
                <p className="text-[11px] font-black uppercase tracking-wide text-[#64748b]">{String(label)}</p>
                <p className="mt-2 text-lg font-black text-[#0f172a]">{brl(Number(value))}</p>
                <p className="mt-1 text-xs leading-5 text-[#94a3b8]">{String(subtitle)}</p>
              </div>
            ))}
          </div>
        )}

        {detalhes && (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-[#e8ecf4] p-4">
              <p className="text-sm font-bold text-[#475569]">Resultado realizado até agora</p>
              <p className="mt-2 text-xl font-black text-[#0f172a]">{brl(resultadoRealizado)}</p>
              <p className="mt-1 text-xs text-[#94a3b8]">Considera só despesas operacionais que já aconteceram.</p>
            </div>
            <div className="rounded-2xl border border-[#e8ecf4] p-4">
              <p className="text-sm font-bold text-[#475569]">Resultado projetado do mês</p>
              <p className="mt-2 text-xl font-black text-[#0f172a]">{brl(resultadoProjetado)}</p>
              <p className="mt-1 text-xs text-[#94a3b8]">Também considera contas do mês que ainda estão pendentes.</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
          <div className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-[#2563eb]" />
            <h2 className="text-xl font-black text-[#0f172a]">Nova conta recorrente</h2>
          </div>
          <p className="mt-1 text-sm text-[#64748b]">
            Cadastre aluguel, energia, internet, sistema e outras contas que se repetem. Elas entram como pendentes todo mês.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input className={inputCls} value={rDescricao} onChange={(e) => setRDescricao(e.target.value)} placeholder="Descrição" />
            <select className={inputCls} value={rCategoria} onChange={(e) => setRCategoria(e.target.value)}>
              {categorias.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input className={inputCls} type="number" step="0.01" min="0" value={rValor} onChange={(e) => setRValor(e.target.value)} placeholder="Valor mensal" />
            <input className={inputCls} type="number" min="1" max="31" value={rDia} onChange={(e) => setRDia(e.target.value)} placeholder="Dia do vencimento" />
          </div>
          <button type="button" onClick={adicionarRecorrente} disabled={salvando} className="mt-3 w-full rounded-2xl bg-[#2563eb] px-4 py-3 text-sm font-black text-white disabled:opacity-50">
            Cadastrar conta recorrente
          </button>
        </div>

        <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
          <div className="flex items-center gap-2">
            <WalletCards className="h-5 w-5 text-[#b45309]" />
            <h2 className="text-xl font-black text-[#0f172a]">Registrar despesa já paga</h2>
          </div>
          <p className="mt-1 text-sm text-[#64748b]">
            Use para compras, taxas, marketing ou qualquer saída que já aconteceu.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input className={inputCls} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição" />
            <select className={inputCls} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              {categorias.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input className={inputCls} type="number" step="0.01" min="0" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Valor" />
            <input className={inputCls} type="date" value={data} onChange={(e) => setData(e.target.value)} />
            <select className={inputCls} value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
              <option value="">Responsável (opcional)</option>
              {responsaveis.map((r) => <option key={r}>{r}</option>)}
            </select>
            <input className={inputCls} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Observação" />
          </div>
          <button type="button" onClick={registrarDespesa} disabled={salvando} className="mt-3 w-full rounded-2xl bg-[#0f172a] px-4 py-3 text-sm font-black text-white disabled:opacity-50">
            Registrar despesa paga
          </button>
        </div>
      </div>

      <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
        <div className="flex items-center gap-2">
          <ReceiptText className="h-5 w-5 text-[#64748b]" />
          <h2 className="text-xl font-black text-[#0f172a]">Movimentações pagas no período</h2>
        </div>
        {loading ? (
          <p className="mt-4 text-sm text-[#64748b]">Carregando...</p>
        ) : despesasPeriodo.length === 0 ? (
          <p className="mt-4 text-sm text-[#64748b]">Nenhuma despesa paga no período selecionado.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {despesasPeriodo.map((d) => (
              <div key={d.id} className="flex flex-col gap-2 rounded-2xl border border-[#eef2f7] bg-[#f8fafc] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-bold text-[#0f172a]">{d.descricao}</p>
                  <p className="mt-1 text-xs text-[#64748b]">{d.categoria} · {dataBR(d.data)}{d.observacao ? ` · ${d.observacao}` : ""}</p>
                </div>
                <strong className="text-sm text-[#0f172a]">{brl(Number(d.valor || 0))}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
