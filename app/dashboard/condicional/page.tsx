"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/dashboard/page-header";
import { CondicionalPdfDocument } from "@/components/pdf/condicional-pdf-document";
import { carregarConfigEmpresa } from "@/lib/empresa-config";
import { carregarNomesResponsaveis } from "@/lib/responsaveis";
import {
  hojeISO,
  somarDiasISO,
  parseDataLocal,
  formatDataBR,
} from "@/lib/datas";
import { rotuloVariacao, type Atributos } from "@/lib/variacoes-utils";
import {
  resumirFinalizacao,
  ESTADO_LABEL,
  type MovResumo,
  type VendaItemResumo,
} from "@/lib/condicional-utils";

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
  custo: number | null;
  estoque: number | null;
  status: string | null;
  tem_variacoes: boolean | null;
};

type Variacao = {
  id: string;
  produto_id: string;
  atributos: Atributos | null;
  tamanho: string | null;
  cor: string | null;
  preco: number | null;
  custo: number | null;
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
  venda_id: string | null;
};

type VendaGerada = {
  id: string;
  total: number | null;
  desconto_pix: number | null;
  valor_bruto: number | null;
  forma_pagamento: string | null;
};

type CondicionalItem = {
  id: string;
  condicional_id: string;
  produto_id: string;
  variacao_id: string | null;
  quantidade: number;
  preco_unitario: number;
  status: string;
};

type ItemRascunho = {
  produto_id: string;
  variacao_id: string | null;
  nome: string;
  quantidade: number;
  preco_unitario: number;
  custo_unitario: number;
};

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function somarDias(dataBase: string, dias: number) {
  return somarDiasISO(dataBase, dias);
}

export default function CondicionalPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [condicionais, setCondicionais] = useState<Condicional[]>([]);
  const [condicionalItens, setCondicionalItens] = useState<CondicionalItem[]>([]);
  // Histórico da finalização (Área #9): movimentos por condicional + venda gerada.
  const [movPorCond, setMovPorCond] = useState<Record<string, MovResumo[]>>({});
  const [vendaPorId, setVendaPorId] = useState<Record<string, VendaGerada>>({});
  const [vendaItensPorVenda, setVendaItensPorVenda] = useState<
    Record<string, VendaItemResumo[]>
  >({});
  const [nomeOperacao, setNomeOperacao] = useState("");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const hoje = hojeISO();

  const [clienteId, setClienteId] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [responsaveisConfig, setResponsaveisConfig] = useState<string[]>([]);
  const [prazoDias, setPrazoDias] = useState(2);
  const [dataSaida, setDataSaida] = useState(hoje);
  const [dataLimite, setDataLimite] = useState(somarDias(hoje, 2));
  const [observacao, setObservacao] = useState("");

  const [produtoId, setProdutoId] = useState("");
  const [variacaoId, setVariacaoId] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [itensRascunho, setItensRascunho] = useState<ItemRascunho[]>([]);
  const [variacoes, setVariacoes] = useState<Variacao[]>([]);

  // Conversão condicional → venda (quantidade vendida por item)
  const [convertendoId, setConvertendoId] = useState<string | null>(null);
  const [qtdVendida, setQtdVendida] = useState<Record<string, string>>({});
  const [formaConversao, setFormaConversao] = useState("pix");
  const [convertendo, setConvertendo] = useState(false);
  const [pixDescontoCfg, setPixDescontoCfg] = useState(5);

  async function carregarDados() {
    setLoading(true);
    setErro("");

    const [clientesRes, produtosRes, condicionaisRes, itensRes, configRes] = await Promise.all([
      supabase.from("clientes").select("id, nome").order("created_at", { ascending: false }),
      supabase
        .from("produtos")
        .select("id, nome, preco, custo, estoque, status, tem_variacoes")
        .order("created_at", { ascending: false }),
      supabase
        .from("condicionais")
        .select(
          "id, created_at, cliente_id, responsavel, status, data_saida, data_limite, data_retorno, observacao, venda_id"
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("condicional_itens")
        .select("id, condicional_id, produto_id, variacao_id, quantidade, preco_unitario, status")
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
    const condicionaisData = (condicionaisRes.data || []) as Condicional[];
    setCondicionais(condicionaisData);
    setCondicionalItens(itensRes.data || []);

    // Detalhamento da finalização: movimentos de estoque dos condicionais já
    // encerrados + a venda gerada (com seus itens) de cada um.
    const encerradosIds = condicionaisData
      .filter((c) => c.status === "finalizado" || c.status === "recolhido")
      .map((c) => c.id);
    const vendaIds = condicionaisData
      .map((c) => c.venda_id)
      .filter((id): id is string => !!id);

    if (encerradosIds.length > 0) {
      const { data: movs } = await supabase
        .from("estoque_movimentacoes")
        .select("produto_id, variacao_id, tipo, quantidade, referencia_id")
        .in("referencia_id", encerradosIds);
      const mapaMov: Record<string, MovResumo[]> = {};
      for (const m of (movs as (MovResumo & { referencia_id: string })[]) || []) {
        (mapaMov[m.referencia_id] ??= []).push({
          produto_id: m.produto_id,
          variacao_id: m.variacao_id,
          tipo: m.tipo,
          quantidade: Number(m.quantidade || 0),
        });
      }
      setMovPorCond(mapaMov);
    } else {
      setMovPorCond({});
    }

    if (vendaIds.length > 0) {
      const [vendasRes, vendaItensRes] = await Promise.all([
        supabase
          .from("vendas")
          .select("id, total, desconto_pix, valor_bruto, forma_pagamento")
          .in("id", vendaIds),
        supabase
          .from("venda_itens")
          .select("venda_id, produto_id, variacao_id, quantidade")
          .in("venda_id", vendaIds),
      ]);
      const mapaVenda: Record<string, VendaGerada> = {};
      for (const v of (vendasRes.data as VendaGerada[]) || []) mapaVenda[v.id] = v;
      setVendaPorId(mapaVenda);
      const mapaItens: Record<string, VendaItemResumo[]> = {};
      for (const vi of (vendaItensRes.data as (VendaItemResumo & {
        venda_id: string;
      })[]) || []) {
        (mapaItens[vi.venda_id] ??= []).push({
          produto_id: vi.produto_id,
          variacao_id: vi.variacao_id,
          quantidade: Number(vi.quantidade || 0),
        });
      }
      setVendaItensPorVenda(mapaItens);
    } else {
      setVendaPorId({});
      setVendaItensPorVenda({});
    }

    const { data: varData } = await supabase
      .from("produto_variacoes")
      .select("id, produto_id, atributos, tamanho, cor, preco, custo, estoque, status");
    setVariacoes(
      (varData || []).filter((v) => (v.status || "ativo") === "ativo")
    );

    const cfg = await carregarConfigEmpresa();
    setNomeOperacao(cfg.nome_operacao || "Sua loja");
    setResponsaveisConfig(await carregarNomesResponsaveis());
    setPixDescontoCfg(cfg.pix_desconto);
    setPrazoDias(cfg.condicional_prazo_dias);
    setDataLimite(somarDias(dataSaida, cfg.condicional_prazo_dias));
    setLoading(false);
  }

  useEffect(() => {
    carregarDados();
    // A função usa o estado inicial; recargas posteriores são explícitas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        (i) =>
          i.status === "aberto" &&
          parseDataLocal(i.data_limite) < parseDataLocal(hoje)
      );
    return condicionais.filter((i) => i.status === filtroStatus);
  }, [condicionais, filtroStatus, hoje]);

  const condicionaisAbertos = useMemo(() => {
    return condicionais.filter((item) => item.status === "aberto");
  }, [condicionais]);

  const condicionaisAtrasados = useMemo(() => {
    const hojeDate = parseDataLocal(hoje);

    return condicionais.filter((item) => {
      if (item.status !== "aberto") return false;
      return parseDataLocal(item.data_limite) < hojeDate;
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

  function nomeComVariante(produtoId: string, variacaoId: string | null) {
    const base = getProdutoNome(produtoId);
    if (!variacaoId) return base;
    const v = variacoes.find((x) => x.id === variacaoId);
    return v
      ? `${base} (${rotuloVariacao(v.atributos, { tamanho: v.tamanho, cor: v.cor })})`
      : base;
  }

  const variacoesDoProduto = variacoes.filter((v) => v.produto_id === produtoId);
  const produtoSelecionado = produtos.find((p) => p.id === produtoId);

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
    setDataSaida(hoje);
    setDataLimite(somarDias(hoje, 2));
    setObservacao("");
    setProdutoId("");
    setVariacaoId("");
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
        variacao_id: item.variacao_id,
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
        const { error: estoqueError } = await supabase.rpc(
          "registrar_movimentacao",
          {
            p_produto_id: item.produto_id,
            p_tipo: "condicional",
            p_quantidade: item.quantidade,
            p_motivo: "Saída em condicional",
            p_referencia_id: condicionalCriado.id,
            p_variacao_id: item.variacao_id,
          }
        );

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
      const { error: estoqueError } = await supabase.rpc(
        "registrar_movimentacao",
        {
          p_produto_id: item.produto_id,
          p_tipo: "retorno_condicional",
          p_quantidade: item.quantidade,
          p_motivo: "Recolhimento de condicional",
          p_referencia_id: condicionalId,
          p_variacao_id: item.variacao_id,
        }
      );

      if (estoqueError) {
        setErro(estoqueError.message);
        return;
      }
    }

    const { error } = await supabase
      .from("condicionais")
      .update({
        status: "recolhido",
        data_retorno: hojeISO(),
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
        data_retorno: hojeISO(),
      })
      .eq("id", condicionalId);

    if (error) {
      setErro(error.message);
      return;
    }

    await carregarDados();
  }

  function abrirConversao(condicionalId: string) {
    setErro("");
    setConvertendoId((atual) => (atual === condicionalId ? null : condicionalId));
    const itens = getItensDoCondicional(condicionalId);
    // Por padrão, vende a quantidade inteira de cada item.
    const inicial: Record<string, string> = {};
    for (const i of itens) inicial[i.id] = String(i.quantidade);
    setQtdVendida(inicial);
    setFormaConversao("pix");
  }

  function setVendidaItem(itemId: string, valor: string, max: number) {
    let n = Number(valor);
    if (!Number.isFinite(n)) n = 0;
    n = Math.max(0, Math.min(max, Math.floor(n)));
    setQtdVendida((atual) => ({ ...atual, [itemId]: String(n) }));
  }

  async function converterEmVenda(condicionalId: string) {
    setErro("");
    const itens = getItensDoCondicional(condicionalId);
    const payload = itens.map((i) => {
      const prod = produtos.find((p) => p.id === i.produto_id);
      const qv = Math.max(
        0,
        Math.min(i.quantidade, Math.floor(Number(qtdVendida[i.id] ?? i.quantidade)))
      );
      return {
        condicional_item_id: i.id,
        preco_unitario: Number(i.preco_unitario || 0),
        custo_unitario: Number(prod?.custo || 0),
        quantidade_vendida: qv,
        quantidade_devolvida: i.quantidade - qv,
      };
    });

    if (payload.every((p) => p.quantidade_vendida === 0)) {
      setErro(
        "Nada foi marcado como vendido. Use 'Recolher tudo' se o cliente devolveu tudo."
      );
      return;
    }

    setConvertendo(true);
    const { error } = await supabase.rpc("converter_condicional_venda", {
      p_condicional_id: condicionalId,
      p_forma_pagamento: formaConversao,
      p_itens: payload,
    });
    if (error) {
      setErro(error.message);
      setConvertendo(false);
      return;
    }
    setConvertendoId(null);
    setConvertendo(false);
    await carregarDados();
  }

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Módulo operacional"
        title="Condicional"
        description="Controle peças deixadas com o cliente, prazo de retorno e converta em venda o que o cliente ficou — devolvendo o restante ao estoque."
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
                        {rotuloVariacao(v.atributos, { tamanho: v.tamanho, cor: v.cor })}{" "}
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
                  min="1"
                  step="1"
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
              <p>• Você pode converter em venda o que o cliente ficou; o restante volta ao estoque.</p>
              <p>• Ao finalizar, o histórico mostra o que foi vendido, devolvido e a venda gerada.</p>
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
                    parseDataLocal(condicional.data_limite) < parseDataLocal(hoje);

                  const encerrado =
                    condicional.status === "finalizado" ||
                    condicional.status === "recolhido";
                  const vendaGerada = condicional.venda_id
                    ? vendaPorId[condicional.venda_id] || null
                    : null;
                  const resumo = encerrado
                    ? resumirFinalizacao(
                        itens.map((i) => ({
                          id: i.id,
                          produto_id: i.produto_id,
                          variacao_id: i.variacao_id,
                          quantidade: i.quantidade,
                          preco_unitario: i.preco_unitario,
                          status: i.status,
                        })),
                        movPorCond[condicional.id] || [],
                        condicional.venda_id
                          ? vendaItensPorVenda[condicional.venda_id] || []
                          : []
                      )
                    : null;
                  const movimentos = movPorCond[condicional.id] || [];

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
                            Saída: {formatDataBR(condicional.data_saida)} ·{" "}
                            Limite: {formatDataBR(condicional.data_limite)}
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
                              {itens.map((item) => {
                                const v = item.variacao_id
                                  ? variacoes.find((x) => x.id === item.variacao_id)
                                  : null;
                                const nome = v
                                  ? `${getProdutoNome(item.produto_id)} (${rotuloVariacao(v.atributos, { tamanho: v.tamanho, cor: v.cor })})`
                                  : getProdutoNome(item.produto_id);
                                return (
                                  <div
                                    key={item.id}
                                    className="rounded-2xl border border-[#e8ecf4] bg-white px-3 py-2 text-sm text-[#475569]"
                                  >
                                    {nome} · Quantidade: {item.quantidade} ·{" "}
                                    {formatCurrency(Number(item.preco_unitario || 0))}
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Área #9: detalhamento da finalização */}
                          {resumo && (
                            <div className="mt-2 rounded-[20px] border border-[#bbf7d0] bg-[#f0fdf4]/60 p-4">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#15803d]">
                                  Resumo da finalização
                                </p>
                                {condicional.data_retorno && (
                                  <span className="text-xs text-[#64748b]">
                                    Retorno: {formatDataBR(condicional.data_retorno)}
                                  </span>
                                )}
                              </div>

                              <p className="mt-1 text-sm text-[#334155]">
                                {resumo.totalVendidoQtd} vendida
                                {resumo.totalVendidoQtd === 1 ? "" : "s"} ·{" "}
                                {resumo.totalDevolvidoQtd} devolvida
                                {resumo.totalDevolvidoQtd === 1 ? "" : "s"} ·
                                Responsável: {condicional.responsavel || "-"}
                              </p>

                              <div className="mt-2 space-y-1.5">
                                {resumo.itens.map((it) => (
                                  <div
                                    key={`${it.produto_id}-${it.variacao_id ?? ""}`}
                                    className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-[#dcfce7] bg-white px-3 py-2 text-sm text-[#475569]"
                                  >
                                    <span className="flex-1 text-[#0f172a]">
                                      {nomeComVariante(it.produto_id, it.variacao_id)}
                                    </span>
                                    <span className="text-xs text-[#64748b]">
                                      levou {it.enviado}
                                    </span>
                                    {it.vendido > 0 && (
                                      <span className="rounded-full bg-[#eff6ff] px-2 py-0.5 text-xs font-bold text-[#1d4ed8]">
                                        vendeu {it.vendido}
                                      </span>
                                    )}
                                    {it.devolvido > 0 && (
                                      <span className="rounded-full bg-[#fff7ed] px-2 py-0.5 text-xs font-bold text-[#b45309]">
                                        devolveu {it.devolvido}
                                      </span>
                                    )}
                                    <span className="rounded-full bg-[#f1f5f9] px-2 py-0.5 text-[10px] font-bold text-[#475569]">
                                      {ESTADO_LABEL[it.estado]}
                                    </span>
                                  </div>
                                ))}
                              </div>

                              {vendaGerada && (
                                <div className="mt-2 rounded-xl border border-[#bfdbfe] bg-white px-3 py-2 text-sm">
                                  <span className="font-bold text-[#0f172a]">
                                    Venda gerada:{" "}
                                    {formatCurrency(Number(vendaGerada.total || 0))}
                                  </span>
                                  {Number(vendaGerada.desconto_pix || 0) > 0 && (
                                    <span className="ml-2 text-xs text-[#15803d]">
                                      desconto {formatCurrency(Number(vendaGerada.desconto_pix))}
                                    </span>
                                  )}
                                  {vendaGerada.forma_pagamento && (
                                    <span className="ml-2 text-xs text-[#64748b]">
                                      · {vendaGerada.forma_pagamento}
                                    </span>
                                  )}
                                </div>
                              )}

                              {movimentos.length > 0 && (
                                <details className="mt-2 text-sm">
                                  <summary className="cursor-pointer text-xs font-semibold text-[#475569]">
                                    Movimentos de estoque ({movimentos.length})
                                  </summary>
                                  <div className="mt-1.5 space-y-1">
                                    {movimentos.map((m, idx) => (
                                      <div
                                        key={`${m.produto_id}-${m.tipo}-${idx}`}
                                        className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs text-[#64748b]"
                                      >
                                        <span>
                                          {nomeComVariante(m.produto_id, m.variacao_id)}
                                        </span>
                                        <span className="font-semibold">
                                          {m.tipo === "retorno_condicional"
                                            ? "retorno"
                                            : m.tipo === "condicional"
                                            ? "saída"
                                            : m.tipo}{" "}
                                          {m.quantidade}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              )}
                            </div>
                          )}
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
                                onClick={() => abrirConversao(condicional.id)}
                                className="rounded-2xl bg-[#2563eb] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#1d4ed8]"
                              >
                                Converter em venda
                              </button>

                              <button
                                type="button"
                                onClick={() => marcarComoRecolhido(condicional.id)}
                                className="rounded-2xl border border-[#e8ecf4] bg-white px-4 py-2 text-sm font-bold text-[#334155] transition hover:bg-[#f4f6fb]"
                              >
                                Recolher tudo
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

                      {/* Painel de conversão em venda */}
                      {convertendoId === condicional.id && (
                        <div className="mt-4 rounded-[20px] border border-[#bfdbfe] bg-[#eff6ff] p-4">
                          <p className="text-sm font-black text-[#0f172a]">
                            Converter em venda
                          </p>
                          <p className="mt-1 text-xs text-[#64748b]">
                            Informe quanto de cada item o cliente ficou. O
                            restante volta ao estoque.
                          </p>

                          <div className="mt-3 space-y-2">
                            {itens.map((item) => {
                              const vLabel = item.variacao_id
                                ? variacoes.find((v) => v.id === item.variacao_id)
                                : null;
                              const nomeItem = vLabel
                                ? `${getProdutoNome(item.produto_id)} (${rotuloVariacao(vLabel.atributos, { tamanho: vLabel.tamanho, cor: vLabel.cor })})`
                                : getProdutoNome(item.produto_id);
                              const qv = Math.max(
                                0,
                                Math.min(
                                  item.quantidade,
                                  Math.floor(
                                    Number(qtdVendida[item.id] ?? item.quantidade)
                                  )
                                )
                              );
                              return (
                                <div
                                  key={item.id}
                                  className="flex items-center gap-3 rounded-xl border border-[#dbeafe] bg-white px-3 py-2 text-sm"
                                >
                                  <span className="flex-1 text-[#0f172a]">
                                    {nomeItem} ·{" "}
                                    {formatCurrency(Number(item.preco_unitario || 0))}{" "}
                                    <span className="text-xs text-[#64748b]">
                                      (levou {item.quantidade})
                                    </span>
                                  </span>
                                  <label className="text-xs text-[#64748b]">
                                    vende
                                  </label>
                                  <input
                                    type="number"
                                    min="0"
                                    max={item.quantidade}
                                    step="1"
                                    value={qtdVendida[item.id] ?? ""}
                                    onChange={(e) =>
                                      setVendidaItem(
                                        item.id,
                                        e.target.value,
                                        item.quantidade
                                      )
                                    }
                                    className="w-16 rounded-lg border border-[#dbeafe] bg-white px-2 py-1.5 text-sm outline-none"
                                  />
                                  <span className="text-xs font-semibold text-[#b45309]">
                                    devolve {item.quantidade - qv}
                                  </span>
                                </div>
                              );
                            })}
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-3">
                            <div>
                              <label className="mb-1 block text-xs text-[#475569]">
                                Pagamento
                              </label>
                              <select
                                value={formaConversao}
                                onChange={(e) => setFormaConversao(e.target.value)}
                                className="rounded-xl border border-[#dbeafe] bg-white px-3 py-2 text-sm outline-none"
                              >
                                <option value="pix">Pix</option>
                                <option value="dinheiro">Dinheiro</option>
                                <option value="cartao">Cartão</option>
                              </select>
                            </div>
                            <div className="ml-auto text-right">
                              <p className="text-xs text-[#64748b]">Total a vender</p>
                              {(() => {
                                const bruto = itens.reduce((s, i) => {
                                  const qv = Math.max(
                                    0,
                                    Math.min(
                                      i.quantidade,
                                      Math.floor(
                                        Number(qtdVendida[i.id] ?? i.quantidade)
                                      )
                                    )
                                  );
                                  return s + qv * Number(i.preco_unitario || 0);
                                }, 0);
                                const desc =
                                  formaConversao === "pix"
                                    ? (bruto * pixDescontoCfg) / 100
                                    : 0;
                                return (
                                  <>
                                    <p className="text-lg font-black text-[#1d4ed8]">
                                      {formatCurrency(bruto - desc)}
                                    </p>
                                    {desc > 0 && (
                                      <p className="text-xs text-[#15803d]">
                                        Pix −{formatCurrency(desc)}
                                      </p>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          </div>

                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              onClick={() => converterEmVenda(condicional.id)}
                              disabled={convertendo}
                              className="rounded-xl bg-[#2563eb] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
                            >
                              {convertendo ? "Convertendo..." : "Confirmar venda"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConvertendoId(null)}
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
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
