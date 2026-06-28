"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  calcularDescontoPix,
  calcularTotal,
  formatCurrency,
  obterCorFormaPagamento,
} from "@/lib/vendas-utils";

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

type Venda = {
  id: string;
  cliente_id: string | null;
  responsavel: string;
  forma_pagamento: string;
  desconto_pix: number;
  subtotal: number;
  desconto: number;
  total: number;
  observacao: string | null;
  status: string;
  created_at: string;
};

type VendaItem = {
  id: string;
  venda_id: string;
  produto_id: string;
  quantidade: number;
  preco_unitario: number;
  total_item: number;
};

type ItemRascunho = {
  produto_id: string;
  nome: string;
  quantidade: number;
  preco_unitario: number;
};

export default function VendasPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [itensVenda, setItensVenda] = useState<VendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [clienteId, setClienteId] = useState("");
  const [responsavel, setResponsavel] = useState("João Pedro");
  const [formaPagamento, setFormaPagamento] = useState("pix");
  const [descontoManual, setDescontoManual] = useState("0");
  const [observacao, setObservacao] = useState("");

  const [produtoId, setProdutoId] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [itensRascunho, setItensRascunho] = useState<ItemRascunho[]>([]);

  async function carregarDados() {
    setLoading(true);
    setErro("");

    const [clientesRes, produtosRes, vendasRes, itensRes] = await Promise.all([
      supabase
        .from("clientes")
        .select("id, nome")
        .order("created_at", { ascending: false }),
      supabase
        .from("produtos")
        .select("id, nome, preco, estoque, status")
        .order("created_at", { ascending: false }),
      supabase
        .from("vendas")
        .select("id, cliente_id, responsavel, forma_pagamento, desconto_pix, subtotal, desconto, total, observacao, status, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("venda_itens")
        .select("id, venda_id, produto_id, quantidade, preco_unitario, total_item"),
    ]);

    if (clientesRes.error) setErro(clientesRes.error.message);
    if (produtosRes.error) setErro(produtosRes.error.message);
    if (vendasRes.error) setErro(vendasRes.error.message);
    if (itensRes.error) setErro(itensRes.error.message);

    setClientes(clientesRes.data || []);
    setProdutos((produtosRes.data || []).filter((produto) => (produto.status || "ativo") === "ativo"));
    setVendas(vendasRes.data || []);
    setItensVenda(itensRes.data || []);
    setLoading(false);
  }

  useEffect(() => {
    carregarDados();
  }, []);

  const totalConcluido = useMemo(() => {
    return vendas
      .filter((item) => item.status === "concluida")
      .reduce((acc, item) => acc + Number(item.total || 0), 0);
  }, [vendas]);

  const totalPix = useMemo(() => {
    return vendas
      .filter((item) => item.forma_pagamento === "pix")
      .reduce((acc, item) => acc + Number(item.total || 0), 0);
  }, [vendas]);

  const subtotalRascunho = useMemo(() => {
    return itensRascunho.reduce(
      (acc, item) => acc + item.quantidade * item.preco_unitario,
      0
    );
  }, [itensRascunho]);

  const descontoManualNumero = Number(descontoManual || 0);
  const descontoPixNumero =
    formaPagamento === "pix" ? calcularDescontoPix(subtotalRascunho, 5) : 0;
  const totalRascunho = calcularTotal(
    subtotalRascunho,
    descontoManualNumero,
    descontoPixNumero
  );

  function getClienteNome(id: string | null) {
    if (!id) return "Cliente avulso";
    const cliente = clientes.find((item) => item.id === id);
    return cliente?.nome || "Cliente não encontrado";
  }

  function getProdutoNome(id: string) {
    const produto = produtos.find((item) => item.id === id);
    return produto?.nome || "Produto não encontrado";
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
    setResponsavel("João Pedro");
    setFormaPagamento("pix");
    setDescontoManual("0");
    setObservacao("");
    setProdutoId("");
    setQuantidade("1");
    setItensRascunho([]);
  }

  async function salvarVenda() {
    setErro("");

    if (itensRascunho.length === 0) {
      setErro("Adicione ao menos um item.");
      return;
    }

    if (!responsavel) {
      setErro("Informe o responsável.");
      return;
    }

    setSalvando(true);

    try {
      const { data: vendaCriada, error: vendaError } = await supabase
        .from("vendas")
        .insert({
          cliente_id: clienteId || null,
          responsavel,
          forma_pagamento: formaPagamento,
          desconto_pix: descontoPixNumero,
          subtotal: subtotalRascunho,
          desconto: descontoManualNumero,
          total: totalRascunho,
          observacao: observacao.trim() || null,
          status: "concluida",
        })
        .select("id")
        .single();

      if (vendaError) {
        throw new Error(vendaError.message);
      }

      const itensParaInserir = itensRascunho.map((item) => ({
        venda_id: vendaCriada.id,
        produto_id: item.produto_id,
        quantidade: item.quantidade,
        preco_unitario: item.preco_unitario,
        total_item: item.quantidade * item.preco_unitario,
      }));

      const { error: itensError } = await supabase
        .from("venda_itens")
        .insert(itensParaInserir);

      if (itensError) {
        throw new Error(itensError.message);
      }

      for (const item of itensRascunho) {
        const produto = produtos.find((p) => p.id === item.produto_id);
        const estoqueAtual = Number(produto?.estoque || 0);

        const { error: estoqueError } = await supabase
          .from("produtos")
          .update({ estoque: estoqueAtual - item.quantidade })
          .eq("id", item.produto_id);

        if (estoqueError) {
          throw new Error(estoqueError.message);
        }
      }

      limparFormulario();
      await carregarDados();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar a venda.");
    }

    setSalvando(false);
  }

  async function cancelarVenda(id: string) {
    const { error } = await supabase
      .from("vendas")
      .update({ status: "cancelada" })
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
        eyebrow="Operação comercial"
        title="Vendas"
        description="Registre vendas com itens, total, forma de pagamento e baixa automática de estoque."
      />

      {erro && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
          {erro}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
          <p className="text-sm font-bold text-zinc-300">Vendas concluídas</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-white">
            {vendas.filter((item) => item.status === "concluida").length}
          </p>
        </div>

        <div className="rounded-[28px] border border-emerald-500/20 bg-emerald-500/[0.06] p-5">
          <p className="text-sm font-bold text-emerald-300">Faturamento</p>
          <p className="mt-3 text-2xl font-black tracking-tight text-white">
            {formatCurrency(totalConcluido)}
          </p>
        </div>

        <div className="rounded-[28px] border border-blue-500/20 bg-blue-500/[0.06] p-5">
          <p className="text-sm font-bold text-blue-300">Vendas no Pix</p>
          <p className="mt-3 text-2xl font-black tracking-tight text-white">
            {formatCurrency(totalPix)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="space-y-6">
          <div className="rounded-[30px] border border-white/10 bg-white/[0.03] p-6">
            <h2 className="text-xl font-black tracking-tight text-white">
              Nova venda
            </h2>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-sm text-zinc-300">Cliente</label>
                <select
                  value={clienteId}
                  onChange={(e) => setClienteId(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-[#0b0f14] px-4 py-3 text-white outline-none"
                >
                  <option value="">Venda avulsa</option>
                  {clientes.map((cliente) => (
                    <option key={cliente.id} value={cliente.id}>
                      {cliente.nome}
                    </option>
                  ))}
                </select>
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
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-300">Forma de pagamento</label>
                <select
                  value={formaPagamento}
                  onChange={(e) => setFormaPagamento(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-[#0b0f14] px-4 py-3 text-white outline-none"
                >
                  <option value="pix">Pix</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="cartao">Cartão</option>
                  <option value="promissoria">Promissória</option>
                  <option value="misto">Misto</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-300">Desconto manual</label>
                <input
                  type="number"
                  value={descontoManual}
                  onChange={(e) => setDescontoManual(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-[#0b0f14] px-4 py-3 text-white outline-none"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-300">Observação</label>
                <textarea
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  className="min-h-[100px] w-full rounded-2xl border border-white/10 bg-[#0b0f14] px-4 py-3 text-white outline-none"
                  placeholder="Ex: cliente pediu separação para presente"
                />
              </div>
            </div>
          </div>

          <div className="rounded-[30px] border border-white/10 bg-white/[0.03] p-6">
            <h2 className="text-xl font-black tracking-tight text-white">
              Adicionar itens
            </h2>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-sm text-zinc-300">Produto</label>
                <select
                  value={produtoId}
                  onChange={(e) => setProdutoId(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-[#0b0f14] px-4 py-3 text-white outline-none"
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
                <label className="mb-2 block text-sm text-zinc-300">Quantidade</label>
                <input
                  type="number"
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-[#0b0f14] px-4 py-3 text-white outline-none"
                  placeholder="1"
                />
              </div>

              <button
                type="button"
                onClick={adicionarItem}
                className="w-full rounded-2xl border border-[#d4a93a]/20 bg-[#d4a93a]/10 px-4 py-3 font-bold text-[#f3d37a] transition hover:bg-[#d4a93a]/20"
              >
                Adicionar item
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {itensRascunho.length === 0 ? (
                <p className="text-sm text-zinc-400">
                  Nenhum item adicionado ainda.
                </p>
              ) : (
                itensRascunho.map((item) => (
                  <div
                    key={item.produto_id}
                    className="rounded-[22px] border border-white/10 bg-[#0b0f14]/80 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-white">{item.nome}</p>
                        <p className="mt-1 text-sm text-zinc-400">
                          Quantidade: {item.quantidade} · Valor unitário: {formatCurrency(item.preco_unitario)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => removerItem(item.produto_id)}
                        className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-300 transition hover:bg-red-500/20"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[30px] border border-[#d4a93a]/20 bg-[#d4a93a]/[0.06] p-6">
            <h2 className="text-xl font-black tracking-tight text-white">
              Resumo da venda
            </h2>

            <div className="mt-5 grid gap-3 text-sm text-zinc-300">
              <p>Cliente: {getClienteNome(clienteId || null)}</p>
              <p>Responsável: {responsavel}</p>
              <p>Pagamento: {formaPagamento}</p>
              <p>Subtotal: {formatCurrency(subtotalRascunho)}</p>
              <p>Desconto manual: {formatCurrency(descontoManualNumero)}</p>
              <p>Desconto Pix: {formatCurrency(descontoPixNumero)}</p>
              <p className="text-base font-bold text-white">
                Total: {formatCurrency(totalRascunho)}
              </p>
            </div>

            <button
              type="button"
              onClick={salvarVenda}
              disabled={salvando}
              className="mt-5 w-full rounded-2xl bg-[#d4a93a] px-4 py-3 font-bold text-black transition hover:bg-[#e2bb56] disabled:opacity-60"
            >
              {salvando ? "Salvando..." : "Salvar venda"}
            </button>
          </div>

          <div className="rounded-[30px] border border-white/10 bg-white/[0.03] p-6">
            <h2 className="text-xl font-black tracking-tight text-white">
              Vendas registradas
            </h2>

            {loading ? (
              <p className="mt-4 text-zinc-400">Carregando vendas...</p>
            ) : vendas.length === 0 ? (
              <p className="mt-4 text-zinc-400">Nenhuma venda cadastrada ainda.</p>
            ) : (
              <div className="mt-5 space-y-4">
                {vendas.map((venda) => {
                  const itensDaVenda = itensVenda.filter(
                    (item) => item.venda_id === venda.id
                  );

                  return (
                    <div
                      key={venda.id}
                      className="rounded-[24px] border border-white/10 bg-[#0b0f14]/80 p-4"
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-black text-white">
                              {getClienteNome(venda.cliente_id)}
                            </p>

                            <span
                              className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${obterCorFormaPagamento(
                                venda.forma_pagamento
                              )}`}
                            >
                              {venda.forma_pagamento}
                            </span>

                            <span className="inline-flex rounded-full bg-zinc-500/10 px-3 py-1 text-xs font-bold text-zinc-300">
                              {venda.status}
                            </span>
                          </div>

                          <p className="text-sm text-zinc-400">
                            Responsável: {venda.responsavel}
                          </p>

                          <p className="text-sm text-zinc-400">
                            Subtotal: {formatCurrency(Number(venda.subtotal || 0))} · Total:{" "}
                            {formatCurrency(Number(venda.total || 0))}
                          </p>

                          <p className="text-sm text-zinc-500">
                            {venda.observacao || "Sem observação"}
                          </p>

                          <div className="pt-2">
                            <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">
                              Itens
                            </p>

                            <div className="mt-2 space-y-2">
                              {itensDaVenda.map((item) => (
                                <div
                                  key={item.id}
                                  className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-300"
                                >
                                  {getProdutoNome(item.produto_id)} · Quantidade: {item.quantidade} ·{" "}
                                  {formatCurrency(Number(item.total_item || 0))}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div className="flex min-w-[190px] flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => cancelarVenda(venda.id)}
                            className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-300 transition hover:bg-red-500/20"
                          >
                            Cancelar venda
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
    </section>
  );
}