"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/dashboard/page-header";
import { carregarConfigEmpresa } from "@/lib/empresa-config";
import { usePeriod, isoToDate } from "@/components/dashboard/period-context";
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
  custo: number | null;
  estoque: number | null;
  status: string | null;
  tem_variacoes: boolean | null;
};

type Variacao = {
  id: string;
  produto_id: string;
  tamanho: string | null;
  cor: string | null;
  preco: number | null;
  custo: number | null;
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
  variacao_id: string | null;
  quantidade: number;
  preco_unitario: number;
  total_item: number;
};

type ItemRascunho = {
  produto_id: string;
  variacao_id: string | null;
  nome: string;
  quantidade: number;
  preco_unitario: number;
  custo_unitario: number;
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
  const [responsavel, setResponsavel] = useState("");
  const [responsaveisConfig, setResponsaveisConfig] = useState<string[]>([]);
  const [funcionariosLista, setFuncionariosLista] = useState<
    { id: string; nome: string }[]
  >([]);
  const [paginaVendas, setPaginaVendas] = useState(0);
  const [formaPagamento, setFormaPagamento] = useState("pix");
  const [pixDesconto, setPixDesconto] = useState(5);
  const [maxParcelasCfg, setMaxParcelasCfg] = useState(6);
  const [valorRecebido, setValorRecebido] = useState("");
  const [parcelas, setParcelas] = useState("1");
  const [taxaCartao, setTaxaCartao] = useState("0");
  const [mesesPromissoria, setMesesPromissoria] = useState("1");
  const [venctoPromissoria, setVenctoPromissoria] = useState("");
  const [entradaMisto, setEntradaMisto] = useState("");
  const [descontoManual, setDescontoManual] = useState("0");
  const [observacao, setObservacao] = useState("");

  const [produtoId, setProdutoId] = useState("");
  const [variacaoId, setVariacaoId] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [itensRascunho, setItensRascunho] = useState<ItemRascunho[]>([]);
  const [variacoes, setVariacoes] = useState<Variacao[]>([]);

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
        .select("id, nome, preco, custo, estoque, status, tem_variacoes")
        .order("created_at", { ascending: false }),
      supabase
        .from("vendas")
        .select("id, cliente_id, responsavel, forma_pagamento, desconto_pix, subtotal, desconto, total, observacao, status, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("venda_itens")
        .select("id, venda_id, produto_id, variacao_id, quantidade, preco_unitario, total_item"),
    ]);

    if (clientesRes.error) setErro(clientesRes.error.message);
    if (produtosRes.error) setErro(produtosRes.error.message);
    if (vendasRes.error) setErro(vendasRes.error.message);
    if (itensRes.error) setErro(itensRes.error.message);

    setClientes(clientesRes.data || []);
    setProdutos((produtosRes.data || []).filter((produto) => (produto.status || "ativo") === "ativo"));
    setVendas(vendasRes.data || []);
    setItensVenda(itensRes.data || []);

    // Variações ativas de todos os produtos (para a grade na venda).
    const { data: varData } = await supabase
      .from("produto_variacoes")
      .select("id, produto_id, tamanho, cor, preco, custo, estoque, status");
    setVariacoes(
      (varData || []).filter((v) => (v.status || "ativo") === "ativo")
    );

    // Funcionários ativos (para vincular a comissão pelo responsável).
    const { data: funcData } = await supabase
      .from("funcionarios")
      .select("id, nome, ativo")
      .order("nome", { ascending: true });
    setFuncionariosLista(
      (funcData || [])
        .filter((f) => f.ativo !== false)
        .map((f) => ({ id: f.id as string, nome: f.nome as string }))
    );

    const cfg = await carregarConfigEmpresa();
    setResponsaveisConfig(cfg.responsaveis);
    setPixDesconto(cfg.pix_desconto);
    setMaxParcelasCfg(cfg.max_parcelas);
    setLoading(false);
  }

  useEffect(() => {
    carregarDados();
  }, []);

  // Filtro global de período (mesmo do Financeiro/Dashboard).
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

  const vendasNoPeriodo = useMemo(() => {
    return vendas.filter((v) => {
      const t = new Date(v.created_at).getTime();
      return t >= janela.ini && t < janela.fim;
    });
  }, [vendas, janela]);

  const totalConcluido = useMemo(() => {
    return vendasNoPeriodo
      .filter((item) => item.status === "concluida")
      .reduce((acc, item) => acc + Number(item.total || 0), 0);
  }, [vendasNoPeriodo]);

  const totalPix = useMemo(() => {
    return vendasNoPeriodo
      .filter((item) => item.forma_pagamento === "pix" && item.status === "concluida")
      .reduce((acc, item) => acc + Number(item.total || 0), 0);
  }, [vendasNoPeriodo]);

  const subtotalRascunho = useMemo(() => {
    return itensRascunho.reduce(
      (acc, item) => acc + item.quantidade * item.preco_unitario,
      0
    );
  }, [itensRascunho]);

  const descontoManualNumero = Number(descontoManual || 0);
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

    // Produto com grade → exige variação; preço/custo/estoque vêm da variação.
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
    const custoUnit = variacao
      ? Number(variacao.custo ?? produto.custo ?? 0)
      : Number(produto.custo || 0);
    const chave = variacao ? variacao.id : produto.id;
    const rotulo = variacao
      ? `${produto.nome} (${[variacao.tamanho, variacao.cor].filter(Boolean).join(" · ")})`
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
          custo_unitario: custoUnit,
        },
      ]);
    }

    setProdutoId("");
    setVariacaoId("");
    setQuantidade("1");
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
    setDescontoManual("0");
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

    if (formaPagamento === "misto" && restanteMisto <= 0) {
      setErro(
        "No misto, o valor no fiado deve ser maior que zero. Se pagou tudo agora, use uma forma à vista."
      );
      return;
    }

    setSalvando(true);

    // Casa o responsável (texto) a um funcionário cadastrado → gera comissão.
    const funcMatch = funcionariosLista.find(
      (f) => f.nome.trim().toLowerCase() === responsavel.trim().toLowerCase()
    );

    try {
      const { data: vendaCriada, error: vendaError } = await supabase
        .from("vendas")
        .insert({
          cliente_id: clienteId || null,
          responsavel,
          funcionario_id: funcMatch ? funcMatch.id : null,
          forma_pagamento: formaPagamento,
          desconto_pix: descontoPixNumero,
          parcelas: formaPagamento === "cartao" ? parcelasNum : 1,
          taxa: formaPagamento === "cartao" ? taxaNum : 0,
          valor_liquido: valorLiquidoRascunho,
          valor_recebido:
            formaPagamento === "dinheiro"
              ? recebidoNum
              : formaPagamento === "misto"
                ? entradaNum
                : null,
          troco: formaPagamento === "dinheiro" ? trocoRascunho : null,
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
        variacao_id: item.variacao_id,
        quantidade: item.quantidade,
        preco_unitario: item.preco_unitario,
        total_item: item.quantidade * item.preco_unitario,
        custo_unitario: item.custo_unitario,
      }));

      const { error: itensError } = await supabase
        .from("venda_itens")
        .insert(itensParaInserir);

      if (itensError) {
        throw new Error(itensError.message);
      }

      for (const item of itensRascunho) {
        const { error: estoqueError } = await supabase.rpc(
          "registrar_movimentacao",
          {
            p_produto_id: item.produto_id,
            p_tipo: "venda",
            p_quantidade: item.quantidade,
            p_motivo: "Venda",
            p_referencia_id: vendaCriada.id,
            p_variacao_id: item.variacao_id,
          }
        );

        if (estoqueError) {
          throw new Error(estoqueError.message);
        }
      }

      // Venda no fiado / misto → gera a promissória ligada a esta venda.
      if (geraPromissoria) {
        const { error: promError } = await supabase
          .from("promissorias")
          .insert({
            cliente_id: clienteId,
            valor_total: valorPromissoria,
            parcelas: mesesNum,
            status: "em_aberto",
            observacao:
              formaPagamento === "misto"
                ? `Restante da venda (entrada ${formatCurrency(entradaNum)})`
                : "Venda no fiado",
            data_vencimento: venctoPromissoria || null,
            venda_id: vendaCriada.id,
          });

        if (promError) {
          throw new Error(promError.message);
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
    setErro("");
    const venda = vendas.find((v) => v.id === id);
    if (!venda || venda.status !== "concluida") return; // evita cancelar 2x

    // Devolve o estoque de cada item ao cancelar (via RPC, com histórico).
    const itens = itensVenda.filter((it) => it.venda_id === id);
    for (const it of itens) {
      const { error: movError } = await supabase.rpc("registrar_movimentacao", {
        p_produto_id: it.produto_id,
        p_tipo: "cancelamento",
        p_quantidade: it.quantidade,
        p_motivo: "Cancelamento de venda",
        p_referencia_id: id,
        p_variacao_id: it.variacao_id,
      });
      if (movError) {
        setErro(movError.message);
        return;
      }
    }

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

  const porPaginaVendas = 5;
  const totalPaginasVendas = Math.max(
    1,
    Math.ceil(vendasNoPeriodo.length / porPaginaVendas)
  );
  const paginaAtual = Math.min(paginaVendas, totalPaginasVendas - 1);
  const vendasPagina = vendasNoPeriodo.slice(
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

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[28px] border border-[#e8ecf4] bg-white p-5">
          <p className="text-sm font-bold text-[#475569]">Vendas concluídas</p>
          <p className="mt-3 text-3xl font-black tracking-tight text-[#0f172a]">
            {vendasNoPeriodo.filter((item) => item.status === "concluida").length}
          </p>
        </div>

        <div className="rounded-[28px] border border-[#bbf7d0] bg-[#f0fdf4] p-5">
          <p className="text-sm font-bold text-[#15803d]">Faturamento</p>
          <p className="mt-3 text-2xl font-black tracking-tight text-[#0f172a]">
            {formatCurrency(totalConcluido)}
          </p>
        </div>

        <div className="rounded-[28px] border border-[#bfdbfe] bg-[#eff6ff] p-5">
          <p className="text-sm font-bold text-[#1d4ed8]">Vendas no Pix</p>
          <p className="mt-3 text-2xl font-black tracking-tight text-[#0f172a]">
            {formatCurrency(totalPix)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="space-y-6">
          <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
            <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
              Nova venda
            </h2>

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-sm text-[#475569]">Cliente</label>
                <select
                  value={clienteId}
                  onChange={(e) => setClienteId(e.target.value)}
                  className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
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
                </select>
              </div>

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
                <div className="grid grid-cols-2 gap-3">
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
                      value={taxaCartao}
                      onChange={(e) => setTaxaCartao(e.target.value)}
                      className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                    />
                  </div>
                  <p className="col-span-2 text-xs font-semibold text-[#1d4ed8]">
                    Você recebe (líquido): {formatCurrency(valorLiquidoRascunho)}
                  </p>
                </div>
              )}

              {formaPagamento === "misto" && (
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
                  <p className="mt-1.5 text-xs font-semibold text-[#b45309]">
                    Restante no fiado: {formatCurrency(restanteMisto)}
                  </p>
                </div>
              )}

              {geraPromissoria && (
                <div className="rounded-2xl border border-[#fde68a] bg-[#fffbeb] p-4">
                  <div className="grid grid-cols-2 gap-3">
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
                        1º vencimento
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
                <input
                  type="number"
                  value={descontoManual}
                  onChange={(e) => setDescontoManual(e.target.value)}
                  className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                  placeholder="0"
                />
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

          <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
            <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
              Adicionar itens
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
                      {produto.nome}
                      {produto.tem_variacoes
                        ? " — grade"
                        : ` — estoque ${produto.estoque ?? 0}`}
                    </option>
                  ))}
                </select>
              </div>

              {produtoSelecionado?.tem_variacoes && (
                <div>
                  <label className="mb-2 block text-sm text-[#475569]">
                    Variação (tamanho/cor)
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
                        {[v.tamanho, v.cor].filter(Boolean).join(" · ") ||
                          "Variação"}{" "}
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
          <div className="rounded-[30px] border border-[#2563eb]/20 bg-[#2563eb]/[0.06] p-6">
            <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
              Resumo da venda
            </h2>

            <div className="mt-5 grid gap-3 text-sm text-[#475569]">
              <p>Cliente: {getClienteNome(clienteId || null)}</p>
              <p>Responsável: {responsavel}</p>
              <p>Pagamento: {formaPagamento}</p>
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

          <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
            <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
              Vendas registradas{" "}
              <span className="text-sm font-semibold text-[#94a3b8]">
                ({vendasNoPeriodo.length})
              </span>
            </h2>

            {loading ? (
              <p className="mt-4 text-[#64748b]">Carregando vendas...</p>
            ) : vendasNoPeriodo.length === 0 ? (
              <p className="mt-4 text-[#64748b]">
                {vendas.length === 0
                  ? "Nenhuma venda cadastrada ainda."
                  : "Nenhuma venda no período selecionado."}
              </p>
            ) : (
              <>
              <div className="mt-5 space-y-4">
                {vendasPagina.map((venda) => {
                  const itensDaVenda = itensVenda.filter(
                    (item) => item.venda_id === venda.id
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
                              {venda.forma_pagamento}
                            </span>

                            <span className="inline-flex rounded-full bg-[#f1f5f9] px-3 py-1 text-xs font-bold text-[#475569]">
                              {venda.status}
                            </span>
                          </div>

                          <p className="text-sm text-[#64748b]">
                            Responsável: {venda.responsavel}
                          </p>

                          <p className="text-sm text-[#64748b]">
                            Subtotal: {formatCurrency(Number(venda.subtotal || 0))} · Total:{" "}
                            {formatCurrency(Number(venda.total || 0))}
                          </p>

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

                        <div className="flex min-w-[190px] flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => cancelarVenda(venda.id)}
                            className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] px-4 py-2 text-sm font-bold text-[#b91c1c] transition hover:bg-[#fee2e2]"
                          >
                            Cancelar venda
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {totalPaginasVendas > 1 && (
                <div className="mt-5 flex items-center justify-between">
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
    </section>
  );
}