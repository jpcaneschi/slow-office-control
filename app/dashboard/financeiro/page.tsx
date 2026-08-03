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
        .select("id, created_at, total, desconto, forma_pagamento, observacao, responsavel, cliente_id")
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
        <div className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-4 text-sm text-[#b91c1c]">
          {erro}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[28px] border border-[#e8ecf4] bg-[#f8fafc] p-5">
          <p className="text-sm font-bold text-[#475569]">Receita</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-[#0f172a]">
            {formatCurrency(receita)}
          </p>
        </div>

        <div className="rounded-[28px] border border-[#fecaca] bg-[#fef2f2] p-5">
          <p className="text-sm font-bold text-[#b91c1c]">Despesas</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-[#0f172a]">
            {formatCurrency(despesasTotal)}
          </p>
        </div>

        <div className="rounded-[28px] border border-[#bbf7d0] bg-[#f0fdf4] p-5">
          <p className="text-sm font-bold text-[#15803d]">Resultado</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-[#0f172a]">
            {formatCurrency(resultado)}
          </p>
        </div>

        <div className="rounded-[28px] border border-[#2563eb]/20 bg-[#2563eb]/[0.06] p-5">
          <p className="text-sm font-bold text-[#2563eb]">Vendas Pix</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-[#0f172a]">
            {vendasPix}
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
          <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
            Nova despesa
          </h2>

          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-2 block text-sm text-[#475569]">Descrição</label>
              <input
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                placeholder="Ex: pagamento de fornecedor"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-[#475569]">Categoria</label>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
              >
                {categoriasDespesa.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm text-[#475569]">Valor</label>
              <input
                type="number"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                placeholder="0,00"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-[#475569]">Data</label>
              <input
                type="date"
                value={dataDespesa}
                onChange={(e) => setDataDespesa(e.target.value)}
                className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-[#475569]">Responsável</label>
              <select
                value={responsavel}
                onChange={(e) => setResponsavel(e.target.value)}
                className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
              >
                <option value="João Pedro">João Pedro</option>
                <option value="Maria Eduarda">Maria Eduarda</option>
                <option value="Léo">Léo</option>
                <option value="Funcionário">Funcionário</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm text-[#475569]">Observação</label>
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                className="min-h-[100px] w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                placeholder="Detalhes extras"
              />
            </div>

            <button
              type="button"
              onClick={registrarDespesa}
              disabled={salvando}
              className="w-full rounded-2xl bg-[#2563eb] px-4 py-3 font-bold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
            >
              {salvando ? "Salvando..." : "Registrar despesa"}
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
            <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
              Despesas registradas
            </h2>

            {loading ? (
              <p className="mt-4 text-[#64748b]">Carregando dados...</p>
            ) : despesas.length === 0 ? (
              <p className="mt-4 text-[#64748b]">
                Nenhuma despesa cadastrada ainda.
              </p>
            ) : (
              <div className="mt-5 space-y-3">
                {despesas.map((despesa) => (
                  <div
                    key={despesa.id}
                    className="rounded-[22px] border border-[#e8ecf4] bg-[#f8fafc]/80 p-4"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-bold text-[#0f172a]">{despesa.descricao}</p>
                        <p className="mt-1 text-sm text-[#64748b]">
                          {despesa.categoria} · {new Date(despesa.data).toLocaleDateString("pt-BR")}
                        </p>
                        <p className="text-sm text-[#64748b]">
                          Responsável: {despesa.responsavel || "-"}
                        </p>
                        <p className="text-sm text-[#94a3b8]">
                          {despesa.observacao || "Sem observação"}
                        </p>
                      </div>

                      <span className="text-lg font-black tracking-tight text-[#0f172a]">
                        {formatCurrency(Number(despesa.valor || 0))}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
            <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
              Leitura rápida
            </h2>

            <div className="mt-4 space-y-3 text-sm text-[#475569]">
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