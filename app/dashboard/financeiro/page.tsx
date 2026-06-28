"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/dashboard/page-header";

type Venda = {
  id: string;
  created_at: string;
  total: number;
  desconto: number;
  forma_pagamento: string;
  observacao: string | null;
  responsavel: string | null;
  cliente_id: string | null;
  tipo_venda?: string | null;
  parcelas_total?: number | null;
};

type Despesa = {
  id: string;
  descricao: string;
  categoria: string;
  valor: number;
  data: string;
  responsavel: string | null;
  observacao: string | null;
  created_at: string;
};

const categoriasDespesa = [
  "Aluguel",
  "Fornecedor",
  "Marketing",
  "Transporte",
  "Embalagem",
  "Sistema",
  "Imposto",
  "Outros",
];

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function FinanceiroPage() {
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState("Outros");
  const [valor, setValor] = useState("");
  const [dataDespesa, setDataDespesa] = useState("");
  const [responsavel, setResponsavel] = useState("João Pedro");
  const [observacao, setObservacao] = useState("");

  async function carregarDados() {
    setLoading(true);
    setErro("");

    const [vendasRes, despesasRes] = await Promise.all([
      supabase
        .from("vendas")
        .select("id, created_at, total, desconto, forma_pagamento, observacao, responsavel, cliente_id, tipo_venda, parcelas_total")
        .order("created_at", { ascending: false }),
      supabase
        .from("despesas")
        .select("id, descricao, categoria, valor, data, responsavel, observacao, created_at")
        .order("created_at", { ascending: false }),
    ]);

    if (vendasRes.error) setErro(vendasRes.error.message);
    if (despesasRes.error) setErro(despesasRes.error.message);

    setVendas(vendasRes.data || []);
    setDespesas(despesasRes.data || []);
    setLoading(false);
  }

  useEffect(() => {
    carregarDados();
  }, []);

  const receita = useMemo(() => {
    return vendas.reduce((acc, venda) => acc + Number(venda.total || 0), 0);
  }, [vendas]);

  const despesasTotal = useMemo(() => {
    return despesas.reduce((acc, despesa) => acc + Number(despesa.valor || 0), 0);
  }, [despesas]);

  const resultado = receita - despesasTotal;

  const vendasPix = useMemo(() => {
    return vendas.filter((venda) => venda.forma_pagamento === "pix").length;
  }, [vendas]);

  async function registrarDespesa() {
    setErro("");

    const valorNumero = Number(valor);

    if (!descricao.trim()) {
      setErro("Informe a descrição da despesa.");
      return;
    }

    if (!Number.isFinite(valorNumero) || valorNumero <= 0) {
      setErro("Informe um valor válido.");
      return;
    }

    setSalvando(true);

    const { error } = await supabase.from("despesas").insert({
      descricao: descricao.trim(),
      categoria,
      valor: valorNumero,
      data: dataDespesa || new Date().toISOString().slice(0, 10),
      responsavel: responsavel.trim() || null,
      observacao: observacao.trim() || null,
    });

    if (error) {
      setErro(error.message);
      setSalvando(false);
      return;
    }

    setDescricao("");
    setCategoria("Outros");
    setValor("");
    setDataDespesa("");
    setResponsavel("João Pedro");
    setObservacao("");

    await carregarDados();
    setSalvando(false);
  }

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Gestão financeira"
        title="Financeiro"
        description="Acompanhe receita, despesas e resultado simples da operação com uma leitura clara do dia a dia."
      />

      {erro && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          {erro}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[28px] border border-white/10 bg-[#0f141b] p-5">
          <p className="text-sm font-bold text-zinc-300">Receita</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-white">
            {formatCurrency(receita)}
          </p>
        </div>

        <div className="rounded-[28px] border border-red-500/20 bg-red-500/[0.06] p-5">
          <p className="text-sm font-bold text-red-300">Despesas</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-white">
            {formatCurrency(despesasTotal)}
          </p>
        </div>

        <div className="rounded-[28px] border border-emerald-500/20 bg-emerald-500/[0.06] p-5">
          <p className="text-sm font-bold text-emerald-300">Resultado</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-white">
            {formatCurrency(resultado)}
          </p>
        </div>

        <div className="rounded-[28px] border border-[#d4a93a]/20 bg-[#d4a93a]/[0.06] p-5">
          <p className="text-sm font-bold text-[#f3d37a]">Vendas Pix</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-white">
            {vendasPix}
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="rounded-[30px] border border-white/10 bg-white/[0.03] p-6">
          <h2 className="text-xl font-black tracking-tight text-white">
            Nova despesa
          </h2>

          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-2 block text-sm text-zinc-300">Descrição</label>
              <input
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-[#0b0f14] px-4 py-3 text-white outline-none"
                placeholder="Ex: pagamento de fornecedor"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-zinc-300">Categoria</label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-[#0b0f14] px-4 py-3 text-white outline-none"
              >
                {categoriasDespesa.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm text-zinc-300">Valor</label>
              <input
                type="number"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-[#0b0f14] px-4 py-3 text-white outline-none"
                placeholder="0,00"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-zinc-300">Data</label>
              <input
                type="date"
                value={dataDespesa}
                onChange={(e) => setDataDespesa(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-[#0b0f14] px-4 py-3 text-white outline-none"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-zinc-300">Responsável</label>
              <select
                value={responsavel}
                onChange={(e) => setResponsavel(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-[#0b0f14] px-4 py-3 text-white outline-none"
              >
                <option value="João Pedro">João Pedro</option>
                <option value="Maria Eduarda">Maria Eduarda</option>
                <option value="Léo">Léo</option>
                <option value="Funcionário">Funcionário</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm text-zinc-300">Observação</label>
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                className="min-h-[100px] w-full rounded-2xl border border-white/10 bg-[#0b0f14] px-4 py-3 text-white outline-none"
                placeholder="Detalhes extras"
              />
            </div>

            <button
              type="button"
              onClick={registrarDespesa}
              disabled={salvando}
              className="w-full rounded-2xl bg-[#d4a93a] px-4 py-3 font-bold text-black transition hover:bg-[#e2bb56] disabled:opacity-60"
            >
              {salvando ? "Salvando..." : "Registrar despesa"}
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[30px] border border-white/10 bg-white/[0.03] p-6">
            <h2 className="text-xl font-black tracking-tight text-white">
              Despesas registradas
            </h2>

            {loading ? (
              <p className="mt-4 text-zinc-400">Carregando dados...</p>
            ) : despesas.length === 0 ? (
              <p className="mt-4 text-zinc-400">
                Nenhuma despesa cadastrada ainda.
              </p>
            ) : (
              <div className="mt-5 space-y-3">
                {despesas.map((despesa) => (
                  <div
                    key={despesa.id}
                    className="rounded-[22px] border border-white/10 bg-[#0b0f14]/80 p-4"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-bold text-white">{despesa.descricao}</p>
                        <p className="mt-1 text-sm text-zinc-400">
                          {despesa.categoria} · {new Date(despesa.data).toLocaleDateString("pt-BR")}
                        </p>
                        <p className="text-sm text-zinc-400">
                          Responsável: {despesa.responsavel || "-"}
                        </p>
                        <p className="text-sm text-zinc-500">
                          {despesa.observacao || "Sem observação"}
                        </p>
                      </div>

                      <span className="text-lg font-black tracking-tight text-white">
                        {formatCurrency(Number(despesa.valor || 0))}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-[30px] border border-white/10 bg-white/[0.03] p-6">
            <h2 className="text-xl font-black tracking-tight text-white">
              Leitura rápida
            </h2>

            <div className="mt-4 space-y-3 text-sm text-zinc-300">
              <p>• Receita total: {formatCurrency(receita)}</p>
              <p>• Total de despesas: {formatCurrency(despesasTotal)}</p>
              <p>• Resultado simples: {formatCurrency(resultado)}</p>
              <p>• Vendas no Pix: {vendasPix}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}