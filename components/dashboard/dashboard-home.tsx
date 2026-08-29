"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CircleDollarSign,
  FileText,
  ReceiptText,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/vendas-utils";
import { SalesPanel, type VendaLite } from "@/components/dashboard/sales-panel";
import { MetricCard } from "@/components/dashboard/metric-card";
import { MiniCalendar } from "@/components/dashboard/mini-calendar";
import { RecentSales, type VendaRow } from "@/components/dashboard/recent-sales";
import { TasksAlerts } from "@/components/dashboard/tasks-alerts";
import {
  isoToDate,
  labelForPeriod,
  presetRange,
  usePeriod,
} from "@/components/dashboard/period-context";
import { usePapel } from "@/components/dashboard/role-context";
import { podeAcessar } from "@/lib/permissoes";
import { TopProducts } from "@/components/dashboard/top-products";
import { rankearProdutosMaisVendidos } from "@/lib/mais-vendidos-utils";

type Venda = {
  id: string;
  cliente_id: string | null;
  forma_pagamento: string;
  total: number | null;
  valor_recebido: number | null;
  status: string;
  created_at: string;
};
type Cliente = { id: string; nome: string };
type Condicional = { id: string; status: string };
type Funcionario = { id: string; nome: string };
type Despesa = {
  id: string;
  descricao: string;
  categoria: string;
  valor: number;
  data: string;
  data_pagamento: string | null;
  status: string;
};
type PagamentoFuncionario = {
  id: string;
  funcionario_id: string;
  valor_liquido: number;
  data_pagamento: string;
};
type Vale = {
  id: string;
  funcionario_id: string;
  valor: number;
  data: string;
  observacao: string | null;
};
type PagamentoPromissoria = { id: string; valor: number; data: string };
type ResumoMes = {
  movimentacao_mes: number;
  contas_receber: number;
};
type ResumoPeriodo = {
  vendas_periodo: number;
  entradas_vendas: number;
  recebimentos_promissorias: number;
  receita_servicos: number;
  entradas_recebidas: number;
  despesas_pagas: number;
  movimentacao_periodo: number;
};
type SaidaPeriodo = {
  id: string;
  data: string;
  titulo: string;
  detalhe: string;
  valor: number;
};

const resumoMesVazio: ResumoMes = { movimentacao_mes: 0, contas_receber: 0 };
const resumoPeriodoVazio: ResumoPeriodo = {
  vendas_periodo: 0,
  entradas_vendas: 0,
  recebimentos_promissorias: 0,
  receita_servicos: 0,
  entradas_recebidas: 0,
  despesas_pagas: 0,
  movimentacao_periodo: 0,
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dentroDoPeriodo(data: string, inicio: string, fim: string) {
  const dia = (data || "").slice(0, 10);
  return !!dia && dia >= inicio && dia <= fim;
}

function dataBR(data: string) {
  return data.slice(0, 10).split("-").reverse().join("/");
}

export function DashboardHome() {
  const { period } = usePeriod();
  const { papel } = usePapel();
  const podeVerFinanceiro = podeAcessar(papel, "/dashboard/financeiro");

  const [vendas, setVendas] = useState<Venda[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [condicionais, setCondicionais] = useState<Condicional[]>([]);
  const [itens, setItens] = useState<
    { venda_id: string; produto_id: string; quantidade: number; total_item: number }[]
  >([]);
  const [produtos, setProdutos] = useState<{ id: string; nome: string }[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [pagamentosEquipe, setPagamentosEquipe] = useState<PagamentoFuncionario[]>([]);
  const [vales, setVales] = useState<Vale[]>([]);
  const [pagamentosPromissoria, setPagamentosPromissoria] = useState<PagamentoPromissoria[]>([]);
  const [resumoMes, setResumoMes] = useState<ResumoMes>(resumoMesVazio);
  const [resumoPeriodo, setResumoPeriodo] = useState<ResumoPeriodo>(resumoPeriodoVazio);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");

    const agora = new Date();
    const competencia = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(
      2,
      "0"
    )}-01`;

    const [v, c, cond, i, p, f, d, pg, vl, pp, mes, periodoRes] = await Promise.all([
      supabase
        .from("vendas")
        .select("id,cliente_id,forma_pagamento,total,valor_recebido,status,created_at")
        .order("created_at", { ascending: false }),
      supabase.from("clientes").select("id,nome"),
      supabase.from("condicionais").select("id,status"),
      supabase.from("venda_itens").select("venda_id,produto_id,quantidade,total_item"),
      supabase.from("produtos").select("id,nome"),
      supabase.from("funcionarios").select("id,nome"),
      supabase
        .from("despesas")
        .select("id,descricao,categoria,valor,data,data_pagamento,status"),
      supabase
        .from("pagamentos_funcionario")
        .select("id,funcionario_id,valor_liquido,data_pagamento"),
      supabase.from("vales").select("id,funcionario_id,valor,data,observacao"),
      supabase
        .from("promissoria_pagamentos")
        .select("id,valor,data,promissorias!inner(status)")
        .neq("promissorias.status", "cancelado"),
      supabase.rpc("resumo_financeiro_mes", { p_competencia: competencia }),
      supabase.rpc("resumo_operacao_periodo", {
        p_inicio: period.inicio,
        p_fim: period.fim,
      }),
    ]);

    const err =
      v.error ||
      c.error ||
      cond.error ||
      i.error ||
      p.error ||
      f.error ||
      d.error ||
      pg.error ||
      vl.error ||
      pp.error ||
      mes.error ||
      periodoRes.error;
    if (err) setErro(err.message);

    setVendas((v.data as Venda[] | null) || []);
    setClientes((c.data as Cliente[] | null) || []);
    setCondicionais((cond.data as Condicional[] | null) || []);
    setItens(i.data || []);
    setProdutos(p.data || []);
    setFuncionarios((f.data as Funcionario[] | null) || []);
    setDespesas((d.data as Despesa[] | null) || []);
    setPagamentosEquipe((pg.data as PagamentoFuncionario[] | null) || []);
    setVales((vl.data as Vale[] | null) || []);
    setPagamentosPromissoria((pp.data as unknown as PagamentoPromissoria[] | null) || []);

    const linhaMes = Array.isArray(mes.data) ? mes.data[0] : mes.data;
    setResumoMes({
      movimentacao_mes: Number(linhaMes?.movimentacao_mes || 0),
      contas_receber: Number(linhaMes?.contas_receber || 0),
    });

    const linhaPeriodo = Array.isArray(periodoRes.data)
      ? periodoRes.data[0]
      : periodoRes.data;
    setResumoPeriodo({
      vendas_periodo: Number(linhaPeriodo?.vendas_periodo || 0),
      entradas_vendas: Number(linhaPeriodo?.entradas_vendas || 0),
      recebimentos_promissorias: Number(linhaPeriodo?.recebimentos_promissorias || 0),
      receita_servicos: Number(linhaPeriodo?.receita_servicos || 0),
      entradas_recebidas: Number(linhaPeriodo?.entradas_recebidas || 0),
      despesas_pagas: Number(linhaPeriodo?.despesas_pagas || 0),
      movimentacao_periodo: Number(linhaPeriodo?.movimentacao_periodo || 0),
    });
    setLoading(false);
  }, [period.inicio, period.fim]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const janela = useMemo(() => {
    const inicio = startOfDay(isoToDate(period.inicio));
    const fim = startOfDay(isoToDate(period.fim));
    fim.setDate(fim.getDate() + 1);
    const ehHoje =
      period.inicio === presetRange("hoje").inicio && period.fim === presetRange("hoje").fim;
    return { inicio, fim, ehHoje };
  }, [period]);

  const clienteNome = useMemo(() => new Map(clientes.map((c) => [c.id, c.nome])), [clientes]);
  const funcionarioNome = useMemo(
    () => new Map(funcionarios.map((f) => [f.id, f.nome])),
    [funcionarios]
  );

  const qtdPeriodo = vendas.filter((v) => {
    const t = new Date(v.created_at).getTime();
    return v.status === "concluida" && t >= janela.inicio.getTime() && t < janela.fim.getTime();
  }).length;

  const vendasLite: VendaLite[] = useMemo(
    () => [
      ...vendas.map((v) => ({
        total:
          v.forma_pagamento === "promissoria"
            ? 0
            : v.forma_pagamento === "misto"
              ? Math.max(0, Math.min(Number(v.total || 0), Number(v.valor_recebido || 0)))
              : Number(v.total || 0),
        status: v.status,
        created_at: v.created_at,
        contarPedido: true,
      })),
      ...pagamentosPromissoria.map((pg) => ({
        total: Number(pg.valor || 0),
        status: "concluida",
        created_at: `${pg.data}T12:00:00`,
        contarPedido: false,
      })),
    ],
    [vendas, pagamentosPromissoria]
  );

  const maisVendidos = useMemo(
    () =>
      rankearProdutosMaisVendidos(
        vendas,
        itens,
        produtos,
        janela.inicio.getTime(),
        janela.fim.getTime()
      ),
    [vendas, itens, produtos, janela]
  );

  const ultimas: VendaRow[] = useMemo(
    () =>
      vendas
        .filter((v) => {
          const t = new Date(v.created_at).getTime();
          return t >= janela.inicio.getTime() && t < janela.fim.getTime();
        })
        .slice(0, 8)
        .map((v) => {
          const d = new Date(v.created_at);
          return {
            id: v.id,
            cliente: (v.cliente_id && clienteNome.get(v.cliente_id)) || "Sem cliente",
            pagamento: v.forma_pagamento,
            valor: Number(v.total || 0),
            status: v.status,
            data: `${String(d.getDate()).padStart(2, "0")}/${String(
              d.getMonth() + 1
            ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
              d.getMinutes()
            ).padStart(2, "0")}`,
          };
        }),
    [vendas, janela, clienteNome]
  );

  const saidasPeriodo = useMemo<SaidaPeriodo[]>(() => {
    const lista: SaidaPeriodo[] = [];

    despesas
      .filter((d) => d.status === "pago")
      .forEach((d) => {
        const data = d.data_pagamento || d.data;
        if (!dentroDoPeriodo(data, period.inicio, period.fim)) return;
        lista.push({
          id: `d-${d.id}`,
          data,
          titulo: d.descricao,
          detalhe: d.categoria,
          valor: Number(d.valor || 0),
        });
      });

    pagamentosEquipe.forEach((p) => {
      if (!dentroDoPeriodo(p.data_pagamento, period.inicio, period.fim)) return;
      lista.push({
        id: `f-${p.id}`,
        data: p.data_pagamento,
        titulo: `Pagamento • ${funcionarioNome.get(p.funcionario_id) || "Funcionário"}`,
        detalhe: "Folha",
        valor: Number(p.valor_liquido || 0),
      });
    });

    vales.forEach((v) => {
      if (!dentroDoPeriodo(v.data, period.inicio, period.fim)) return;
      lista.push({
        id: `v-${v.id}`,
        data: v.data,
        titulo: `Vale • ${funcionarioNome.get(v.funcionario_id) || "Funcionário"}`,
        detalhe: v.observacao || "Adiantamento",
        valor: Number(v.valor || 0),
      });
    });

    return lista.sort((a, b) => b.data.localeCompare(a.data));
  }, [despesas, pagamentosEquipe, vales, funcionarioNome, period.inicio, period.fim]);

  const condicionaisAbertas = condicionais.filter((c) => c.status === "aberto").length;
  const vendasRecebidas = Number(resumoPeriodo.vendas_periodo || 0);

  return (
    <div className="space-y-6">
      {erro && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Não foi possível carregar alguns dados: {erro}
        </div>
      )}

      <SalesPanel vendas={vendasLite} loading={loading} onRefresh={carregar} />

      <section className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 min-[2200px]:grid-cols-6">
        <MetricCard
          icon={ShoppingCart}
          tint="#2563eb"
          title={janela.ehHoje ? "Vendas da loja hoje" : "Vendas da loja"}
          value={loading ? "…" : formatCurrency(vendasRecebidas)}
          deltaLabel={`recebido · ${labelForPeriod(period)}`}
          href="/dashboard/vendas"
          ariaLabel="Ver vendas da loja"
        />

        <MetricCard
          icon={CircleDollarSign}
          tint="#16a34a"
          title="Ganhos de serviços"
          value={loading ? "…" : formatCurrency(resumoPeriodo.receita_servicos)}
          deltaLabel={labelForPeriod(period)}
          href="/dashboard/servicos"
          ariaLabel="Ver ganhos de serviços"
        />

        {podeVerFinanceiro && (
          <MetricCard
            icon={ReceiptText}
            tint="#dc2626"
            title="Despesas pagas"
            value={loading ? "…" : formatCurrency(resumoPeriodo.despesas_pagas)}
            deltaLabel={labelForPeriod(period)}
            href="/dashboard/financeiro"
            ariaLabel="Ver despesas pagas"
          />
        )}

        {podeVerFinanceiro && (
          <MetricCard
            icon={CircleDollarSign}
            tint="#7c3aed"
            title="Faturamento do mês"
            value={loading ? "…" : formatCurrency(resumoMes.movimentacao_mes)}
            deltaLabel="entradas + serviços + saídas pagas"
            href="/dashboard/financeiro"
            ariaLabel="Ver faturamento e movimentação"
          />
        )}

        <MetricCard
          icon={Wallet}
          tint="#0891b2"
          title="Contas a receber"
          value={loading ? "…" : formatCurrency(resumoMes.contas_receber)}
          href="/dashboard/promissorias?status=em_aberto"
          ariaLabel="Ver promissórias a receber"
        />

        <MetricCard
          icon={FileText}
          tint="#ea580c"
          title="Condicionais em aberto"
          value={loading ? "…" : String(condicionaisAbertas)}
          href="/dashboard/condicional?status=aberto"
          ariaLabel="Ver condicionais em aberto"
        />
      </section>

      <TopProducts produtos={maisVendidos} loading={loading} />

      {podeVerFinanceiro && (
        <section className="rounded-3xl border border-[#eef2f7] bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.05)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-black text-[#0f172a]">Contas pagas no período</p>
              <p className="mt-1 text-xs text-[#64748b]">
                {labelForPeriod(period)} · fornecedores, despesas, folha e vales realmente pagos.
              </p>
            </div>
            <p className="text-xl font-black text-[#dc2626]">
              {formatCurrency(resumoPeriodo.despesas_pagas)}
            </p>
          </div>

          {saidasPeriodo.length === 0 ? (
            <p className="mt-4 rounded-2xl bg-[#f8fafc] p-4 text-sm text-[#64748b]">
              Nenhuma saída paga nesse período.
            </p>
          ) : (
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {saidasPeriodo.slice(0, 6).map((item) => (
                <div key={item.id} className="rounded-2xl border border-[#eef2f7] bg-[#f8fafc] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[#0f172a]">{item.titulo}</p>
                      <p className="mt-1 truncate text-xs text-[#64748b]">
                        {dataBR(item.data)} · {item.detalhe}
                      </p>
                    </div>
                    <strong className="shrink-0 text-sm text-[#b91c1c]">
                      {formatCurrency(item.valor)}
                    </strong>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[0.95fr_1.2fr_1fr]">
        <MiniCalendar />
        <RecentSales
          vendas={ultimas}
          totalQtd={qtdPeriodo}
          totalValor={vendasRecebidas}
          loading={loading}
        />
        <TasksAlerts />
      </section>
    </div>
  );
}
