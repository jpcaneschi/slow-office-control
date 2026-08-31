"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, MessageCircle, Pencil, Search, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  calcularParcelaSugerida,
  calcularSaldoPromissoria,
  formatCurrency,
  gerarCronogramaPromissoria,
  obterCorStatus,
  validarRegrasPromissoria,
} from "@/lib/promissorias-utils";
import { carregarConfigEmpresa } from "@/lib/empresa-config";
import { compartilharPdfWhatsApp } from "@/lib/whatsapp-utils";
import { PromissoriaAcordoPdf } from "@/components/pdf/promissoria-acordo-pdf";
import {
  calcularItemPromissoria,
  calcularTotaisItensPromissoria,
  type TipoDescontoPromissoria,
  validarItemPromissoria,
} from "@/lib/promissoria-itens";

type Cliente = { id: string; nome: string; cpf: string | null; telefone: string | null };
type Produto = { id: string; nome: string; marca: string | null; preco: number; estoque: number; tem_variacoes: boolean; status: string };
type Variacao = { id: string; produto_id: string; tamanho: string | null; cor: string | null; preco: number | null; estoque: number; status: string };
type Promissoria = {
  id: string; cliente_id: string; valor_total: number; valor_produtos: number; entrada_valor: number;
  acrescimo_tipo: string | null; acrescimo_valor: number; acrescimo_percentual: number;
  parcelas: number; status: string; observacao: string | null; data_vencimento: string | null;
  data_primeira_parcela: string | null; created_at: string;
};
type Pagamento = { id: string; promissoria_id: string; valor: number; data: string; forma_pagamento: string | null; tipo: string };
type ItemProm = {
  id: string;
  promissoria_id: string;
  produto_id: string;
  variacao_id: string | null;
  quantidade: number;
  preco_unitario: number;
  preco_original: number;
  desconto_tipo: TipoDescontoPromissoria | null;
  desconto_valor: number;
  desconto_percentual: number;
};
type OpcaoProduto = { key: string; produtoId: string; variacaoId: string | null; nome: string; detalhe: string; preco: number; estoque: number };
type ItemSelecionado = OpcaoProduto & {
  quantidade: string;
  precoOriginal: string;
  descontoTipo: TipoDescontoPromissoria;
  descontoInput: string;
  estoqueDisponivel: number;
};

function formatarData(data: string | null) {
  if (!data) return "Não informada";
  const [a, m, d] = data.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}
function slug(v: string) { return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }
function normalizarBusca(v: string) { return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function rotuloFormaPagamento(forma: string | null) {
  if (!forma) return "Não informada";
  return forma === "pix" ? "Pix" : forma === "cartao" ? "Cartão" : forma === "dinheiro" ? "Dinheiro" : forma;
}

export default function PromissoriasPage() {
  const formRef = useRef<HTMLDivElement>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [variacoes, setVariacoes] = useState<Variacao[]>([]);
  const [promissorias, setPromissorias] = useState<Promissoria[]>([]);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [itensProm, setItensProm] = useState<ItemProm[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [baixandoPdf, setBaixandoPdf] = useState<string | null>(null);
  const [nomeLoja, setNomeLoja] = useState("");
  const [prazoMaxMeses, setPrazoMaxMeses] = useState(4);
  const [parcelaMinima, setParcelaMinima] = useState(0);
  const [filtroStatus, setFiltroStatus] = useState("todos");

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [clienteId, setClienteId] = useState("");
  const [buscaProduto, setBuscaProduto] = useState("");
  const [buscaProdutoAberta, setBuscaProdutoAberta] = useState(false);
  const [itensSelecionados, setItensSelecionados] = useState<ItemSelecionado[]>([]);
  const [valorBaseManual, setValorBaseManual] = useState("");
  const [entrada, setEntrada] = useState("0");
  const [entradaForma, setEntradaForma] = useState("pix");
  const [acrescimoTipo, setAcrescimoTipo] = useState<"percentual" | "valor">("valor");
  const [acrescimoInput, setAcrescimoInput] = useState("0");
  const [parcelas, setParcelas] = useState("1");
  const [dataVencimento, setDataVencimento] = useState("");
  const [observacao, setObservacao] = useState("");
  const [valorPagamento, setValorPagamento] = useState<Record<string, string>>({});
  const [formaPagamento, setFormaPagamento] = useState<Record<string, string>>({});

  async function carregarDados() {
    setLoading(true); setErro("");
    const cfg = await carregarConfigEmpresa();
    setNomeLoja(cfg.nome_operacao); setPrazoMaxMeses(cfg.promissoria_prazo_meses); setParcelaMinima(cfg.parcela_minima);
    const [c, p, v, pr, pg, ip] = await Promise.all([
      supabase.from("clientes").select("id,nome,cpf,telefone").order("nome"),
      supabase.from("produtos").select("id,nome,marca,preco,estoque,tem_variacoes,status").order("nome"),
      supabase.from("produto_variacoes").select("id,produto_id,tamanho,cor,preco,estoque,status"),
      supabase.from("promissorias").select("id,cliente_id,valor_total,valor_produtos,entrada_valor,acrescimo_tipo,acrescimo_valor,acrescimo_percentual,parcelas,status,observacao,data_vencimento,data_primeira_parcela,created_at").order("created_at", { ascending: false }),
      supabase.from("promissoria_pagamentos").select("id,promissoria_id,valor,data,forma_pagamento,tipo").order("data"),
      supabase.from("promissoria_itens").select("id,promissoria_id,produto_id,variacao_id,quantidade,preco_unitario,preco_original,desconto_tipo,desconto_valor,desconto_percentual"),
    ]);
    const e = c.error || p.error || v.error || pr.error || pg.error || ip.error;
    if (e) setErro(e.message);
    setClientes((c.data as Cliente[] | null) || []); setProdutos((p.data as Produto[] | null) || []);
    setVariacoes((v.data as Variacao[] | null) || []); setPromissorias((pr.data as Promissoria[] | null) || []);
    setPagamentos((pg.data as Pagamento[] | null) || []); setItensProm((ip.data as ItemProm[] | null) || []);
    setLoading(false);
  }
  useEffect(() => { carregarDados(); }, []);
  useEffect(() => { const s = new URLSearchParams(window.location.search).get("status"); if (s) setFiltroStatus(s); }, []);

  const clientePorId = useMemo(
    () => new Map(clientes.map((cliente) => [cliente.id, cliente])),
    [clientes]
  );
  const produtoPorId = useMemo(
    () => new Map(produtos.map((produto) => [produto.id, produto])),
    [produtos]
  );
  const variacaoPorId = useMemo(
    () => new Map(variacoes.map((variacao) => [variacao.id, variacao])),
    [variacoes]
  );
  const variacoesPorProduto = useMemo(() => {
    const mapa = new Map<string, Variacao[]>();
    for (const variacao of variacoes) {
      const atuais = mapa.get(variacao.produto_id) || [];
      atuais.push(variacao);
      mapa.set(variacao.produto_id, atuais);
    }
    return mapa;
  }, [variacoes]);
  const itensPorPromissoria = useMemo(() => {
    const mapa = new Map<string, ItemProm[]>();
    for (const item of itensProm) {
      const atuais = mapa.get(item.promissoria_id) || [];
      atuais.push(item);
      mapa.set(item.promissoria_id, atuais);
    }
    return mapa;
  }, [itensProm]);
  const pagamentosPorPromissoria = useMemo(() => {
    const mapa = new Map<string, Pagamento[]>();
    for (const pagamento of pagamentos) {
      const atuais = mapa.get(pagamento.promissoria_id) || [];
      atuais.push(pagamento);
      mapa.set(pagamento.promissoria_id, atuais);
    }
    return mapa;
  }, [pagamentos]);

  const opcoesProdutos = useMemo<OpcaoProduto[]>(() => {
    const out: OpcaoProduto[] = [];
    for (const p of produtos.filter((x) => x.status !== "inativo")) {
      if (p.tem_variacoes) {
        (variacoesPorProduto.get(p.id) || []).filter((v) => v.status !== "inativo").forEach((v) => out.push({
          key: `v:${v.id}`, produtoId: p.id, variacaoId: v.id, nome: p.nome,
          detalhe: [v.tamanho, v.cor].filter(Boolean).join(" · ") || "Variação",
          preco: Number(v.preco ?? p.preco ?? 0), estoque: Number(v.estoque || 0),
        }));
      } else out.push({ key: `p:${p.id}`, produtoId: p.id, variacaoId: null, nome: p.nome, detalhe: p.marca || "Produto", preco: Number(p.preco || 0), estoque: Number(p.estoque || 0) });
    }
    return out;
  }, [produtos, variacoesPorProduto]);
  const opcaoProdutoPorKey = useMemo(
    () => new Map(opcoesProdutos.map((opcao) => [opcao.key, opcao])),
    [opcoesProdutos]
  );

  const opcoesProdutosFiltradas = useMemo(() => {
    const termo = normalizarBusca(buscaProduto.trim());
    const disponiveis = opcoesProdutos.filter((opcao) => opcao.estoque > 0);
    if (!termo) return disponiveis.slice(0, 8);
    return disponiveis
      .filter((opcao) => normalizarBusca(`${opcao.nome} ${opcao.detalhe}`).includes(termo))
      .slice(0, 12);
  }, [buscaProduto, opcoesProdutos]);

  const itensCalculados = useMemo(
    () =>
      itensSelecionados.map((item) => ({
        item,
        calculo: calcularItemPromissoria({
          quantidade: Number(item.quantidade),
          precoOriginal: Number(item.precoOriginal),
          descontoTipo: item.descontoTipo,
          descontoInput: Number(item.descontoInput),
        }),
      })),
    [itensSelecionados]
  );
  const totaisItens = useMemo(
    () =>
      calcularTotaisItensPromissoria(
        itensSelecionados.map((item) => ({
          quantidade: Number(item.quantidade),
          precoOriginal: Number(item.precoOriginal),
          descontoTipo: item.descontoTipo,
          descontoInput: Number(item.descontoInput),
        }))
      ),
    [itensSelecionados]
  );
  const base = itensSelecionados.length > 0 ? totaisItens.total : Number(valorBaseManual || 0);
  const acrescimo = acrescimoTipo === "percentual" ? Math.round(base * Number(acrescimoInput || 0)) / 100 : Number(acrescimoInput || 0);
  const acrescimoValor = acrescimoTipo === "percentual" ? Math.round(base * Number(acrescimoInput || 0)) / 100 : Math.max(0, acrescimo);
  const acrescimoPct = acrescimoTipo === "percentual" ? Math.max(0, Number(acrescimoInput || 0)) : base > 0 ? (acrescimoValor / base) * 100 : 0;
  const totalAcordo = Math.max(0, base + acrescimoValor);
  const entradaNumero = Math.max(0, Number(entrada || 0));
  const saldoParcelado = Math.max(0, totalAcordo - entradaNumero);
  const parcelasNumero = Math.max(1, Number(parcelas || 1));
  const parcelaSugerida = calcularParcelaSugerida(saldoParcelado, parcelasNumero);
  const regraMensagem = validarRegrasPromissoria(saldoParcelado, parcelasNumero, { prazoMaxMeses, parcelaMinima });

  const pagoPorProm = useMemo(() => { const m: Record<string, number> = {}; pagamentos.forEach((p) => m[p.promissoria_id] = (m[p.promissoria_id] || 0) + Number(p.valor || 0)); return m; }, [pagamentos]);
  const saldoDe = (p: Promissoria) => calcularSaldoPromissoria(Number(p.valor_total || 0), pagoPorProm[p.id] || 0, p.status);
  const totalAberto = promissorias.filter((p) => !["pago","cancelado"].includes(p.status)).reduce((s,p) => s + saldoDe(p),0);
  const totalPago = pagamentos.reduce((s,p) => s + Number(p.valor || 0),0);
  const totalFinanciado = promissorias.filter((p) => p.status !== "cancelado").reduce((s,p) => s + Number(p.valor_total || 0),0);
  const promissoriasFiltradas = filtroStatus === "todos" ? promissorias : promissorias.filter((p) => p.status === filtroStatus);
  const entradaEditando = editandoId
    ? (pagamentosPorPromissoria.get(editandoId) || []).find((pagamento) => pagamento.tipo === "entrada")
    : undefined;

  function limparFormulario() {
    setEditandoId(null); setClienteId(""); setBuscaProduto(""); setBuscaProdutoAberta(false); setItensSelecionados([]); setValorBaseManual("");
    setEntrada("0"); setEntradaForma("pix"); setAcrescimoTipo("valor"); setAcrescimoInput("0"); setParcelas("1"); setDataVencimento(""); setObservacao("");
  }

  function adicionarProduto(opcao: OpcaoProduto) {
    setErro("");
    const existente = itensSelecionados.find((item) => item.key === opcao.key);
    if (existente && Number(existente.quantidade || 0) + 1 > existente.estoqueDisponivel) {
      setErro(`Estoque insuficiente para ${opcao.nome}.`);
      return;
    }
    setItensSelecionados((atuais) => {
      const itemAtual = atuais.find((item) => item.key === opcao.key);
      if (itemAtual) {
        const novaQuantidade = Number(itemAtual.quantidade || 0) + 1;
        return atuais.map((item) =>
          item.key === opcao.key ? { ...item, quantidade: String(novaQuantidade) } : item
        );
      }
      return [
        ...atuais,
        {
          ...opcao,
          quantidade: "1",
          precoOriginal: String(opcao.preco),
          descontoTipo: "valor",
          descontoInput: "0",
          estoqueDisponivel: opcao.estoque,
        },
      ];
    });
    setBuscaProduto("");
    setBuscaProdutoAberta(false);
    setValorBaseManual("");
  }

  function atualizarItem(
    key: string,
    campo: "quantidade" | "precoOriginal" | "descontoTipo" | "descontoInput",
    valor: string
  ) {
    setItensSelecionados((atuais) =>
      atuais.map((item) => {
        if (item.key !== key) return item;
        if (campo === "descontoTipo") {
          return { ...item, descontoTipo: valor as TipoDescontoPromissoria };
        }
        return { ...item, [campo]: valor };
      })
    );
  }

  function editar(item: Promissoria) {
    const ips = itensPorPromissoria.get(item.id) || [];
    const selecionados = ips.map<ItemSelecionado>((ip) => {
      const produto = produtoPorId.get(ip.produto_id);
      const variacao = ip.variacao_id ? variacaoPorId.get(ip.variacao_id) : undefined;
      const opcaoAtual = opcaoProdutoPorKey.get(
        ip.variacao_id ? `v:${ip.variacao_id}` : `p:${ip.produto_id}`
      );
      const precoOriginal = Number(ip.preco_original || 0) ||
        Number(ip.preco_unitario || 0) + Number(ip.desconto_valor || 0);
      const descontoTipo = ip.desconto_tipo ||
        (Number(ip.desconto_percentual || 0) > 0 ? "percentual" : "valor");
      return {
        key: ip.variacao_id ? `v:${ip.variacao_id}` : `p:${ip.produto_id}`,
        produtoId: ip.produto_id,
        variacaoId: ip.variacao_id,
        nome: produto?.nome || "Produto",
        detalhe: [variacao?.tamanho, variacao?.cor].filter(Boolean).join(" · ") || produto?.marca || "Produto",
        preco: precoOriginal,
        estoque: Number(opcaoAtual?.estoque || 0),
        quantidade: String(ip.quantidade),
        precoOriginal: String(precoOriginal),
        descontoTipo,
        descontoInput: String(
          descontoTipo === "percentual"
            ? Number(ip.desconto_percentual || 0)
            : Number(ip.desconto_valor || 0)
        ),
        estoqueDisponivel: Number(opcaoAtual?.estoque || 0) + Number(ip.quantidade || 0),
      };
    });
    const pagamentoEntrada = (pagamentosPorPromissoria.get(item.id) || []).find(
      (pagamento) => pagamento.tipo === "entrada"
    );
    setEditandoId(item.id); setClienteId(item.cliente_id); setItensSelecionados(selecionados);
    setBuscaProduto(""); setBuscaProdutoAberta(false);
    setValorBaseManual(ips.length ? "" : String(Number(item.valor_produtos || (Number(item.valor_total)-Number(item.acrescimo_valor || 0)))));
    setEntrada(String(Number(item.entrada_valor || 0))); setEntradaForma(pagamentoEntrada?.forma_pagamento || "pix");
    setAcrescimoTipo(item.acrescimo_tipo === "percentual" ? "percentual" : "valor");
    setAcrescimoInput(String(item.acrescimo_tipo === "percentual" ? Number(item.acrescimo_percentual || 0) : Number(item.acrescimo_valor || 0)));
    setParcelas(String(item.parcelas)); setDataVencimento(item.data_primeira_parcela || item.data_vencimento || ""); setObservacao(item.observacao || "");
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  async function salvarPromissoria() {
    setErro("");
    if (!clienteId) return setErro("Selecione um cliente.");
    for (const selecionado of itensSelecionados) {
      const mensagem = validarItemPromissoria({
        quantidade: Number(selecionado.quantidade),
        precoOriginal: Number(selecionado.precoOriginal),
        descontoTipo: selecionado.descontoTipo,
        descontoInput: Number(selecionado.descontoInput),
      });
      if (mensagem) return setErro(`${selecionado.nome}: ${mensagem}`);
      if (Number(selecionado.quantidade) > selecionado.estoqueDisponivel) {
        return setErro(`${selecionado.nome}: estoque disponível é ${selecionado.estoqueDisponivel}.`);
      }
    }
    if (base <= 0) return setErro("Selecione um produto ou informe o valor base da dívida.");
    if (entradaNumero > totalAcordo) return setErro("A entrada não pode ser maior que o total do acordo.");
    if (!dataVencimento) return setErro("Informe a data da primeira parcela.");
    if (regraMensagem) return setErro(regraMensagem);
    setSalvando(true);
    const itens = itensCalculados.map(({ item: selecionado, calculo }) => ({
      produto_id: selecionado.produtoId,
      variacao_id: selecionado.variacaoId,
      quantidade: calculo.quantidade,
      preco_original: calculo.precoOriginal,
      desconto_tipo: calculo.descontoUnitario > 0 ? selecionado.descontoTipo : null,
      desconto_input: Math.max(0, Number(selecionado.descontoInput || 0)),
    }));
    const { error } = await supabase.rpc("salvar_promissoria_detalhada", {
      p_promissoria_id: editandoId,
      p_cliente_id: clienteId,
      p_valor_base: base,
      p_entrada_valor: entradaNumero,
      p_acrescimo_tipo: acrescimoValor > 0 ? acrescimoTipo : null,
      p_acrescimo_input: Math.max(0, Number(acrescimoInput || 0)),
      p_parcelas: parcelasNumero,
      p_data_primeira: dataVencimento,
      p_observacao: observacao.trim() || null,
      p_itens: itens,
      p_entrada_forma: entradaNumero > 0 ? entradaForma : null,
      p_idempotency_key: crypto.randomUUID(),
    });
    setSalvando(false);
    if (error) return setErro(error.message);
    limparFormulario(); await carregarDados();
  }

  async function registrarPagamento(prom: Promissoria) {
    setErro(""); const saldo = saldoDe(prom); const bruto = valorPagamento[prom.id]; const valor = bruto ? Number(bruto) : saldo;
    if (!Number.isFinite(valor) || valor <= 0) return setErro("Informe um valor de pagamento válido.");
    if (valor > saldo + 0.001) return setErro(`Pagamento maior que o saldo de ${formatCurrency(saldo)}.`);
    setPagando(true);
    const { error } = await supabase.rpc("registrar_pagamento_promissoria", { p_promissoria_id: prom.id, p_valor: valor, p_forma: formaPagamento[prom.id] || "pix", p_obs: null, p_idempotency_key: crypto.randomUUID() });
    setPagando(false); if (error) return setErro(error.message);
    setValorPagamento((a) => ({ ...a, [prom.id]: "" })); await carregarDados();
  }
  async function marcarComoAtrasado(id: string) { const { error } = await supabase.from("promissorias").update({ status: "atrasado" }).eq("id", id); if (error) setErro(error.message); else await carregarDados(); }

  async function gerarArquivo(item: Promissoria, cliente: Cliente) {
    const ips = itensPorPromissoria.get(item.id) || [];
    const itensPdf = ips.map((ip) => {
      const p = produtoPorId.get(ip.produto_id);
      const v = ip.variacao_id ? variacaoPorId.get(ip.variacao_id) : undefined;
      return {
        nome: p?.nome || "Produto",
        detalhe: [v?.tamanho, v?.cor].filter(Boolean).join(" · "),
        quantidade: ip.quantidade,
        precoUnitario: Number(ip.preco_unitario || 0),
        precoOriginal: Number(ip.preco_original || 0) || Number(ip.preco_unitario || 0),
        descontoValor: Number(ip.desconto_valor || 0),
        descontoPercentual: Number(ip.desconto_percentual || 0),
      };
    });
    const subtotalProdutos = itensPdf.reduce(
      (total, ip) => total + Number(ip.precoOriginal || 0) * ip.quantidade,
      0
    );
    const descontoProdutos = itensPdf.reduce(
      (total, ip) => total + Number(ip.descontoValor || 0) * ip.quantidade,
      0
    );
    const recebimentos = (pagamentosPorPromissoria.get(item.id) || [])
      .map((pagamento) => ({
        data: pagamento.data,
        tipo: pagamento.tipo === "entrada" ? "entrada" as const : "parcela" as const,
        forma: rotuloFormaPagamento(pagamento.forma_pagamento),
        valor: Number(pagamento.valor || 0),
      }));
    const primeira = item.data_primeira_parcela || item.data_vencimento || "";
    const saldoInicialParcelas = Math.max(0, Number(item.valor_total || 0) - Number(item.entrada_valor || 0));
    const cronograma = gerarCronogramaPromissoria(saldoInicialParcelas, Number(item.parcelas || 1), primeira);
    const pago = pagoPorProm[item.id] || 0;
    const { pdf } = await import("@react-pdf/renderer");
    const doc = <PromissoriaAcordoPdf loja={nomeLoja} cliente={cliente.nome} cpf={cliente.cpf} emissao={item.created_at.slice(0,10)} itens={itensPdf} subtotalProdutos={subtotalProdutos || undefined} descontoProdutos={descontoProdutos} valorProdutos={Number(item.valor_produtos || 0) || Math.max(0, Number(item.valor_total)-Number(item.acrescimo_valor || 0))} acrescimoValor={Number(item.acrescimo_valor || 0)} acrescimoPercentual={Number(item.acrescimo_percentual || 0)} entrada={Number(item.entrada_valor || 0)} valorTotal={Number(item.valor_total || 0)} totalPago={pago} saldoAtual={saldoDe(item)} parcelas={cronograma} recebimentos={recebimentos} observacao={item.observacao} />;
    return { blob: await pdf(doc).toBlob(), nome: `promissoria-${slug(cliente.nome) || item.id}.pdf`, primeira };
  }
  async function baixar(item: Promissoria, cliente?: Cliente) {
    if (!cliente) return setErro("Cliente não localizado."); setBaixandoPdf(item.id);
    try { const a = await gerarArquivo(item, cliente); const url=URL.createObjectURL(a.blob); const l=document.createElement("a"); l.href=url; l.download=a.nome; document.body.appendChild(l); l.click(); l.remove(); URL.revokeObjectURL(url); } catch { setErro("Não foi possível gerar o PDF."); } finally { setBaixandoPdf(null); }
  }
  async function whatsapp(item: Promissoria, cliente?: Cliente) {
    if (!cliente?.telefone) return setErro("Cadastre o telefone do cliente para abrir o WhatsApp."); setBaixandoPdf(item.id);
    try { const a=await gerarArquivo(item,cliente); await compartilharPdfWhatsApp({ blob:a.blob,nomeArquivo:a.nome,telefone:cliente.telefone,mensagem:`Olá, ${cliente.nome}! Segue o acordo atualizado da ${nomeLoja || "loja"}. Saldo atual: ${formatCurrency(saldoDe(item))}. Próximo vencimento: ${formatarData(a.primeira)}.` }); } catch (e) { if (!(e instanceof DOMException && e.name === "AbortError")) setErro("Não foi possível compartilhar o PDF."); } finally { setBaixandoPdf(null); }
  }

  return <section className="space-y-6">
    <PageHeader eyebrow="Financeiro e crédito" title="Promissórias" description="Vários produtos, desconto individual, entrada, parcelas, recebimentos e estoque em um único fluxo." />
    {erro && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div>}

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[ ["Em aberto", String(promissorias.filter((p)=>!["pago","cancelado"].includes(p.status)).length)], ["Financiado", formatCurrency(totalFinanciado)], ["Total recebido", formatCurrency(totalPago)], ["Saldo em aberto", formatCurrency(totalAberto)] ].map(([l,v]) => <div key={l} className="rounded-[28px] border border-[#e8ecf4] bg-white p-5"><p className="text-sm font-bold text-[#64748b]">{l}</p><p className="mt-3 text-2xl font-black text-[#0f172a]">{v}</p></div>)}
    </div>

    <div className="grid gap-6 xl:grid-cols-[440px_1fr]">
      <div ref={formRef} className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
        <div className="flex items-center justify-between"><h2 className="text-xl font-black text-[#0f172a]">{editandoId ? "Editar promissória" : "Nova promissória"}</h2>{editandoId && <button onClick={limparFormulario} className="rounded-xl border p-2"><X size={16}/></button>}</div>
        <div className="mt-5 space-y-4">
          <label className="block text-sm text-[#475569]">Cliente<select value={clienteId} onChange={(e)=>setClienteId(e.target.value)} className="mt-2 w-full rounded-2xl border bg-[#f8fafc] px-4 py-3"><option value="">Selecione</option>{clientes.map((c)=><option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
          <div>
            <label htmlFor="busca-produto-promissoria" className="block text-sm text-[#475569]">
              Adicionar produtos
            </label>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-[#94a3b8]" />
              <input
                id="busca-produto-promissoria"
                value={buscaProduto}
                onFocus={() => setBuscaProdutoAberta(true)}
                onBlur={() => setBuscaProdutoAberta(false)}
                onChange={(e) => { setBuscaProduto(e.target.value); setBuscaProdutoAberta(true); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && opcoesProdutosFiltradas[0]) {
                    e.preventDefault();
                    adicionarProduto(opcoesProdutosFiltradas[0]);
                  }
                }}
                placeholder="Digite nome, marca, tamanho ou cor"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={buscaProdutoAberta}
                aria-controls="opcoes-produtos-promissoria"
                className="w-full rounded-2xl border bg-[#f8fafc] py-3 pl-11 pr-4 text-sm outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-blue-100"
              />
              {buscaProdutoAberta && (
                <div id="opcoes-produtos-promissoria" role="listbox" className="absolute z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-[#dbe4f0] bg-white p-2 shadow-xl">
                  {opcoesProdutosFiltradas.length ? opcoesProdutosFiltradas.map((opcao) => (
                    <button
                      key={opcao.key}
                      type="button"
                      role="option"
                      aria-selected="false"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => adicionarProduto(opcao)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-blue-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-[#0f172a]">{opcao.nome}</span>
                        <span className="block truncate text-xs text-[#64748b]">{opcao.detalhe} · estoque {opcao.estoque}</span>
                      </span>
                      <span className="shrink-0 text-sm font-black text-[#2563eb]">{formatCurrency(opcao.preco)}</span>
                    </button>
                  )) : <p className="px-3 py-4 text-center text-sm text-[#64748b]">Nenhum produto disponível encontrado.</p>}
                </div>
              )}
            </div>
            <p className="mt-2 text-xs text-[#64748b]">Pesquise e adicione quantos produtos precisar. Cada um terá seu próprio valor e desconto.</p>
          </div>

          {itensCalculados.map(({ item: selecionado, calculo }) => (
            <div key={selecionado.key} className="rounded-2xl border border-[#dbe4f0] bg-[#f8fafc] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[#0f172a]">{selecionado.nome}</p>
                  <p className="mt-0.5 truncate text-xs text-[#64748b]">{selecionado.detalhe} · disponível {selecionado.estoqueDisponivel}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setItensSelecionados((atuais) => atuais.filter((item) => item.key !== selecionado.key))}
                  aria-label={`Remover ${selecionado.nome}`}
                  className="rounded-xl border border-red-100 bg-white p-2 text-red-600 transition hover:bg-red-50"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-[#475569]">Quantidade
                  <input type="number" min="1" max={selecionado.estoqueDisponivel} step="1" value={selecionado.quantidade} onChange={(e)=>atualizarItem(selecionado.key,"quantidade",e.target.value)} className="mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5"/>
                </label>
                <label className="text-xs font-semibold text-[#475569]">Valor unitário
                  <input type="number" min="0.01" step="0.01" value={selecionado.precoOriginal} onChange={(e)=>atualizarItem(selecionado.key,"precoOriginal",e.target.value)} className="mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5"/>
                </label>
                <label className="text-xs font-semibold text-[#475569]">Tipo de desconto
                  <select value={selecionado.descontoTipo} onChange={(e)=>atualizarItem(selecionado.key,"descontoTipo",e.target.value)} className="mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5">
                    <option value="valor">Desconto unitário em R$</option>
                    <option value="percentual">Desconto em %</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-[#475569]">Desconto
                  <input type="number" min="0" max={selecionado.descontoTipo === "percentual" ? 100 : Number(selecionado.precoOriginal || 0)} step="0.01" value={selecionado.descontoInput} onChange={(e)=>atualizarItem(selecionado.key,"descontoInput",e.target.value)} className="mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5"/>
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#e2e8f0] pt-3 text-xs">
                <span className="text-[#64748b]">Bruto {formatCurrency(calculo.subtotalBruto)} · desconto {formatCurrency(calculo.descontoTotal)}</span>
                <strong className="text-sm text-[#0f172a]">Total {formatCurrency(calculo.total)}</strong>
              </div>
            </div>
          ))}

          {itensSelecionados.length === 0 && <label className="block text-sm text-[#475569]">Valor base da dívida sem produto
            <input type="number" min="0.01" step="0.01" value={valorBaseManual} onChange={(e)=>setValorBaseManual(e.target.value)} className="mt-2 w-full rounded-2xl border bg-[#f8fafc] px-4 py-3" placeholder="Ex.: 350"/>
          </label>}
          <div className="grid grid-cols-[140px_1fr] gap-3"><select value={acrescimoTipo} onChange={(e)=>setAcrescimoTipo(e.target.value as "percentual"|"valor")} className="rounded-2xl border bg-[#f8fafc] px-3 py-3"><option value="valor">Juros em R$</option><option value="percentual">Juros em %</option></select><input type="number" step="0.01" min="0" value={acrescimoInput} onChange={(e)=>setAcrescimoInput(e.target.value)} className="rounded-2xl border bg-[#f8fafc] px-4 py-3"/></div>
          <div><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm text-[#475569]">Entrada<input type="number" step="0.01" min="0" value={entrada} onChange={(e)=>setEntrada(e.target.value)} className="mt-2 w-full rounded-2xl border bg-[#f8fafc] px-4 py-3"/></label><label className="text-sm text-[#475569]">Forma da entrada<select value={entradaForma} onChange={(e)=>setEntradaForma(e.target.value)} disabled={entradaNumero<=0} className="mt-2 w-full rounded-2xl border bg-[#f8fafc] px-4 py-3 disabled:opacity-50"><option value="pix">Pix</option><option value="dinheiro">Dinheiro</option><option value="cartao">Cartão</option></select></label></div>{entradaNumero > 0 ? <p className="mt-2 text-xs text-[#64748b]">{entradaEditando ? `A entrada permanece no caixa da data original: ${formatarData(entradaEditando.data)}.` : "A entrada será registrada como recebimento de hoje e entrará no caixa e no mês atual."}</p> : null}</div>
          <div className="grid grid-cols-2 gap-3"><label className="text-sm text-[#475569]">Parcelas<input type="number" min="1" value={parcelas} onChange={(e)=>setParcelas(e.target.value)} className="mt-2 w-full rounded-2xl border bg-[#f8fafc] px-4 py-3"/></label><label className="text-sm text-[#475569]">Primeiro vencimento<input type="date" value={dataVencimento} onChange={(e)=>setDataVencimento(e.target.value)} className="mt-2 w-full rounded-2xl border bg-[#f8fafc] px-4 py-3"/></label></div>
          <label className="block text-sm text-[#475569]">Observação<textarea value={observacao} onChange={(e)=>setObservacao(e.target.value)} className="mt-2 min-h-20 w-full rounded-2xl border bg-[#f8fafc] px-4 py-3"/></label>
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm">{itensSelecionados.length > 0 ? <><div className="flex justify-between"><span>Subtotal dos produtos</span><b>{formatCurrency(totaisItens.subtotalBruto)}</b></div><div className="mt-1 flex justify-between text-green-700"><span>Descontos individuais</span><b>- {formatCurrency(totaisItens.descontoTotal)}</b></div><div className="mt-1 flex justify-between"><span>Produtos após descontos</span><b>{formatCurrency(base)}</b></div></> : <div className="flex justify-between"><span>Valor/base</span><b>{formatCurrency(base)}</b></div>}<div className="mt-1 flex justify-between"><span>Juros ({acrescimoPct.toFixed(2)}%)</span><b>+ {formatCurrency(acrescimoValor)}</b></div><div className="mt-1 flex justify-between"><span>Total do acordo</span><b>{formatCurrency(totalAcordo)}</b></div><div className="mt-1 flex justify-between"><span>Entrada recebida {entradaEditando ? `em ${formatarData(entradaEditando.data)}` : "hoje"}</span><b>- {formatCurrency(entradaNumero)}</b></div><div className="mt-2 flex justify-between border-t border-blue-200 pt-2 text-base"><strong>Saldo parcelado</strong><strong>{formatCurrency(saldoParcelado)}</strong></div><div className="mt-1 flex justify-between"><span>{parcelasNumero} parcela(s)</span><b>{formatCurrency(parcelaSugerida)}</b></div><p className="mt-2 text-xs text-[#64748b]">{regraMensagem || "Condição válida."}</p></div>
        </div>
        <button onClick={salvarPromissoria} disabled={salvando} className="mt-5 w-full rounded-2xl bg-[#2563eb] px-4 py-3 font-bold text-white disabled:opacity-60">{salvando ? "Salvando..." : editandoId ? "Salvar alterações" : "Criar promissória"}</button>
      </div>

      <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-black">Promissórias registradas</h2><div className="flex gap-1">{[["todos","Todas"],["em_aberto","Abertas"],["pago","Pagas"],["atrasado","Atrasadas"]].map(([v,l])=><button key={v} onClick={()=>setFiltroStatus(v)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${filtroStatus===v?"bg-[#2563eb] text-white":"border"}`}>{l}</button>)}</div></div>
        {loading ? <p className="mt-5 text-[#64748b]">Carregando...</p> : (
          <div className="mt-5 space-y-4">
            {promissoriasFiltradas.map((item) => {
              const cliente = clientePorId.get(item.cliente_id);
              const ips = itensPorPromissoria.get(item.id) || [];
              const recebimentos = pagamentosPorPromissoria.get(item.id) || [];
              const pago = pagoPorProm[item.id] || 0;
              const saldo = saldoDe(item);
              const mensal = calcularParcelaSugerida(
                Math.max(0, Number(item.valor_total) - Number(item.entrada_valor || 0)),
                item.parcelas
              );
              return (
                <div key={item.id} className="rounded-[24px] border bg-[#f8fafc]/80 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:justify-between">
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <b>{cliente?.nome || "Cliente"}</b>
                        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${obterCorStatus(item.status)}`}>{item.status}</span>
                      </div>

                      {ips.length > 0 ? (
                        <div className="space-y-2">
                          {ips.map((ip) => {
                            const produto = produtoPorId.get(ip.produto_id);
                            const variacao = ip.variacao_id ? variacaoPorId.get(ip.variacao_id) : undefined;
                            const precoOriginal = Number(ip.preco_original || 0) || Number(ip.preco_unitario || 0);
                            const descontoTotal = Number(ip.desconto_valor || 0) * Number(ip.quantidade || 0);
                            return (
                              <div key={ip.id} className="rounded-xl border border-[#e2e8f0] bg-white px-3 py-2.5">
                                <p className="text-sm font-bold text-[#334155]">
                                  {ip.quantidade}x {produto?.nome || "Produto"}{variacao ? ` · ${[variacao.tamanho, variacao.cor].filter(Boolean).join(" · ")}` : ""}
                                </p>
                                <p className="mt-1 text-xs text-[#64748b]">
                                  Valor {formatCurrency(precoOriginal)} · desconto {formatCurrency(descontoTotal)} · total {formatCurrency(Number(ip.preco_unitario || 0) * Number(ip.quantidade || 0))}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      ) : <p className="text-sm text-[#64748b]">Sem produto vinculado</p>}

                      <p className="text-sm text-[#64748b]">Produtos após descontos {formatCurrency(Number(item.valor_produtos || 0) || Math.max(0, Number(item.valor_total) - Number(item.acrescimo_valor || 0)))} · juros {formatCurrency(Number(item.acrescimo_valor || 0))} ({Number(item.acrescimo_percentual || 0).toFixed(2)}%) · total {formatCurrency(Number(item.valor_total || 0))}</p>
                      <p className="text-sm text-[#64748b]">Entrada {formatCurrency(Number(item.entrada_valor || 0))} · {item.parcelas}x de {formatCurrency(mensal)} · primeira {formatarData(item.data_primeira_parcela || item.data_vencimento)}</p>
                      <p className="text-sm"><span className="font-semibold text-green-700">Recebido {formatCurrency(pago)}</span> · <span className="font-semibold text-amber-700">Saldo {formatCurrency(saldo)}</span></p>

                      {recebimentos.length > 0 && (
                        <details className="rounded-xl border border-[#e2e8f0] bg-white px-3 py-2.5">
                          <summary className="cursor-pointer text-sm font-bold text-[#334155]">Histórico de recebimentos ({recebimentos.length})</summary>
                          <div className="mt-2 divide-y divide-[#eef2f7]">
                            {recebimentos.map((recebimento) => (
                              <div key={recebimento.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                                <span className="text-[#64748b]">{recebimento.tipo === "entrada" ? "Entrada" : "Parcela recebida"} · {formatarData(recebimento.data)} · {rotuloFormaPagamento(recebimento.forma_pagamento)}</span>
                                <strong className="text-green-700">{formatCurrency(Number(recebimento.valor || 0))}</strong>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                      {item.observacao && <p className="text-sm text-[#64748b]">{item.observacao}</p>}
                    </div>

                    <div className="flex w-full flex-col gap-2 lg:w-[250px] lg:shrink-0">
                      <div className="flex gap-2">
                        {!['pago','cancelado'].includes(item.status) && <button type="button" onClick={()=>editar(item)} className="flex flex-1 items-center justify-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-semibold"><Pencil size={15}/>Editar</button>}
                        <button type="button" onClick={()=>baixar(item,cliente)} disabled={baixandoPdf===item.id} aria-label="Baixar PDF" className="rounded-xl border bg-white p-2.5 disabled:opacity-50"><Download size={16}/></button>
                        <button type="button" onClick={()=>whatsapp(item,cliente)} disabled={baixandoPdf===item.id} aria-label="Compartilhar no WhatsApp" className="rounded-xl border bg-white p-2.5 disabled:opacity-50"><MessageCircle size={16}/></button>
                      </div>
                      {saldo > 0 && (
                        <>
                          <div className="grid gap-2 sm:grid-cols-[1fr_120px] lg:grid-cols-1">
                            <input type="number" min="0.01" max={saldo} step="0.01" value={valorPagamento[item.id] || ""} onChange={(e)=>setValorPagamento((atual)=>({...atual,[item.id]:e.target.value}))} placeholder={`Receber até ${formatCurrency(saldo)}`} className="min-w-0 rounded-xl border bg-white px-3 py-2 text-sm"/>
                            <select value={formaPagamento[item.id] || "pix"} onChange={(e)=>setFormaPagamento((atual)=>({...atual,[item.id]:e.target.value}))} aria-label="Forma do recebimento" className="rounded-xl border bg-white px-3 py-2 text-sm"><option value="pix">Pix</option><option value="dinheiro">Dinheiro</option><option value="cartao">Cartão</option></select>
                          </div>
                          <p className="text-xs text-[#64748b]">O recebimento entra automaticamente no caixa de hoje e no mês correspondente.</p>
                          <button type="button" onClick={()=>registrarPagamento(item)} disabled={pagando} className="rounded-xl bg-green-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-60">Registrar pagamento</button>
                          {item.status!=="atrasado" && <button type="button" onClick={()=>marcarComoAtrasado(item.id)} className="rounded-xl border border-amber-300 px-3 py-2 text-sm font-semibold text-amber-800">Marcar atrasado</button>}
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
  </section>;
}
