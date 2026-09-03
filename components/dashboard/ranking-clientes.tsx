"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Crown,
  LoaderCircle,
  Medal,
  ReceiptText,
  ShoppingBag,
  Trophy,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatDataBR, hojeISO, parseDataLocal, toISOLocal } from "@/lib/datas";

type RankingCliente = {
  cliente_id: string;
  cliente_nome: string;
  total_gasto: number;
  compras: number;
  ticket_medio: number;
  ultima_compra: string | null;
};

const inputClass =
  "w-full rounded-xl border border-[#dfe6f0] bg-white px-3 py-2.5 text-sm font-semibold text-[#0f172a] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10";

function brl(valor: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(valor || 0));
}

function periodoMes(mes: string) {
  const inicio = `${mes}-01`;
  const data = parseDataLocal(inicio);
  data.setMonth(data.getMonth() + 1);
  data.setDate(0);
  return { inicio, fim: toISOLocal(data) };
}

function mesAnterior(mes: string) {
  const data = parseDataLocal(`${mes}-01`);
  data.setMonth(data.getMonth() - 1);
  return toISOLocal(data).slice(0, 7);
}

function numero(valor: unknown) {
  const convertido = Number(valor);
  return Number.isFinite(convertido) ? convertido : 0;
}

export function RankingClientes() {
  const hoje = hojeISO();
  const mesAtual = hoje.slice(0, 7);
  const periodoInicial = periodoMes(mesAtual);
  const [mes, setMes] = useState(mesAtual);
  const [inicio, setInicio] = useState(periodoInicial.inicio);
  const [fim, setFim] = useState(periodoInicial.fim);
  const [ranking, setRanking] = useState<RankingCliente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    if (!inicio || !fim || fim < inicio) {
      setErro("Confira as datas do ranking.");
      return;
    }

    setCarregando(true);
    setErro("");
    const { data, error } = await supabase.rpc("ranking_clientes_periodo", {
      p_inicio: inicio,
      p_fim: fim,
      p_limite: 200,
    });

    if (error) {
      setErro(error.message);
      setRanking([]);
    } else {
      setRanking(
        ((data || []) as Record<string, unknown>[]).map((linha) => ({
          cliente_id: String(linha.cliente_id || ""),
          cliente_nome: String(linha.cliente_nome || "Cliente"),
          total_gasto: numero(linha.total_gasto),
          compras: numero(linha.compras),
          ticket_medio: numero(linha.ticket_medio),
          ultima_compra: linha.ultima_compra
            ? String(linha.ultima_compra).slice(0, 10)
            : null,
        }))
      );
    }
    setCarregando(false);
  }, [fim, inicio]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const rankingOrdenado = useMemo(
    () =>
      [...ranking].sort(
        (a, b) =>
          b.total_gasto - a.total_gasto ||
          a.cliente_nome.localeCompare(b.cliente_nome, "pt-BR")
      ),
    [ranking]
  );

  function aplicarMes(novoMes: string) {
    if (!novoMes) return;
    const periodo = periodoMes(novoMes);
    setMes(novoMes);
    setInicio(periodo.inicio);
    setFim(periodo.fim);
  }

  function aplicarAnoAtual() {
    setMes("");
    setInicio(`${hoje.slice(0, 4)}-01-01`);
    setFim(`${hoje.slice(0, 4)}-12-31`);
  }

  const iconesPodio = [Crown, Trophy, Medal];

  return (
    <section className="overflow-hidden rounded-[30px] border border-[#dbe7fb] bg-white shadow-[0_8px_30px_rgba(15,57,130,0.06)]">
      <div className="bg-gradient-to-r from-[#071d43] via-[#0b3c91] to-[#1167e8] px-5 py-6 text-white sm:px-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[#bcd4ff]">
              <Trophy className="h-4 w-4" /> Relacionamento
            </div>
            <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
              Ranking de clientes
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#dbeafe]">
              Veja os clientes ordenados exclusivamente pelo valor total gasto no período escolhido.
            </p>
          </div>
          <span className="inline-flex w-fit rounded-full border border-white/25 bg-white/10 px-4 py-2 text-xs font-black text-white">
            Ordenado por valor gasto
          </span>
        </div>
      </div>

      <div className="space-y-5 p-4 sm:p-6">
        <div className="grid gap-3 lg:grid-cols-[190px_1fr_1fr_auto] lg:items-end">
          <label className="text-xs font-black uppercase tracking-wide text-[#64748b]">
            Escolher mês
            <input
              type="month"
              value={mes}
              onChange={(event) => aplicarMes(event.target.value)}
              className={`${inputClass} mt-1.5`}
            />
          </label>
          <label className="text-xs font-black uppercase tracking-wide text-[#64748b]">
            Data inicial
            <input
              type="date"
              value={inicio}
              onChange={(event) => {
                setMes("");
                setInicio(event.target.value);
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
                setMes("");
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
            {carregando ? "Atualizando…" : "Aplicar"}
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          <button
            type="button"
            onClick={() => aplicarMes(mesAtual)}
            className="shrink-0 rounded-full border border-[#dfe6f0] px-3.5 py-2 text-xs font-black text-[#475569]"
          >
            Este mês
          </button>
          <button
            type="button"
            onClick={() => aplicarMes(mesAnterior(mesAtual))}
            className="shrink-0 rounded-full border border-[#dfe6f0] px-3.5 py-2 text-xs font-black text-[#475569]"
          >
            Mês passado
          </button>
          <button
            type="button"
            onClick={aplicarAnoAtual}
            className="shrink-0 rounded-full border border-[#dfe6f0] px-3.5 py-2 text-xs font-black text-[#475569]"
          >
            Este ano
          </button>
          <span className="inline-flex shrink-0 items-center gap-1.5 px-2 text-xs font-bold text-[#64748b]">
            <CalendarDays className="h-3.5 w-3.5" /> {formatDataBR(inicio)} a {formatDataBR(fim)}
          </span>
        </div>

        {erro && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {erro}
          </div>
        )}

        {carregando ? (
          <div className="flex min-h-44 items-center justify-center gap-2 text-sm font-bold text-[#64748b]">
            <LoaderCircle className="h-5 w-5 animate-spin" /> Calculando ranking…
          </div>
        ) : rankingOrdenado.length === 0 ? (
          <div className="rounded-2xl bg-[#f8fafc] p-6 text-center text-sm text-[#64748b]">
            Nenhuma venda vinculada a cliente neste período.
          </div>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              {rankingOrdenado.slice(0, 3).map((cliente, indice) => {
                const Icone = iconesPodio[indice];
                return (
                  <Link
                    key={cliente.cliente_id}
                    href={`/dashboard/clientes/${cliente.cliente_id}`}
                    className="rounded-2xl border border-[#dbe7fb] bg-[#f8fbff] p-4 transition hover:border-[#93b4f8] hover:bg-white"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#2563eb]">
                          {indice + 1}º lugar
                        </p>
                        <p className="mt-1 truncate text-base font-black text-[#0f172a]">
                          {cliente.cliente_nome}
                        </p>
                      </div>
                      <Icone className="h-5 w-5 shrink-0 text-[#f59e0b]" />
                    </div>
                    <p className="mt-4 text-xl font-black text-[#0b3c91]">
                      {brl(cliente.total_gasto)}
                    </p>
                    <p className="mt-1 text-xs text-[#64748b]">
                      {cliente.compras} compras · ticket {brl(cliente.ticket_medio)}
                    </p>
                  </Link>
                );
              })}
            </div>

            <div className="overflow-hidden rounded-2xl border border-[#e8edf5]">
              <div className="hidden grid-cols-[58px_1fr_140px_110px_130px_110px] gap-3 bg-[#f8fafc] px-4 py-3 text-[10px] font-black uppercase tracking-wide text-[#64748b] md:grid">
                <span>Posição</span>
                <span>Cliente</span>
                <span className="text-right">Total gasto</span>
                <span className="text-right">Compras</span>
                <span className="text-right">Ticket médio</span>
                <span className="text-right">Última</span>
              </div>
              <div className="divide-y divide-[#eef2f7]">
                {rankingOrdenado.map((cliente, indice) => (
                  <Link
                    key={cliente.cliente_id}
                    href={`/dashboard/clientes/${cliente.cliente_id}`}
                    className="grid gap-3 p-4 transition hover:bg-[#f8fbff] md:grid-cols-[58px_1fr_140px_110px_130px_110px] md:items-center"
                  >
                    <span className="text-xs font-black text-[#2563eb]">#{indice + 1}</span>
                    <span className="min-w-0 truncate text-sm font-black text-[#0f172a]">
                      {cliente.cliente_nome}
                    </span>
                    <div className="flex items-center justify-between gap-3 md:block md:text-right">
                      <span className="text-[10px] font-bold uppercase text-[#94a3b8] md:hidden">Total gasto</span>
                      <span className="text-sm font-black text-[#0b3c91]">{brl(cliente.total_gasto)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 md:block md:text-right">
                      <span className="text-[10px] font-bold uppercase text-[#94a3b8] md:hidden">Compras</span>
                      <span className="inline-flex items-center gap-1 text-sm font-bold text-[#475569] md:justify-end">
                        <ShoppingBag className="h-3.5 w-3.5" /> {cliente.compras}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 md:block md:text-right">
                      <span className="text-[10px] font-bold uppercase text-[#94a3b8] md:hidden">Ticket médio</span>
                      <span className="inline-flex items-center gap-1 text-sm font-bold text-[#475569] md:justify-end">
                        <ReceiptText className="h-3.5 w-3.5" /> {brl(cliente.ticket_medio)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-xs text-[#64748b] md:block md:text-right">
                      <span className="text-[10px] font-bold uppercase text-[#94a3b8] md:hidden">Última compra</span>
                      <span>{cliente.ultima_compra ? formatDataBR(cliente.ultima_compra) : "—"}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
