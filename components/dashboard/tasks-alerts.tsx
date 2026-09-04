"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Boxes,
  ListTodo,
  CalendarClock,
  ClipboardList,
  HandCoins,
  ReceiptText,
  AlertTriangle,
  ChevronRight,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/vendas-utils";
import { toISODate } from "@/lib/eventos-utils";
import { LIMITE_ESTOQUE } from "@/lib/notificacoes-core";
import {
  agregarPagamentosPromissoria,
  calcularSaldoTotalPromissorias,
} from "@/lib/promissorias-utils";
import {
  contarProdutosEstoqueBaixo,
  type ProdutoEstoqueStatus,
  type VariacaoEstoque,
} from "@/lib/estoque-utils";
import { SensitiveValue } from "@/components/dashboard/dashboard-preferences";

type Produto = ProdutoEstoqueStatus;
type Condicional = { status: string; data_limite: string | null };
type Promissoria = { id: string; valor_total: number | null; status: string };
type Pagamento = { promissoria_id: string; valor: number | null };
type EventoLite = { tipo: string; status: string; data: string };
type DespesaFornecedor = {
  id: string;
  status: string | null;
  data_vencimento: string | null;
  fornecedor: string | null;
  valor: number | null;
};

type Alerta = {
  key: string;
  icon: LucideIcon;
  tint: string;
  title: string;
  subtitle: string;
  badge: string;
  href: string;
  ativo: boolean;
};

function addDias(iso: string, dias: number) {
  const [a, m, d] = iso.split("-").map(Number);
  const x = new Date(a, m - 1, d);
  x.setDate(x.getDate() + dias);
  return toISODate(x);
}

export function TasksAlerts() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [variacoes, setVariacoes] = useState<VariacaoEstoque[]>([]);
  const [condicionais, setCondicionais] = useState<Condicional[]>([]);
  const [promissorias, setPromissorias] = useState<Promissoria[]>([]);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [eventos, setEventos] = useState<EventoLite[]>([]);
  const [fornecedores, setFornecedores] = useState<DespesaFornecedor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function carregar() {
      setLoading(true);
      const [prodRes, varRes, condRes, promRes, pagRes, evRes, despRes] = await Promise.all([
        supabase.from("produtos").select("id, estoque, status, tem_variacoes"),
        supabase.from("produto_variacoes").select("produto_id, estoque"),
        supabase.from("condicionais").select("status, data_limite"),
        supabase.from("promissorias").select("id, valor_total, status"),
        supabase.from("promissoria_pagamentos").select("promissoria_id, valor"),
        supabase.from("eventos").select("tipo, status, data"),
        supabase
          .from("despesas")
          .select("id,status,data_vencimento,fornecedor,valor")
          .neq("status", "pago")
          .not("fornecedor", "is", null),
      ]);
      setProdutos((prodRes.data as Produto[]) || []);
      setVariacoes((varRes.data as VariacaoEstoque[]) || []);
      setCondicionais((condRes.data as Condicional[]) || []);
      setPromissorias((promRes.data as Promissoria[]) || []);
      setPagamentos((pagRes.data as Pagamento[]) || []);
      setEventos((evRes.data as EventoLite[]) || []);
      setFornecedores((despRes.data as DespesaFornecedor[]) || []);
      setLoading(false);
    }
    carregar();
  }, []);

  const hoje = toISODate(new Date());
  const em3 = addDias(hoje, 3);

  const estoqueBaixo = contarProdutosEstoqueBaixo(produtos, variacoes, LIMITE_ESTOQUE);
  const tarefasHoje = eventos.filter(
    (e) => e.tipo === "tarefa" && e.status === "pendente" && e.data === hoje
  ).length;
  const condicionaisAbertas = condicionais.filter((c) => c.status === "aberto").length;
  const retornosAtrasados = condicionais.filter(
    (c) => c.status === "aberto" && c.data_limite != null && c.data_limite < hoje
  ).length;

  const promissoriasAbertas = promissorias.filter((p) => p.status === "em_aberto");
  const promissoriasValor = calcularSaldoTotalPromissorias(
    promissoriasAbertas,
    agregarPagamentosPromissoria(pagamentos)
  );

  const boletosAtrasados = fornecedores.filter(
    (d) => d.data_vencimento != null && d.data_vencimento < hoje
  );
  const boletosVencendo = fornecedores.filter(
    (d) => d.data_vencimento != null && d.data_vencimento >= hoje && d.data_vencimento <= em3
  );
  const valorVencendo = boletosVencendo.reduce((s, d) => s + Number(d.valor || 0), 0);
  const valorAtrasado = boletosAtrasados.reduce((s, d) => s + Number(d.valor || 0), 0);

  const plural = (n: number, sing: string, plu: string) => `${n} ${n === 1 ? sing : plu}`;

  const alertas: Alerta[] = [
    {
      key: "fornecedor-atrasado",
      icon: AlertTriangle,
      tint: "#dc2626",
      title: "Boletos de fornecedor vencidos",
      subtitle: plural(boletosAtrasados.length, "boleto atrasado", "boletos atrasados"),
      badge: formatCurrency(valorAtrasado),
      href: "/dashboard/financeiro",
      ativo: boletosAtrasados.length > 0,
    },
    {
      key: "fornecedor-vencendo",
      icon: ReceiptText,
      tint: "#d97706",
      title: "Fornecedor vence em até 3 dias",
      subtitle: plural(boletosVencendo.length, "boleto próximo", "boletos próximos"),
      badge: formatCurrency(valorVencendo),
      href: "/dashboard/financeiro",
      ativo: boletosVencendo.length > 0,
    },
    {
      key: "estoque",
      icon: Boxes,
      tint: "#dc2626",
      title: "Estoque crítico",
      subtitle: `Produtos com estoque ≤ ${LIMITE_ESTOQUE}`,
      badge: plural(estoqueBaixo, "item", "itens"),
      href: "/dashboard/produtos?estoque=critico",
      ativo: estoqueBaixo > 0,
    },
    {
      key: "tarefas",
      icon: ListTodo,
      tint: "#2563eb",
      title: "Tarefas do dia",
      subtitle: "Pendentes para hoje",
      badge: plural(tarefasHoje, "tarefa", "tarefas"),
      href: "/dashboard/agenda",
      ativo: tarefasHoje > 0,
    },
    {
      key: "retornos",
      icon: CalendarClock,
      tint: "#d97706",
      title: "Retornos atrasados",
      subtitle: "Condicionais fora do prazo",
      badge: plural(retornosAtrasados, "atrasado", "atrasados"),
      href: "/dashboard/condicional?status=atrasado",
      ativo: retornosAtrasados > 0,
    },
    {
      key: "condicionais",
      icon: ClipboardList,
      tint: "#0891b2",
      title: "Condicionais em aberto",
      subtitle: "Aguardando finalização",
      badge: plural(condicionaisAbertas, "título", "títulos"),
      href: "/dashboard/condicional?status=aberto",
      ativo: condicionaisAbertas > 0,
    },
    {
      key: "promissorias",
      icon: HandCoins,
      tint: "#16a34a",
      title: "Promissórias a receber",
      subtitle: plural(promissoriasAbertas.length, "em aberto", "em aberto"),
      badge: formatCurrency(promissoriasValor),
      href: "/dashboard/promissorias?status=em_aberto",
      ativo: promissoriasAbertas.length > 0,
    },
  ].filter((a) => a.ativo);

  const tudoEmDia = !loading && alertas.length === 0;

  return (
    <div className="flex h-full flex-col rounded-3xl border border-[#eef2f7] bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.05)]">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-[#0f172a]">Tarefas e alertas</h3>
          <p className="mt-0.5 text-xs text-[#94a3b8]">Rotina monitorada automaticamente</p>
        </div>
        <Link href="/dashboard/tarefas-alertas" className="text-sm font-semibold text-[#2563eb] transition hover:underline">
          Ver todas
        </Link>
      </div>

      {loading ? (
        <div className="flex-1 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 w-full animate-pulse rounded-xl bg-[#f1f5f9]" />
          ))}
        </div>
      ) : tudoEmDia ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#dcfce7] text-[#16a34a]">
            <CheckCircle2 className="h-6 w-6" />
          </span>
          <p className="text-sm font-semibold text-[#475569]">Tudo em dia ✓</p>
          <p className="text-xs text-[#94a3b8]">Nenhum alerta pendente no momento.</p>
        </div>
      ) : (
        <div className="flex-1 space-y-1">
          {alertas.map((a) => {
            const Icon = a.icon;
            return (
              <Link key={a.key} href={a.href} className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition hover:bg-[#f4f6fb]">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${a.tint}1a`, color: a.tint }}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-[#0f172a]">{a.title}</span>
                  <span className="block truncate text-xs text-[#64748b]">{a.subtitle}</span>
                </span>
                <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold" style={{ backgroundColor: `${a.tint}1a`, color: a.tint }}>
                  {a.badge.includes("R$") ? (
                    <SensitiveValue>{a.badge}</SensitiveValue>
                  ) : (
                    a.badge
                  )}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[#cbd5e1]" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
