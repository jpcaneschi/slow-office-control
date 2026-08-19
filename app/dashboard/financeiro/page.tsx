"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/dashboard/page-header";
import { usePeriod, isoToDate } from "@/components/dashboard/period-context";
import { hojeISO, formatDataBR, dataLocalMs } from "@/lib/datas";
import { carregarNomesResponsaveis } from "@/lib/responsaveis";

type Venda = {
  id: string;
  created_at: string;
  total: number;
  desconto: number;
  forma_pagamento: string;
  observacao: string | null;
  responsavel: string | null;
  cliente_id: string | null;
  status: string | null;
};

type VendaItem = {
  venda_id: string;
  quantidade: number;
  custo_unitario: number;
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

type AtendimentoTat = {
  valor: number | null;
  percentual: number | null;
  data: string | null;
};

type Recorrente = {
  id: string;
  descricao: string;
  categoria: string;
  valor: number;
  dia_vencimento: number;
  ativo: boolean;
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

const inputRec =
  "w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-sm text-[#0f172a] outline-none focus:border-[#2563eb] focus:bg-white";

export default function FinanceiroPage() {
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [itensVenda, setItensVenda] = useState<VendaItem[]>([]);
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [atendimentos, setAtendimentos] = useState<AtendimentoTat[]>([]);
  const [atendServico, setAtendServico] = useState<
    { valor: number; percentual_loja: number; data: string }[]
  >([]);
  const [recorrentes, setRecorrentes] = useState<Recorrente[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState("Outros");
  const [valor, setValor] = useState("");
  const [dataDespesa, setDataDespesa] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [responsaveisConfig, setResponsaveisConfig] = useState<string[]>([]);
  const [observacao, setObservacao] = useState("");

  const [rDescricao, setRDescricao] = useState("");
  const [rCategoria, setRCategoria] = useState("Aluguel");
  const [rValor, setRValor] = useState("");
  const [rDia, setRDia] = useState("5");
  const [salvandoRec, setSalvandoRec] = useState(false);

  const { period } = usePeriod();
  const janela = useMemo(() => {
    const startOfDay = (d: Date) => {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      return x;
    };
    const ini = startOfDay(isoToDate(period.inicio)).getTime();
    const fimData = startOfDay(isoToDate(period.fim));
    fimData.setDate(fimData.getDate() + 1);
    return { ini, fim: fimData.getTime() };
  }, [period]);

  async function carregarDados() {
    setLoading(true);
    setErro("");

    const [vendasRes, despesasRes, atendRes, recRes, itensRes, servRes] = await Promise.all([
      supabase
        .from("vendas")
        .select("id, created_at, total, desconto, forma_pagamento, observacao, responsavel, cliente_id, status")
        .order("created_at", { ascending: false }),
      supabase
        .from("despesas")
        .select("id, descricao, categoria, valor, data, responsavel, observacao, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("tatuagem_atendimentos").select("valor, percentual, data"),
      supabase
        .from("despesas_recorrentes")
        .select("id, descricao, categoria, valor, dia_vencimento, ativo")
        .order("created_at", { ascending: true }),
      supabase.from("venda_itens").select("venda_id, quantidade, custo_unitario"),
      supabase.from("atendimentos_servico").select("valor, percentual_loja, data"),
    ]);

    if (vendasRes.error) setErro(vendasRes.error.message);
    if (despesasRes.error) setErro(despesasRes.error.message);
    if (atendRes.error) setErro(atendRes.error.message);
    if (recRes.error) setErro(recRes.error.message);
    if (itensRes.error) setErro(itensRes.error.message);

    setVendas(vendasRes.data || []);
    setItensVenda(itensRes.data || []);
    setDespesas(despesasRes.data || []);
    setAtendimentos(atendRes.data || []);
    setAtendServico(servRes.data || []);
    setRecorrentes(recRes.data || []);

    setResponsaveisConfig(await carregarNomesResponsaveis());
    setLoading(false);
  }

  useEffect(() => {
    carregarDados();
  }, []);

  // Só vendas CONCLUÍDAS entram no financeiro (canceladas ficam de fora).
  const idsConcluidas = useMemo(
    () =>
      new Set(
        vendas
          .filter((v) => (v.status || "") === "concluida")
          .filter((v) => {
            const t = new Date(v.created_at).getTime();
            return t >= janela.ini && t < janela.fim;
          })
          .map((v) => v.id)
      ),
    [vendas, janela]
  );

  const receitaVendas = useMemo(() => {
    return vendas
      .filter((v) => idsConcluidas.has(v.id))
      .reduce((acc, venda) => acc + Number(venda.total || 0), 0);
  }, [vendas, idsConcluidas]);

  const receitaTatuagem = useMemo(() => {
    return atendimentos
      .filter((a) => {
        if (!a.data) return false;
        const t = dataLocalMs(a.data);
        return t >= janela.ini && t < janela.fim;
      })
      .reduce(
        (acc, a) =>
          acc + ((Number(a.valor) || 0) * (Number(a.percentual) || 0)) / 100,
        0
      );
  }, [atendimentos, janela]);

  const receitaServicos = useMemo(() => {
    return atendServico
      .filter((a) => {
        if (!a.data) return false;
        const t = isoToDate(a.data).getTime();
        return t >= janela.ini && t < janela.fim;
      })
      .reduce(
        (acc, a) =>
          acc +
          (Number(a.valor) || 0) * ((Number(a.percentual_loja) || 0) / 100),
        0
      );
  }, [atendServico, janela]);

  const receita = receitaVendas + receitaTatuagem + receitaServicos;

  // Custo dos produtos vendidos (COGS) — custo histórico dos itens concluídos.
  const custoProdutos = useMemo(() => {
    return itensVenda
      .filter((it) => idsConcluidas.has(it.venda_id))
      .reduce(
        (acc, it) =>
          acc + (Number(it.custo_unitario) || 0) * (Number(it.quantidade) || 0),
        0
      );
  }, [itensVenda, idsConcluidas]);

  const lucroBruto = receita - custoProdutos;

  const despesasPeriodo = useMemo(
    () =>
      despesas.filter((d) => {
        const t = dataLocalMs(d.data);
        return t >= janela.ini && t < janela.fim;
      }),
    [despesas, janela]
  );

  const despesasTotal = useMemo(
    () => despesasPeriodo.reduce((acc, d) => acc + Number(d.valor || 0), 0),
    [despesasPeriodo]
  );

  // Taxas de cartão são lançadas como despesa (categoria "Taxa de cartão").
  // Já entram em despesasTotal (por isso o resultado fica correto) — aqui só as
  // destacamos para leitura separada (faturamento × taxas × resultado).
  const taxasCartao = useMemo(
    () =>
      despesasPeriodo
        .filter((d) => d.categoria === "Taxa de cartão")
        .reduce((acc, d) => acc + Number(d.valor || 0), 0),
    [despesasPeriodo]
  );

  const resultado = lucroBruto - despesasTotal;

  const vendasPix = useMemo(() => {
    return vendas.filter(
      (v) => v.forma_pagamento === "pix" && idsConcluidas.has(v.id)
    ).length;
  }, [vendas, idsConcluidas]);

  const mesPrefix = hojeISO().slice(0, 7); // "YYYY-MM" (fuso São Paulo)

  const totalFixoMensal = useMemo(
    () =>
      recorrentes
        .filter((r) => r.ativo)
        .reduce((acc, r) => acc + Number(r.valor || 0), 0),
    [recorrentes]
  );

  function lancadaEsteMes(rec: Recorrente) {
    return despesas.some(
      (d) =>
        d.descricao === rec.descricao && (d.data || "").startsWith(mesPrefix)
    );
  }

  async function adicionarRecorrente() {
    setErro("");
    const v = Number(rValor);
    const dia = Number(rDia);
    if (!rDescricao.trim()) {
      setErro("Informe a descrição da conta recorrente.");
      return;
    }
    if (!Number.isFinite(v) || v <= 0) {
      setErro("Informe um valor válido para a conta recorrente.");
      return;
    }
    setSalvandoRec(true);
    const { error } = await supabase.from("despesas_recorrentes").insert({
      descricao: rDescricao.trim(),
      categoria: rCategoria,
      valor: v,
      dia_vencimento:
        Number.isFinite(dia) && dia >= 1 && dia <= 31 ? dia : 5,
      ativo: true,
    });
    if (error) {
      setErro(error.message);
      setSalvandoRec(false);
      return;
    }
    setRDescricao("");
    setRValor("");
    setRDia("5");
    setRCategoria("Aluguel");
    await carregarDados();
    setSalvandoRec(false);
  }

  async function excluirRecorrente(id: string) {
    if (!window.confirm("Excluir esta conta recorrente?")) return;
    const { error } = await supabase
      .from("despesas_recorrentes")
      .delete()
      .eq("id", id);
    if (error) {
      setErro(error.message);
      return;
    }
    await carregarDados();
  }

  async function lancarRecorrente(rec: Recorrente) {
    setErro("");
    const agora = new Date();
    const ano = agora.getFullYear();
    const mes = agora.getMonth();
    const ultimoDia = new Date(ano, mes + 1, 0).getDate();
    const dia = Math.min(Math.max(rec.dia_vencimento || 1, 1), ultimoDia);
    const dataISO = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(
      dia
    ).padStart(2, "0")}`;

    const { error } = await supabase.from("despesas").insert({
      descricao: rec.descricao,
      categoria: rec.categoria,
      valor: rec.valor,
      data: dataISO,
      responsavel: null,
      observacao: "Conta recorrente",
    });
    if (error) {
      setErro(error.message);
      return;
    }
    await carregarDados();
  }

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
      data: dataDespesa || hojeISO(),
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
    setResponsavel("");
    setObservacao("");

    await carregarDados();
    setSalvando(false);
  }

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Gestão financeira"
        title="Financeiro"
        description="Acompanhe receita, custo, lucro e resultado da operação — só vendas concluídas entram na conta."
      />

      {erro && (
        <div className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-4 text-sm text-[#b91c1c]">
          {erro}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-[28px] border border-[#e8ecf4] bg-[#f8fafc] p-5">
          <p className="text-sm font-bold text-[#475569]">Receita</p>
          <p className="mt-3 text-2xl font-black tracking-tight text-[#0f172a]">
            {formatCurrency(receita)}
          </p>
          <p className="mt-2 text-xs text-[#94a3b8]">
            Vendas {formatCurrency(receitaVendas)} · Tatuagem{" "}
            {formatCurrency(receitaTatuagem)} · Serviços{" "}
            {formatCurrency(receitaServicos)}
          </p>
        </div>

        <div className="rounded-[28px] border border-[#fed7aa] bg-[#fff7ed] p-5">
          <p className="text-sm font-bold text-[#c2410c]">Custo dos produtos</p>
          <p className="mt-3 text-2xl font-black tracking-tight text-[#0f172a]">
            {formatCurrency(custoProdutos)}
          </p>
          <p className="mt-2 text-xs text-[#94a3b8]">Custo das vendas (COGS)</p>
        </div>

        <div className="rounded-[28px] border border-[#bfdbfe] bg-[#eff6ff] p-5">
          <p className="text-sm font-bold text-[#1d4ed8]">Lucro bruto</p>
          <p className="mt-3 text-2xl font-black tracking-tight text-[#0f172a]">
            {formatCurrency(lucroBruto)}
          </p>
          <p className="mt-2 text-xs text-[#94a3b8]">Receita − custo</p>
        </div>

        <div className="rounded-[28px] border border-[#fecaca] bg-[#fef2f2] p-5">
          <p className="text-sm font-bold text-[#b91c1c]">Despesas</p>
          <p className="mt-3 text-2xl font-black tracking-tight text-[#0f172a]">
            {formatCurrency(despesasTotal)}
          </p>
          {taxasCartao > 0 && (
            <p className="mt-2 text-xs text-[#94a3b8]">
              Inclui {formatCurrency(taxasCartao)} de taxas de cartão
            </p>
          )}
        </div>

        <div className="rounded-[28px] border border-[#bbf7d0] bg-[#f0fdf4] p-5">
          <p className="text-sm font-bold text-[#15803d]">Resultado</p>
          <p className="mt-3 text-2xl font-black tracking-tight text-[#0f172a]">
            {formatCurrency(resultado)}
          </p>
          <p className="mt-2 text-xs text-[#94a3b8]">Lucro − despesas</p>
        </div>
      </div>

      {/* ─── Contas recorrentes ─────────────────────────────────────────── */}
      <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
              Contas recorrentes
            </h2>
            <p className="mt-1 text-sm text-[#64748b]">
              Despesas fixas que se repetem todo mês (aluguel, internet…).
            </p>
          </div>
          <div className="rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-2 text-sm">
            <span className="text-[#64748b]">Total fixo mensal: </span>
            <span className="font-black text-[#0f172a]">
              {formatCurrency(totalFixoMensal)}
            </span>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_0.8fr_0.6fr_auto]">
          <input
            value={rDescricao}
            onChange={(e) => setRDescricao(e.target.value)}
            className={inputRec}
            placeholder="Descrição (ex: Aluguel)"
          />
          <select
            value={rCategoria}
            onChange={(e) => setRCategoria(e.target.value)}
            className={inputRec}
          >
            {categoriasDespesa.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.01"
            min="0"
            value={rValor}
            onChange={(e) => setRValor(e.target.value)}
            className={inputRec}
            placeholder="Valor"
          />
          <input
            type="number"
            min="1"
            max="31"
            value={rDia}
            onChange={(e) => setRDia(e.target.value)}
            className={inputRec}
            placeholder="Dia"
            title="Dia do vencimento"
          />
          <button
            type="button"
            onClick={adicionarRecorrente}
            disabled={salvandoRec}
            className="rounded-2xl bg-[#2563eb] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
          >
            {salvandoRec ? "..." : "Adicionar"}
          </button>
        </div>

        {recorrentes.length === 0 ? (
          <p className="mt-5 text-sm text-[#64748b]">
            Nenhuma conta recorrente cadastrada ainda.
          </p>
        ) : (
          <div className="mt-5 space-y-2.5">
            {recorrentes.map((rec) => {
              const lancada = lancadaEsteMes(rec);
              return (
                <div
                  key={rec.id}
                  className="flex flex-col gap-3 rounded-2xl border border-[#eef2f7] bg-[#f8fafc] p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#0f172a]">
                      {rec.descricao}
                    </p>
                    <p className="mt-0.5 text-sm text-[#64748b]">
                      {rec.categoria} · vence dia {rec.dia_vencimento} ·{" "}
                      {formatCurrency(Number(rec.valor || 0))}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {lancada ? (
                      <span className="rounded-full bg-[#f0fdf4] px-3 py-1.5 text-xs font-bold text-[#15803d]">
                        Lançada este mês
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => lancarRecorrente(rec)}
                        className="rounded-lg border border-[#2563eb]/20 bg-[#2563eb]/10 px-4 py-2 text-sm font-semibold text-[#2563eb] transition hover:bg-[#2563eb]/20"
                      >
                        Lançar este mês
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => excluirRecorrente(rec.id)}
                      className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm font-semibold text-[#dc2626] transition hover:bg-[#fee2e2]"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
                <option value="">Selecione…</option>
                {responsaveisConfig.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
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
            ) : despesasPeriodo.length === 0 ? (
              <p className="mt-4 text-[#64748b]">
                Nenhuma despesa no período selecionado.
              </p>
            ) : (
              <div className="mt-5 space-y-3">
                {despesasPeriodo.map((despesa) => (
                  <div
                    key={despesa.id}
                    className="rounded-[22px] border border-[#e8ecf4] bg-[#f8fafc]/80 p-4"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-bold text-[#0f172a]">{despesa.descricao}</p>
                        <p className="mt-1 text-sm text-[#64748b]">
                          {despesa.categoria} · {formatDataBR(despesa.data)}
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
              <p>• Repasse de tatuagem: {formatCurrency(receitaTatuagem)}</p>
              <p>• Custo dos produtos: {formatCurrency(custoProdutos)}</p>
              <p>• Lucro bruto: {formatCurrency(lucroBruto)}</p>
              <p>• Taxas de cartão: {formatCurrency(taxasCartao)}</p>
              <p>• Total de despesas: {formatCurrency(despesasTotal)}</p>
              <p>• Resultado líquido: {formatCurrency(resultado)}</p>
              <p>• Vendas no Pix: {vendasPix}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}