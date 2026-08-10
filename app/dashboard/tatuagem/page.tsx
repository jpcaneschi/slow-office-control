"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/dashboard/page-header";

type Atendimento = {
  id: string;
  cliente_id: string | null;
  cliente_nome: string;
  tatuador: string | null;
  descricao: string | null;
  data: string;
  valor: number;
  percentual: number;
  observacao: string | null;
};

type ClienteRef = { id: string; nome: string };

const inputClass =
  "w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-sm text-[#0f172a] outline-none transition placeholder:text-[#94a3b8] focus:border-[#2563eb] focus:bg-white focus:ring-2 focus:ring-[#2563eb]/15";
const labelClass = "mb-1.5 block text-sm font-semibold text-[#475569]";
const cardClass =
  "rounded-3xl border border-[#eef2f7] bg-white p-6 shadow-[0_2px_12px_rgba(15,23,42,0.05)]";

function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(n) ? n : 0);
}

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function formatData(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export default function TatuagemPage() {
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [clientes, setClientes] = useState<ClienteRef[]>([]);
  const [percentualPadrao, setPercentualPadrao] = useState("10");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const [clienteNome, setClienteNome] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [tatuador, setTatuador] = useState("");
  const [descricao, setDescricao] = useState("");
  const [data, setData] = useState(hoje());
  const [valor, setValor] = useState("");
  const [percentual, setPercentual] = useState("10");
  const [observacao, setObservacao] = useState("");

  async function carregarDados() {
    setLoading(true);

    const [atendRes, cliRes, confRes] = await Promise.all([
      supabase
        .from("tatuagem_atendimentos")
        .select(
          "id, cliente_id, cliente_nome, tatuador, descricao, data, valor, percentual, observacao"
        )
        .order("data", { ascending: false }),
      supabase.from("clientes").select("id, nome").order("nome"),
      supabase
        .from("configuracoes")
        .select("tatuagem_percentual")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    if (atendRes.error) {
      setErro(atendRes.error.message);
    } else {
      setAtendimentos(atendRes.data || []);
      setErro("");
    }

    setClientes(cliRes.data || []);

    if (confRes.data?.tatuagem_percentual != null) {
      const p = String(confRes.data.tatuagem_percentual);
      setPercentualPadrao(p);
      if (!editandoId) setPercentual(p);
    }

    setLoading(false);
  }

  useEffect(() => {
    carregarDados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tatuadores = useMemo(() => {
    const set = new Set<string>();
    atendimentos.forEach((a) => a.tatuador && set.add(a.tatuador));
    return Array.from(set).sort();
  }, [atendimentos]);

  const totais = useMemo(() => {
    let faturado = 0;
    let loja = 0;
    for (const a of atendimentos) {
      faturado += Number(a.valor) || 0;
      loja += ((Number(a.valor) || 0) * (Number(a.percentual) || 0)) / 100;
    }
    return { faturado, loja, count: atendimentos.length };
  }, [atendimentos]);

  // Prévia ao vivo do repasse no formulário.
  const valorNum = Number(valor) || 0;
  const percNum = Number(percentual) || 0;
  const previaLoja = (valorNum * percNum) / 100;
  const previaTatuador = valorNum - previaLoja;

  function limparFormulario() {
    setEditandoId(null);
    setClienteNome("");
    setClienteId("");
    setTatuador("");
    setDescricao("");
    setData(hoje());
    setValor("");
    setPercentual(percentualPadrao);
    setObservacao("");
    setErro("");
  }

  function editar(a: Atendimento) {
    setEditandoId(a.id);
    setClienteNome(a.cliente_nome || "");
    setClienteId(a.cliente_id || "");
    setTatuador(a.tatuador || "");
    setDescricao(a.descricao || "");
    setData(a.data || hoje());
    setValor(String(a.valor ?? ""));
    setPercentual(String(a.percentual ?? percentualPadrao));
    setObservacao(a.observacao || "");
    setErro("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function aoVincularCliente(id: string) {
    setClienteId(id);
    if (id) {
      const c = clientes.find((x) => x.id === id);
      if (c) setClienteNome(c.nome);
    }
  }

  async function excluir(id: string) {
    if (!window.confirm("Excluir este atendimento de tatuagem?")) return;
    const { error } = await supabase
      .from("tatuagem_atendimentos")
      .delete()
      .eq("id", id);
    if (error) {
      setErro(error.message);
      return;
    }
    if (editandoId === id) limparFormulario();
    await carregarDados();
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!clienteNome.trim()) {
      setErro("Informe o nome do cliente.");
      return;
    }
    if (!data) {
      setErro("Informe a data do atendimento.");
      return;
    }
    if (!Number.isFinite(valorNum) || valorNum < 0) {
      setErro("Informe um valor válido.");
      return;
    }
    if (percNum < 0 || percNum > 100) {
      setErro("O percentual da loja deve ficar entre 0% e 100%.");
      return;
    }

    setSaving(true);
    setErro("");

    const payload = {
      cliente_id: clienteId || null,
      cliente_nome: clienteNome.trim(),
      tatuador: tatuador.trim() || null,
      descricao: descricao.trim() || null,
      data,
      valor: valorNum,
      percentual: percNum,
      observacao: observacao.trim() || null,
    };

    const { error } = editandoId
      ? await supabase
          .from("tatuagem_atendimentos")
          .update(payload)
          .eq("id", editandoId)
      : await supabase.from("tatuagem_atendimentos").insert(payload);

    if (error) {
      setErro(error.message);
      setSaving(false);
      return;
    }

    limparFormulario();
    await carregarDados();
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          eyebrow="Módulo de serviço"
          title="Tatuagem"
          description="Registre os atendimentos de tatuagem e acompanhe o repasse da loja."
        />
        <Link
          href="/dashboard"
          className="rounded-xl border border-[#e8ecf4] bg-white px-4 py-2.5 text-sm font-semibold text-[#334155] transition hover:bg-[#f4f6fb]"
        >
          Voltar
        </Link>
      </div>

      {/* Resumo */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className={cardClass}>
          <p className="text-sm font-semibold text-[#64748b]">Atendimentos</p>
          <p className="mt-1 text-2xl font-black text-[#0f172a]">{totais.count}</p>
        </div>
        <div className={cardClass}>
          <p className="text-sm font-semibold text-[#64748b]">Total faturado</p>
          <p className="mt-1 text-2xl font-black text-[#0f172a]">
            {brl(totais.faturado)}
          </p>
        </div>
        <div className="rounded-2xl border border-[#2563eb]/20 bg-[#eff6ff] p-6">
          <p className="text-sm font-semibold text-[#2563eb]">Repasse à loja</p>
          <p className="mt-1 text-2xl font-black text-[#1d4ed8]">
            {brl(totais.loja)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        {/* Formulário */}
        <div className={cardClass}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-[#0f172a]">
              {editandoId ? "Editar atendimento" : "Novo atendimento"}
            </h2>
            {editandoId && (
              <button
                type="button"
                onClick={limparFormulario}
                className="rounded-lg border border-[#e8ecf4] bg-white px-3 py-1.5 text-xs font-semibold text-[#334155] transition hover:bg-[#f4f6fb]"
              >
                Cancelar
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label className={labelClass}>Nome do cliente</label>
              <input
                value={clienteNome}
                onChange={(e) => setClienteNome(e.target.value)}
                className={inputClass}
                placeholder="Nome do cliente"
              />
            </div>

            <div>
              <label className={labelClass}>
                Vincular a cliente da loja{" "}
                <span className="font-normal text-[#94a3b8]">(opcional)</span>
              </label>
              <select
                value={clienteId}
                onChange={(e) => aoVincularCliente(e.target.value)}
                className={inputClass}
              >
                <option value="">— Cliente só de tatuagem —</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Tatuador</label>
              <input
                value={tatuador}
                onChange={(e) => setTatuador(e.target.value)}
                className={inputClass}
                placeholder="Nome do tatuador"
                list="lista-tatuadores"
              />
              <datalist id="lista-tatuadores">
                {tatuadores.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Data</label>
                <input
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Valor cobrado (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  className={inputClass}
                  placeholder="0,00"
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Percentual da loja (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={percentual}
                onChange={(e) => setPercentual(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Descrição do serviço</label>
              <textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                className={`${inputClass} min-h-[70px] resize-y`}
                placeholder="Ex: tatuagem no antebraço, fineline..."
              />
            </div>

            <div>
              <label className={labelClass}>
                Observação{" "}
                <span className="font-normal text-[#94a3b8]">(opcional)</span>
              </label>
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                className={`${inputClass} min-h-[54px] resize-y`}
                placeholder="Anotações internas"
              />
            </div>

            {/* Prévia do repasse */}
            <div className="rounded-xl border border-[#e8ecf4] bg-[#f8fafc] p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#64748b]">Repasse à loja</span>
                <span className="font-bold text-[#1d4ed8]">{brl(previaLoja)}</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-sm">
                <span className="text-[#64748b]">Fica com o tatuador</span>
                <span className="font-bold text-[#0f172a]">
                  {brl(previaTatuador)}
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-[#2563eb] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
            >
              {saving
                ? "Salvando..."
                : editandoId
                ? "Salvar alterações"
                : "Registrar atendimento"}
            </button>
          </form>
        </div>

        {/* Lista */}
        <div className={cardClass}>
          {erro && (
            <div className="mb-4 rounded-xl border border-[#fecaca] bg-[#fef2f2] p-4 text-sm text-[#b91c1c]">
              {erro}
            </div>
          )}

          {loading && <p className="text-[#64748b]">Carregando atendimentos...</p>}

          {!loading && atendimentos.length === 0 && !erro && (
            <p className="text-[#64748b]">
              Nenhum atendimento registrado ainda. Cadastre o primeiro no
              formulário ao lado.
            </p>
          )}

          {!loading && atendimentos.length > 0 && (
            <div className="space-y-3">
              {atendimentos.map((a) => {
                const vLoja =
                  ((Number(a.valor) || 0) * (Number(a.percentual) || 0)) / 100;
                const vTat = (Number(a.valor) || 0) - vLoja;
                return (
                  <div
                    key={a.id}
                    className="rounded-xl border border-[#eef2f7] bg-[#f8fafc] p-4"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-bold text-[#0f172a]">
                            {a.cliente_nome}
                          </h3>
                          {a.cliente_id && (
                            <span className="rounded-full bg-[#eff6ff] px-2.5 py-0.5 text-xs font-semibold text-[#2563eb]">
                              cliente da loja
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-[#64748b]">
                          {formatData(a.data)}
                          {a.tatuador ? ` · ${a.tatuador}` : ""}
                        </p>
                        {a.descricao && (
                          <p className="mt-1 text-sm text-[#475569]">
                            {a.descricao}
                          </p>
                        )}

                        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                          <span className="text-[#64748b]">
                            Valor:{" "}
                            <span className="font-bold text-[#0f172a]">
                              {brl(Number(a.valor) || 0)}
                            </span>
                          </span>
                          <span className="text-[#64748b]">
                            Loja ({a.percentual}%):{" "}
                            <span className="font-bold text-[#1d4ed8]">
                              {brl(vLoja)}
                            </span>
                          </span>
                          <span className="text-[#64748b]">
                            Tatuador:{" "}
                            <span className="font-bold text-[#0f172a]">
                              {brl(vTat)}
                            </span>
                          </span>
                        </div>
                        {a.observacao && (
                          <p className="mt-2 text-xs text-[#94a3b8]">
                            {a.observacao}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => editar(a)}
                          className="rounded-lg border border-[#e8ecf4] bg-white px-4 py-2 text-sm font-semibold text-[#334155] transition hover:bg-[#f4f6fb]"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => excluir(a.id)}
                          className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-4 py-2 text-sm font-semibold text-[#dc2626] transition hover:bg-[#fee2e2]"
                        >
                          Excluir
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
    </div>
  );
}
