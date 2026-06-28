"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  calcularParcelaSugerida,
  formatCurrency,
  obterCorStatus,
  validarRegrasPromissoria,
} from "@/lib/promissorias-utils";

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

  async function carregarDados() {
    setLoading(true);
    setErro("");

    const [clientesRes, promissoriasRes] = await Promise.all([
      supabase
        .from("clientes")
        .select("id, nome")
        .order("created_at", { ascending: false }),
      supabase
        .from("promissorias")
        .select("id, cliente_id, valor_total, parcelas, status, observacao, created_at")
        .order("created_at", { ascending: false }),
    ]);

    if (clientesRes.error) setErro(clientesRes.error.message);
    if (promissoriasRes.error) setErro(promissoriasRes.error.message);

    setClientes(clientesRes.data || []);
    setPromissorias(promissoriasRes.data || []);
    setLoading(false);
  }

  useEffect(() => {
    carregarDados();
  }, []);

  const totalAberto = useMemo(() => {
    return promissorias
      .filter((item) => item.status === "em_aberto")
      .reduce((acc, item) => acc + Number(item.valor_total || 0), 0);
  }, [promissorias]);

  const totalPago = useMemo(() => {
    return promissorias
      .filter((item) => item.status === "pago")
      .reduce((acc, item) => acc + Number(item.valor_total || 0), 0);
  }, [promissorias]);

  const valorTotalNumero = Number(valorTotal || 0);
  const parcelasNumero = Number(parcelas || 0);
  const valorParcelaSugerida = calcularParcelaSugerida(valorTotalNumero, parcelasNumero);
  const regraMensagem = validarRegrasPromissoria(valorTotalNumero, parcelasNumero);

  function limparFormulario() {
    setClienteId("");
    setValorTotal("");
    setParcelas("1");
    setObservacao("");
  }

  async function criarPromissoria() {
    setErro("");

    if (!clienteId) {
      setErro("Selecione um cliente.");
      return;
    }

    const mensagemRegra = validarRegrasPromissoria(valorTotalNumero, parcelasNumero);

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

  async function marcarComoPago(id: string) {
    const { error } = await supabase
      .from("promissorias")
      .update({ status: "pago" })
      .eq("id", id);

    if (error) {
      setErro(error.message);
      return;
    }

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
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          {erro}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
          <p className="text-sm font-bold text-zinc-300">Promissórias em aberto</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-white">
            {promissorias.filter((item) => item.status === "em_aberto").length}
          </p>
        </div>

        <div className="rounded-[28px] border border-emerald-500/20 bg-emerald-500/[0.06] p-5">
          <p className="text-sm font-bold text-emerald-300">Total pago</p>
          <p className="mt-3 text-2xl font-black tracking-tight text-white">
            {formatCurrency(totalPago)}
          </p>
        </div>

        <div className="rounded-[28px] border border-blue-500/20 bg-blue-500/[0.06] p-5">
          <p className="text-sm font-bold text-blue-300">Total em aberto</p>
          <p className="mt-3 text-2xl font-black tracking-tight text-white">
            {formatCurrency(totalAberto)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="space-y-6">
          <div className="rounded-[30px] border border-white/10 bg-white/[0.03] p-6">
            <h2 className="text-xl font-black tracking-tight text-white">
              Nova promissória
            </h2>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-sm text-zinc-300">Cliente</label>
                <select
                  value={clienteId}
                  onChange={(e) => setClienteId(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-[#0b0f14] px-4 py-3 text-white outline-none"
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
                <label className="mb-2 block text-sm text-zinc-300">Valor total</label>
                <input
                  type="number"
                  value={valorTotal}
                  onChange={(e) => setValorTotal(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-[#0b0f14] px-4 py-3 text-white outline-none"
                  placeholder="Ex: 1200"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-300">Quantidade de meses</label>
                <input
                  type="number"
                  value={parcelas}
                  onChange={(e) => setParcelas(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-[#0b0f14] px-4 py-3 text-white outline-none"
                  placeholder="Ex: 1 até 4"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-300">Observação</label>
                <textarea
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  className="min-h-[100px] w-full rounded-2xl border border-white/10 bg-[#0b0f14] px-4 py-3 text-white outline-none"
                  placeholder="Ex: cliente combinou pagamento em 4 meses"
                />
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#0b0f14] p-4">
                <p className="text-sm font-bold text-zinc-300">Parcela mensal</p>
                <p className="mt-2 text-2xl font-black tracking-tight text-white">
                  {formatCurrency(valorParcelaSugerida)}
                </p>
                <p className="mt-2 text-sm text-zinc-400">
                  {regraMensagem || "Condição válida para criação da promissória."}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={criarPromissoria}
              disabled={salvando}
              className="mt-5 w-full rounded-2xl bg-[#d4a93a] px-4 py-3 font-bold text-black transition hover:bg-[#e2bb56] disabled:opacity-60"
            >
              {salvando ? "Salvando..." : "Criar promissória"}
            </button>
          </div>

          <div className="rounded-[30px] border border-yellow-500/20 bg-yellow-500/[0.06] p-6">
            <h2 className="text-xl font-black tracking-tight text-white">
              Regras atuais da loja
            </h2>
            <div className="mt-4 space-y-3 text-sm text-zinc-300">
              <p>• O prazo máximo é de 4 meses.</p>
              <p>• A parcela mínima deve ser de R$ 300 por mês.</p>
              <p>• O sistema só deve aceitar promissórias dentro dessa regra.</p>
            </div>
          </div>
        </div>

        <div className="rounded-[30px] border border-white/10 bg-white/[0.03] p-6">
          <h2 className="text-xl font-black tracking-tight text-white">
            Promissórias registradas
          </h2>

          {loading ? (
            <p className="mt-4 text-zinc-400">Carregando promissórias...</p>
          ) : promissorias.length === 0 ? (
            <p className="mt-4 text-zinc-400">
              Nenhuma promissória cadastrada ainda.
            </p>
          ) : (
            <div className="mt-5 space-y-4">
              {promissorias.map((item) => {
                const cliente = clientes.find((c) => c.id === item.cliente_id);
                const parcelaMensal = calcularParcelaSugerida(
                  Number(item.valor_total || 0),
                  Number(item.parcelas || 0)
                );

                return (
                  <div
                    key={item.id}
                    className="rounded-[24px] border border-white/10 bg-[#0b0f14]/80 p-4"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-black text-white">
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

                        <p className="text-sm text-zinc-400">
                          Total: {formatCurrency(Number(item.valor_total || 0))} · Meses: {item.parcelas}
                        </p>

                        <p className="text-sm text-zinc-400">
                          Parcela mensal: {formatCurrency(parcelaMensal)}
                        </p>

                        <p className="text-sm text-zinc-500">
                          {item.observacao || "Sem observação"}
                        </p>
                      </div>

                      <div className="flex min-w-[190px] flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => marcarComoPago(item.id)}
                          className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm font-bold text-emerald-300 transition hover:bg-emerald-500/20"
                        >
                          Marcar como paga
                        </button>

                        <button
                          type="button"
                          onClick={() => marcarComoAtrasado(item.id)}
                          className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-300 transition hover:bg-red-500/20"
                        >
                          Marcar como atrasada
                        </button>
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