"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Landmark, PackagePlus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { hojeISO } from "@/lib/datas";

const inputCls =
  "w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-sm text-[#0f172a] outline-none transition focus:border-[#2563eb] focus:bg-white";

function brl(valor: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(valor || 0));
}

export function CompraFornecedorForm() {
  const [fornecedor, setFornecedor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [parcelas, setParcelas] = useState("1");
  const [primeiroVencimento, setPrimeiroVencimento] = useState(hojeISO());
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const valorNumero = Number(valor || 0);
  const qtdParcelas = Math.min(60, Math.max(1, Number(parcelas || 1)));
  const parcelaMedia = useMemo(
    () => (valorNumero > 0 ? valorNumero / qtdParcelas : 0),
    [valorNumero, qtdParcelas]
  );

  async function registrar() {
    setErro("");
    if (!fornecedor.trim()) {
      setErro("Informe a marca ou fornecedor.");
      return;
    }
    if (!Number.isFinite(valorNumero) || valorNumero <= 0) {
      setErro("Informe o valor total da compra.");
      return;
    }
    if (!primeiroVencimento) {
      setErro("Informe o primeiro vencimento.");
      return;
    }

    setSalvando(true);
    const { error } = await supabase.rpc("registrar_compra_fornecedor", {
      p_fornecedor: fornecedor.trim(),
      p_descricao: descricao.trim() || "Compra de mercadoria",
      p_valor_total: valorNumero,
      p_parcelas: qtdParcelas,
      p_primeiro_vencimento: primeiroVencimento,
      p_observacao: observacao.trim() || null,
    });
    if (error) {
      setErro(error.message);
      setSalvando(false);
      return;
    }

    // Recarrega para o resumo, a agenda e a lista de contas refletirem as novas
    // parcelas usando a mesma fonte mensal do Financeiro.
    window.location.reload();
  }

  return (
    <section className="rounded-[30px] border border-[#dbeafe] bg-gradient-to-br from-white to-[#f8fbff] p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#eff6ff] text-[#2563eb]">
            <PackagePlus className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2563eb]">
              Mercadoria / fornecedor
            </p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-[#0f172a]">
              Cadastrar compra e boletos
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[#64748b]">
              Informe o total que a loja comprou e em quantos boletos vai pagar. Cada parcela vira uma conta pendente no mês do vencimento. Nenhum valor é criado a partir do produto vendido.
            </p>
          </div>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#bfdbfe] bg-white px-3 py-1.5 text-xs font-bold text-[#1d4ed8]">
          <Landmark className="h-3.5 w-3.5" /> fornecedor = despesa
        </span>
      </div>

      {erro && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {erro}
        </div>
      )}

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <label className="mb-1.5 block text-xs font-bold text-[#64748b]">Marca / fornecedor</label>
          <input
            className={inputCls}
            value={fornecedor}
            onChange={(e) => setFornecedor(e.target.value)}
            placeholder="Ex.: Barra Oficina"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold text-[#64748b]">Referência da compra</label>
          <input
            className={inputCls}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex.: Coleção Verão / Pedido 3142"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold text-[#64748b]">Valor total dos boletos</label>
          <input
            className={inputCls}
            type="number"
            min="0"
            step="0.01"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="0,00"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold text-[#64748b]">Quantidade de boletos</label>
          <input
            className={inputCls}
            type="number"
            min="1"
            max="60"
            value={parcelas}
            onChange={(e) => setParcelas(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold text-[#64748b]">Primeiro vencimento</label>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[#94a3b8]" />
            <input
              className={`${inputCls} pl-10`}
              type="date"
              value={primeiroVencimento}
              onChange={(e) => setPrimeiroVencimento(e.target.value)}
            />
          </div>
        </div>
        <div className="md:col-span-1 xl:col-span-2">
          <label className="mb-1.5 block text-xs font-bold text-[#64748b]">Observação</label>
          <input
            className={inputCls}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Número da nota, pedido ou detalhe opcional"
          />
        </div>
        <div className="flex items-end">
          <button
            type="button"
            disabled={salvando}
            onClick={registrar}
            className="w-full rounded-2xl bg-[#0f172a] px-4 py-3 text-sm font-black text-white transition hover:bg-[#1e293b] disabled:opacity-50"
          >
            {salvando ? "Criando boletos..." : "Cadastrar compra"}
          </button>
        </div>
      </div>

      {valorNumero > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-white px-3 py-1.5 font-bold text-[#334155] shadow-sm">
            Total: {brl(valorNumero)}
          </span>
          <span className="rounded-full bg-white px-3 py-1.5 font-bold text-[#334155] shadow-sm">
            {qtdParcelas} boleto{qtdParcelas > 1 ? "s" : ""}
          </span>
          <span className="rounded-full bg-white px-3 py-1.5 font-bold text-[#334155] shadow-sm">
            ~ {brl(parcelaMedia)} por parcela
          </span>
        </div>
      )}
    </section>
  );
}
