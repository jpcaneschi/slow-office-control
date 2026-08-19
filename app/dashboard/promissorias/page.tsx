"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  calcularParcelaSugerida,
  calcularSaldoPromissoria,
  formatCurrency,
  obterCorStatus,
  validarRegrasPromissoria,
} from "@/lib/promissorias-utils";
import { carregarConfigEmpresa } from "@/lib/empresa-config";

type Cliente = {
  id: string;
  nome: string;
};

type Promissoria = {
  id: string;
  cliente_id: string;
  valor_total: number;
  parcelas: number;
  status: string;
  observacao: string | null;
  created_at: string;
};

export default function PromissoriasPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [promissorias, setPromissorias] = useState<Promissoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [clienteId, setClienteId] = useState("");
  const [valorTotal, setValorTotal] = useState("");
  const [parcelas, setParcelas] = useState("1");
  const [observacao, setObservacao] = useState("");
  const [dataVencimento, setDataVencimento] = useState("");

  // Pagamentos (parciais)
  const [pagamentos, setPagamentos] = useState<
    { promissoria_id: string; valor: number }[]
  >([]);
  const [valorPagamento, setValorPagamento] = useState<Record<string, string>>({});
  const [pagando, setPagando] = useState(false);

  // Config da loja (fonte única): prazo máximo e parcela mínima.
  const [prazoMaxMeses, setPrazoMaxMeses] = useState(4);
  const [parcelaMinima, setParcelaMinima] = useState(0);

  async function carregarDados() {
    setLoading(true);
    setErro("");

    const cfg = await carregarConfigEmpresa();
    setPrazoMaxMeses(cfg.promissoria_prazo_meses);
    setParcelaMinima(cfg.parcela_minima);

    const [clientesRes, promissoriasRes, pagamentosRes] = await Promise.all([
      supabase
        .from("clientes")
        .select("id, nome")
        .order("created_at", { ascending: false }),
      supabase
        .from("promissorias")
        .select("id, cliente_id, valor_total, parcelas, status, observacao, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("promissoria_pagamentos").select("promissoria_id, valor"),
    ]);

    if (clientesRes.error) setErro(clientesRes.error.message);
    if (promissoriasRes.error) setErro(promissoriasRes.error.message);

    setClientes(clientesRes.data || []);
    setPromissorias(promissoriasRes.data || []);
    setPagamentos(pagamentosRes.data || []);
    setLoading(false);
  }

  // Total pago e saldo por promissória.
  const pagoPorPromissoria = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const p of pagamentos) {
      mapa[p.promissoria_id] =
        (mapa[p.promissoria_id] || 0) + Number(p.valor || 0);
    }
    return mapa;
  }, [pagamentos]);

  function saldoDe(prom: Promissoria) {
    return calcularSaldoPromissoria(
      Number(prom.valor_total || 0),
      pagoPorPromissoria[prom.id] || 0,
      prom.status
    );
  }

  useEffect(() => {
    carregarDados();
  }, []);

  const [filtroStatus, setFiltroStatus] = useState("todos");

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("status");
    if (s) setFiltroStatus(s);
  }, []);

  function aplicarFiltro(v: string) {
    setFiltroStatus(v);
    const params = new URLSearchParams(window.location.search);
    if (v === "todos") params.delete("status");
    else params.set("status", v);
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      qs ? `${window.location.pathname}?${qs}` : window.location.pathname
    );
  }

  const promissoriasFiltradas = useMemo(() => {
    if (filtroStatus === "todos") return promissorias;
    return promissorias.filter((p) => p.status === filtroStatus);
  }, [promissorias, filtroStatus]);

  const totalAberto = useMemo(() => {
    return promissorias
      .filter((item) => item.status !== "pago" && item.status !== "cancelado")
      .reduce((acc, item) => acc + saldoDe(item), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promissorias, pagoPorPromissoria]);

  // "Total recebido" = soma de TODOS os pagamentos (inclui os parciais),
  // não só as promissórias quitadas.
  const totalPago = useMemo(() => {
    return pagamentos.reduce((acc, p) => acc + Number(p.valor || 0), 0);
  }, [pagamentos]);

  // Valor originalmente financiado (todas as promissórias não canceladas).
  const totalFinanciado = useMemo(() => {
    return promissorias
      .filter((item) => item.status !== "cancelado")
      .reduce((acc, item) => acc + Number(item.valor_total || 0), 0);
  }, [promissorias]);

  const valorTotalNumero = Number(valorTotal || 0);
  const parcelasNumero = Number(parcelas || 0);
  const valorParcelaSugerida = calcularParcelaSugerida(valorTotalNumero, parcelasNumero);
  const regraMensagem = validarRegrasPromissoria(valorTotalNumero, parcelasNumero, {
    prazoMaxMeses,
    parcelaMinima,
  });

  function limparFormulario() {
    setClienteId("");
    setValorTotal("");
    setParcelas("1");
    setObservacao("");
    setDataVencimento("");
  }

  async function criarPromissoria() {
    setErro("");

    if (!clienteId) {
      setErro("Selecione um cliente.");
      return;
    }

    const mensagemRegra = validarRegrasPromissoria(valorTotalNumero, parcelasNumero, {
      prazoMaxMeses,
      parcelaMinima,
    });

    if (mensagemRegra) {
      setErro(mensagemRegra);
      return;
    }

    setSalvando(true);

    try {
      const { error } = await supabase.from("promissorias").insert({
        cliente_id: clienteId,
        valor_total: valorTotalNumero,
        parcelas: parcelasNumero,
        status: "em_aberto",
        observacao: observacao.trim() || null,
        data_vencimento: dataVencimento || null,
      });

      if (error) {
        throw new Error(error.message);
      }

      limparFormulario();
      await carregarDados();
    } catch (err) {
      setErro(
        err instanceof Error
          ? err.message
          : "Não foi possível criar a promissória."
      );
    }

    setSalvando(false);
  }

  async function registrarPagamento(prom: Promissoria) {
    setErro("");
    const saldo = saldoDe(prom);
    const bruto = valorPagamento[prom.id];
    // Se o campo estiver vazio, quita o saldo restante.
    const valor = bruto === undefined || bruto === "" ? saldo : Number(bruto);

    if (!Number.isFinite(valor) || valor <= 0) {
      setErro("Informe um valor de pagamento válido.");
      return;
    }
    if (valor > saldo + 0.001) {
      setErro(
        `O pagamento (${formatCurrency(valor)}) é maior que o saldo (${formatCurrency(saldo)}).`
      );
      return;
    }

    setPagando(true);
    // Chave de idempotência: reenvio/duplo-clique não gera pagamento duplicado.
    const idempKey =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${prom.id}-${Date.now()}`;
    const { error } = await supabase.rpc("registrar_pagamento_promissoria", {
      p_promissoria_id: prom.id,
      p_valor: valor,
      p_forma: null,
      p_obs: null,
      p_idempotency_key: idempKey,
    });
    if (error) {
      setErro(error.message);
      setPagando(false);
      return;
    }
    setValorPagamento((atual) => ({ ...atual, [prom.id]: "" }));
    setPagando(false);
    await carregarDados();
  }

  async function marcarComoAtrasado(id: string) {
    const { error } = await supabase
      .from("promissorias")
      .update({ status: "atrasado" })
      .eq("id", id);

    if (error) {
      setErro(error.message);
      return;
    }

    await carregarDados();
  }

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Financeiro e crédito"
        title="Promissórias"
        description="Controle parcelamentos da loja com regra de parcela mínima e limite máximo de prazo."
      />

      {erro && (
        <div className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-4 text-sm text-[#b91c1c]">
          {erro}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[28px] border border-[#e8ecf4] bg-white p-5">
          <p className="text-sm font-bold text-[#475569]">Em aberto (qtd)</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-[#0f172a]">
            {promissorias.filter((item) => item.status !== "pago" && item.status !== "cancelado").length}
          </p>
        </div>

        <div className="rounded-[28px] border border-[#e8ecf4] bg-white p-5">
          <p className="text-sm font-bold text-[#475569]">Financiado</p>
          <p className="mt-3 text-2xl font-black tracking-tight text-[#0f172a]">
            {formatCurrency(totalFinanciado)}
          </p>
        </div>

        <div className="rounded-[28px] border border-[#bbf7d0] bg-[#f0fdf4] p-5">
          <p className="text-sm font-bold text-[#15803d]">Total recebido</p>
          <p className="mt-3 text-2xl font-black tracking-tight text-[#0f172a]">
            {formatCurrency(totalPago)}
          </p>
          <p className="mt-1 text-xs text-[#94a3b8]">inclui pagamentos parciais</p>
        </div>

        <div className="rounded-[28px] border border-[#fde68a] bg-[#fffbeb] p-5">
          <p className="text-sm font-bold text-[#b45309]">Saldo em aberto</p>
          <p className="mt-3 text-2xl font-black tracking-tight text-[#0f172a]">
            {formatCurrency(totalAberto)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="space-y-6">
          <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
            <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
              Nova promissória
            </h2>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-sm text-[#475569]">Cliente</label>
                <select
                  value={clienteId}
                  onChange={(e) => setClienteId(e.target.value)}
                  className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                >
                  <option value="">Selecione o cliente</option>
                  {clientes.map((cliente) => (
                    <option key={cliente.id} value={cliente.id}>
                      {cliente.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#475569]">Valor total</label>
                <input
                  type="number"
                  value={valorTotal}
                  onChange={(e) => setValorTotal(e.target.value)}
                  className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                  placeholder="Ex: 1200"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#475569]">Quantidade de meses</label>
                <input
                  type="number"
                  value={parcelas}
                  onChange={(e) => setParcelas(e.target.value)}
                  className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                  placeholder="Ex: 1 até 4"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#475569]">
                  Data de vencimento
                </label>
                <input
                  type="date"
                  value={dataVencimento}
                  onChange={(e) => setDataVencimento(e.target.value)}
                  className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#475569]">Observação</label>
                <textarea
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  className="min-h-[100px] w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                  placeholder="Ex: cliente combinou pagamento em 4 meses"
                />
              </div>

              <div className="rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] p-4">
                <p className="text-sm font-bold text-[#475569]">Parcela mensal</p>
                <p className="mt-2 text-2xl font-black tracking-tight text-[#0f172a]">
                  {formatCurrency(valorParcelaSugerida)}
                </p>
                <p className="mt-2 text-sm text-[#64748b]">
                  {regraMensagem || "Condição válida para criação da promissória."}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={criarPromissoria}
              disabled={salvando}
              className="mt-5 w-full rounded-2xl bg-[#2563eb] px-4 py-3 font-bold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
            >
              {salvando ? "Salvando..." : "Criar promissória"}
            </button>
          </div>

          <div className="rounded-[30px] border border-[#bfdbfe] bg-[#eff6ff] p-6">
            <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
              Regras atuais da loja
            </h2>
            <div className="mt-4 space-y-3 text-sm text-[#475569]">
              <p>
                • Prazo máximo: {prazoMaxMeses}{" "}
                {prazoMaxMeses === 1 ? "mês" : "meses"} (definido em Configurações).
              </p>
              <p>
                • Parcela mínima:{" "}
                {parcelaMinima > 0
                  ? `${formatCurrency(parcelaMinima)} por mês`
                  : "sem mínimo"}
                .
              </p>
              <p>• O sistema valida no servidor — não só nesta tela.</p>
            </div>
          </div>
        </div>

        <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
              Promissórias registradas
            </h2>
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { v: "todos", l: "Todas" },
                { v: "em_aberto", l: "Em aberto" },
                { v: "pago", l: "Pagas" },
                { v: "atrasado", l: "Atrasadas" },
                { v: "cancelado", l: "Canceladas" },
              ].map((f) => (
                <button
                  key={f.v}
                  onClick={() => aplicarFiltro(f.v)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    filtroStatus === f.v
                      ? "bg-[#2563eb] text-white"
                      : "border border-[#e8ecf4] bg-white text-[#334155] hover:bg-[#f4f6fb]"
                  }`}
                >
                  {f.l}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <p className="mt-4 text-[#64748b]">Carregando promissórias...</p>
          ) : promissoriasFiltradas.length === 0 ? (
            <p className="mt-4 text-[#64748b]">
              {promissorias.length === 0
                ? "Nenhuma promissória cadastrada ainda."
                : "Nenhuma promissória com esse filtro."}
            </p>
          ) : (
            <div className="mt-5 space-y-4">
              {promissoriasFiltradas.map((item) => {
                const cliente = clientes.find((c) => c.id === item.cliente_id);
                const parcelaMensal = calcularParcelaSugerida(
                  Number(item.valor_total || 0),
                  Number(item.parcelas || 0)
                );

                return (
                  <div
                    key={item.id}
                    className="rounded-[24px] border border-[#e8ecf4] bg-[#f8fafc]/80 p-4"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-black text-[#0f172a]">
                            {cliente?.nome || "Cliente não encontrado"}
                          </p>

                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${obterCorStatus(
                              item.status
                            )}`}
                          >
                            {item.status}
                          </span>
                        </div>

                        <p className="text-sm text-[#64748b]">
                          Total: {formatCurrency(Number(item.valor_total || 0))} · Meses: {item.parcelas}
                        </p>

                        <p className="text-sm text-[#64748b]">
                          Parcela mensal: {formatCurrency(parcelaMensal)}
                        </p>

                        <p className="text-sm">
                          <span className="text-[#15803d]">
                            Pago: {formatCurrency(pagoPorPromissoria[item.id] || 0)}
                          </span>{" "}
                          ·{" "}
                          <span className="font-bold text-[#b45309]">
                            Saldo: {formatCurrency(saldoDe(item))}
                          </span>
                        </p>

                        <p className="text-sm text-[#94a3b8]">
                          {item.observacao || "Sem observação"}
                        </p>
                      </div>

                      <div className="flex min-w-[210px] flex-col gap-2">
                        {item.status === "pago" ? (
                          <span className="rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-2 text-center text-sm font-bold text-[#15803d]">
                            Quitada ✓
                          </span>
                        ) : item.status === "cancelado" ? (
                          <span className="rounded-2xl border border-[#e2e8f0] bg-[#f8fafc] px-4 py-2 text-center text-sm font-bold text-[#64748b]">
                            Cancelada
                          </span>
                        ) : (
                          <>
                            <div>
                              <label className="mb-1 block text-xs text-[#475569]">
                                Registrar pagamento
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={valorPagamento[item.id] ?? ""}
                                onChange={(e) =>
                                  setValorPagamento((atual) => ({
                                    ...atual,
                                    [item.id]: e.target.value,
                                  }))
                                }
                                placeholder={`Saldo ${formatCurrency(saldoDe(item))}`}
                                className="w-full rounded-2xl border border-[#e8ecf4] bg-white px-4 py-2 text-sm text-[#0f172a] outline-none"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => registrarPagamento(item)}
                              disabled={pagando}
                              className="rounded-2xl bg-[#2563eb] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
                            >
                              {pagando ? "..." : "Receber"}
                            </button>
                            <button
                              type="button"
                              onClick={() => marcarComoAtrasado(item.id)}
                              className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] px-4 py-2 text-sm font-bold text-[#b91c1c] transition hover:bg-[#fee2e2]"
                            >
                              Marcar como atrasada
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}