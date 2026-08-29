"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/dashboard/page-header";
import { carregarConfigEmpresa } from "@/lib/empresa-config";
import {
  usePeriod,
  isoToDate,
  presetRange,
} from "@/components/dashboard/period-context";
import { usePapel } from "@/components/dashboard/role-context";
import { podeCancelarVenda } from "@/lib/permissoes";
import { validarPagamento } from "@/lib/pdv-regras";
import { carregarFuncionariosResponsaveis } from "@/lib/responsaveis";
import {
  calcularDescontoPix,
  calcularDescontoManual,
  calcularTotal,
  formatCurrency,
  obterCorFormaPagamento,
  rotuloFormaPagamento,
} from "@/lib/vendas-utils";
import { encontrarRegraTaxa, type RegraTaxa } from "@/lib/taxas-utils";
import { rotuloVariacao, type Atributos } from "@/lib/variacoes-utils";
import { QuickSearchSelect } from "@/components/dashboard/quick-search-select";
import {
  resumirRecebimentos,
  vendaCorrespondeFiltro,
  type FiltroFormaVenda,
} from "@/lib/vendas-filtros";

type Cliente = {
  id: string;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
};

type Produto = {
  id: string;
  nome: string;
  preco: number | null;
  estoque: number | null;
  status: string | null;
  tem_variacoes: boolean | null;
  categoria: string | null;
  marca: string | null;
};

type Variacao = {
  id: string;
  produto_id: string;
  atributos: Atributos | null;
  tamanho: string | null;
  cor: string | null;
  preco: number | null;
  estoque: number | null;
  status: string | null;
  sku: string | null;
  codigo_barras: string | null;
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
  valor_recebido: number | null;
  valor_liquido: number | null;
  entrada_forma: string | null;
  observacao: string | null;
  status: string;
  created_at: string;
};

type VendaItem = {
  id: string;
  venda_id: string;
  produto_id: string;
  variacao_id: string | null;
  quantidade: number;
  preco_unitario: number;
  total_item: number;
};

type PagamentoVenda = {
  venda_id: string;
  forma: "pix" | "dinheiro" | "cartao";
  valor: number;
  taxa_valor: number | null;
};

type PagamentoRascunho = {
  forma: "pix" | "dinheiro" | "cartao";
  valor: string;
  parcelas: string;
  taxa: string;
};

type ItemRascunho = {
  produto_id: string;
  variacao_id: string | null;
  nome: string;
  quantidade: number;
  preco_unitario: number;
};

export default function VendasPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [itensVenda, setItensVenda] = useState<VendaItem[]>([]);
  const [pagamentosVenda, setPagamentosVenda] = useState<PagamentoVenda[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [clienteId, setClienteId] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [responsaveisConfig, setResponsaveisConfig] = useState<string[]>([]);
  const [funcionariosLista, setFuncionariosLista] = useState<
    { id: string; nome: string }[]
  >([]);
  const [paginaVendas, setPaginaVendas] = useState(0);
  const [filtroPagamento, setFiltroPagamento] =
    useState<FiltroFormaVenda>("todas");
  const [formaPagamento, setFormaPagamento] = useState("pix");
  const [pixDesconto, setPixDesconto] = useState(5);
  const [maxParcelasCfg, setMaxParcelasCfg] = useState(6);
  const [parcelaMinimaCfg, setParcelaMinimaCfg] = useState(0);
  const [promMaxCfg, setPromMaxCfg] = useState(4);
  const [entradaFormaMisto, setEntradaFormaMisto] = useState("pix");
  const [idempKey, setIdempKey] = useState<string>(() =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : String(Date.now())
  );
  const [valorRecebido, setValorRecebido] = useState("");
  const [parcelas, setParcelas] = useState("1");
  const [taxaCartao, setTaxaCartao] = useState("0");
  const [taxasRegras, setTaxasRegras] = useState<RegraTaxa[]>([]);
  const [mesesPromissoria, setMesesPromissoria] = useState("1");
  const [venctoPromissoria, setVenctoPromissoria] = useState("");
  const [entradaMisto, setEntradaMisto] = useState("");
  const [descontoManual, setDescontoManual] = useState("0");
  const [tipoDesconto, setTipoDesconto] = useState<"valor" | "percentual">("valor");
  const [pagamentosMultiplos, setPagamentosMultiplos] = useState<PagamentoRascunho[]>([
    { forma: "pix", valor: "", parcelas: "1", taxa: "0" },
    { forma: "dinheiro", valor: "", parcelas: "1", taxa: "0" },
  ]);
  const [observacao, setObservacao] = useState("");

  // Devolução parcial de venda
  const [devolvendoId, setDevolvendoId] = useState<string | null>(null);
  const [qtdDevolucao, setQtdDevolucao] = useState<Record<string, string>>({});
  const [devolvendo, setDevolvendo] = useState(false);

  // Cancelamento de venda (modal + motivo)
  const [cancelandoVenda, setCancelandoVenda] = useState<Venda | null>(null);
  const [motivoCancel, setMotivoCancel] = useState("");
  const [cancelando, setCancelando] = useState(false);

  const [produtoId, setProdutoId] = useState("");
  const [variacaoId, setVariacaoId] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [itensRascunho, setItensRascunho] = useState<ItemRascunho[]>([]);
  const [variacoes, setVariacoes] = useState<Variacao[]>([]);
  const produtoBuscaRef = useRef<HTMLInputElement>(null);

  async function carregarDados() {
    setLoading(true);
    setErro("");

    const [clientesRes, produtosRes, vendasRes, itensRes, pagamentosRes] = await Promise.all([
      supabase
        .from("clientes")
        .select("id, nome, cpf, telefone, email")
        .order("created_at", { ascending: false }),
      supabase
        .from("produtos")
        .select("id, nome, preco, estoque, status, tem_variacoes, categoria, marca")
        .order("created_at", { ascending: false }),
      supabase
        .from("vendas")
        .select("id, cliente_id, responsavel, forma_pagamento, desconto_pix, subtotal, desconto, total, valor_recebido, valor_liquido, entrada_forma, observacao, status, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("venda_itens")
        .select("id, venda_id, produto_id, variacao_id, quantidade, preco_unitario, total_item"),
      supabase.from("venda_pagamentos").select("venda_id, forma, valor, taxa_valor"),
    ]);

    if (clientesRes.error) setErro(clientesRes.error.message);
    if (produtosRes.error) setErro(produtosRes.error.message);
    if (vendasRes.error) setErro(vendasRes.error.message);
    if (itensRes.error) setErro(itensRes.error.message);
    // A tabela nasce na migration 0056. Em uma atualização gradual, a tela
    // continua utilizável mesmo antes dela chegar ao ambiente.
    if (pagamentosRes.error && pagamentosRes.error.code !== "42P01") {
      setErro(pagamentosRes.error.message);
    }

    setClientes(clientesRes.data || []);
    setProdutos((produtosRes.data || []).filter((produto) => (produto.status || "ativo") === "ativo"));
    setVendas(vendasRes.data || []);
    setItensVenda(itensRes.data || []);
    setPagamentosVenda((pagamentosRes.data as PagamentoVenda[] | null) || []);

    // Variações ativas de todos os produtos (para a grade na venda).
    const { data: varData } = await supabase
      .from("produto_variacoes")
      .select(
        "id, produto_id, atributos, tamanho, cor, preco, estoque, status, sku, codigo_barras"
      );
    setVariacoes(
      (varData || []).filter((v) => (v.status || "ativo") === "ativo")
    );

    // Funcionários ativos (id+nome via RPC segura — funciona p/ qualquer papel,
    // inclusive caixa, sem expor salário). Usado p/ vincular a comissão.
    setFuncionariosLista(await carregarFuncionariosResponsaveis());

    const cfg = await carregarConfigEmpresa();
    setResponsaveisConfig(cfg.responsaveis);
    setPixDesconto(cfg.pix_desconto);
    setMaxParcelasCfg(cfg.max_parcelas);
    setParcelaMinimaCfg(cfg.parcela_minima);
    setPromMaxCfg(cfg.promissoria_prazo_meses);

    // Regras de taxa de cartão (ativas) — para auto-preencher a taxa no PDV.
    const { data: taxasData } = await supabase
      .from("taxas_cartao")
      .select(
        "id, tipo, bandeira, parcelas_min, parcelas_max, taxa_percentual, taxa_fixa, ativo, permite_ajuste_manual_pdv"
      )
      .eq("ativo", true);
    setTaxasRegras((taxasData as RegraTaxa[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    carregarDados();
  }, []);

  // Acessibilidade: fecha o modal de cancelamento com a tecla Esc.
  useEffect(() => {
    if (!cancelandoVenda) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape" && !cancelando) setCancelandoVenda(null);
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [cancelandoVenda, cancelando]);

  // Filtro global de período (mesmo do Financeiro/Dashboard).
  const { period, setPeriod } = usePeriod();
  const { papel } = usePapel();
  const podeCancelar = podeCancelarVenda(papel);
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

  const vendasNoPeriodo = useMemo(() => {
    return vendas.filter((v) => {
      const t = new Date(v.created_at).getTime();
      return t >= janela.ini && t < janela.fim;
    });
  }, [vendas, janela]);

  const vendasFiltradas = useMemo(
    () =>
      vendasNoPeriodo.filter((venda) =>
        vendaCorrespondeFiltro(venda, pagamentosVenda, filtroPagamento)
      ),
    [filtroPagamento, pagamentosVenda, vendasNoPeriodo]
  );

  const recebimentosPeriodo = useMemo(
    () => resumirRecebimentos(vendasNoPeriodo, pagamentosVenda),
    [pagamentosVenda, vendasNoPeriodo]
  );

  useEffect(() => {
    setPaginaVendas(0);
  }, [filtroPagamento, period.inicio, period.fim]);

  const totalConcluido = useMemo(() => {
    return vendasNoPeriodo
      .filter((item) => item.status === "concluida")
      .reduce((acc, item) => acc + Number(item.total || 0), 0);
  }, [vendasNoPeriodo]);

  const subtotalRascunho = useMemo(() => {
    return itensRascunho.reduce(
      (acc, item) => acc + item.quantidade * item.preco_unitario,
      0
    );
  }, [itensRascunho]);

  const descontoDigitado = Math.max(0, Number(descontoManual || 0));
  const descontoManualNumero = calcularDescontoManual(
    subtotalRascunho,
    descontoDigitado,
    tipoDesconto
  );
  const descontoPixNumero =
    formaPagamento === "pix"
      ? calcularDescontoPix(subtotalRascunho, pixDesconto)
      : 0;
  const totalRascunho = calcularTotal(
    subtotalRascunho,
    descontoManualNumero,
    descontoPixNumero
  );

  const recebidoNum = Number(valorRecebido || 0);
  const trocoRascunho =
    formaPagamento === "dinheiro"
      ? Math.max(0, recebidoNum - totalRascunho)
      : 0;
  const taxaNum = Number(taxaCartao || 0);
  const parcelasNum = Math.max(1, parseInt(parcelas) || 1);
  const valorLiquidoRascunho =
    formaPagamento === "cartao"
      ? totalRascunho * (1 - taxaNum / 100)
      : totalRascunho;
  const totalPagamentosMultiplos = pagamentosMultiplos.reduce(
    (total, pagamento) => total + Number(pagamento.valor || 0),
    0
  );
  const diferencaPagamentosMultiplos = totalRascunho - totalPagamentosMultiplos;

  // Regra de taxa aplicável (por tipo crédito + faixa de parcelas). Quando existe,
  // o PDV auto-preenche a taxa; só permite editar se a regra autorizar.
  const regraTaxaAplicavel = useMemo(
    () =>
      formaPagamento === "cartao"
        ? encontrarRegraTaxa(taxasRegras, {
            tipo: "credito",
            parcelas: parcelasNum,
          })
        : null,
    [formaPagamento, parcelasNum, taxasRegras]
  );
  const taxaBloqueada =
    !!regraTaxaAplicavel && !regraTaxaAplicavel.permite_ajuste_manual_pdv;

  // Auto-preenche a taxa quando a regra aplicável muda (troca de parcelas/forma).
  useEffect(() => {
    if (regraTaxaAplicavel) {
      setTaxaCartao(String(regraTaxaAplicavel.taxa_percentual));
    }
  }, [regraTaxaAplicavel]);

  // Fiado / promissória (venda inteira) e misto (entrada + restante no fiado).
  const mesesNum = Math.max(1, parseInt(mesesPromissoria) || 1);
  const entradaNum = Number(entradaMisto || 0);
  const restanteMisto = Math.max(0, totalRascunho - entradaNum);
  const valorPromissoria =
    formaPagamento === "misto" ? restanteMisto : totalRascunho;
  const parcelaMensalRascunho = valorPromissoria / mesesNum;
  const geraPromissoria =
    formaPagamento === "promissoria" || formaPagamento === "misto";

  function getClienteNome(id: string | null) {
    if (!id) return "Cliente avulso";
    const cliente = clientes.find((item) => item.id === id);
    return cliente?.nome || "Cliente não encontrado";
  }

  function getProdutoNome(id: string) {
    const produto = produtos.find((item) => item.id === id);
    return produto?.nome || "Produto não encontrado";
  }

  // Variações do produto selecionado no formulário de item.
  const variacoesDoProduto = variacoes.filter((v) => v.produto_id === produtoId);
  const produtoSelecionado = produtos.find((p) => p.id === produtoId);
  const opcoesClientes = useMemo(
    () => [
      {
        value: "",
        label: "Venda avulsa",
        description: "Não vincular esta venda a um cliente",
        searchText: "avulso sem cliente",
      },
      ...clientes.map((cliente) => ({
        value: cliente.id,
        label: cliente.nome,
        description:
          [cliente.telefone, cliente.email].filter(Boolean).join(" · ") ||
          "Cliente cadastrado",
        searchText: [cliente.cpf, cliente.telefone, cliente.email]
          .filter(Boolean)
          .join(" "),
      })),
    ],
    [clientes]
  );
  const opcoesProdutos = useMemo(
    () => {
      const gradePorProduto = new Map<string, Variacao[]>();
      for (const variacao of variacoes) {
        const grade = gradePorProduto.get(variacao.produto_id) || [];
        grade.push(variacao);
        gradePorProduto.set(variacao.produto_id, grade);
      }

      return produtos.map((produto) => {
        const grade = gradePorProduto.get(produto.id) || [];
        const estoqueDisponivel = produto.tem_variacoes
          ? grade.reduce((total, variacao) => total + Number(variacao.estoque || 0), 0)
          : Number(produto.estoque || 0);
        const termosGrade = grade.flatMap((variacao) => [
          variacao.sku,
          variacao.codigo_barras,
          variacao.tamanho,
          variacao.cor,
          ...Object.values(variacao.atributos || {}),
        ]);

        return {
          value: produto.id,
          label: produto.nome,
          description: [
            produto.marca,
            produto.categoria,
            produto.tem_variacoes ? "com grade" : null,
            `estoque ${estoqueDisponivel}`,
            formatCurrency(Number(produto.preco || 0)),
          ]
            .filter(Boolean)
            .join(" · "),
          searchText: [produto.marca, produto.categoria, ...termosGrade]
            .filter(Boolean)
            .join(" "),
          disabled: estoqueDisponivel <= 0,
        };
      });
    },
    [produtos, variacoes]
  );

  function adicionarItem() {
    setErro("");

    if (!produtoId) {
      setErro("Selecione um produto.");
      return;
    }

    const quantidadeNumero = Number(quantidade);

    if (
      !Number.isFinite(quantidadeNumero) ||
      quantidadeNumero <= 0 ||
      !Number.isInteger(quantidadeNumero)
    ) {
      setErro("Informe uma quantidade válida (inteira e positiva).");
      return;
    }

    const produto = produtos.find((item) => item.id === produtoId);

    if (!produto) {
      setErro("Produto não encontrado.");
      return;
    }

    // Produto com grade → exige variação; preço e estoque vêm da variação.
    let variacao: Variacao | null = null;
    if (produto.tem_variacoes) {
      if (!variacaoId) {
        setErro("Selecione a variação (tamanho/cor).");
        return;
      }
      variacao = variacoes.find((v) => v.id === variacaoId) || null;
      if (!variacao) {
        setErro("Variação não encontrada.");
        return;
      }
    }

    const estoqueAtual = variacao
      ? Number(variacao.estoque || 0)
      : Number(produto.estoque || 0);
    const precoUnit = variacao
      ? Number(variacao.preco ?? produto.preco ?? 0)
      : Number(produto.preco || 0);
    const chave = variacao ? variacao.id : produto.id;
    const rotulo = variacao
      ? `${produto.nome} (${rotuloVariacao(variacao.atributos, { tamanho: variacao.tamanho, cor: variacao.cor })})`
      : produto.nome;

    if (quantidadeNumero > estoqueAtual) {
      setErro("A quantidade é maior que o estoque disponível.");
      return;
    }

    const itemExistente = itensRascunho.find(
      (item) => (item.variacao_id ?? item.produto_id) === chave
    );

    if (itemExistente) {
      const novaQuantidade = itemExistente.quantidade + quantidadeNumero;

      if (novaQuantidade > estoqueAtual) {
        setErro("A soma das quantidades ultrapassa o estoque disponível.");
        return;
      }

      setItensRascunho((atual) =>
        atual.map((item) =>
          (item.variacao_id ?? item.produto_id) === chave
            ? { ...item, quantidade: novaQuantidade }
            : item
        )
      );
    } else {
      setItensRascunho((atual) => [
        ...atual,
        {
          produto_id: produto.id,
          variacao_id: variacao ? variacao.id : null,
          nome: rotulo,
          quantidade: quantidadeNumero,
          preco_unitario: precoUnit,
        },
      ]);
    }

    setProdutoId("");
    setVariacaoId("");
    setQuantidade("1");
    requestAnimationFrame(() => produtoBuscaRef.current?.focus());
  }

  function removerItem(chave: string) {
    setItensRascunho((atual) =>
      atual.filter((item) => (item.variacao_id ?? item.produto_id) !== chave)
    );
  }

  function limparFormulario() {
    setClienteId("");
    setResponsavel("");
    setFormaPagamento("pix");
    setValorRecebido("");
    setParcelas("1");
    setTaxaCartao("0");
    setMesesPromissoria("1");
    setVenctoPromissoria("");
    setEntradaMisto("");
    setEntradaFormaMisto("pix");
    setIdempKey(crypto.randomUUID());
    setDescontoManual("0");
    setTipoDesconto("valor");
    setPagamentosMultiplos([
      { forma: "pix", valor: "", parcelas: "1", taxa: "0" },
      { forma: "dinheiro", valor: "", parcelas: "1", taxa: "0" },
    ]);
    setObservacao("");
    setProdutoId("");
    setVariacaoId("");
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

    if (geraPromissoria && !clienteId) {
      setErro("Selecione um cliente para venda no fiado/promissória.");
      return;
    }
    if (geraPromissoria && !venctoPromissoria) {
      setErro("Informe a data da primeira parcela da promissória.");
      return;
    }
    if (tipoDesconto === "percentual" && descontoDigitado > 100) {
      setErro("O desconto percentual deve ficar entre 0% e 100%.");
      return;
    }
    if (descontoManualNumero > subtotalRascunho) {
      setErro("O desconto não pode ser maior que o subtotal da venda.");
      return;
    }
    if (formaPagamento === "multiplo") {
      const invalidos = pagamentosMultiplos.some(
        (pagamento) => !Number.isFinite(Number(pagamento.valor)) || Number(pagamento.valor) <= 0
      );
      if (pagamentosMultiplos.length < 2 || invalidos) {
        setErro("Informe pelo menos duas formas de pagamento com valores válidos.");
        return;
      }
      if (new Set(pagamentosMultiplos.map((pagamento) => pagamento.forma)).size < 2) {
        setErro("Escolha pelo menos duas formas de pagamento diferentes.");
        return;
      }
      if (Math.abs(diferencaPagamentosMultiplos) > 0.009) {
        setErro(
          `A soma dos pagamentos precisa fechar em ${formatCurrency(totalRascunho)}. Diferença: ${formatCurrency(Math.abs(diferencaPagamentosMultiplos))}.`
        );
        return;
      }
    }

    // Validações locais (o backend valida de novo — aqui é só UX amigável).
    const erroPagamento = validarPagamento({
      forma: formaPagamento,
      total: totalRascunho,
      recebido: recebidoNum,
      entradaMisto: entradaNum,
      restanteMisto,
      parcelasCartao: parcelasNum,
      mesesFiado: mesesNum,
      parcelaMinima: parcelaMinimaCfg,
      promMax: promMaxCfg,
      maxParcelasCartao: maxParcelasCfg,
      temCliente: !!clienteId,
    });
    if (erroPagamento) {
      setErro(erroPagamento);
      return;
    }

    setSalvando(true);

    // Casa o responsável (texto) a um funcionário cadastrado → gera comissão.
    const funcMatch = funcionariosLista.find(
      (f) => f.nome.trim().toLowerCase() === responsavel.trim().toLowerCase()
    );

    const itensPayload = itensRascunho.map((item) => ({
      produto_id: item.produto_id,
      variacao_id: item.variacao_id,
      quantidade: item.quantidade,
      preco_unitario: item.preco_unitario,
    }));

    try {
      // Venda ATÔMICA + idempotente: o backend recalcula total/regras e a
      // mesma chave impede venda duplicada em clique/retry.
      const chamada = formaPagamento === "multiplo"
        ? supabase.rpc("criar_venda_multiforma", {
            p_cliente_id: clienteId || null,
            p_responsavel: responsavel,
            p_funcionario_id: funcMatch ? funcMatch.id : null,
            p_desconto: descontoManualNumero,
            p_observacao: observacao.trim() || null,
            p_itens: itensPayload,
            p_pagamentos: pagamentosMultiplos.map((pagamento) => ({
              forma: pagamento.forma,
              valor: Number(pagamento.valor),
              parcelas: pagamento.forma === "cartao" ? Number(pagamento.parcelas || 1) : 1,
              taxa_percentual: pagamento.forma === "cartao" ? Number(pagamento.taxa || 0) : 0,
            })),
            p_idempotency_key: idempKey,
          })
        : supabase.rpc("criar_venda", {
        p_cliente_id: clienteId || null,
        p_responsavel: responsavel,
        p_funcionario_id: funcMatch ? funcMatch.id : null,
        p_forma_pagamento: formaPagamento,
        p_parcelas: formaPagamento === "cartao" ? parcelasNum : 1,
        p_taxa: formaPagamento === "cartao" ? taxaNum : 0,
        p_valor_recebido:
          formaPagamento === "dinheiro"
            ? recebidoNum
            : formaPagamento === "misto"
              ? entradaNum
              : null,
        p_desconto: descontoManualNumero,
        p_observacao: observacao.trim() || null,
        p_itens: itensPayload,
        p_promissoria_parcelas: geraPromissoria ? mesesNum : null,
        p_promissoria_vencimento: geraPromissoria ? venctoPromissoria || null : null,
        p_promissoria_obs: geraPromissoria
          ? formaPagamento === "misto"
            ? `Restante da venda (entrada ${formatCurrency(entradaNum)})`
            : "Venda no fiado"
          : null,
        p_entrada_forma: formaPagamento === "misto" ? entradaFormaMisto : null,
        p_idempotency_key: idempKey,
      });
      const { error: rpcError } = await chamada;

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      limparFormulario();
      await carregarDados();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar a venda.");
    }

    setSalvando(false);
  }

  // Cancelamento atômico via RPC (reverte estoque + promissórias + audita).
  async function confirmarCancelamento() {
    if (!cancelandoVenda) return;
    setErro("");
    if (motivoCancel.trim().length < 3) {
      setErro("Descreva o motivo do cancelamento (mínimo 3 caracteres).");
      return;
    }
    setCancelando(true);
    const { error } = await supabase.rpc("cancelar_venda", {
      p_venda_id: cancelandoVenda.id,
      p_motivo: motivoCancel.trim(),
    });
    if (error) {
      setErro(error.message);
      setCancelando(false);
      return;
    }
    setCancelandoVenda(null);
    setMotivoCancel("");
    setCancelando(false);
    await carregarDados();
  }

  function abrirDevolucao(vendaId: string) {
    setErro("");
    setDevolvendoId((atual) => (atual === vendaId ? null : vendaId));
    setQtdDevolucao({});
  }

  async function confirmarDevolucao(vendaId: string) {
    setErro("");
    const itens = itensVenda.filter((it) => it.venda_id === vendaId);
    const devolver = itens
      .map((it) => ({
        venda_item_id: it.id,
        quantidade: Number(qtdDevolucao[it.id] || 0),
      }))
      .filter((d) => d.quantidade > 0);

    if (devolver.length === 0) {
      setErro("Informe a quantidade a devolver em ao menos um item.");
      return;
    }

    setDevolvendo(true);
    // Chave de idempotência: um retry/duplo-envio desta MESMA requisição não
    // estorna o estoque duas vezes (o backend vira no-op).
    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `devol-${vendaId}-${Date.now()}`;
    const { error } = await supabase.rpc("devolver_itens_venda", {
      p_venda_id: vendaId,
      p_itens: devolver,
      p_motivo: null,
      p_idempotency_key: idempotencyKey,
    });
    if (error) {
      setErro(error.message);
      setDevolvendo(false);
      return;
    }
    setDevolvendoId(null);
    setQtdDevolucao({});
    setDevolvendo(false);
    await carregarDados();
  }

  const porPaginaVendas = 5;
  const totalPaginasVendas = Math.max(
    1,
    Math.ceil(vendasFiltradas.length / porPaginaVendas)
  );
  const paginaAtual = Math.min(paginaVendas, totalPaginasVendas - 1);
  const vendasPagina = vendasFiltradas.slice(
    paginaAtual * porPaginaVendas,
    paginaAtual * porPaginaVendas + porPaginaVendas
  );

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Operação comercial"
        title="Vendas"
        description="Registre vendas com itens, total, forma de pagamento e baixa automática de estoque."
      />

      {erro && (
        <div className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-4 text-sm text-[#b91c1c]">
          {erro}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-[24px] border border-[#e8ecf4] bg-white p-4 sm:p-5">
          <p className="text-sm font-bold text-[#475569]">Vendas concluídas</p>
          <p className="mt-3 text-2xl font-black tracking-tight text-[#0f172a] sm:text-3xl">
            {vendasNoPeriodo.filter((item) => item.status === "concluida").length}
          </p>
        </div>

        <div className="rounded-[24px] border border-[#bbf7d0] bg-[#f0fdf4] p-4 sm:p-5">
          <p className="text-sm font-bold text-[#15803d]">Faturamento</p>
          <p className="mt-3 break-words text-xl font-black tracking-tight text-[#0f172a] sm:text-2xl">
            {formatCurrency(totalConcluido)}
          </p>
        </div>

        <div className="rounded-[24px] border border-[#bfdbfe] bg-[#eff6ff] p-4 sm:col-span-2 sm:p-5 lg:col-span-1">
          <p className="text-sm font-bold text-[#1d4ed8]">Recebido no período</p>
          <p className="mt-3 break-words text-xl font-black tracking-tight text-[#0f172a] sm:text-2xl">
            {formatCurrency(recebimentosPeriodo.totalRecebido)}
          </p>
        </div>

        <div className="rounded-[24px] border border-[#e8ecf4] bg-white p-4 sm:p-5">
          <p className="text-xs font-bold text-[#64748b] sm:text-sm">Pix / Dinheiro</p>
          <p className="mt-2 break-words text-lg font-black tracking-tight text-[#0f172a] sm:text-xl">
            {formatCurrency(recebimentosPeriodo.pix)}
          </p>
          <p className="mt-1 text-xs font-semibold text-[#64748b]">
            Dinheiro: {formatCurrency(recebimentosPeriodo.dinheiro)}
          </p>
        </div>

        <div className="rounded-[24px] border border-[#e9d5ff] bg-[#faf5ff] p-4 sm:p-5">
          <p className="text-xs font-bold text-[#7e22ce] sm:text-sm">Cartão líquido</p>
          <p className="mt-2 break-words text-lg font-black tracking-tight text-[#0f172a] sm:text-xl">
            {formatCurrency(recebimentosPeriodo.cartaoLiquido)}
          </p>
          <p className="mt-1 text-xs font-semibold text-[#7e22ce]">
            Bruto: {formatCurrency(recebimentosPeriodo.cartaoBruto)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="space-y-6">
          <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-4 sm:p-6">
            <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
              Nova venda
            </h2>

            <div className="mt-5 space-y-4">
              <QuickSearchSelect
                label="Cliente"
                value={clienteId}
                options={opcoesClientes}
                onChange={setClienteId}
                placeholder="Busque por nome, sobrenome, CPF, telefone ou e-mail"
                emptyMessage="Nenhum cliente encontrado. Use venda avulsa ou cadastre o cliente."
                hint="Digite qualquer trecho para localizar rapidamente um cliente já cadastrado."
              />

              <div>
                <label className="mb-2 block text-sm text-[#475569]">Responsável</label>
                <input
                  list="responsaveis-lista"
                  value={responsavel}
                  onChange={(e) => setResponsavel(e.target.value)}
                  placeholder="Nome do vendedor(a)"
                  className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                />
                <datalist id="responsaveis-lista">
                  {Array.from(
                    new Set([
                      ...funcionariosLista.map((f) => f.nome),
                      ...responsaveisConfig,
                    ])
                  ).map((r) => (
                    <option key={r} value={r} />
                  ))}
                </datalist>
                {responsaveisConfig.length === 0 && (
                  <p className="mt-1.5 text-xs text-[#64748b]">
                    Dica: cadastre a equipe em Configurações para virar sugestão
                    automática.
                  </p>
                )}
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#475569]">Forma de pagamento</label>
                <select
                  value={formaPagamento}
                  onChange={(e) => setFormaPagamento(e.target.value)}
                  className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                >
                  <option value="pix">Pix</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="cartao">Cartão</option>
                  <option value="promissoria">Promissória</option>
                  <option value="misto">Misto</option>
                  <option value="multiplo">Pagamento dividido</option>
                </select>
              </div>

              {formaPagamento === "multiplo" && (
                <div className="rounded-2xl border border-[#bfdbfe] bg-[#eff6ff] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-[#1e40af]">Dividir pagamento</p>
                      <p className="text-xs text-[#64748b]">Ex.: parte no dinheiro e parte no Pix.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setPagamentosMultiplos((atual) => [
                          ...atual,
                          { forma: "pix", valor: "", parcelas: "1", taxa: "0" },
                        ])
                      }
                      className="rounded-xl border border-[#bfdbfe] bg-white px-3 py-2 text-xs font-bold text-[#1d4ed8]"
                    >
                      + Adicionar forma
                    </button>
                  </div>
                  <div className="mt-4 space-y-3">
                    {pagamentosMultiplos.map((pagamento, indice) => (
                      <div key={indice} className="rounded-xl border border-[#dbeafe] bg-white p-3">
                        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
                          <select
                            value={pagamento.forma}
                            onChange={(event) =>
                              setPagamentosMultiplos((atual) =>
                                atual.map((item, i) =>
                                  i === indice
                                    ? { ...item, forma: event.target.value as PagamentoRascunho["forma"] }
                                    : item
                                )
                              )
                            }
                            className="rounded-xl border border-[#e8ecf4] px-3 py-2.5 text-sm outline-none"
                          >
                            <option value="pix">Pix</option>
                            <option value="dinheiro">Dinheiro</option>
                            <option value="cartao">Cartão</option>
                          </select>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={pagamento.valor}
                            onChange={(event) =>
                              setPagamentosMultiplos((atual) =>
                                atual.map((item, i) =>
                                  i === indice ? { ...item, valor: event.target.value } : item
                                )
                              )
                            }
                            placeholder="Valor"
                            className="rounded-xl border border-[#e8ecf4] px-3 py-2.5 text-sm outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const outros = pagamentosMultiplos.reduce(
                                (soma, item, i) =>
                                  i === indice ? soma : soma + Number(item.valor || 0),
                                0
                              );
                              const restante = Math.max(0, totalRascunho - outros);
                              setPagamentosMultiplos((atual) =>
                                atual.map((item, i) =>
                                  i === indice
                                    ? { ...item, valor: restante.toFixed(2) }
                                    : item
                                )
                              );
                            }}
                            className="rounded-xl border border-[#bfdbfe] px-3 py-2 text-xs font-bold text-[#1d4ed8] hover:bg-[#eff6ff]"
                          >
                            Usar restante
                          </button>
                          <button
                            type="button"
                            disabled={pagamentosMultiplos.length <= 2}
                            onClick={() =>
                              setPagamentosMultiplos((atual) => atual.filter((_, i) => i !== indice))
                            }
                            className="rounded-xl px-3 py-2 text-xs font-bold text-[#b91c1c] hover:bg-[#fef2f2] disabled:opacity-30"
                          >
                            Remover
                          </button>
                        </div>
                        {pagamento.forma === "cartao" && (
                          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <input
                              type="number"
                              min="1"
                              max={maxParcelasCfg}
                              value={pagamento.parcelas}
                              onChange={(event) =>
                                setPagamentosMultiplos((atual) =>
                                  atual.map((item, i) =>
                                    i === indice ? { ...item, parcelas: event.target.value } : item
                                  )
                                )
                              }
                              placeholder="Parcelas"
                              className="rounded-xl border border-[#e8ecf4] px-3 py-2 text-sm outline-none"
                            />
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              value={pagamento.taxa}
                              onChange={(event) =>
                                setPagamentosMultiplos((atual) =>
                                  atual.map((item, i) =>
                                    i === indice ? { ...item, taxa: event.target.value } : item
                                  )
                                )
                              }
                              placeholder="Taxa (%)"
                              className="rounded-xl border border-[#e8ecf4] px-3 py-2 text-sm outline-none"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs font-bold">
                    <span className="text-[#334155]">Total informado: {formatCurrency(totalPagamentosMultiplos)}</span>
                    <span className={Math.abs(diferencaPagamentosMultiplos) <= 0.009 ? "text-[#15803d]" : "text-[#b45309]"}>
                      {Math.abs(diferencaPagamentosMultiplos) <= 0.009
                        ? "Pagamento fechado ✓"
                        : `${diferencaPagamentosMultiplos > 0 ? "Falta" : "Excede"} ${formatCurrency(Math.abs(diferencaPagamentosMultiplos))}`}
                    </span>
                  </div>
                </div>
              )}

              {formaPagamento === "dinheiro" && (
                <div>
                  <label className="mb-2 block text-sm text-[#475569]">
                    Valor recebido
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={valorRecebido}
                    onChange={(e) => setValorRecebido(e.target.value)}
                    className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                    placeholder="0,00"
                  />
                  <p className="mt-1.5 text-xs font-semibold text-[#15803d]">
                    Troco: {formatCurrency(trocoRascunho)}
                  </p>
                </div>
              )}

              {formaPagamento === "cartao" && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm text-[#475569]">
                      Parcelas
                    </label>
                    <select
                      value={parcelas}
                      onChange={(e) => setParcelas(e.target.value)}
                      className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                    >
                      {Array.from({ length: maxParcelasCfg }, (_, i) => i + 1).map(
                        (n) => (
                          <option key={n} value={n}>
                            {n}x
                          </option>
                        )
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm text-[#475569]">
                      Taxa (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={taxaCartao}
                      onChange={(e) => setTaxaCartao(e.target.value)}
                      disabled={taxaBloqueada}
                      title={
                        taxaBloqueada
                          ? "Taxa definida pela regra cadastrada (ajuste manual bloqueado)."
                          : undefined
                      }
                      className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </div>
                  {regraTaxaAplicavel && (
                    <p className="text-xs text-[#94a3b8] sm:col-span-2">
                      Taxa da regra cadastrada
                      {taxaBloqueada
                        ? " (ajuste manual bloqueado)."
                        : " — você pode ajustar se precisar."}
                    </p>
                  )}
                  <p className="text-xs font-semibold text-[#1d4ed8] sm:col-span-2">
                    Você recebe (líquido): {formatCurrency(valorLiquidoRascunho)}
                  </p>
                </div>
              )}

              {formaPagamento === "misto" && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm text-[#475569]">
                      Valor pago agora (entrada)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={entradaMisto}
                      onChange={(e) => setEntradaMisto(e.target.value)}
                      className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                      placeholder="0,00"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm text-[#475569]">
                      Forma da entrada
                    </label>
                    <select
                      value={entradaFormaMisto}
                      onChange={(e) => setEntradaFormaMisto(e.target.value)}
                      className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                    >
                      <option value="pix">Pix</option>
                      <option value="dinheiro">Dinheiro</option>
                      <option value="cartao">Cartão</option>
                    </select>
                  </div>
                  <p className="text-xs font-semibold text-[#b45309] sm:col-span-2">
                    Restante no fiado: {formatCurrency(restanteMisto)}
                  </p>
                </div>
              )}

              {geraPromissoria && (
                <div className="rounded-2xl border border-[#fde68a] bg-[#fffbeb] p-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm text-[#92400e]">
                        Parcelas (meses)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max={maxParcelasCfg}
                        value={mesesPromissoria}
                        onChange={(e) => setMesesPromissoria(e.target.value)}
                        className="w-full rounded-2xl border border-[#fde68a] bg-white px-4 py-3 text-[#0f172a] outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm text-[#92400e]">
                        Data da primeira parcela
                      </label>
                      <input
                        type="date"
                        value={venctoPromissoria}
                        onChange={(e) => setVenctoPromissoria(e.target.value)}
                        className="w-full rounded-2xl border border-[#fde68a] bg-white px-4 py-3 text-[#0f172a] outline-none"
                      />
                    </div>
                  </div>
                  <p className="mt-3 text-xs font-semibold text-[#92400e]">
                    {clienteId
                      ? `Gera promissória de ${formatCurrency(valorPromissoria)} · ${mesesNum}x de ${formatCurrency(parcelaMensalRascunho)}`
                      : "Selecione um cliente — venda no fiado exige cliente identificado."}
                  </p>
                </div>
              )}

              <div>
                <label className="mb-2 block text-sm text-[#475569]">Desconto manual</label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[130px_1fr]">
                  <select
                    value={tipoDesconto}
                    onChange={(e) => setTipoDesconto(e.target.value as "valor" | "percentual")}
                    className="rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-3 py-3 text-sm font-semibold text-[#334155] outline-none"
                  >
                    <option value="valor">Em R$</option>
                    <option value="percentual">Em %</option>
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={tipoDesconto === "percentual" ? 100 : undefined}
                    value={descontoManual}
                    onChange={(e) => setDescontoManual(e.target.value)}
                    className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                    placeholder="0"
                  />
                </div>
                <p className="mt-1.5 text-xs text-[#64748b]">
                  Desconto calculado: <b>{formatCurrency(descontoManualNumero)}</b>
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#475569]">Observação</label>
                <textarea
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  className="min-h-[100px] w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                  placeholder="Ex: cliente pediu separação para presente"
                />
              </div>
            </div>
          </div>

          <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-4 sm:p-6">
            <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
              Adicionar itens
            </h2>

            <div className="mt-5 space-y-4">
              <QuickSearchSelect
                label="Produto"
                value={produtoId}
                options={opcoesProdutos}
                onChange={(id) => {
                  setProdutoId(id);
                  setVariacaoId("");
                }}
                placeholder="Busque por produto, marca, categoria, SKU ou código"
                emptyMessage="Nenhum produto ativo encontrado para esta busca."
                hint="Selecione com Enter. Depois de adicionar, a busca volta a receber o foco."
                inputRef={produtoBuscaRef}
              />

              {produtoSelecionado?.tem_variacoes && (
                <div>
                  <label className="mb-2 block text-sm text-[#475569]">
                    Variação
                  </label>
                  <select
                    value={variacaoId}
                    onChange={(e) => setVariacaoId(e.target.value)}
                    className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                  >
                    <option value="">Selecione a variação</option>
                    {variacoesDoProduto.map((v) => (
                      <option
                        key={v.id}
                        value={v.id}
                        disabled={Number(v.estoque || 0) <= 0}
                      >
                        {rotuloVariacao(v.atributos, {
                          tamanho: v.tamanho,
                          cor: v.cor,
                        })}{" "}
                        — estoque {Number(v.estoque || 0)}
                      </option>
                    ))}
                  </select>
                  {variacoesDoProduto.length === 0 && (
                    <p className="mt-1.5 text-xs text-[#b45309]">
                      Este produto ainda não tem grade cadastrada (faça em
                      Produtos).
                    </p>
                  )}
                </div>
              )}

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
                Adicionar item
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {itensRascunho.length === 0 ? (
                <p className="text-sm text-[#64748b]">
                  Nenhum item adicionado ainda.
                </p>
              ) : (
                itensRascunho.map((item) => (
                  <div
                    key={item.variacao_id ?? item.produto_id}
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
                        onClick={() =>
                          removerItem(item.variacao_id ?? item.produto_id)
                        }
                        className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] px-4 py-2 text-sm font-bold text-[#b91c1c] transition hover:bg-[#fee2e2]"
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
          <div className="rounded-[30px] border border-[#2563eb]/20 bg-[#2563eb]/[0.06] p-4 sm:p-6">
            <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
              Resumo da venda
            </h2>

            <div className="mt-5 grid gap-3 text-sm text-[#475569]">
              <p>Cliente: {getClienteNome(clienteId || null)}</p>
              <p>Responsável: {responsavel}</p>
              <p>Pagamento: {rotuloFormaPagamento(formaPagamento)}</p>
              <p>Subtotal: {formatCurrency(subtotalRascunho)}</p>
              <p>Desconto manual: {formatCurrency(descontoManualNumero)}</p>
              <p>Desconto Pix: {formatCurrency(descontoPixNumero)}</p>
              <p className="text-base font-bold text-[#0f172a]">
                Total: {formatCurrency(totalRascunho)}
              </p>
            </div>

            <button
              type="button"
              onClick={salvarVenda}
              disabled={salvando}
              className="mt-5 w-full rounded-2xl bg-[#2563eb] px-4 py-3 font-bold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
            >
              {salvando ? "Salvando..." : "Salvar venda"}
            </button>
          </div>

          <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-4 sm:p-6">
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
                  Vendas registradas{" "}
                  <span className="text-sm font-semibold text-[#94a3b8]">
                    ({vendasFiltradas.length})
                  </span>
                </h2>
                <p className="mt-1 text-xs text-[#64748b]">
                  Consulte por data e por cada forma realmente recebida, inclusive em pagamentos divididos.
                </p>
              </div>

              <div className="rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] p-3 sm:p-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.25fr]">
                  <label className="text-xs font-bold text-[#64748b]">
                    Data inicial
                    <input
                      type="date"
                      value={period.inicio}
                      onChange={(event) => {
                        const inicio = event.target.value;
                        if (!inicio) return;
                        setPeriod({
                          inicio,
                          fim: inicio > period.fim ? inicio : period.fim,
                        });
                      }}
                      className="mt-1.5 w-full min-w-0 rounded-xl border border-[#dbe4f0] bg-white px-3 py-2.5 text-sm font-semibold text-[#334155] outline-none focus:border-[#2563eb]"
                    />
                  </label>
                  <label className="text-xs font-bold text-[#64748b]">
                    Data final
                    <input
                      type="date"
                      value={period.fim}
                      onChange={(event) => {
                        const fim = event.target.value;
                        if (!fim) return;
                        setPeriod({
                          inicio: fim < period.inicio ? fim : period.inicio,
                          fim,
                        });
                      }}
                      className="mt-1.5 w-full min-w-0 rounded-xl border border-[#dbe4f0] bg-white px-3 py-2.5 text-sm font-semibold text-[#334155] outline-none focus:border-[#2563eb]"
                    />
                  </label>
                  <label className="text-xs font-bold text-[#64748b]">
                    Forma de pagamento
                    <select
                      value={filtroPagamento}
                      onChange={(event) =>
                        setFiltroPagamento(event.target.value as FiltroFormaVenda)
                      }
                      className="mt-1.5 w-full min-w-0 rounded-xl border border-[#dbe4f0] bg-white px-3 py-2.5 text-sm font-semibold text-[#334155] outline-none focus:border-[#2563eb]"
                    >
                      <option value="todas">Todas as formas</option>
                      <option value="pix">Pix (inclusive dividido)</option>
                      <option value="dinheiro">Dinheiro (inclusive dividido)</option>
                      <option value="cartao">Cartão (inclusive dividido)</option>
                      <option value="promissoria">Promissória</option>
                      <option value="misto">Entrada + promissória</option>
                      <option value="multiplo">Pagamento dividido</option>
                    </select>
                  </label>
                </div>
                <div className="mt-3 flex max-w-full gap-2 overflow-x-auto pb-1">
                  {[
                    ["Hoje", "hoje"],
                    ["7 dias", "7"],
                    ["15 dias", "15"],
                    ["30 dias", "30"],
                  ].map(([label, preset]) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setPeriod(presetRange(preset as "hoje" | "7" | "15" | "30"))}
                      className="shrink-0 rounded-lg border border-[#dbe4f0] bg-white px-3 py-2 text-xs font-bold text-[#475569] transition hover:border-[#93b4f7] hover:text-[#2563eb]"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {loading ? (
              <p className="mt-4 text-[#64748b]">Carregando vendas...</p>
            ) : vendasFiltradas.length === 0 ? (
              <p className="mt-4 text-[#64748b]">
                {vendas.length === 0
                  ? "Nenhuma venda cadastrada ainda."
                  : "Nenhuma venda encontrada para a data e a forma selecionadas."}
              </p>
            ) : (
              <>
              <div className="mt-5 space-y-4">
                {vendasPagina.map((venda) => {
                  const itensDaVenda = itensVenda.filter(
                    (item) => item.venda_id === venda.id
                  );
                  const pagamentosDaVenda = pagamentosVenda.filter(
                    (pagamento) => pagamento.venda_id === venda.id
                  );

                  return (
                    <div
                      key={venda.id}
                      className="rounded-[24px] border border-[#e8ecf4] bg-[#f8fafc]/80 p-4"
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-black text-[#0f172a]">
                              {getClienteNome(venda.cliente_id)}
                            </p>

                            <span
                              className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${obterCorFormaPagamento(
                                venda.forma_pagamento
                              )}`}
                            >
                              {rotuloFormaPagamento(venda.forma_pagamento)}
                            </span>

                            <span className="inline-flex rounded-full bg-[#f1f5f9] px-3 py-1 text-xs font-bold text-[#475569]">
                              {venda.status}
                            </span>
                          </div>

                          <p className="text-sm text-[#64748b]">
                            Responsável: {venda.responsavel}
                          </p>

                          <p className="text-sm font-bold text-[#334155]">
                            Data: {new Date(venda.created_at).toLocaleString("pt-BR", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </p>

                          <p className="text-sm text-[#64748b]">
                            Subtotal: {formatCurrency(Number(venda.subtotal || 0))} · Total:{" "}
                            {formatCurrency(Number(venda.total || 0))}
                          </p>

                          {venda.forma_pagamento === "multiplo" &&
                            pagamentosDaVenda.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {pagamentosDaVenda.map((pagamento) => (
                                  <span
                                    key={`${pagamento.venda_id}-${pagamento.forma}`}
                                    className="rounded-lg border border-[#dbe4f0] bg-white px-2.5 py-1 text-xs font-semibold text-[#475569]"
                                  >
                                    {rotuloFormaPagamento(pagamento.forma)}: {formatCurrency(Number(pagamento.valor || 0))}
                                  </span>
                                ))}
                              </div>
                            )}

                          {venda.forma_pagamento === "misto" && (
                            <p className="text-xs font-semibold text-[#b45309]">
                              Entrada em {rotuloFormaPagamento(venda.entrada_forma || "")}: {formatCurrency(Number(venda.valor_recebido || 0))}
                            </p>
                          )}

                          <p className="text-sm text-[#94a3b8]">
                            {venda.observacao || "Sem observação"}
                          </p>

                          <div className="pt-2">
                            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#94a3b8]">
                              Itens
                            </p>

                            <div className="mt-2 space-y-2">
                              {itensDaVenda.map((item) => (
                                <div
                                  key={item.id}
                                  className="rounded-2xl border border-[#e8ecf4] bg-white px-3 py-2 text-sm text-[#475569]"
                                >
                                  {getProdutoNome(item.produto_id)} · Quantidade: {item.quantidade} ·{" "}
                                  {formatCurrency(Number(item.total_item || 0))}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {venda.status === "concluida" && (
                          <div className="flex w-full flex-col gap-2 md:w-auto md:min-w-[190px]">
                            <button
                              type="button"
                              onClick={() => abrirDevolucao(venda.id)}
                              className="rounded-2xl border border-[#fed7aa] bg-[#fff7ed] px-4 py-2 text-sm font-bold text-[#c2410c] transition hover:bg-[#ffedd5]"
                            >
                              Devolver itens
                            </button>
                            {podeCancelar && (
                              <button
                                type="button"
                                onClick={() => {
                                  setErro("");
                                  setMotivoCancel("");
                                  setCancelandoVenda(venda);
                                }}
                                className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] px-4 py-2 text-sm font-bold text-[#b91c1c] transition hover:bg-[#fee2e2]"
                              >
                                Cancelar venda
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Painel de devolução parcial */}
                      {devolvendoId === venda.id && (
                        <div className="mt-4 rounded-[20px] border border-[#fed7aa] bg-[#fff7ed] p-4">
                          <p className="text-sm font-black text-[#0f172a]">
                            Devolver itens
                          </p>
                          <p className="mt-1 text-xs text-[#9a3412]">
                            Informe quanto devolver de cada item. O estoque volta e
                            o total da venda é reduzido.
                          </p>

                          <div className="mt-3 space-y-2">
                            {itensDaVenda
                              .filter((it) => Number(it.quantidade || 0) > 0)
                              .map((it) => (
                                <div
                                  key={it.id}
                                  className="flex items-center justify-between gap-3 rounded-xl border border-[#fed7aa] bg-white px-3 py-2 text-sm"
                                >
                                  <span className="flex-1 text-[#0f172a]">
                                    {getProdutoNome(it.produto_id)}{" "}
                                    <span className="text-xs text-[#64748b]">
                                      (vendido {it.quantidade})
                                    </span>
                                  </span>
                                  <input
                                    type="number"
                                    min="0"
                                    max={it.quantidade}
                                    value={qtdDevolucao[it.id] ?? ""}
                                    onChange={(e) =>
                                      setQtdDevolucao((atual) => ({
                                        ...atual,
                                        [it.id]: e.target.value,
                                      }))
                                    }
                                    placeholder="0"
                                    className="w-20 rounded-lg border border-[#fed7aa] bg-white px-2 py-1.5 text-sm outline-none"
                                  />
                                </div>
                              ))}
                          </div>

                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() => confirmarDevolucao(venda.id)}
                              disabled={devolvendo}
                              className="rounded-xl bg-[#c2410c] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#9a3412] disabled:opacity-60"
                            >
                              {devolvendo ? "Devolvendo..." : "Confirmar devolução"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setDevolvendoId(null)}
                              className="rounded-xl border border-[#e8ecf4] bg-white px-4 py-2.5 text-sm font-bold text-[#475569] transition hover:bg-[#f4f6fb]"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {totalPaginasVendas > 1 && (
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setPaginaVendas((p) => Math.max(0, p - 1))}
                    disabled={paginaAtual === 0}
                    className="rounded-xl border border-[#e8ecf4] bg-white px-4 py-2 text-sm font-semibold text-[#334155] transition hover:bg-[#f4f6fb] disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <span className="text-sm text-[#64748b]">
                    Página {paginaAtual + 1} de {totalPaginasVendas}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setPaginaVendas((p) =>
                        Math.min(totalPaginasVendas - 1, p + 1)
                      )
                    }
                    disabled={paginaAtual >= totalPaginasVendas - 1}
                    className="rounded-xl border border-[#e8ecf4] bg-white px-4 py-2 text-sm font-semibold text-[#334155] transition hover:bg-[#f4f6fb] disabled:opacity-40"
                  >
                    Próxima
                  </button>
                </div>
              )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modal de cancelamento (confirmação + motivo obrigatório) */}
      {cancelandoVenda && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !cancelando && setCancelandoVenda(null)}
          />
          <div className="relative w-full max-w-md rounded-[24px] border border-[#e8ecf4] bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-black text-[#0f172a]">Cancelar venda</h3>
            <div className="mt-3 rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-4 text-sm text-[#7f1d1d]">
              <p>
                <b>Cliente:</b> {getClienteNome(cancelandoVenda.cliente_id)}
              </p>
              <p>
                <b>Total:</b> {formatCurrency(Number(cancelandoVenda.total || 0))} ·{" "}
                {cancelandoVenda.forma_pagamento}
              </p>
              <p className="mt-2 text-xs">
                Impacto: o estoque dos itens volta, e a promissória vinculada
                (se houver) será cancelada. A venda sai do faturamento. Ação
                registrada na auditoria.
              </p>
            </div>
            <label className="mt-4 block text-sm font-semibold text-[#475569]">
              Motivo do cancelamento
            </label>
            <textarea
              value={motivoCancel}
              onChange={(e) => setMotivoCancel(e.target.value)}
              autoFocus
              className="mt-1.5 min-h-[80px] w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-sm text-[#0f172a] outline-none focus:border-[#b91c1c]"
              placeholder="Ex: cliente desistiu da compra"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelandoVenda(null)}
                disabled={cancelando}
                className="rounded-xl border border-[#e8ecf4] bg-white px-4 py-2.5 text-sm font-bold text-[#475569] transition hover:bg-[#f4f6fb] disabled:opacity-60"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={confirmarCancelamento}
                disabled={cancelando}
                className="rounded-xl bg-[#b91c1c] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#991b1b] disabled:opacity-60"
              >
                {cancelando ? "Cancelando..." : "Confirmar cancelamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
