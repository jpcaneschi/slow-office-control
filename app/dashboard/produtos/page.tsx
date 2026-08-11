"use client";

import { useEffect, useMemo, useState } from "react";
import { Package } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/dashboard/page-header";
import { CATEGORIAS_PADRAO, carregarConfigEmpresa } from "@/lib/empresa-config";
import { CsvTools } from "@/components/dashboard/csv-tools";
import { formatDataHoraBR } from "@/lib/datas";

type Produto = {
  id: string;
  nome: string;
  categoria: string | null;
  preco: number | null;
  custo: number | null;
  estoque: number | null;
  status: string | null;
  imagem_url: string | null;
  tem_variacoes: boolean | null;
};

type Variacao = {
  id: string;
  produto_id?: string;
  tamanho: string | null;
  cor: string | null;
  sku: string | null;
  preco: number | null;
  custo: number | null;
  estoque: number | null;
  status: string | null;
};

type Movimentacao = {
  id: string;
  produto_id: string;
  variacao_id: string | null;
  tipo: string;
  quantidade: number;
  quantidade_anterior: number | null;
  quantidade_posterior: number | null;
  motivo: string | null;
  observacao: string | null;
  user_id: string | null;
  created_at?: string;
};

// Rótulos amigáveis + se o tipo SOMA (entrada) ou subtrai (saída) do estoque.
const TIPO_MOV: Record<string, { label: string; entrada: boolean }> = {
  entrada: { label: "Entrada", entrada: true },
  venda: { label: "Venda", entrada: false },
  cancelamento: { label: "Cancelamento", entrada: true },
  devolucao: { label: "Devolução", entrada: true },
  condicional: { label: "Condicional enviado", entrada: false },
  retorno_condicional: { label: "Retorno de condicional", entrada: true },
  estoque_inicial: { label: "Estoque inicial", entrada: true },
  importacao: { label: "Importação", entrada: true },
  ajuste_positivo: { label: "Ajuste (+)", entrada: true },
  saida: { label: "Saída", entrada: false },
};
function tipoInfo(t: string) {
  return TIPO_MOV[t] || { label: t, entrada: false };
}

const statusOptions = ["ativo", "inativo"];

// Markup padrão sugerido no cadastro: preço de venda = custo × MARKUP.
const MARKUP = 2.2;

export default function ProdutosPage() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [variacaoLabel, setVariacaoLabel] = useState<Record<string, string>>({});
  const [movUserEmail, setMovUserEmail] = useState<Record<string, string>>({});
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

  // Variações (grade) do produto em edição
  const [temVariacoes, setTemVariacoes] = useState(false);
  const [variacoes, setVariacoes] = useState<Variacao[]>([]);
  const [varTamanho, setVarTamanho] = useState("");
  const [varCor, setVarCor] = useState("");
  const [varEstoque, setVarEstoque] = useState("");
  const [varPreco, setVarPreco] = useState("");
  const [savingVar, setSavingVar] = useState(false);
  // produto_id -> soma de estoque das variações (para exibir na lista)
  const [somaVariacoes, setSomaVariacoes] = useState<Record<string, number>>({});

  async function carregarProdutos() {
    const { data, error } = await supabase
      .from("produtos")
      .select("id, nome, categoria, preco, custo, estoque, status, imagem_url, tem_variacoes")
      .order("created_at", { ascending: false });

    if (error) {
      setErro(error.message);
      return;
    }

    setProdutos(data || []);

    // Soma o estoque das variações por produto (só usado no display da lista).
    const { data: vars } = await supabase
      .from("produto_variacoes")
      .select("produto_id, estoque");
    const mapa: Record<string, number> = {};
    for (const v of vars || []) {
      const pid = v.produto_id as string;
      mapa[pid] = (mapa[pid] || 0) + Number(v.estoque || 0);
    }
    setSomaVariacoes(mapa);
  }

  function estoqueEfetivo(produto: Produto) {
    if (produto.tem_variacoes) return somaVariacoes[produto.id] || 0;
    return Number(produto.estoque || 0);
  }

  async function carregarVariacoes(produtoId: string) {
    const { data, error } = await supabase
      .from("produto_variacoes")
      .select("id, tamanho, cor, sku, preco, custo, estoque, status")
      .eq("produto_id", produtoId)
      .order("created_at", { ascending: true });
    if (error) {
      setErro(error.message);
      return;
    }
    setVariacoes(data || []);
  }

  async function alternarTemVariacoes(valor: boolean) {
    setTemVariacoes(valor);
    // Em edição, persiste na hora para a grade poder ser adicionada.
    if (editandoId) {
      const { error } = await supabase
        .from("produtos")
        .update({ tem_variacoes: valor })
        .eq("id", editandoId);
      if (error) {
        setErro(error.message);
        return;
      }
      await carregarProdutos();
    }
  }

  async function adicionarVariacao() {
    if (!editandoId) return;
    if (!varTamanho.trim() && !varCor.trim()) {
      setErro("Informe ao menos tamanho ou cor da variação.");
      return;
    }
    const estoqueNum = Number(varEstoque || 0);
    const precoNum = varPreco ? Number(varPreco) : null;
    if (!Number.isFinite(estoqueNum) || estoqueNum < 0) {
      setErro("Estoque da variação não pode ser negativo.");
      return;
    }
    if (precoNum !== null && (!Number.isFinite(precoNum) || precoNum < 0)) {
      setErro("Preço da variação não pode ser negativo.");
      return;
    }
    setSavingVar(true);
    setErro("");
    const { error } = await supabase.from("produto_variacoes").insert({
      produto_id: editandoId,
      tamanho: varTamanho.trim() || null,
      cor: varCor.trim() || null,
      estoque: estoqueNum,
      preco: precoNum,
    });
    if (error) {
      setErro(error.message);
      setSavingVar(false);
      return;
    }
    setVarTamanho("");
    setVarCor("");
    setVarEstoque("");
    setVarPreco("");
    await carregarVariacoes(editandoId);
    await carregarProdutos();
    setSavingVar(false);
  }

  async function removerVariacao(id: string) {
    const { error } = await supabase
      .from("produto_variacoes")
      .delete()
      .eq("id", id);
    if (error) {
      setErro(error.message);
      return;
    }
    if (editandoId) await carregarVariacoes(editandoId);
    await carregarProdutos();
  }

  async function carregarMovimentacoes() {
    const { data, error } = await supabase
      .from("estoque_movimentacoes")
      .select(
        "id, produto_id, variacao_id, tipo, quantidade, quantidade_anterior, quantidade_posterior, motivo, observacao, user_id, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      setErro(error.message);
      return;
    }

    setMovimentacoes(data || []);

    // Mapa de variação (id -> "tamanho · cor") e de usuário (id -> e-mail).
    const [varsRes, membrosRes] = await Promise.all([
      supabase.from("produto_variacoes").select("id, tamanho, cor"),
      supabase.from("organization_members").select("user_id, email"),
    ]);
    const vmap: Record<string, string> = {};
    for (const v of varsRes.data || []) {
      vmap[v.id as string] =
        [v.tamanho, v.cor].filter(Boolean).join(" · ") || "Variação";
    }
    setVariacaoLabel(vmap);
    const emap: Record<string, string> = {};
    for (const m of membrosRes.data || []) {
      if (m.user_id) emap[m.user_id as string] = (m.email as string) || "";
    }
    setMovUserEmail(emap);
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
    setTemVariacoes(false);
    setVariacoes([]);
    setVarTamanho("");
    setVarCor("");
    setVarEstoque("");
    setVarPreco("");
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
    setTemVariacoes(!!produto.tem_variacoes);
    setVariacoes([]);
    if (produto.tem_variacoes) carregarVariacoes(produto.id);
    setErro("");
  }

  async function excluirProduto(id: string) {
    const confirmar = window.confirm("Tem certeza que deseja excluir este produto?");
    if (!confirmar) return;

    const produtoAlvo = produtos.find((p) => p.id === id);
    const { error } = await supabase.from("produtos").delete().eq("id", id);

    if (error) {
      setErro(error.message);
      return;
    }

    await supabase.rpc("log_auditoria", {
      p_acao: "produto_excluido",
      p_entidade: "produtos",
      p_registro_id: id,
      p_dados: { nome: produtoAlvo?.nome ?? null },
    });

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
    // Com grade, o estoque vive nas variações; o campo do produto vira 0.
    const estoqueNumero = temVariacoes ? 0 : Number(estoque);

    if (Number.isNaN(precoNumero) || preco === "" || precoNumero < 0) {
      setErro("Informe um preço válido (não negativo).");
      return;
    }

    if (Number.isNaN(custoNumero) || custo === "" || custoNumero < 0) {
      setErro("Informe um custo válido (não negativo).");
      return;
    }

    if (
      !temVariacoes &&
      (Number.isNaN(estoqueNumero) || estoque === "" || estoqueNumero < 0)
    ) {
      setErro("Informe um estoque válido (não negativo).");
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
          tem_variacoes: temVariacoes,
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
        tem_variacoes: temVariacoes,
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

      const estoqueAtual = estoqueEfetivo(produto);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtos, busca, filtroStatus, filtroEstoque, somaVariacoes]);

  const resumo = useMemo(() => {
    const totalProdutos = produtos.length;
    const ativos = produtos.filter(
      (produto) => (produto.status || "ativo") === "ativo"
    ).length;
    const inativos = produtos.filter(
      (produto) => (produto.status || "ativo") === "inativo"
    ).length;
    const estoqueTotal = produtos.reduce(
      (acc, produto) => acc + estoqueEfetivo(produto),
      0
    );
    const estoqueBaixo = produtos.filter((produto) => {
      const estoqueAtual = estoqueEfetivo(produto);
      return estoqueAtual > 0 && estoqueAtual <= 3;
    }).length;
    const estoqueZerado = produtos.filter(
      (produto) => estoqueEfetivo(produto) === 0
    ).length;

    return {
      totalProdutos,
      ativos,
      inativos,
      estoqueTotal,
      estoqueBaixo,
      estoqueZerado,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtos, somaVariacoes]);

  const produtosCriticos = useMemo(() => {
    return produtos
      .filter((produto) => estoqueEfetivo(produto) <= 3)
      .sort((a, b) => estoqueEfetivo(a) - estoqueEfetivo(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtos, somaVariacoes]);

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
                  min="0"
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
                  min="0"
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

              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3">
                <input
                  type="checkbox"
                  checked={temVariacoes}
                  onChange={(e) => alternarTemVariacoes(e.target.checked)}
                  className="h-4 w-4 accent-[#2563eb]"
                />
                <span className="text-sm font-semibold text-[#334155]">
                  Este produto usa grade (tamanho/cor)
                </span>
              </label>

              {!temVariacoes && (
                <div>
                  <label className="mb-2 block text-sm text-[#475569]">
                    Estoque inicial
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={estoque}
                    onChange={(e) => setEstoque(e.target.value)}
                    className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                    placeholder="0"
                  />
                </div>
              )}

              {temVariacoes && (
                <div className="rounded-2xl border border-[#dbeafe] bg-[#f8fbff] p-4">
                  <p className="text-sm font-bold text-[#1e3a8a]">Grade do produto</p>
                  {!editandoId ? (
                    <p className="mt-2 text-xs text-[#64748b]">
                      Salve o produto primeiro; depois abra em “Editar” para
                      montar a grade (tamanhos e cores).
                    </p>
                  ) : (
                    <>
                      {variacoes.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {variacoes.map((v) => (
                            <div
                              key={v.id}
                              className="flex items-center justify-between gap-2 rounded-xl border border-[#e8ecf4] bg-white px-3 py-2"
                            >
                              <span className="text-sm text-[#0f172a]">
                                {[v.tamanho, v.cor].filter(Boolean).join(" · ") ||
                                  "Variação"}
                                <span className="ml-2 text-xs text-[#64748b]">
                                  {Number(v.estoque || 0)} un
                                  {v.preco
                                    ? ` · R$ ${Number(v.preco).toFixed(2)}`
                                    : ""}
                                </span>
                              </span>
                              <button
                                type="button"
                                onClick={() => removerVariacao(v.id)}
                                className="rounded-lg px-2 py-1 text-xs font-semibold text-[#b91c1c] hover:bg-[#fef2f2]"
                              >
                                Remover
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <input
                          value={varTamanho}
                          onChange={(e) => setVarTamanho(e.target.value)}
                          placeholder="Tamanho (P/M/G)"
                          className="rounded-xl border border-[#e8ecf4] bg-white px-3 py-2 text-sm outline-none"
                        />
                        <input
                          value={varCor}
                          onChange={(e) => setVarCor(e.target.value)}
                          placeholder="Cor"
                          className="rounded-xl border border-[#e8ecf4] bg-white px-3 py-2 text-sm outline-none"
                        />
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={varEstoque}
                          onChange={(e) => setVarEstoque(e.target.value)}
                          placeholder="Estoque"
                          className="rounded-xl border border-[#e8ecf4] bg-white px-3 py-2 text-sm outline-none"
                        />
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={varPreco}
                          onChange={(e) => setVarPreco(e.target.value)}
                          placeholder="Preço (opcional)"
                          className="rounded-xl border border-[#e8ecf4] bg-white px-3 py-2 text-sm outline-none"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={adicionarVariacao}
                        disabled={savingVar}
                        className="mt-2 w-full rounded-xl border border-[#bfdbfe] bg-[#eff6ff] px-3 py-2 text-sm font-bold text-[#1d4ed8] transition hover:bg-[#dbeafe] disabled:opacity-60"
                      >
                        {savingVar ? "Adicionando..." : "+ Adicionar à grade"}
                      </button>
                    </>
                  )}
                </div>
              )}

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
                  {produtos
                    .filter((produto) => !produto.tem_variacoes)
                    .map((produto) => (
                      <option key={produto.id} value={produto.id}>
                        {produto.nome}
                      </option>
                    ))}
                </select>
                <p className="mt-1.5 text-xs text-[#94a3b8]">
                  Produtos com grade têm o estoque ajustado na própria grade
                  (aba de edição).
                </p>
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
                  const estoqueAtual = estoqueEfetivo(produto);

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
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
                Produtos cadastrados
              </h2>
              <CsvTools
                nomeArquivo="produtos"
                headers={["nome", "categoria", "preco", "custo", "estoque", "status"]}
                linhas={produtos.map((p) => [
                  p.nome,
                  p.categoria || "",
                  Number(p.preco || 0),
                  Number(p.custo || 0),
                  estoqueEfetivo(p),
                  p.status || "ativo",
                ])}
                ajuda="Colunas: nome, categoria, preco, custo, estoque, status."
                onImportar={async (linhas) => {
                  const novos = linhas
                    .map((r) => ({
                      nome: (r.nome || "").trim(),
                      categoria: (r.categoria || "").trim() || null,
                      preco: Number(r.preco || 0),
                      custo: Number(r.custo || 0),
                      estoque: Number(r.estoque || 0),
                      status: (r.status || "").trim() || "ativo",
                    }))
                    .filter((p) => p.nome);
                  if (novos.length === 0) return { ok: 0, erro: "Nenhuma linha com nome válido." };
                  const { error } = await supabase.from("produtos").insert(novos);
                  if (error) return { ok: 0, erro: error.message };
                  await carregarDados();
                  return { ok: novos.length };
                }}
              />
            </div>

            {loading && <p className="mt-4 text-[#64748b]">Carregando produtos...</p>}

            {!loading && !erro && produtosFiltrados.length === 0 && (
              <p className="mt-4 text-[#64748b]">
                Nenhum produto encontrado com os filtros atuais.
              </p>
            )}

            {!loading && produtosFiltrados.length > 0 && (
              <div className="mt-5 space-y-4">
                {produtosFiltrados.map((produto) => {
                  const estoqueAtual = estoqueEfetivo(produto);

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

                            {produto.tem_variacoes && (
                              <span className="inline-flex rounded-full bg-[#eff6ff] px-3 py-1 text-xs font-bold text-[#1d4ed8]">
                                grade
                              </span>
                            )}
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
                {movimentacoes.slice(0, 12).map((movimento) => {
                  const info = tipoInfo(movimento.tipo);
                  const variacao = movimento.variacao_id
                    ? variacaoLabel[movimento.variacao_id]
                    : null;
                  const autor = movimento.user_id
                    ? movUserEmail[movimento.user_id]
                    : null;
                  return (
                  <div
                    key={movimento.id}
                    className="rounded-[22px] border border-[#e8ecf4] bg-[#f8fafc]/80 p-4"
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-bold text-[#0f172a]">
                          {nomeProduto(movimento.produto_id)}
                          {variacao && (
                            <span className="ml-2 rounded-full bg-[#eff6ff] px-2 py-0.5 text-xs font-semibold text-[#1d4ed8]">
                              {variacao}
                            </span>
                          )}
                        </p>
                        <p className="mt-1 text-sm text-[#64748b]">
                          {info.entrada ? "+" : "−"}
                          {movimento.quantidade}
                          {movimento.quantidade_anterior != null &&
                            movimento.quantidade_posterior != null && (
                              <span className="ml-1 text-[#94a3b8]">
                                (saldo {Number(movimento.quantidade_anterior)} →{" "}
                                {Number(movimento.quantidade_posterior)})
                              </span>
                            )}
                        </p>
                        <p className="text-xs text-[#94a3b8]">
                          {movimento.motivo || movimento.observacao || "—"}
                          {autor ? ` · por ${autor}` : ""}
                          {movimento.created_at
                            ? ` · ${formatDataHoraBR(movimento.created_at)}`
                            : ""}
                        </p>
                      </div>

                      <span
                        className={`inline-flex shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                          info.entrada
                            ? "bg-[#f0fdf4] text-[#15803d]"
                            : "bg-[#fef2f2] text-[#b91c1c]"
                        }`}
                      >
                        {info.label}
                      </span>
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