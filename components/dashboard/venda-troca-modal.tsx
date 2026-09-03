"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Loader2, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { QuickSearchSelect } from "@/components/dashboard/quick-search-select";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/vendas-utils";
import { calcularTotaisTroca } from "@/lib/vendas-relatorio";
import { rotuloVariacao, type Atributos } from "@/lib/variacoes-utils";

export type ItemAtualTroca = {
  id: string;
  produto_id: string;
  variacao_id: string | null;
  produto: string;
  variacao: string;
  quantidade: number;
  preco_unitario: number;
};

type ProdutoTroca = {
  id: string;
  nome: string;
  marca: string | null;
  categoria: string | null;
  preco: number;
  estoque: number;
  tem_variacoes: boolean;
};

type VariacaoTroca = {
  id: string;
  produto_id: string;
  atributos: Atributos | null;
  tamanho: string | null;
  cor: string | null;
  preco: number | null;
  estoque: number;
  sku: string | null;
  codigo_barras: string | null;
};

type NovoItem = {
  produto_id: string;
  variacao_id: string | null;
  produto: string;
  variacao: string;
  quantidade: number;
  preco_unitario: number;
  estoque: number;
};

function novaChaveIdempotencia(vendaId: string) {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `troca-${vendaId}-${Date.now()}`;
}

export function VendaTrocaModal({
  aberto,
  vendaId,
  itens,
  onFechar,
  onConcluida,
}: {
  aberto: boolean;
  vendaId: string;
  itens: ItemAtualTroca[];
  onFechar: () => void;
  onConcluida: () => Promise<void> | void;
}) {
  const [produtos, setProdutos] = useState<ProdutoTroca[]>([]);
  const [variacoes, setVariacoes] = useState<VariacaoTroca[]>([]);
  const [qtdDevolucao, setQtdDevolucao] = useState<Record<string, string>>({});
  const [produtoId, setProdutoId] = useState("");
  const [variacaoId, setVariacaoId] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [novosItens, setNovosItens] = useState<NovoItem[]>([]);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");

  useEffect(() => {
    if (!aberto) return;

    setQtdDevolucao({});
    setProdutoId("");
    setVariacaoId("");
    setQuantidade("1");
    setNovosItens([]);
    setMotivo("");
    setErro("");
    setIdempotencyKey(novaChaveIdempotencia(vendaId));
    setLoading(true);

    let ativo = true;
    async function carregarCatalogo() {
      const [produtosRes, variacoesRes] = await Promise.all([
        supabase
          .from("produtos")
          .select("id, nome, marca, categoria, preco, estoque, tem_variacoes")
          .eq("status", "ativo")
          .order("nome"),
        supabase
          .from("produto_variacoes")
          .select(
            "id, produto_id, atributos, tamanho, cor, preco, estoque, sku, codigo_barras"
          )
          .eq("status", "ativo"),
      ]);

      if (!ativo) return;
      if (produtosRes.error || variacoesRes.error) {
        setErro(
          produtosRes.error?.message ||
            variacoesRes.error?.message ||
            "Não foi possível carregar o catálogo."
        );
      } else {
        setProdutos((produtosRes.data as ProdutoTroca[] | null) || []);
        setVariacoes((variacoesRes.data as VariacaoTroca[] | null) || []);
      }
      setLoading(false);
    }

    carregarCatalogo();
    return () => {
      ativo = false;
    };
  }, [aberto, vendaId]);

  useEffect(() => {
    if (!aberto) return;
    function fecharComEsc(event: KeyboardEvent) {
      if (event.key === "Escape" && !salvando) onFechar();
    }
    document.addEventListener("keydown", fecharComEsc);
    return () => document.removeEventListener("keydown", fecharComEsc);
  }, [aberto, onFechar, salvando]);

  const variacoesPorProduto = useMemo(() => {
    const mapa = new Map<string, VariacaoTroca[]>();
    for (const variacao of variacoes) {
      const lista = mapa.get(variacao.produto_id) || [];
      lista.push(variacao);
      mapa.set(variacao.produto_id, lista);
    }
    return mapa;
  }, [variacoes]);

  const opcoesProdutos = useMemo(
    () =>
      produtos.map((produto) => {
        const grade = variacoesPorProduto.get(produto.id) || [];
        const estoque = produto.tem_variacoes
          ? grade.reduce((total, variacao) => total + Number(variacao.estoque || 0), 0)
          : Number(produto.estoque || 0);
        return {
          value: produto.id,
          label: produto.nome,
          description: [
            produto.marca,
            produto.categoria,
            `estoque ${estoque}`,
            formatCurrency(Number(produto.preco || 0)),
          ]
            .filter(Boolean)
            .join(" · "),
          searchText: grade
            .flatMap((variacao) => [
              variacao.sku,
              variacao.codigo_barras,
              rotuloVariacao(variacao.atributos, variacao),
            ])
            .filter(Boolean)
            .join(" "),
          disabled: estoque <= 0,
        };
      }),
    [produtos, variacoesPorProduto]
  );

  const produtoSelecionado = produtos.find((produto) => produto.id === produtoId);
  const gradeSelecionada = variacoesPorProduto.get(produtoId) || [];
  const variacaoSelecionada = gradeSelecionada.find(
    (variacao) => variacao.id === variacaoId
  );
  const opcoesVariacoes = gradeSelecionada.map((variacao) => ({
    value: variacao.id,
    label: rotuloVariacao(variacao.atributos, variacao),
    description: `Estoque ${Number(variacao.estoque || 0)} · ${formatCurrency(
      Number(variacao.preco ?? produtoSelecionado?.preco ?? 0)
    )}`,
    searchText: [variacao.sku, variacao.codigo_barras].filter(Boolean).join(" "),
    disabled: Number(variacao.estoque || 0) <= 0,
  }));

  const itensDevolvidos = itens
    .map((item) => ({
      ...item,
      quantidade: Math.max(0, Number(qtdDevolucao[item.id] || 0)),
    }))
    .filter((item) => item.quantidade > 0);
  const totais = calcularTotaisTroca(itensDevolvidos, novosItens);

  function adicionarNovoItem() {
    setErro("");
    if (!produtoSelecionado) {
      setErro("Escolha o produto que entrará na troca.");
      return;
    }
    if (produtoSelecionado.tem_variacoes && !variacaoSelecionada) {
      setErro("Escolha o tamanho ou a variação do novo produto.");
      return;
    }

    const qtd = Math.max(0, Math.trunc(Number(quantidade || 0)));
    const estoque = produtoSelecionado.tem_variacoes
      ? Number(variacaoSelecionada?.estoque || 0)
      : Number(produtoSelecionado.estoque || 0);
    if (qtd <= 0 || qtd > estoque) {
      setErro(`Informe uma quantidade entre 1 e ${estoque}.`);
      return;
    }

    const novo: NovoItem = {
      produto_id: produtoSelecionado.id,
      variacao_id: variacaoSelecionada?.id || null,
      produto: produtoSelecionado.nome,
      variacao: variacaoSelecionada
        ? rotuloVariacao(variacaoSelecionada.atributos, variacaoSelecionada)
        : "Sem variação",
      quantidade: qtd,
      preco_unitario: Number(variacaoSelecionada?.preco ?? produtoSelecionado.preco),
      estoque,
    };

    const indice = novosItens.findIndex(
      (item) =>
        item.produto_id === novo.produto_id && item.variacao_id === novo.variacao_id
    );
    const quantidadeSomada =
      indice < 0 ? novo.quantidade : novosItens[indice].quantidade + novo.quantidade;
    if (quantidadeSomada > estoque) {
      setErro(`Há somente ${estoque} unidade(s) disponíveis nesta variação.`);
      return;
    }
    setNovosItens((atuais) =>
      indice < 0
        ? [...atuais, novo]
        : atuais.map((item, itemIndice) =>
            itemIndice === indice ? { ...item, quantidade: quantidadeSomada } : item
          )
    );
    setProdutoId("");
    setVariacaoId("");
    setQuantidade("1");
  }

  async function confirmarTroca() {
    setErro("");
    if (itensDevolvidos.length === 0) {
      setErro("Informe ao menos um item que será devolvido.");
      return;
    }
    if (novosItens.length === 0) {
      setErro("Adicione ao menos um novo produto ou tamanho.");
      return;
    }
    if (!totais.valoresCompativeis) {
      setErro(
        "A troca precisa fechar no mesmo valor. Para diferença, faça a devolução e registre uma nova venda para o financeiro permanecer correto."
      );
      return;
    }
    if (motivo.trim().length < 3) {
      setErro("Informe o motivo da troca com pelo menos 3 caracteres.");
      return;
    }

    setSalvando(true);
    const { error } = await supabase.rpc("trocar_itens_venda", {
      p_venda_id: vendaId,
      p_devolucoes: itensDevolvidos.map((item) => ({
        venda_item_id: item.id,
        quantidade: item.quantidade,
      })),
      p_novos_itens: novosItens.map((item) => ({
        produto_id: item.produto_id,
        variacao_id: item.variacao_id,
        quantidade: item.quantidade,
      })),
      p_motivo: motivo.trim(),
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      setErro(error.message);
      setSalvando(false);
      return;
    }

    await onConcluida();
    setSalvando(false);
    onFechar();
  }

  if (!aberto) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#0f172a]/55 p-0 backdrop-blur-sm sm:items-center sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-troca-venda"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !salvando) onFechar();
      }}
    >
      <div className="max-h-[94vh] w-full overflow-y-auto rounded-t-[28px] bg-white shadow-2xl sm:max-w-3xl sm:rounded-[28px]">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#e8ecf4] bg-white px-4 py-4 sm:px-6">
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#2563eb]">
              <ArrowLeftRight className="h-4 w-4" /> Troca controlada
            </p>
            <h2 id="titulo-troca-venda" className="mt-1 text-xl font-black text-[#0f172a]">
              Trocar produto ou tamanho
            </h2>
          </div>
          <button
            type="button"
            onClick={onFechar}
            disabled={salvando}
            aria-label="Fechar troca"
            className="rounded-xl border border-[#e8ecf4] p-2 text-[#64748b] transition hover:bg-[#f4f6fb] disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 p-4 sm:p-6">
          <div className="flex gap-3 rounded-2xl border border-[#bfdbfe] bg-[#eff6ff] p-4 text-sm text-[#1e3a8a]">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
            <p>
              O estoque devolvido e o novo estoque são ajustados juntos. A venda e o
              pagamento permanecem intactos, e toda troca fica registrada no histórico.
            </p>
          </div>

          <section>
            <h3 className="text-sm font-black text-[#0f172a]">1. O que voltou</h3>
            <p className="mt-1 text-xs text-[#64748b]">
              Informe a quantidade devolvida de cada item da venda.
            </p>
            <div className="mt-3 space-y-2">
              {itens
                .filter((item) => item.quantidade > 0)
                .map((item) => (
                  <div
                    key={item.id}
                    className="grid gap-3 rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] p-3 sm:grid-cols-[1fr_110px] sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[#0f172a]">
                        {item.produto}
                      </p>
                      <p className="mt-0.5 text-xs text-[#64748b]">
                        {item.variacao} · vendido {item.quantidade} · {formatCurrency(item.preco_unitario)} cada
                      </p>
                    </div>
                    <label className="text-xs font-bold text-[#64748b]">
                      Devolver
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        max={item.quantidade}
                        step="1"
                        value={qtdDevolucao[item.id] || ""}
                        onChange={(event) =>
                          setQtdDevolucao((atual) => ({
                            ...atual,
                            [item.id]: event.target.value,
                          }))
                        }
                        className="mt-1 w-full rounded-xl border border-[#dbe4f0] bg-white px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
                      />
                    </label>
                  </div>
                ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-black text-[#0f172a]">2. O que o cliente levou</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <QuickSearchSelect
                label="Novo produto"
                value={produtoId}
                options={opcoesProdutos}
                onChange={(valor) => {
                  setProdutoId(valor);
                  setVariacaoId("");
                }}
                placeholder="Busque produto, marca, tamanho ou SKU"
                emptyMessage="Nenhum produto com estoque encontrado."
              />
              {produtoSelecionado?.tem_variacoes ? (
                <QuickSearchSelect
                  label="Tamanho / variação"
                  value={variacaoId}
                  options={opcoesVariacoes}
                  onChange={setVariacaoId}
                  placeholder="Escolha o tamanho"
                  emptyMessage="Nenhuma variação disponível."
                />
              ) : (
                <label className="text-sm text-[#475569]">
                  Quantidade
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    value={quantidade}
                    onChange={(event) => setQuantidade(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none focus:border-[#2563eb]"
                  />
                </label>
              )}
            </div>
            {produtoSelecionado?.tem_variacoes ? (
              <label className="mt-3 block max-w-[180px] text-sm text-[#475569]">
                Quantidade
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={quantidade}
                  onChange={(event) => setQuantidade(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none focus:border-[#2563eb]"
                />
              </label>
            ) : null}
            <button
              type="button"
              onClick={adicionarNovoItem}
              disabled={loading}
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#2563eb] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#1d4ed8] disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Adicionar à troca
            </button>

            {novosItens.length > 0 ? (
              <div className="mt-3 space-y-2">
                {novosItens.map((item, indice) => (
                  <div
                    key={`${item.produto_id}-${item.variacao_id || "sem"}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[#0f172a]">
                        {item.produto}
                      </p>
                      <p className="mt-0.5 text-xs text-[#64748b]">
                        {item.variacao} · {item.quantidade} un. · {formatCurrency(
                          item.quantidade * item.preco_unitario
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remover ${item.produto} da troca`}
                      onClick={() =>
                        setNovosItens((atuais) =>
                          atuais.filter((_, itemIndice) => itemIndice !== indice)
                        )
                      }
                      className="rounded-xl p-2 text-[#dc2626] transition hover:bg-[#fee2e2]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] p-4">
            <div className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <p className="text-xs font-semibold text-[#64748b]">Valor devolvido</p>
                <p className="mt-1 font-black text-[#0f172a]">
                  {formatCurrency(totais.totalDevolvido)}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-[#64748b]">Valor dos novos itens</p>
                <p className="mt-1 font-black text-[#0f172a]">
                  {formatCurrency(totais.totalNovo)}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-[#64748b]">Diferença</p>
                <p
                  className={`mt-1 font-black ${
                    totais.valoresCompativeis ? "text-[#15803d]" : "text-[#b91c1c]"
                  }`}
                >
                  {formatCurrency(totais.diferenca)}
                </p>
              </div>
            </div>
            {!totais.valoresCompativeis ? (
              <p className="mt-3 text-xs font-semibold text-[#b45309]">
                Para manter caixa, comissão e formas de pagamento corretos, finalize aqui
                somente trocas sem diferença de valor.
              </p>
            ) : null}
          </section>

          <label className="block text-sm text-[#475569]">
            Motivo da troca
            <textarea
              value={motivo}
              onChange={(event) => setMotivo(event.target.value)}
              placeholder="Ex.: cliente trocou do tamanho M para G"
              className="mt-2 min-h-[88px] w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none focus:border-[#2563eb]"
            />
          </label>

          {erro ? (
            <div className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-3 text-sm font-semibold text-[#b91c1c]">
              {erro}
            </div>
          ) : null}
        </div>

        <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-[#e8ecf4] bg-white px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button
            type="button"
            onClick={onFechar}
            disabled={salvando}
            className="rounded-xl border border-[#e8ecf4] bg-white px-4 py-2.5 text-sm font-bold text-[#475569] transition hover:bg-[#f4f6fb] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmarTroca}
            disabled={salvando || loading || !totais.valoresCompativeis}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2563eb] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}
            {salvando ? "Registrando..." : "Confirmar troca"}
          </button>
        </div>
      </div>
    </div>
  );
}
