"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/dashboard/page-header";
import { CondicionalPdfDocument } from "@/components/pdf/condicional-pdf-document";
import { carregarConfigEmpresa } from "@/lib/empresa-config";

const PDFDownloadLink = dynamic(
  () => import("@react-pdf/renderer").then((mod) => mod.PDFDownloadLink),
  {
    ssr: false,
  }
);

type Cliente = {
  id: string;
  nome: string;
};

type Produto = {
  id: string;
  nome: string;
  preco: number | null;
  estoque: number | null;
  status: string | null;
};

type Condicional = {
  id: string;
  created_at: string;
  cliente_id: string;
  responsavel: string | null;
  status: string;
  data_saida: string;
  data_limite: string;
  data_retorno: string | null;
  observacao: string | null;
};

type CondicionalItem = {
  id: string;
  condicional_id: string;
  produto_id: string;
  quantidade: number;
  preco_unitario: number;
  status: string;
};

type ItemRascunho = {
  produto_id: string;
  nome: string;
  quantidade: number;
  preco_unitario: number;
};

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function somarDias(dataBase: string, dias: number) {
  const data = new Date(dataBase);
  data.setDate(data.getDate() + dias);
  return data.toISOString().slice(0, 10);
}

export default function CondicionalPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [condicionais, setCondicionais] = useState<Condicional[]>([]);
  const [condicionalItens, setCondicionalItens] = useState<CondicionalItem[]>([]);
  const [nomeOperacao, setNomeOperacao] = useState("");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const hoje = new Date().toISOString().slice(0, 10);

  const [clienteId, setClienteId] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [responsaveisConfig, setResponsaveisConfig] = useState<string[]>([]);
  const [prazoDias, setPrazoDias] = useState(2);
  const [dataSaida, setDataSaida] = useState(hoje);
  const [dataLimite, setDataLimite] = useState(somarDias(hoje, 2));
  const [observacao, setObservacao] = useState("");

  const [produtoId, setProdutoId] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [itensRascunho, setItensRascunho] = useState<ItemRascunho[]>([]);

  async function carregarDados() {
    setLoading(true);
    setErro("");

    const [clientesRes, produtosRes, condicionaisRes, itensRes, configRes] = await Promise.all([
      supabase.from("clientes").select("id, nome").order("created_at", { ascending: false }),
      supabase
        .from("produtos")
        .select("id, nome, preco, estoque, status")
        .order("created_at", { ascending: false }),
      supabase
        .from("condicionais")
        .select(
          "id, created_at, cliente_id, responsavel, status, data_saida, data_limite, data_retorno, observacao"
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("condicional_itens")
        .select("id, condicional_id, produto_id, quantidade, preco_unitario, status")
        .order("created_at", { ascending: false }),
      supabase
        .from("configuracoes")
        .select("nome_operacao")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    if (clientesRes.error) setErro(clientesRes.error.message);
    if (produtosRes.error) setErro(produtosRes.error.message);
    if (condicionaisRes.error) setErro(condicionaisRes.error.message);
    if (itensRes.error) setErro(itensRes.error.message);
    if (configRes.error) setErro(configRes.error.message);

    setClientes(clientesRes.data || []);
    setProdutos((produtosRes.data || []).filter((produto) => (produto.status || "ativo") === "ativo"));
    setCondicionais(condicionaisRes.data || []);
    setCondicionalItens(itensRes.data || []);

    const cfg = await carregarConfigEmpresa();
    setNomeOperacao(cfg.nome_operacao || "Sua loja");
    setResponsaveisConfig(cfg.responsaveis);
    setPrazoDias(cfg.condicional_prazo_dias);
    setDataLimite(somarDias(dataSaida, cfg.condicional_prazo_dias));
    setLoading(false);
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

  const condicionaisFiltrados = useMemo(() => {
    if (filtroStatus === "todos") return condicionais;
    if (filtroStatus === "atrasado")
      return condicionais.filter(
        (i) => i.status === "aberto" && new Date(i.data_limite) < new Date(hoje)
      );
    return condicionais.filter((i) => i.status === filtroStatus);
  }, [condicionais, filtroStatus, hoje]);

  const condicionaisAbertos = useMemo(() => {
    return condicionais.filter((item) => item.status === "aberto");
  }, [condicionais]);

  const condicionaisAtrasados = useMemo(() => {
    const hojeDate = new Date(hoje);

    return condicionais.filter((item) => {
      if (item.status !== "aberto") return false;
      return new Date(item.data_limite) < hojeDate;
    });
  }, [condicionais, hoje]);

  const condicionaisFinalizados = useMemo(() => {
    return condicionais.filter((item) => item.status === "finalizado");
  }, [condicionais]);

  function getClienteNome(id: string) {
    const cliente = clientes.find((item) => item.id === id);
    return cliente?.nome || "Cliente não encontrado";
  }

  function getProdutoNome(id: string) {
    const produto = produtos.find((item) => item.id === id);
    return produto?.nome || "Produto não encontrado";
  }

  function getItensDoCondicional(condicionalId: string) {
    return condicionalItens.filter((item) => item.condicional_id === condicionalId);
  }

  function adicionarItem() {
    setErro("");

    if (!produtoId) {
      setErro("Selecione um produto.");
      return;
    }

    const quantidadeNumero = Number(quantidade);

    if (!Number.isFinite(quantidadeNumero) || quantidadeNumero <= 0) {
      setErro("Informe uma quantidade válida.");
      return;
    }

    const produto = produtos.find((item) => item.id === produtoId);

    if (!produto) {
      setErro("Produto não encontrado.");
      return;
    }

    const estoqueAtual = Number(produto.estoque || 0);

    if (quantidadeNumero > estoqueAtual) {
      setErro("A quantidade é maior que o estoque disponível.");
      return;
    }

    const itemExistente = itensRascunho.find((item) => item.produto_id === produto.id);

    if (itemExistente) {
      const novaQuantidade = itemExistente.quantidade + quantidadeNumero;

      if (novaQuantidade > estoqueAtual) {
        setErro("A soma das quantidades ultrapassa o estoque disponível.");
        return;
      }

      setItensRascunho((atual) =>
        atual.map((item) =>
          item.produto_id === produto.id
            ? {
                ...item,
                quantidade: novaQuantidade,
              }
            : item
        )
      );
    } else {
      setItensRascunho((atual) => [
        ...atual,
        {
          produto_id: produto.id,
          nome: produto.nome,
          quantidade: quantidadeNumero,
          preco_unitario: Number(produto.preco || 0),
        },
      ]);
    }

    setProdutoId("");
    setQuantidade("1");
  }

  function removerItem(produtoIdRemover: string) {
    setItensRascunho((atual) =>
      atual.filter((item) => item.produto_id !== produtoIdRemover)
    );
  }

  function limparFormulario() {
    setClienteId("");
    setResponsavel("");
    setDataSaida(hoje);
    setDataLimite(somarDias(hoje, 2));
    setObservacao("");
    setProdutoId("");
    setQuantidade("1");
    setItensRascunho([]);
  }

  async function criarCondicional() {
    setErro("");

    if (!clienteId) {
      setErro("Selecione um cliente.");
      return;
    }

    if (itensRascunho.length === 0) {
      setErro("Adicione ao menos um item no condicional.");
      return;
    }

    setSalvando(true);

    try {
      const { data: condicionalCriado, error: condicionalError } = await supabase
        .from("condicionais")
        .insert({
          cliente_id: clienteId,
          responsavel,
          status: "aberto",
          data_saida: dataSaida,
          data_limite: dataLimite,
          observacao: observacao.trim() || null,
        })
        .select("id")
        .single();

      if (condicionalError) {
        throw new Error(condicionalError.message);
      }

      const itensParaInserir = itensRascunho.map((item) => ({
        condicional_id: condicionalCriado.id,
        produto_id: item.produto_id,
        quantidade: item.quantidade,
        preco_unitario: item.preco_unitario,
        status: "em_aberto",
      }));

      const { error: itensError } = await supabase
        .from("condicional_itens")
        .insert(itensParaInserir);

      if (itensError) {
        throw new Error(itensError.message);
      }

      for (const item of itensRascunho) {
        const produto = produtos.find((p) => p.id === item.produto_id);
        const estoqueAtual = Number(produto?.estoque || 0);
        const novoEstoque = estoqueAtual - item.quantidade;

        const { error: estoqueError } = await supabase
          .from("produtos")
          .update({ estoque: novoEstoque })
          .eq("id", item.produto_id);

        if (estoqueError) {
          throw new Error(estoqueError.message);
        }
      }

      limparFormulario();
      await carregarDados();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível criar o condicional.");
    }

    setSalvando(false);
  }

  async function marcarComoRecolhido(condicionalId: string) {
    const itens = getItensDoCondicional(condicionalId);

    for (const item of itens) {
      const produto = produtos.find((p) => p.id === item.produto_id);
      const estoqueAtual = Number(produto?.estoque || 0);

      const { error: estoqueError } = await supabase
        .from("produtos")
        .update({ estoque: estoqueAtual + item.quantidade })
        .eq("id", item.produto_id);

      if (estoqueError) {
        setErro(estoqueError.message);
        return;
      }
    }

    const { error } = await supabase
      .from("condicionais")
      .update({
        status: "recolhido",
        data_retorno: new Date().toISOString().slice(0, 10),
      })
      .eq("id", condicionalId);

    if (error) {
      setErro(error.message);
      return;
    }

    await carregarDados();
  }

  async function marcarComoFinalizado(condicionalId: string) {
    const { error } = await supabase
      .from("condicionais")
      .update({
        status: "finalizado",
        data_retorno: new Date().toISOString().slice(0, 10),
      })
      .eq("id", condicionalId);

    if (error) {
      setErro(error.message);
      return;
    }

    await carregarDados();
  }

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Módulo operacional"
        title="Condicional"
        description="Controle peças deixadas com o cliente, prazo de retorno, situação do condicional e preparação para conversão futura em venda."
      />

      {erro && (
        <div className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-4 text-sm text-[#b91c1c]">
          {erro}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[28px] border border-[#e8ecf4] bg-[#f8fafc] p-5">
          <p className="text-sm font-bold text-[#475569]">Condicionais abertos</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-[#0f172a]">
            {condicionaisAbertos.length}
          </p>
        </div>

        <div className="rounded-[28px] border border-[#fecaca] bg-[#fef2f2] p-5">
          <p className="text-sm font-bold text-[#b91c1c]">Atrasados</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-[#0f172a]">
            {condicionaisAtrasados.length}
          </p>
        </div>

        <div className="rounded-[28px] border border-[#2563eb]/20 bg-[#2563eb]/[0.06] p-5">
          <p className="text-sm font-bold text-[#2563eb]">Finalizados</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-[#0f172a]">
            {condicionaisFinalizados.length}
          </p>
        </div>

        <div className="rounded-[28px] border border-[#2563eb]/20 bg-[#2563eb]/[0.06] p-5">
          <p className="text-sm font-bold text-[#2563eb]">Peças em rascunho</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-[#0f172a]">
            {itensRascunho.length}
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="space-y-6">
          <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
            <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
              Novo condicional
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
                <label className="mb-2 block text-sm text-[#475569]">Data de saída</label>
                <input
                  type="date"
                  value={dataSaida}
                  onChange={(e) => {
                    setDataSaida(e.target.value);
                    setDataLimite(somarDias(e.target.value, prazoDias));
                  }}
                  className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#475569]">Data limite</label>
                <input
                  type="date"
                  value={dataLimite}
                  onChange={(e) => setDataLimite(e.target.value)}
                  className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#475569]">Observação</label>
                <textarea
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  className="min-h-[100px] w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                  placeholder="Ex: envio para prova em casa, retorno em até 2 dias"
                />
              </div>
            </div>
          </div>

          <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
            <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
              Adicionar peças
            </h2>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-sm text-[#475569]">Produto</label>
                <select
                  value={produtoId}
                  onChange={(e) => setProdutoId(e.target.value)}
                  className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                >
                  <option value="">Selecione um produto</option>
                  {produtos.map((produto) => (
                    <option key={produto.id} value={produto.id}>
                      {produto.nome} — estoque {produto.estoque ?? 0}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#475569]">Quantidade</label>
                <input
                  type="number"
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                  className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                  placeholder="1"
                />
              </div>

              <button
                type="button"
                onClick={adicionarItem}
                className="w-full rounded-2xl border border-[#2563eb]/20 bg-[#2563eb]/10 px-4 py-3 font-bold text-[#2563eb] transition hover:bg-[#2563eb]/20"
              >
                Adicionar ao condicional
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {itensRascunho.length === 0 ? (
                <p className="text-sm text-[#64748b]">
                  Nenhuma peça adicionada ainda.
                </p>
              ) : (
                itensRascunho.map((item) => (
                  <div
                    key={item.produto_id}
                    className="rounded-[22px] border border-[#e8ecf4] bg-[#f8fafc]/80 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-[#0f172a]">{item.nome}</p>
                        <p className="mt-1 text-sm text-[#64748b]">
                          Quantidade: {item.quantidade} · Valor unitário: {formatCurrency(item.preco_unitario)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => removerItem(item.produto_id)}
                        className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] px-4 py-2 text-sm font-bold text-[#b91c1c] transition hover:bg-[#fee2e2]"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <button
              type="button"
              onClick={criarCondicional}
              disabled={salvando}
              className="mt-5 w-full rounded-2xl bg-[#2563eb] px-4 py-3 font-bold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
            >
              {salvando ? "Salvando..." : "Criar condicional"}
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[30px] border border-[#bfdbfe] bg-[#eff6ff] p-6">
            <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
              Regras do condicional
            </h2>

            <div className="mt-4 space-y-3 text-sm text-[#475569]">
              <p>• O condicional não é venda.</p>
              <p>• O prazo padrão é de {prazoDias} {prazoDias === 1 ? "dia" : "dias"}.</p>
              <p>• As peças saem temporariamente do estoque.</p>
              <p>• Quando recolhido, o produto volta ao estoque.</p>
              <p>• Depois vamos permitir converter itens escolhidos em venda.</p>
              <p>• PDF profissional já habilitado nesta etapa.</p>
            </div>
          </div>

          <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
                Condicionais registrados
              </h2>
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { v: "todos", l: "Todos" },
                  { v: "aberto", l: "Abertos" },
                  { v: "atrasado", l: "Atrasados" },
                  { v: "finalizado", l: "Finalizados" },
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
              <p className="mt-4 text-[#64748b]">Carregando condicionais...</p>
            ) : condicionaisFiltrados.length === 0 ? (
              <p className="mt-4 text-[#64748b]">
                {condicionais.length === 0
                  ? "Nenhum condicional cadastrado ainda."
                  : "Nenhum condicional com esse filtro."}
              </p>
            ) : (
              <div className="mt-5 space-y-4">
                {condicionaisFiltrados.map((condicional) => {
                  const itens = getItensDoCondicional(condicional.id);
                  const atrasado =
                    condicional.status === "aberto" &&
                    new Date(condicional.data_limite) < new Date(hoje);

                  return (
                    <div
                      key={condicional.id}
                      className="rounded-[24px] border border-[#e8ecf4] bg-[#f8fafc]/80 p-4"
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-black text-[#0f172a]">
                              {getClienteNome(condicional.cliente_id)}
                            </p>

                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                                condicional.status === "aberto"
                                  ? "bg-[#eff6ff] text-[#1d4ed8]"
                                  : condicional.status === "recolhido"
                                  ? "bg-[#f1f5f9] text-[#475569]"
                                  : "bg-[#f0fdf4] text-[#15803d]"
                              }`}
                            >
                              {condicional.status}
                            </span>

                            {atrasado && (
                              <span className="inline-flex rounded-full bg-[#fef2f2] px-3 py-1 text-xs font-bold text-[#b91c1c]">
                                atrasado
                              </span>
                            )}
                          </div>

                          <p className="text-sm text-[#64748b]">
                            Saída: {new Date(condicional.data_saida).toLocaleDateString("pt-BR")} ·{" "}
                            Limite: {new Date(condicional.data_limite).toLocaleDateString("pt-BR")}
                          </p>

                          <p className="text-sm text-[#64748b]">
                            Responsável: {condicional.responsavel || "-"}
                          </p>

                          <p className="text-sm text-[#94a3b8]">
                            {condicional.observacao || "Sem observação"}
                          </p>

                          <div className="pt-2">
                            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#94a3b8]">
                              Itens
                            </p>

                            <div className="mt-2 space-y-2">
                              {itens.map((item) => (
                                <div
                                  key={item.id}
                                  className="rounded-2xl border border-[#e8ecf4] bg-white px-3 py-2 text-sm text-[#475569]"
                                >
                                  {getProdutoNome(item.produto_id)} · Quantidade: {item.quantidade} ·{" "}
                                  {formatCurrency(Number(item.preco_unitario || 0))}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 md:min-w-[190px]">
                          <PDFDownloadLink
                            document={
                             <CondicionalPdfDocument
  nomeLoja={nomeOperacao}
  clienteNome={getClienteNome(condicional.cliente_id)}
  responsavel={condicional.responsavel || "Não informado"}
  dataSaida={condicional.data_saida}
  dataLimite={condicional.data_limite}
  observacao={condicional.observacao}
  codigo={`S/O-COND-${String(
    condicionais.findIndex((c) => c.id === condicional.id) + 1
  ).padStart(4, "0")}`}
  itens={itens.map((item) => ({
    nome: getProdutoNome(item.produto_id),
    quantidade: item.quantidade,
  }))}
/>
                            }
                            fileName={`condicional-${getClienteNome(condicional.cliente_id)
                              .toLowerCase()
                              .replaceAll(" ", "-")}.pdf`}
                            className="rounded-2xl border border-[#2563eb]/20 bg-[#2563eb]/10 px-4 py-2 text-center text-sm font-bold text-[#2563eb] transition hover:bg-[#2563eb]/20"
                          >
                            {({ loading: pdfLoading }) =>
                              pdfLoading ? "Gerando PDF..." : "Baixar PDF"
                            }
                          </PDFDownloadLink>

                          {condicional.status === "aberto" && (
                            <>
                              <button
                                type="button"
                                onClick={() => marcarComoRecolhido(condicional.id)}
                                className="rounded-2xl bg-[#2563eb] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#1d4ed8]"
                              >
                                Marcar recolhido
                              </button>

                              <button
                                type="button"
                                onClick={() => marcarComoFinalizado(condicional.id)}
                                className="rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-2 text-sm font-bold text-[#15803d] transition hover:bg-emerald-500/20"
                              >
                                Finalizar
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
      </div>
    </section>
  );
}