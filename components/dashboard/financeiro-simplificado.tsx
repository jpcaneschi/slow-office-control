"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  PackageOpen,
  ReceiptText,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/dashboard/page-header";
import { usePeriod } from "@/components/dashboard/period-context";
import { hojeISO } from "@/lib/datas";

type Resumo = {
  vendas_contratadas: number;
  receita_vendas: number;
  receita_promissorias: number;
  receita_servicos: number;
  faturamento_recebido: number;
  despesas_previstas: number;
  despesas_pagas: number;
  despesas_pendentes: number;
  folha_prevista: number;
  contas_receber: number;
  resultado_projetado: number;
  movimentacao_mes: number;
};

type AgendaItem = {
  id: string;
  data: string;
  tipo: string;
  titulo: string;
  detalhe: string | null;
  valor: number | null;
  status: string;
  href: string | null;
};

type Recorrente = {
  id: string;
  descricao: string;
  categoria: string;
  valor: number;
  dia_vencimento: number;
  ativo: boolean;
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
  "w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-sm text-[#0f172a] outline-none transition focus:border-[#2563eb] focus:bg-white";

function brl(v: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(v || 0));
}

function dataBR(data: string) {
  if (!data) return "—";
  return data.slice(0, 10).split("-").reverse().join("/");
}

function uuidDeId(id: string, prefixo: string) {
  const match = id.match(new RegExp(`^${prefixo}-([0-9a-fA-F-]{36})`));
  return match?.[1] || null;
}

const resumoVazio: Resumo = {
  vendas_contratadas: 0,
  receita_vendas: 0,
  receita_promissorias: 0,
  receita_servicos: 0,
  faturamento_recebido: 0,
  despesas_previstas: 0,
  despesas_pagas: 0,
  despesas_pendentes: 0,
  folha_prevista: 0,
  contas_receber: 0,
  resultado_projetado: 0,
  movimentacao_mes: 0,
};

export function FinanceiroSimplificado() {
  const { period } = usePeriod();
  // O Financeiro é mensal. Se o filtro global atravessar dois meses (ex.: 30 dias),
  // usamos o mês da DATA FINAL, que é o mês que o usuário está olhando agora.
  const competencia = `${period.fim.slice(0, 7)}-01`;

  const [resumo, setResumo] = useState<Resumo>(resumoVazio);
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [recorrentes, setRecorrentes] = useState<Recorrente[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [processando, setProcessando] = useState<string | null>(null);

  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState("Compra de mercadoria");
  const [valor, setValor] = useState("");
  const [vencimento, setVencimento] = useState(hojeISO());
  const [status, setStatus] = useState<"pago" | "pendente">("pago");
  const [dataPagamento, setDataPagamento] = useState(hojeISO());
  const [observacao, setObservacao] = useState("");

  const [rDescricao, setRDescricao] = useState("");
  const [rCategoria, setRCategoria] = useState("Aluguel");
  const [rValor, setRValor] = useState("");
  const [rDia, setRDia] = useState("5");

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    const [resumoRes, agendaRes, recorrentesRes] = await Promise.all([
      supabase.rpc("resumo_financeiro_mes", { p_competencia: competencia }),
      supabase.rpc("agenda_operacao_mes", { p_competencia: competencia }),
      supabase
        .from("despesas_recorrentes")
        .select("id, descricao, categoria, valor, dia_vencimento, ativo")
        .eq("ativo", true)
        .order("dia_vencimento"),
    ]);

    const primeiroErro = resumoRes.error || agendaRes.error || recorrentesRes.error;
    if (primeiroErro) setErro(primeiroErro.message);

    const linha = Array.isArray(resumoRes.data) ? resumoRes.data[0] : resumoRes.data;
    setResumo({ ...resumoVazio, ...(linha || {}) } as Resumo);
    setAgenda((agendaRes.data as AgendaItem[] | null) || []);
    setRecorrentes((recorrentesRes.data as Recorrente[] | null) || []);
    setLoading(false);
  }, [competencia]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const contas = useMemo(
    () => agenda.filter((a) => ["despesa", "compra", "conta", "folha"].includes(a.tipo)),
    [agenda]
  );
  const pendentes = useMemo(
    () => contas.filter((a) => !["pago", "recebido"].includes(a.status)),
    [contas]
  );
  const pagas = useMemo(
    () => contas.filter((a) => ["pago", "recebido"].includes(a.status)),
    [contas]
  );

  const cobertura =
    resumo.despesas_previstas > 0
      ? Math.max(0, (resumo.faturamento_recebido / resumo.despesas_previstas) * 100)
      : 100;
  const faltaEmpatar = Math.max(0, resumo.despesas_previstas - resumo.faturamento_recebido);
  const sobra = Math.max(0, resumo.faturamento_recebido - resumo.despesas_previstas);

  async function registrarDespesa() {
    setErro("");
    setSucesso("");
    const n = Number(valor);
    if (!descricao.trim() || !Number.isFinite(n) || n <= 0 || !vencimento) {
      setErro("Informe descrição, valor e vencimento válidos.");
      return;
    }
    setProcessando("nova-despesa");
    const competenciaDespesa = `${vencimento.slice(0, 7)}-01`;
    const { error } = await supabase.from("despesas").insert({
      descricao: descricao.trim(),
      categoria,
      valor: n,
      data: vencimento,
      data_vencimento: vencimento,
      data_pagamento: status === "pago" ? dataPagamento || hojeISO() : null,
      status,
      competencia: competenciaDespesa,
      observacao: observacao.trim() || null,
    });
    if (error) setErro(error.message);
    else {
      setDescricao("");
      setValor("");
      setObservacao("");
      setSucesso(
        status === "pago" ? "Despesa registrada como paga." : "Conta registrada como pendente."
      );
      await carregar();
    }
    setProcessando(null);
  }

  async function adicionarRecorrente() {
    setErro("");
    setSucesso("");
    const n = Number(rValor);
    const dia = Math.min(31, Math.max(1, Number(rDia || 5)));
    if (!rDescricao.trim() || !Number.isFinite(n) || n <= 0) {
      setErro("Informe descrição e valor da conta recorrente.");
      return;
    }
    setProcessando("nova-recorrente");
    const { error } = await supabase.from("despesas_recorrentes").insert({
      descricao: rDescricao.trim(),
      categoria: rCategoria,
      valor: n,
      dia_vencimento: dia,
      ativo: true,
    });
    if (error) setErro(error.message);
    else {
      setRDescricao("");
      setRValor("");
      setSucesso("Conta recorrente criada. Ela fica pendente até você marcar como paga.");
      await carregar();
    }
    setProcessando(null);
  }

  async function marcarPaga(item: AgendaItem) {
    setErro("");
    setSucesso("");
    setProcessando(item.id);
    if (item.tipo === "conta") {
      const id = uuidDeId(item.id, "rec");
      if (!id) {
        setErro("Não foi possível identificar a conta recorrente.");
        setProcessando(null);
        return;
      }
      const { error } = await supabase.rpc("lancar_despesa_recorrente", {
        p_recorrente_id: id,
        p_competencia: competencia,
      });
      if (error) setErro(error.message);
      else setSucesso("Conta marcada como paga.");
    } else if (item.tipo === "despesa" || item.tipo === "compra") {
      const id = uuidDeId(item.id, "desp");
      if (!id) {
        setErro("Não foi possível identificar a despesa.");
        setProcessando(null);
        return;
      }
      const { error } = await supabase.rpc("marcar_despesa_paga", {
        p_despesa_id: id,
        p_data_pagamento: hojeISO(),
      });
      if (error) setErro(error.message);
      else setSucesso("Despesa marcada como paga.");
    }
    await carregar();
    setProcessando(null);
  }

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Gestão financeira"
        title="Financeiro"
        description="Visão mensal da operação: o que movimentou, o que foi vendido, o que entrou e o que ainda precisa ser pago."
      />

      {erro && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {erro}
        </div>
      )}
      {sucesso && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {sucesso}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card
          label="Movimentação do mês"
          valor={resumo.movimentacao_mes}
          detalhe={`Entradas recebidas ${brl(resumo.faturamento_recebido)} + saídas já pagas ${brl(
            resumo.despesas_pagas
          )}`}
          icon={<CircleDollarSign className="h-5 w-5" />}
        />
        <Card
          label="Despesas do mês"
          valor={resumo.despesas_previstas}
          detalhe="Fornecedor/mercadoria + contas fixas + equipe + demais despesas"
          icon={<ReceiptText className="h-5 w-5" />}
        />
        <Card
          label="Ainda falta pagar"
          valor={resumo.despesas_pendentes}
          detalhe="Somente contas e pagamentos ainda pendentes"
          icon={<Clock3 className="h-5 w-5" />}
        />
        <Card
          label="Resultado projetado"
          valor={resumo.resultado_projetado}
          detalhe="Entradas recebidas menos todas as despesas previstas do mês"
          icon={
            resumo.resultado_projetado >= 0 ? (
              <TrendingUp className="h-5 w-5" />
            ) : (
              <TrendingDown className="h-5 w-5" />
            )
          }
          destaque
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Mini
          label="Vendas do mês"
          valor={resumo.vendas_contratadas}
          texto="Valor total dos pedidos vendidos, inclusive vendas em promissória."
        />
        <Mini
          label="Entradas recebidas"
          valor={resumo.faturamento_recebido}
          texto={`À vista ${brl(resumo.receita_vendas)} · promissórias ${brl(
            resumo.receita_promissorias
          )} · serviços ${brl(resumo.receita_servicos)}`}
        />
        <Mini
          label="Contas a receber"
          valor={resumo.contas_receber}
          texto="Saldo das promissórias que os clientes ainda devem."
        />
      </div>

      <div className="rounded-[30px] border border-[#dbeafe] bg-gradient-to-br from-[#eff6ff] to-white p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2563eb]">
              Ponto de equilíbrio
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-[#0f172a]">
              {faltaEmpatar > 0
                ? `Faltam ${brl(faltaEmpatar)} em entradas para cobrir as despesas previstas.`
                : `Despesas cobertas. Sobra projetada de ${brl(sobra)}.`}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#64748b]">
              Venda à vista e entrada de venda mista contam quando acontecem. Promissória só aumenta as entradas quando o pagamento é registrado. Compra de mercadoria entra uma única vez como despesa.
            </p>
          </div>
          <div className="min-w-[180px] text-right">
            <p className="text-3xl font-black text-[#0f172a]">
              {Math.min(999, cobertura).toFixed(0)}%
            </p>
            <p className="text-xs font-bold text-[#64748b]">das despesas cobertas</p>
          </div>
        </div>
        <div className="mt-5 h-3 overflow-hidden rounded-full bg-white shadow-inner">
          <div
            className="h-full rounded-full bg-[#2563eb] transition-all"
            style={{ width: `${Math.min(100, cobertura)}%` }}
          />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ContasLista
          titulo="Pendentes"
          itens={pendentes}
          vazio="Nenhuma conta pendente neste mês."
          processando={processando}
          onPagar={marcarPaga}
        />
        <ContasLista
          titulo="Já pagas"
          itens={pagas}
          vazio="Nenhum pagamento registrado neste mês."
          processando={processando}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
          <div className="flex items-center gap-2">
            <PackageOpen className="h-5 w-5 text-[#2563eb]" />
            <div>
              <h2 className="text-lg font-black text-[#0f172a]">Nova despesa ou compra</h2>
              <p className="text-xs text-[#64748b]">
                Fornecedor, mercadoria, luz, água ou qualquer saída da loja.
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <input
              className={`${inputCls} sm:col-span-2`}
              placeholder="Descrição"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
            <select className={inputCls} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              {categorias.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <input
              className={inputCls}
              type="number"
              min="0"
              step="0.01"
              placeholder="Valor"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
            <div>
              <label className="mb-1 block text-xs font-bold text-[#64748b]">Vencimento</label>
              <input
                className={inputCls}
                type="date"
                value={vencimento}
                onChange={(e) => setVencimento(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-[#64748b]">Situação</label>
              <select
                className={inputCls}
                value={status}
                onChange={(e) => setStatus(e.target.value as "pago" | "pendente")}
              >
                <option value="pago">Já paguei</option>
                <option value="pendente">Ainda vou pagar</option>
              </select>
            </div>
            {status === "pago" && (
              <div>
                <label className="mb-1 block text-xs font-bold text-[#64748b]">
                  Data que pagou
                </label>
                <input
                  className={inputCls}
                  type="date"
                  value={dataPagamento}
                  onChange={(e) => setDataPagamento(e.target.value)}
                />
              </div>
            )}
            <input
              className={`${inputCls} ${status === "pago" ? "" : "sm:col-span-2"}`}
              placeholder="Observação (opcional)"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </div>
          <button
            disabled={processando === "nova-despesa"}
            onClick={registrarDespesa}
            className="mt-4 w-full rounded-2xl bg-[#0f172a] px-4 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            {processando === "nova-despesa"
              ? "Salvando..."
              : status === "pago"
                ? "Registrar despesa paga"
                : "Adicionar conta pendente"}
          </button>
        </div>

        <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
          <h2 className="text-lg font-black text-[#0f172a]">Contas recorrentes</h2>
          <p className="mt-1 text-xs text-[#64748b]">
            Aluguel, internet, contador e outras contas que voltam todo mês.
          </p>
          <div className="mt-4 space-y-2">
            {recorrentes.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-2xl bg-[#f8fafc] p-3"
              >
                <div>
                  <p className="text-sm font-bold text-[#0f172a]">{r.descricao}</p>
                  <p className="text-xs text-[#64748b]">
                    Dia {r.dia_vencimento} · {r.categoria}
                  </p>
                </div>
                <p className="text-sm font-black">{brl(r.valor)}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <input
              className={`${inputCls} sm:col-span-2`}
              placeholder="Nome da conta"
              value={rDescricao}
              onChange={(e) => setRDescricao(e.target.value)}
            />
            <select className={inputCls} value={rCategoria} onChange={(e) => setRCategoria(e.target.value)}>
              {categorias.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <input
              className={inputCls}
              type="number"
              step="0.01"
              placeholder="Valor mensal"
              value={rValor}
              onChange={(e) => setRValor(e.target.value)}
            />
            <input
              className={inputCls}
              type="number"
              min="1"
              max="31"
              placeholder="Dia"
              value={rDia}
              onChange={(e) => setRDia(e.target.value)}
            />
          </div>
          <button
            disabled={processando === "nova-recorrente"}
            onClick={adicionarRecorrente}
            className="mt-4 w-full rounded-2xl border border-[#dbeafe] bg-[#eff6ff] px-4 py-3 text-sm font-black text-[#1d4ed8] disabled:opacity-50"
          >
            {processando === "nova-recorrente" ? "Salvando..." : "Adicionar conta recorrente"}
          </button>
        </div>
      </div>

      <p className="text-center text-xs text-[#94a3b8]">
        O custo unitário dos produtos continua salvo para estoque e análise, mas não é descontado novamente no Financeiro quando a compra já foi lançada como despesa.
      </p>
    </section>
  );
}

function Card({
  label,
  valor,
  detalhe,
  icon,
  destaque = false,
}: {
  label: string;
  valor: number;
  detalhe: string;
  icon: React.ReactNode;
  destaque?: boolean;
}) {
  return (
    <div
      className={`rounded-[28px] border p-5 ${
        destaque
          ? valor >= 0
            ? "border-emerald-200 bg-emerald-50/60"
            : "border-red-200 bg-red-50/60"
          : "border-[#e8ecf4] bg-white"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-[#475569]">{label}</p>
        <span className="text-[#2563eb]">{icon}</span>
      </div>
      <p
        className={`mt-3 text-2xl font-black tracking-tight ${
          destaque && valor < 0 ? "text-red-700" : "text-[#0f172a]"
        }`}
      >
        {brl(valor)}
      </p>
      <p className="mt-2 text-xs leading-5 text-[#94a3b8]">{detalhe}</p>
    </div>
  );
}

function Mini({ label, valor, texto }: { label: string; valor: number; texto: string }) {
  return (
    <div className="rounded-2xl border border-[#e8ecf4] bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-black uppercase tracking-wide text-[#64748b]">{label}</p>
        <ArrowUpRight className="h-4 w-4 text-[#94a3b8]" />
      </div>
      <p className="mt-2 text-xl font-black text-[#0f172a]">{brl(valor)}</p>
      <p className="mt-1 text-[11px] leading-4 text-[#94a3b8]">{texto}</p>
    </div>
  );
}

function ContasLista({
  titulo,
  itens,
  vazio,
  processando,
  onPagar,
}: {
  titulo: string;
  itens: AgendaItem[];
  vazio: string;
  processando: string | null;
  onPagar?: (item: AgendaItem) => void;
}) {
  return (
    <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black text-[#0f172a]">{titulo}</h2>
        <span className="rounded-full bg-[#f1f5f9] px-2.5 py-1 text-xs font-black text-[#475569]">
          {itens.length}
        </span>
      </div>
      <div className="mt-4 space-y-2">
        {itens.length === 0 ? (
          <p className="rounded-2xl bg-[#f8fafc] p-4 text-sm text-[#64748b]">{vazio}</p>
        ) : (
          itens.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-[#eef2f7] p-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {["pago", "recebido"].includes(item.status) ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <Clock3 className="h-4 w-4 shrink-0 text-amber-500" />
                  )}
                  <p className="truncate text-sm font-bold text-[#0f172a]">{item.titulo}</p>
                </div>
                <p className="mt-1 truncate pl-6 text-xs text-[#64748b]">
                  {dataBR(item.data)} · {item.detalhe}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-black text-[#0f172a]">{brl(Number(item.valor || 0))}</p>
                {onPagar &&
                !["pago", "recebido"].includes(item.status) &&
                ["conta", "despesa", "compra"].includes(item.tipo) ? (
                  <button
                    disabled={processando === item.id}
                    onClick={() => onPagar(item)}
                    className="mt-1 text-xs font-bold text-[#2563eb] disabled:opacity-50"
                  >
                    {processando === item.id ? "Salvando..." : "Marcar paga"}
                  </button>
                ) : item.href ? (
                  <Link href={item.href} className="mt-1 inline-block text-xs font-bold text-[#2563eb]">
                    Abrir
                  </Link>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
