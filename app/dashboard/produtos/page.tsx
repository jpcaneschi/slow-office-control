"use client";

import { useEffect, useMemo, useState } from "react";
import { Package } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/dashboard/page-header";
import { CATEGORIAS_PADRAO, carregarConfigEmpresa } from "@/lib/empresa-config";

type Produto = {
  id: string;
  nome: string;
  categoria: string | null;
  preco: number | null;
  custo: number | null;
  estoque: number | null;
  status: string | null;
  imagem_url: string | null;
};

type Movimentacao = {
  id: string;
  produto_id: string;
  tipo: string;
  quantidade: number;
  observacao: string | null;
  created_at?: string;
};

const statusOptions = ["ativo", "inativo"];

// Markup padrão sugerido no cadastro: preço de venda = custo × MARKUP.
const MARKUP = 2.2;

export default function ProdutosPage() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingMovimento, setSavingMovimento] = useState(false);
  const [erro, setErro] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [categoriaOptions, setCategoriaOptions] =
    useState<string[]>(CATEGORIAS_PADRAO);

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroEstoque, setFiltroEstoque] = useState("todos");

  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get("estoque");
    if (e === "critico" || e === "baixo") setFiltroEstoque("baixo");
    else if (e === "zerado") setFiltroEstoque("zerado");
  }, []);

  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("Camiseta");
  const [preco, setPreco] = useState("");
  const [custo, setCusto] = useState("");
  const [estoque, setEstoque] = useState("");
  const [status, setStatus] = useState("ativo");
  const [imagemUrl, setImagemUrl] = useState("");

  const [produtoMovimentoId, setProdutoMovimentoId] = useState("");
  const [tipoMovimento, setTipoMovimento] = useState("entrada");
  const [quantidadeMovimento, setQuantidadeMovimento] = useState("");
  const [observacaoMovimento, setObservacaoMovimento] = useState("");

  async function carregarProdutos() {
    const { data, error } = await supabase
      .from("produtos")
      .select("id, nome, categoria, preco, custo, estoque, status, imagem_url")
      .order("created_at", { ascending: false });

    if (error) {
      setErro(error.message);
      return;
    }

    setProdutos(data || []);
  }

  async function carregarMovimentacoes() {
    const { data, error } = await supabase
      .from("estoque_movimentacoes")
      .select("id, produto_id, tipo, quantidade, observacao, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setErro(error.message);
      return;
    }

    setMovimentacoes(data || []);
  }

  async function carregarDados() {
    setLoading(true);
    setErro("");

    const cfg = await carregarConfigEmpresa();
    setCategoriaOptions(cfg.categorias_produto);

    await Promise.all([carregarProdutos(), carregarMovimentacoes()]);

    setLoading(false);
  }

  useEffect(() => {
    carregarDados();
  }, []);

  function limparFormulario() {
    setNome("");
    setCategoria("Camiseta");
    setPreco("");
    setCusto("");
    setEstoque("");
    setStatus("ativo");
    setImagemUrl("");
    setEditandoId(null);
  }

  function limparMovimentacao() {
    setProdutoMovimentoId("");
    setTipoMovimento("entrada");
    setQuantidadeMovimento("");
    setObservacaoMovimento("");
  }

  function editarProduto(produto: Produto) {
    setEditandoId(produto.id);
    setNome(produto.nome || "");
    setCategoria(produto.categoria || "Camiseta");
    setPreco(produto.preco?.toString() || "");
    setCusto(produto.custo?.toString() || "");
    setEstoque(produto.estoque?.toString() || "");
    setStatus(produto.status || "ativo");
    setImagemUrl(produto.imagem_url || "");
    setErro("");
  }

  async function excluirProduto(id: string) {
    const confirmar = window.confirm("Tem certeza que deseja excluir este produto?");
    if (!confirmar) return;

    const { error } = await supabase.from("produtos").delete().eq("id", id);

    if (error) {
      setErro(error.message);
      return;
    }

    if (editandoId === id) {
      limparFormulario();
    }

    await carregarDados();
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!nome.trim()) {
      setErro("O nome do produto é obrigatório.");
      return;
    }

    const precoNumero = Number(preco);
    const custoNumero = Number(custo);
    const estoqueNumero = Number(estoque);

    if (Number.isNaN(precoNumero) || preco === "") {
      setErro("Informe um preço válido.");
      return;
    }

    if (Number.isNaN(custoNumero) || custo === "") {
      setErro("Informe um custo válido.");
      return;
    }

    if (Number.isNaN(estoqueNumero) || estoque === "") {
      setErro("Informe um estoque válido.");
      return;
    }

    setSaving(true);
    setErro("");

    if (editandoId) {
      const { error } = await supabase
        .from("produtos")
        .update({
          nome: nome.trim(),
          categoria,
          preco: precoNumero,
          custo: custoNumero,
          estoque: estoqueNumero,
          status,
          imagem_url: imagemUrl.trim() || null,
        })
        .eq("id", editandoId);

      if (error) {
        setErro(error.message);
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase.from("produtos").insert({
        nome: nome.trim(),
        categoria,
        preco: precoNumero,
        custo: custoNumero,
        estoque: estoqueNumero,
        status,
        imagem_url: imagemUrl.trim() || null,
      });

      if (error) {
        setErro(error.message);
        setSaving(false);
        return;
      }
    }

    limparFormulario();
    await carregarDados();
    setSaving(false);
  }

  async function handleMovimentacao(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!produtoMovimentoId) {
      setErro("Selecione um produto para movimentar.");
      return;
    }

    const quantidadeNumero = Number(quantidadeMovimento);

    if (
      Number.isNaN(quantidadeNumero) ||
      quantidadeMovimento === "" ||
      quantidadeNumero <= 0
    ) {
      setErro("Informe uma quantidade válida para a movimentação.");
      return;
    }

    const produto = produtos.find((item) => item.id === produtoMovimentoId);

    if (!produto) {
      setErro("Produto não encontrado.");
      return;
    }

    const estoqueAtual = Number(produto.estoque || 0);
    const novoEstoque =
      tipoMovimento === "entrada"
        ? estoqueAtual + quantidadeNumero
        : estoqueAtual - quantidadeNumero;

    if (tipoMovimento === "saida" && novoEstoque < 0) {
      setErro("A saída não pode deixar o estoque negativo.");
      return;
    }

    setSavingMovimento(true);
    setErro("");

    const { error: errorMovimento } = await supabase.rpc(
      "registrar_movimentacao",
      {
        p_produto_id: produtoMovimentoId,
        p_tipo: tipoMovimento,
        p_quantidade: quantidadeNumero,
        p_motivo: tipoMovimento === "entrada" ? "Entrada manual" : "Saída manual",
        p_observacao: observacaoMovimento.trim() || null,
      }
    );

    if (errorMovimento) {
      setErro(errorMovimento.message);
      setSavingMovimento(false);
      return;
    }

    limparMovimentacao();
    await carregarDados();
    setSavingMovimento(false);
  }

  const produtosFiltrados = useMemo(() => {
    return produtos.filter((produto) => {
      const nomeMatch = produto.nome
        .toLowerCase()
        .includes(busca.trim().toLowerCase());

      const statusAtual = produto.status || "ativo";
      const statusMatch =
        filtroStatus === "todos" ? true : statusAtual === filtroStatus;

      const estoqueAtual = Number(produto.estoque || 0);

      const estoqueMatch =
        filtroEstoque === "todos"
          ? true
          : filtroEstoque === "zerado"
          ? estoqueAtual === 0
          : filtroEstoque === "baixo"
          ? estoqueAtual > 0 && estoqueAtual <= 3
          : filtroEstoque === "normal"
          ? estoqueAtual > 3
          : true;

      return nomeMatch && statusMatch && estoqueMatch;
    });
  }, [produtos, busca, filtroStatus, filtroEstoque]);

  const resumo = useMemo(() => {
    const totalProdutos = produtos.length;
    const ativos = produtos.filter(
      (produto) => (produto.status || "ativo") === "ativo"
    ).length;
    const inativos = produtos.filter(
      (produto) => (produto.status || "ativo") === "inativo"
    ).length;
    const estoqueTotal = produtos.reduce(
      (acc, produto) => acc + Number(produto.estoque || 0),
      0
    );
    const estoqueBaixo = produtos.filter((produto) => {
      const estoqueAtual = Number(produto.estoque || 0);
      return estoqueAtual > 0 && estoqueAtual <= 3;
    }).length;
    const estoqueZerado = produtos.filter(
      (produto) => Number(produto.estoque || 0) === 0
    ).length;

    return {
      totalProdutos,
      ativos,
      inativos,
      estoqueTotal,
      estoqueBaixo,
      estoqueZerado,
    };
  }, [produtos]);

  const produtosCriticos = useMemo(() => {
    return produtos
      .filter((produto) => Number(produto.estoque || 0) <= 3)
      .sort((a, b) => Number(a.estoque || 0) - Number(b.estoque || 0));
  }, [produtos]);

  function nomeProduto(produtoId: string) {
    const produto = produtos.find((item) => item.id === produtoId);
    return produto?.nome || "Produto não encontrado";
  }

  function getEstoqueBadge(estoqueAtual: number) {
    if (estoqueAtual === 0) {
      return "bg-[#fef2f2] text-[#b91c1c]";
    }

    if (estoqueAtual <= 3) {
      return "bg-[#eff6ff] text-[#2563eb]";
    }

    return "bg-[#f0fdf4] text-[#15803d]";
  }

  function getEstoqueLabel(estoqueAtual: number) {
    if (estoqueAtual === 0) {
      return "Estoque zerado";
    }

    if (estoqueAtual <= 3) {
      return "Estoque baixo";
    }

    return "Estoque ok";
  }

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Módulo operacional"
        title="Produtos / Estoque"
        description="Cadastre produtos, acompanhe estoque, registre entradas e saídas e identifique rapidamente itens com risco operacional."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-[28px] border border-[#e8ecf4] bg-[#f8fafc] p-5">
          <p className="text-sm font-bold text-[#475569]">Total de produtos</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-[#0f172a]">
            {resumo.totalProdutos}
          </p>
        </div>

        <div className="rounded-[28px] border border-[#2563eb]/20 bg-[#2563eb]/[0.06] p-5">
          <p className="text-sm font-bold text-[#2563eb]">Produtos ativos</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-[#0f172a]">
            {resumo.ativos}
          </p>
        </div>

        <div className="rounded-[28px] border border-[#2563eb]/20 bg-[#2563eb]/[0.06] p-5">
          <p className="text-sm font-bold text-[#2563eb]">Estoque baixo</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-[#0f172a]">
            {resumo.estoqueBaixo}
          </p>
        </div>

        <div className="rounded-[28px] border border-[#fecaca] bg-[#fef2f2] p-5">
          <p className="text-sm font-bold text-[#b91c1c]">Estoque zerado</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-[#0f172a]">
            {resumo.estoqueZerado}
          </p>
        </div>

        <div className="rounded-[28px] border border-[#bbf7d0] bg-[#f0fdf4] p-5">
          <p className="text-sm font-bold text-[#15803d]">Estoque total</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-[#0f172a]">
            {resumo.estoqueTotal}
          </p>
        </div>
      </div>

      {erro && (
        <div className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-4 text-sm text-[#b91c1c]">
          {erro}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <div className="space-y-6">
          <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
                {editandoId ? "Editar produto" : "Novo produto"}
              </h2>

              {editandoId && (
                <button
                  type="button"
                  onClick={limparFormulario}
                  className="rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-3 py-2 text-xs font-bold text-[#0f172a] transition hover:bg-[#151b24]"
                >
                  Cancelar
                </button>
              )}
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-sm text-[#475569]">Nome</label>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                  placeholder="Ex: Camiseta Oversized Slow"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#475569]">
                  Categoria
                </label>
                <select
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                >
                  {(categoriaOptions.includes(categoria) || !categoria
                    ? categoriaOptions
                    : [categoria, ...categoriaOptions]
                  ).map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#475569]">
                  Preço de venda
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={preco}
                  onChange={(e) => setPreco(e.target.value)}
                  className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                  placeholder="0.00"
                />
                {parseFloat(custo) > 0 && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-[#94a3b8]">
                      Sugestão (custo × {MARKUP.toLocaleString("pt-BR")}): R${" "}
                      {(parseFloat(custo) * MARKUP).toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setPreco((parseFloat(custo) * MARKUP).toFixed(2))
                      }
                      className="font-semibold text-[#2563eb] hover:underline"
                    >
                      Aplicar
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#475569]">Custo</label>
                <input
                  type="number"
                  step="0.01"
                  value={custo}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCusto(v);
                    // Sugere o preço automaticamente se ainda estiver vazio.
                    const n = parseFloat(v);
                    if (!preco && Number.isFinite(n) && n > 0) {
                      setPreco((n * MARKUP).toFixed(2));
                    }
                  }}
                  className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#475569]">
                  Estoque inicial
                </label>
                <input
                  type="number"
                  value={estoque}
                  onChange={(e) => setEstoque(e.target.value)}
                  className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#475569]">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                >
                  {statusOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#475569]">
                  Imagem (URL)
                </label>
                <div className="flex items-center gap-3">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-[#e8ecf4] bg-white">
                    {imagemUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imagemUrl}
                        alt="Prévia"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[#cbd5e1]">
                        <Package className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                  <input
                    value={imagemUrl}
                    onChange={(e) => setImagemUrl(e.target.value)}
                    className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                    placeholder="https://..."
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-2xl bg-[#2563eb] px-4 py-3 font-bold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
              >
                {saving
                  ? "Salvando..."
                  : editandoId
                  ? "Salvar alterações"
                  : "Cadastrar produto"}
              </button>
            </form>
          </div>

          <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
            <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
              Movimentar estoque
            </h2>

            <form onSubmit={handleMovimentacao} className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-sm text-[#475569]">Produto</label>
                <select
                  value={produtoMovimentoId}
                  onChange={(e) => setProdutoMovimentoId(e.target.value)}
                  className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                >
                  <option value="">Selecione um produto</option>
                  {produtos.map((produto) => (
                    <option key={produto.id} value={produto.id}>
                      {produto.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#475569]">Tipo</label>
                <select
                  value={tipoMovimento}
                  onChange={(e) => setTipoMovimento(e.target.value)}
                  className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                >
                  <option value="entrada">Entrada</option>
                  <option value="saida">Saída</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#475569]">
                  Quantidade
                </label>
                <input
                  type="number"
                  value={quantidadeMovimento}
                  onChange={(e) => setQuantidadeMovimento(e.target.value)}
                  className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#475569]">
                  Observação
                </label>
                <textarea
                  value={observacaoMovimento}
                  onChange={(e) => setObservacaoMovimento(e.target.value)}
                  className="min-h-[100px] w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                  placeholder="Ex: reposição da coleção nova"
                />
              </div>

              <button
                type="submit"
                disabled={savingMovimento}
                className="w-full rounded-2xl border border-[#2563eb]/20 bg-[#2563eb]/10 px-4 py-3 font-bold text-[#2563eb] transition hover:bg-[#2563eb]/20 disabled:opacity-60"
              >
                {savingMovimento ? "Registrando..." : "Registrar movimentação"}
              </button>
            </form>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[30px] border border-[#bfdbfe] bg-[#eff6ff] p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.28em] text-[#2563eb]">
                  Atenção operacional
                </p>
                <h2 className="mt-3 text-2xl font-black tracking-tight text-[#0f172a]">
                  Produtos com estoque crítico
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-[#475569]">
                  Aqui aparecem os itens com estoque baixo ou zerado para ajudar
                  na reposição e evitar perda de venda.
                </p>
              </div>

              <div className="rounded-2xl border border-[#bfdbfe] bg-[#f8fafc] px-4 py-3 text-center">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2563eb]">
                  Críticos
                </p>
                <p className="mt-2 text-3xl font-black tracking-tight text-[#0f172a]">
                  {produtosCriticos.length}
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {produtosCriticos.length === 0 ? (
                <div className="rounded-[22px] border border-[#bbf7d0] bg-[#f0fdf4] p-4 text-sm text-[#15803d]">
                  Nenhum produto com estoque crítico no momento.
                </div>
              ) : (
                produtosCriticos.slice(0, 5).map((produto) => {
                  const estoqueAtual = Number(produto.estoque || 0);

                  return (
                    <div
                      key={produto.id}
                      className="rounded-[22px] border border-[#e8ecf4] bg-[#f8fafc]/80 p-4"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-sm font-bold text-[#0f172a]">
                            {produto.nome}
                          </p>
                          <p className="mt-1 text-sm text-[#64748b]">
                            Categoria: {produto.categoria || "Não informada"}
                          </p>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-[#0f172a]">
                            {estoqueAtual} un.
                          </span>
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getEstoqueBadge(
                              estoqueAtual
                            )}`}
                          >
                            {getEstoqueLabel(estoqueAtual)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-5">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm text-[#475569]">
                  Buscar por nome
                </label>
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                  placeholder="Digite o nome do produto"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#475569]">
                  Filtrar status
                </label>
                <select
                  value={filtroStatus}
                  onChange={(e) => setFiltroStatus(e.target.value)}
                  className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                >
                  <option value="todos">Todos</option>
                  <option value="ativo">Ativos</option>
                  <option value="inativo">Inativos</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#475569]">
                  Filtrar estoque
                </label>
                <select
                  value={filtroEstoque}
                  onChange={(e) => setFiltroEstoque(e.target.value)}
                  className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                >
                  <option value="todos">Todos</option>
                  <option value="zerado">Estoque zerado</option>
                  <option value="baixo">Estoque baixo</option>
                  <option value="normal">Estoque normal</option>
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
            <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
              Produtos cadastrados
            </h2>

            {loading && <p className="mt-4 text-[#64748b]">Carregando produtos...</p>}

            {!loading && !erro && produtosFiltrados.length === 0 && (
              <p className="mt-4 text-[#64748b]">
                Nenhum produto encontrado com os filtros atuais.
              </p>
            )}

            {!loading && produtosFiltrados.length > 0 && (
              <div className="mt-5 space-y-4">
                {produtosFiltrados.map((produto) => {
                  const estoqueAtual = Number(produto.estoque || 0);

                  return (
                    <div
                      key={produto.id}
                      className="rounded-[24px] border border-[#e8ecf4] bg-[#f8fafc]/80 p-4"
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="flex gap-4">
                          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-[#e8ecf4] bg-white">
                            {produto.imagem_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={produto.imagem_url}
                                alt={produto.nome}
                                loading="lazy"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[#cbd5e1]">
                                <Package className="h-7 w-7" />
                              </div>
                            )}
                          </div>
                          <div>
                          <h3 className="text-lg font-black tracking-tight text-[#0f172a]">
                            {produto.nome}
                          </h3>

                          <p className="mt-1 text-sm text-[#64748b]">
                            Categoria: {produto.categoria || "Não informada"}
                          </p>

                          <p className="text-sm text-[#64748b]">
                            Preço: R$ {Number(produto.preco || 0).toFixed(2)}
                          </p>

                          <p className="text-sm text-[#64748b]">
                            Custo: R$ {Number(produto.custo || 0).toFixed(2)}
                          </p>

                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-[#0f172a]">
                              Estoque atual: {estoqueAtual}
                            </span>

                            <span
                              className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${getEstoqueBadge(
                                estoqueAtual
                              )}`}
                            >
                              {getEstoqueLabel(estoqueAtual)}
                            </span>
                          </div>

                          <p className="mt-2 inline-flex rounded-full bg-[#2563eb]/10 px-3 py-1 text-xs font-bold text-[#2563eb]">
                            Status: {produto.status || "ativo"}
                          </p>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => editarProduto(produto)}
                            className="rounded-2xl bg-[#2563eb] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#1d4ed8]"
                          >
                            Editar
                          </button>

                          <button
                            type="button"
                            onClick={() => excluirProduto(produto.id)}
                            className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] px-4 py-2 text-sm font-bold text-[#b91c1c] transition hover:bg-[#fee2e2]"
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

          <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
            <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
              Últimas movimentações
            </h2>

            {movimentacoes.length === 0 ? (
              <p className="mt-4 text-[#64748b]">
                Nenhuma movimentação registrada ainda.
              </p>
            ) : (
              <div className="mt-5 space-y-3">
                {movimentacoes.slice(0, 8).map((movimento) => (
                  <div
                    key={movimento.id}
                    className="rounded-[22px] border border-[#e8ecf4] bg-[#f8fafc]/80 p-4"
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-bold text-[#0f172a]">
                          {nomeProduto(movimento.produto_id)}
                        </p>
                        <p className="mt-1 text-sm text-[#64748b]">
                          {movimento.tipo === "entrada" ? "Entrada" : "Saída"} ·
                          Quantidade: {movimento.quantidade}
                        </p>
                        <p className="text-sm text-[#94a3b8]">
                          {movimento.observacao || "Sem observação"}
                        </p>
                      </div>

                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                          movimento.tipo === "entrada"
                            ? "bg-[#f0fdf4] text-[#15803d]"
                            : "bg-[#fef2f2] text-[#b91c1c]"
                        }`}
                      >
                        {movimento.tipo === "entrada" ? "Entrada" : "Saída"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}