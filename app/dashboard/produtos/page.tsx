"use client";

import { useEffect, useMemo, useState } from "react";
import { Package } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/dashboard/page-header";
import { CATEGORIAS_PADRAO, carregarConfigEmpresa } from "@/lib/empresa-config";
import { CsvTools } from "@/components/dashboard/csv-tools";
import {
  ProdutoImportWizard,
  type RelatorioImport,
} from "@/components/dashboard/produto-import-wizard";
import { formatDataHoraBR } from "@/lib/datas";
import {
  rotuloVariacao,
  assinaturaExiste,
  gerarCombinacoes,
  validarCombinacao,
  atributosParaLegado,
  type ProdutoOpcao,
  type OpcaoTipo,
  type Atributos,
} from "@/lib/variacoes-utils";
import {
  planejarImportacao,
  type ProdutoImport,
} from "@/lib/csv-importador";
import {
  agregarEstoqueVariacoes,
  estoqueEfetivo as estoqueEfetivoUtil,
} from "@/lib/estoque-utils";

type Produto = {
  id: string;
  nome: string;
  categoria: string | null;
  marca: string | null;
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
  atributos: Atributos | null;
  tamanho: string | null;
  cor: string | null;
  sku: string | null;
  codigo_barras: string | null;
  preco: number | null;
  custo: number | null;
  estoque: number | null;
  status: string | null;
};

type Opcao = ProdutoOpcao & { id: string };

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
  const [ordenacao, setOrdenacao] = useState("recentes");
  const [paginaProdutos, setPaginaProdutos] = useState(0);

  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get("estoque");
    if (e === "critico" || e === "baixo") setFiltroEstoque("baixo");
    else if (e === "zerado") setFiltroEstoque("zerado");
  }, []);

  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("Camiseta");
  const [marca, setMarca] = useState("");
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
  const [opcoes, setOpcoes] = useState<Opcao[]>([]);
  // Nova opção (definição) do produto
  const [novaOpcaoNome, setNovaOpcaoNome] = useState("");
  const [novaOpcaoTipo, setNovaOpcaoTipo] = useState<OpcaoTipo>("lista");
  const [novaOpcaoObrigatorio, setNovaOpcaoObrigatorio] = useState(true);
  const [novaOpcaoValores, setNovaOpcaoValores] = useState("");
  const [novaOpcaoUnidade, setNovaOpcaoUnidade] = useState("");
  const [savingOpcao, setSavingOpcao] = useState(false);
  // Nova variação (combinação de valores das opções)
  const [varAtributos, setVarAtributos] = useState<Record<string, string>>({});
  const [varEstoque, setVarEstoque] = useState("");
  const [varPreco, setVarPreco] = useState("");
  const [varCusto, setVarCusto] = useState("");
  const [varSku, setVarSku] = useState("");
  const [varBarras, setVarBarras] = useState("");
  const [savingVar, setSavingVar] = useState(false);
  // produto_id -> soma de estoque das variações (para exibir na lista)
  const [somaVariacoes, setSomaVariacoes] = useState<Record<string, number>>({});
  const [todasVariacoes, setTodasVariacoes] = useState<Variacao[]>([]);

  async function carregarProdutos() {
    const { data, error } = await supabase
      .from("produtos")
      .select("id, nome, categoria, marca, preco, custo, estoque, status, imagem_url, tem_variacoes")
      .order("created_at", { ascending: false });

    if (error) {
      setErro(error.message);
      return;
    }

    setProdutos(data || []);

    // Variações completas (para soma na lista E para o CSV com grade).
    const { data: vars } = await supabase
      .from("produto_variacoes")
      .select("id, produto_id, atributos, tamanho, cor, sku, codigo_barras, preco, custo, estoque, status");
    setTodasVariacoes((vars as Variacao[]) || []);
    setSomaVariacoes(
      agregarEstoqueVariacoes(
        (vars as { produto_id: string; estoque: number | null }[]) || []
      )
    );
  }

  function estoqueEfetivo(produto: Produto) {
    return estoqueEfetivoUtil(produto, somaVariacoes);
  }

  // Persiste os produtos já estruturados pelo assistente de importação (#6).
  // Idempotente: produto com nome já existente é ignorado (não duplica).
  async function persistirImportacao(
    produtosImport: ProdutoImport[]
  ): Promise<RelatorioImport> {
    const plano = planejarImportacao(
      produtosImport,
      produtos.map((p) => p.nome)
    );
    let criados = 0;
    let ignorados = 0;
    const erros: { linha?: number; motivo: string }[] = [];

    for (const item of plano) {
      if (item.acao === "ignorar_existente") {
        ignorados++;
        continue;
      }
      const p = item.produto;
      const { data: prod, error } = await supabase
        .from("produtos")
        .insert({
          nome: p.nome,
          categoria: p.categoria,
          marca: p.marca,
          preco: p.preco,
          custo: p.custo,
          estoque: p.temVariacoes ? 0 : p.estoque,
          status: p.status,
          tem_variacoes: p.temVariacoes,
        })
        .select("id")
        .single();
      if (error || !prod) {
        erros.push({ motivo: `${p.nome}: ${error?.message ?? "falha ao criar"}` });
        continue;
      }

      if (p.temVariacoes) {
        if (p.opcoes.length) {
          const { error: oerr } = await supabase.from("produto_opcoes").insert(
            p.opcoes.map((o) => ({
              produto_id: prod.id,
              nome: o.nome,
              tipo: "lista",
              obrigatorio: o.obrigatorio,
              ordem: o.ordem,
              valores_permitidos: o.valores_permitidos,
            }))
          );
          if (oerr) erros.push({ motivo: `${p.nome} (opções): ${oerr.message}` });
        }
        // Espelha atributos nas colunas legadas tamanho/cor (compatibilidade).
        const vs = p.variacoes.map((v) => {
          const legado = atributosParaLegado(v.atributos);
          return {
            produto_id: prod.id,
            atributos: v.atributos,
            tamanho: legado.tamanho,
            cor: legado.cor,
            sku: v.sku,
            codigo_barras: v.codigo_barras,
            preco: v.preco,
            custo: v.custo,
            estoque: v.estoque,
          };
        });
        const { error: verr } = await supabase
          .from("produto_variacoes")
          .insert(vs);
        if (verr) {
          erros.push({ motivo: `${p.nome} (variações): ${verr.message}` });
          continue;
        }
      }
      criados++;
    }

    await carregarDados();
    return { criados, ignorados, erros };
  }

  async function carregarVariacoes(produtoId: string) {
    const { data, error } = await supabase
      .from("produto_variacoes")
      .select("id, atributos, tamanho, cor, sku, codigo_barras, preco, custo, estoque, status")
      .eq("produto_id", produtoId)
      .order("created_at", { ascending: true });
    if (error) {
      setErro(error.message);
      return;
    }
    setVariacoes(data || []);
  }

  async function carregarOpcoes(produtoId: string) {
    const { data, error } = await supabase
      .from("produto_opcoes")
      .select("id, nome, tipo, unidade, obrigatorio, ordem, valores_permitidos")
      .eq("produto_id", produtoId)
      .order("ordem", { ascending: true });
    if (error) {
      setErro(error.message);
      return;
    }
    setOpcoes((data as Opcao[]) || []);
  }

  // Nomes das opções na ordem definida — usado para rotular a variação.
  const ordemOpcoes = useMemo(
    () => [...opcoes].sort((a, b) => a.ordem - b.ordem).map((o) => o.nome),
    [opcoes]
  );

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

  async function adicionarOpcao() {
    if (!editandoId) return;
    const nomeOpcao = novaOpcaoNome.trim();
    if (!nomeOpcao) {
      setErro("Informe o nome da opção (ex.: Tamanho, Cor, Numeração).");
      return;
    }
    if (opcoes.some((o) => o.nome.toLowerCase() === nomeOpcao.toLowerCase())) {
      setErro(`Já existe uma opção "${nomeOpcao}".`);
      return;
    }
    const valores =
      novaOpcaoTipo === "lista"
        ? Array.from(
            new Set(
              novaOpcaoValores
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean)
            )
          )
        : [];
    if (novaOpcaoTipo === "lista" && valores.length === 0) {
      setErro("Liste ao menos um valor (separados por vírgula).");
      return;
    }
    setSavingOpcao(true);
    setErro("");
    const { error } = await supabase.from("produto_opcoes").insert({
      produto_id: editandoId,
      nome: nomeOpcao,
      tipo: novaOpcaoTipo,
      unidade: novaOpcaoUnidade.trim() || null,
      obrigatorio: novaOpcaoObrigatorio,
      ordem: opcoes.length,
      valores_permitidos: valores,
    });
    if (error) {
      setErro(error.message);
      setSavingOpcao(false);
      return;
    }
    setNovaOpcaoNome("");
    setNovaOpcaoTipo("lista");
    setNovaOpcaoObrigatorio(true);
    setNovaOpcaoValores("");
    setNovaOpcaoUnidade("");
    await carregarOpcoes(editandoId);
    setSavingOpcao(false);
  }

  async function removerOpcao(id: string) {
    if (
      !window.confirm(
        "Remover esta opção? As variações já criadas não são apagadas."
      )
    )
      return;
    const { error } = await supabase
      .from("produto_opcoes")
      .delete()
      .eq("id", id);
    if (error) {
      setErro(error.message);
      return;
    }
    if (editandoId) await carregarOpcoes(editandoId);
  }

  async function adicionarVariacao() {
    if (!editandoId) return;
    // Monta os atributos a partir dos valores escolhidos por opção.
    const atributos: Atributos = {};
    for (const o of opcoes) {
      const v = (varAtributos[o.nome] ?? "").trim();
      if (v) atributos[o.nome] = v;
    }
    if (opcoes.length === 0) {
      setErro("Crie ao menos uma opção (ex.: Tamanho) antes das variações.");
      return;
    }
    const erroValidacao = validarCombinacao(atributos, opcoes);
    if (erroValidacao) {
      setErro(erroValidacao);
      return;
    }
    if (assinaturaExiste(atributos, variacoes.map((v) => v.atributos))) {
      setErro("Essa combinação já existe na grade.");
      return;
    }
    const estoqueNum = Number(varEstoque || 0);
    const precoNum = varPreco ? Number(varPreco) : null;
    const custoNum = varCusto ? Number(varCusto) : null;
    if (!Number.isFinite(estoqueNum) || estoqueNum < 0) {
      setErro("Estoque da variação não pode ser negativo.");
      return;
    }
    if (precoNum !== null && (!Number.isFinite(precoNum) || precoNum < 0)) {
      setErro("Preço da variação não pode ser negativo.");
      return;
    }
    if (custoNum !== null && (!Number.isFinite(custoNum) || custoNum < 0)) {
      setErro("Custo da variação não pode ser negativo.");
      return;
    }
    setSavingVar(true);
    setErro("");
    const legado = atributosParaLegado(atributos);
    const { error } = await supabase.from("produto_variacoes").insert({
      produto_id: editandoId,
      atributos,
      tamanho: legado.tamanho,
      cor: legado.cor,
      sku: varSku.trim() || null,
      codigo_barras: varBarras.trim() || null,
      estoque: estoqueNum,
      preco: precoNum,
      custo: custoNum,
    });
    if (error) {
      setErro(error.message);
      setSavingVar(false);
      return;
    }
    setVarAtributos({});
    setVarEstoque("");
    setVarPreco("");
    setVarCusto("");
    setVarSku("");
    setVarBarras("");
    await carregarVariacoes(editandoId);
    await carregarProdutos();
    setSavingVar(false);
  }

  // Cria de uma vez todas as combinações das opções de lista que ainda faltam.
  async function gerarTodasCombinacoes() {
    if (!editandoId) return;
    const combos = gerarCombinacoes(opcoes);
    const faltantes = combos.filter(
      (c) => !assinaturaExiste(c, variacoes.map((v) => v.atributos))
    );
    if (faltantes.length === 0) {
      setErro("Todas as combinações já existem na grade.");
      return;
    }
    setSavingVar(true);
    setErro("");
    const linhas = faltantes.map((atributos) => {
      const legado = atributosParaLegado(atributos);
      return {
        produto_id: editandoId,
        atributos,
        tamanho: legado.tamanho,
        cor: legado.cor,
        estoque: 0,
      };
    });
    const { error } = await supabase.from("produto_variacoes").insert(linhas);
    if (error) {
      setErro(error.message);
      setSavingVar(false);
      return;
    }
    await carregarVariacoes(editandoId);
    await carregarProdutos();
    setSavingVar(false);
  }

  async function removerVariacao(id: string) {
    if (!window.confirm("Remover esta variação da grade?")) return;
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
      supabase.from("produto_variacoes").select("id, atributos, tamanho, cor"),
      supabase.from("organization_members").select("user_id, email"),
    ]);
    const vmap: Record<string, string> = {};
    for (const v of varsRes.data || []) {
      vmap[v.id as string] = rotuloVariacao(v.atributos as Atributos, {
        tamanho: v.tamanho as string | null,
        cor: v.cor as string | null,
      });
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
    setMarca("");
    setPreco("");
    setCusto("");
    setEstoque("");
    setStatus("ativo");
    setImagemUrl("");
    setEditandoId(null);
    setTemVariacoes(false);
    setVariacoes([]);
    setOpcoes([]);
    setNovaOpcaoNome("");
    setNovaOpcaoTipo("lista");
    setNovaOpcaoObrigatorio(true);
    setNovaOpcaoValores("");
    setNovaOpcaoUnidade("");
    setVarAtributos({});
    setVarEstoque("");
    setVarPreco("");
    setVarCusto("");
    setVarSku("");
    setVarBarras("");
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
    setMarca(produto.marca || "");
    setPreco(produto.preco?.toString() || "");
    setCusto(produto.custo?.toString() || "");
    setEstoque(produto.estoque?.toString() || "");
    setStatus(produto.status || "ativo");
    setImagemUrl(produto.imagem_url || "");
    setTemVariacoes(!!produto.tem_variacoes);
    setVariacoes([]);
    setOpcoes([]);
    setVarAtributos({});
    if (produto.tem_variacoes) {
      carregarVariacoes(produto.id);
      carregarOpcoes(produto.id);
    }
    setErro("");
  }

  async function excluirProduto(id: string) {
    setErro("");
    // Não excluir fisicamente produto com histórico — preferir inativar
    // (preserva vendas/movimentações e não quebra relatórios).
    const { count: cItens } = await supabase
      .from("venda_itens")
      .select("id", { count: "exact", head: true })
      .eq("produto_id", id);
    const { count: cMov } = await supabase
      .from("estoque_movimentacoes")
      .select("id", { count: "exact", head: true })
      .eq("produto_id", id);
    if ((cItens || 0) > 0 || (cMov || 0) > 0) {
      const inativar = window.confirm(
        "Este produto tem histórico (vendas/movimentações) e não pode ser excluído sem perder esse histórico.\n\nDeseja INATIVAR o produto? (ele some das listagens de venda, mas o histórico é preservado)"
      );
      if (!inativar) return;
      const { error: eInat } = await supabase
        .from("produtos")
        .update({ status: "inativo" })
        .eq("id", id);
      if (eInat) {
        setErro(eInat.message);
        return;
      }
      if (editandoId === id) limparFormulario();
      await carregarDados();
      return;
    }

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
          marca: marca.trim() || null,
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
        marca: marca.trim() || null,
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

  const produtosOrdenados = useMemo(() => {
    const arr = [...produtosFiltrados];
    if (ordenacao === "nome") {
      arr.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    } else if (ordenacao === "estoque") {
      arr.sort((a, b) => estoqueEfetivo(a) - estoqueEfetivo(b));
    } else if (ordenacao === "preco") {
      arr.sort((a, b) => Number(b.preco || 0) - Number(a.preco || 0));
    }
    // "recentes" mantém a ordem de carregamento (created_at desc)
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtosFiltrados, ordenacao, somaVariacoes]);

  // Paginação (12/página) — evita renderizar 155 produtos de uma vez.
  const porPaginaProdutos = 12;
  const totalPaginasProdutos = Math.max(
    1,
    Math.ceil(produtosOrdenados.length / porPaginaProdutos)
  );
  const paginaAtualProdutos = Math.min(paginaProdutos, totalPaginasProdutos - 1);
  const produtosPagina = produtosOrdenados.slice(
    paginaAtualProdutos * porPaginaProdutos,
    paginaAtualProdutos * porPaginaProdutos + porPaginaProdutos
  );

  // Volta pra 1ª página quando muda filtro/busca/ordenação.
  useEffect(() => {
    setPaginaProdutos(0);
  }, [busca, filtroStatus, filtroEstoque, ordenacao]);

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
                  Marca <span className="text-[#94a3b8]">(opcional)</span>
                </label>
                <input
                  value={marca}
                  onChange={(e) => setMarca(e.target.value)}
                  className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                  placeholder="Ex: Nike, Slow, sem marca"
                />
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
                  Este produto tem variações (grade)
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
                <div className="space-y-4 rounded-2xl border border-[#dbeafe] bg-[#f8fbff] p-4">
                  {!editandoId ? (
                    <p className="text-xs text-[#64748b]">
                      Salve o produto primeiro; depois abra em “Editar” para
                      definir as opções (ex.: Tamanho, Cor, Numeração) e montar a
                      grade.
                    </p>
                  ) : (
                    <>
                      {/* 1) Opções do produto (definições) */}
                      <div>
                        <p className="text-sm font-bold text-[#1e3a8a]">
                          Opções do produto
                        </p>
                        <p className="mt-0.5 text-xs text-[#64748b]">
                          Defina o que varia (Tamanho, Cor, Numeração, Voltagem…).
                          Só o que você criar aqui aparece na venda.
                        </p>

                        {opcoes.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {opcoes.map((o) => (
                              <div
                                key={o.id}
                                className="flex items-center justify-between gap-2 rounded-xl border border-[#e8ecf4] bg-white px-3 py-2"
                              >
                                <span className="text-sm text-[#0f172a]">
                                  <span className="font-semibold">{o.nome}</span>
                                  <span className="ml-1 text-xs text-[#64748b]">
                                    ({o.tipo}
                                    {o.obrigatorio ? " · obrigatória" : " · opcional"})
                                  </span>
                                  {o.valores_permitidos.length > 0 && (
                                    <span className="ml-2 text-xs text-[#94a3b8]">
                                      {o.valores_permitidos.join(", ")}
                                    </span>
                                  )}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => removerOpcao(o.id)}
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
                            value={novaOpcaoNome}
                            onChange={(e) => setNovaOpcaoNome(e.target.value)}
                            placeholder="Nome (ex.: Tamanho)"
                            className="rounded-xl border border-[#e8ecf4] bg-white px-3 py-2 text-sm outline-none"
                          />
                          <select
                            value={novaOpcaoTipo}
                            onChange={(e) =>
                              setNovaOpcaoTipo(e.target.value as OpcaoTipo)
                            }
                            className="rounded-xl border border-[#e8ecf4] bg-white px-3 py-2 text-sm outline-none"
                          >
                            <option value="lista">Lista de valores</option>
                            <option value="numero">Número</option>
                            <option value="numero_unidade">Número + unidade</option>
                            <option value="texto">Texto livre</option>
                          </select>
                          {novaOpcaoTipo === "lista" && (
                            <input
                              value={novaOpcaoValores}
                              onChange={(e) => setNovaOpcaoValores(e.target.value)}
                              placeholder="Valores: P, M, G"
                              className="col-span-2 rounded-xl border border-[#e8ecf4] bg-white px-3 py-2 text-sm outline-none"
                            />
                          )}
                          {novaOpcaoTipo === "numero_unidade" && (
                            <input
                              value={novaOpcaoUnidade}
                              onChange={(e) => setNovaOpcaoUnidade(e.target.value)}
                              placeholder="Unidade (ex.: V, ml)"
                              className="col-span-2 rounded-xl border border-[#e8ecf4] bg-white px-3 py-2 text-sm outline-none"
                            />
                          )}
                          <label className="col-span-2 flex cursor-pointer items-center gap-2 text-xs text-[#475569]">
                            <input
                              type="checkbox"
                              checked={novaOpcaoObrigatorio}
                              onChange={(e) =>
                                setNovaOpcaoObrigatorio(e.target.checked)
                              }
                              className="h-4 w-4 accent-[#2563eb]"
                            />
                            Obrigatória (toda variação precisa ter esse valor)
                          </label>
                        </div>
                        <button
                          type="button"
                          onClick={adicionarOpcao}
                          disabled={savingOpcao}
                          className="mt-2 w-full rounded-xl border border-[#bfdbfe] bg-white px-3 py-2 text-sm font-bold text-[#1d4ed8] transition hover:bg-[#eff6ff] disabled:opacity-60"
                        >
                          {savingOpcao ? "Adicionando..." : "+ Adicionar opção"}
                        </button>
                      </div>

                      {/* 2) Variações (combinações) */}
                      {opcoes.length > 0 && (
                        <div className="border-t border-[#dbeafe] pt-4">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-bold text-[#1e3a8a]">
                              Variações da grade
                            </p>
                            <button
                              type="button"
                              onClick={gerarTodasCombinacoes}
                              disabled={savingVar}
                              className="rounded-lg px-2 py-1 text-xs font-semibold text-[#1d4ed8] hover:bg-[#eff6ff] disabled:opacity-60"
                            >
                              Gerar todas
                            </button>
                          </div>

                          {variacoes.length > 0 && (
                            <div className="mt-3 space-y-2">
                              {variacoes.map((v) => (
                                <div
                                  key={v.id}
                                  className="flex items-center justify-between gap-2 rounded-xl border border-[#e8ecf4] bg-white px-3 py-2"
                                >
                                  <span className="text-sm text-[#0f172a]">
                                    {rotuloVariacao(
                                      v.atributos,
                                      { tamanho: v.tamanho, cor: v.cor },
                                      ordemOpcoes
                                    )}
                                    <span className="ml-2 text-xs text-[#64748b]">
                                      {Number(v.estoque || 0)} un
                                      {v.preco
                                        ? ` · R$ ${Number(v.preco).toFixed(2)}`
                                        : ""}
                                      {v.sku ? ` · ${v.sku}` : ""}
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

                          {/* Um campo por opção */}
                          <div className="mt-3 space-y-2">
                            {[...opcoes]
                              .sort((a, b) => a.ordem - b.ordem)
                              .map((o) => (
                                <div key={o.id}>
                                  <label className="mb-1 block text-xs text-[#475569]">
                                    {o.nome}
                                    {o.obrigatorio ? " *" : ""}
                                  </label>
                                  {o.tipo === "lista" &&
                                  o.valores_permitidos.length > 0 ? (
                                    <select
                                      value={varAtributos[o.nome] || ""}
                                      onChange={(e) =>
                                        setVarAtributos((prev) => ({
                                          ...prev,
                                          [o.nome]: e.target.value,
                                        }))
                                      }
                                      className="w-full rounded-xl border border-[#e8ecf4] bg-white px-3 py-2 text-sm outline-none"
                                    >
                                      <option value="">
                                        {o.obrigatorio ? "Selecione" : "(nenhum)"}
                                      </option>
                                      {o.valores_permitidos.map((val) => (
                                        <option key={val} value={val}>
                                          {val}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input
                                      type={
                                        o.tipo === "numero" ||
                                        o.tipo === "numero_unidade"
                                          ? "number"
                                          : "text"
                                      }
                                      value={varAtributos[o.nome] || ""}
                                      onChange={(e) =>
                                        setVarAtributos((prev) => ({
                                          ...prev,
                                          [o.nome]: e.target.value,
                                        }))
                                      }
                                      placeholder={
                                        o.unidade ? `Valor (${o.unidade})` : "Valor"
                                      }
                                      className="w-full rounded-xl border border-[#e8ecf4] bg-white px-3 py-2 text-sm outline-none"
                                    />
                                  )}
                                </div>
                              ))}
                          </div>

                          <div className="mt-2 grid grid-cols-2 gap-2">
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
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={varCusto}
                              onChange={(e) => setVarCusto(e.target.value)}
                              placeholder="Custo (opcional)"
                              className="rounded-xl border border-[#e8ecf4] bg-white px-3 py-2 text-sm outline-none"
                            />
                            <input
                              value={varSku}
                              onChange={(e) => setVarSku(e.target.value)}
                              placeholder="SKU (opcional)"
                              className="rounded-xl border border-[#e8ecf4] bg-white px-3 py-2 text-sm outline-none"
                            />
                            <input
                              value={varBarras}
                              onChange={(e) => setVarBarras(e.target.value)}
                              placeholder="Código de barras (opcional)"
                              className="col-span-2 rounded-xl border border-[#e8ecf4] bg-white px-3 py-2 text-sm outline-none"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={adicionarVariacao}
                            disabled={savingVar}
                            className="mt-2 w-full rounded-xl border border-[#bfdbfe] bg-[#eff6ff] px-3 py-2 text-sm font-bold text-[#1d4ed8] transition hover:bg-[#dbeafe] disabled:opacity-60"
                          >
                            {savingVar ? "Adicionando..." : "+ Adicionar variação"}
                          </button>
                        </div>
                      )}
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
              <div className="flex flex-col items-end gap-2">
                <div className="flex flex-wrap gap-2">
                  <CsvTools
                    nomeArquivo="produtos"
                    headers={[
                      "nome",
                      "categoria",
                      "marca",
                      "preco",
                      "custo",
                      "estoque",
                      "status",
                      "tamanho",
                      "cor",
                    ]}
                    linhas={produtos.flatMap((p) => {
                      const vs = todasVariacoes.filter(
                        (v) => v.produto_id === p.id
                      );
                      if (p.tem_variacoes && vs.length > 0) {
                        // Uma linha por variação (grade preservada).
                        return vs.map((v) => [
                          p.nome,
                          p.categoria || "",
                          p.marca || "",
                          Number(v.preco ?? p.preco ?? 0),
                          Number(v.custo ?? p.custo ?? 0),
                          Number(v.estoque || 0),
                          p.status || "ativo",
                          v.tamanho || "",
                          v.cor || "",
                        ]);
                      }
                      return [
                        [
                          p.nome,
                          p.categoria || "",
                          p.marca || "",
                          Number(p.preco || 0),
                          Number(p.custo || 0),
                          Number(p.estoque || 0),
                          p.status || "ativo",
                          "",
                          "",
                        ],
                      ];
                    })}
                  />
                  <ProdutoImportWizard
                    nomesExistentes={produtos.map((p) => p.nome)}
                    onImportar={persistirImportacao}
                  />
                </div>
                <p className="max-w-md text-right text-xs text-[#94a3b8]">
                  O assistente aceita cabeçalhos comuns (produto, preço venda,
                  tamanho, cor, sku…) e agrupa linhas do mesmo nome em variações.
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-[#64748b]">
                {produtosOrdenados.length} produto(s)
              </p>
              <label className="flex items-center gap-2 text-sm text-[#475569]">
                Ordenar:
                <select
                  value={ordenacao}
                  onChange={(e) => setOrdenacao(e.target.value)}
                  className="rounded-xl border border-[#e8ecf4] bg-white px-3 py-1.5 text-sm outline-none"
                >
                  <option value="recentes">Mais recentes</option>
                  <option value="nome">Nome (A–Z)</option>
                  <option value="estoque">Menor estoque</option>
                  <option value="preco">Maior preço</option>
                </select>
              </label>
            </div>

            {loading && <p className="mt-4 text-[#64748b]">Carregando produtos...</p>}

            {!loading && !erro && produtosOrdenados.length === 0 && (
              <p className="mt-4 text-[#64748b]">
                Nenhum produto encontrado com os filtros atuais.
              </p>
            )}

            {!loading && produtosOrdenados.length > 0 && (
              <div className="mt-5 space-y-4">
                {produtosPagina.map((produto) => {
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

                {totalPaginasProdutos > 1 && (
                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => setPaginaProdutos((p) => Math.max(0, p - 1))}
                      disabled={paginaAtualProdutos === 0}
                      className="rounded-xl border border-[#e8ecf4] bg-white px-4 py-2 text-sm font-semibold text-[#334155] transition hover:bg-[#f4f6fb] disabled:opacity-40"
                    >
                      Anterior
                    </button>
                    <span className="text-sm text-[#64748b]">
                      Página {paginaAtualProdutos + 1} de {totalPaginasProdutos}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setPaginaProdutos((p) =>
                          Math.min(totalPaginasProdutos - 1, p + 1)
                        )
                      }
                      disabled={paginaAtualProdutos >= totalPaginasProdutos - 1}
                      className="rounded-xl border border-[#e8ecf4] bg-white px-4 py-2 text-sm font-semibold text-[#334155] transition hover:bg-[#f4f6fb] disabled:opacity-40"
                    >
                      Próxima
                    </button>
                  </div>
                )}
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