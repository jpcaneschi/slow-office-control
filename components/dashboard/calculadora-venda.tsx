"use client";

import { useId, useState } from "react";
import { formatCurrency } from "@/lib/vendas-utils";

export function CalculadoraVenda({ total }: { total: number }) {
  const id = useId();
  const [primeiro, setPrimeiro] = useState("");
  const [segundo, setSegundo] = useState("");
  const [operacao, setOperacao] = useState("+");
  const a = primeiro === "" ? total : Number(primeiro);
  const b = Number(segundo || 0);
  const resultado = operacao === "+" ? a + b : operacao === "-" ? a - b : operacao === "×" ? a * b : b === 0 ? null : a / b;
  const inputCls = "min-w-0 w-full rounded-xl border border-[#e8ecf4] bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200";
  return (
    <details className="rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] p-3">
      <summary className="cursor-pointer text-sm font-semibold text-[#475569]">Calculadora de apoio</summary>
      <p className="mt-2 text-xs text-[#64748b]">Confira somas, parcelas ou troco. O resultado não altera a venda.</p>
      <div className="mt-3 grid grid-cols-[1fr_64px_1fr] gap-2">
        <label htmlFor={`${id}-a`} className="sr-only">Primeiro valor</label>
        <input id={`${id}-a`} type="number" step="any" value={primeiro} placeholder={String(total)} onChange={(e) => setPrimeiro(e.target.value)} className={inputCls} />
        <select aria-label="Operação" value={operacao} onChange={(e) => setOperacao(e.target.value)} className={inputCls}>
          {["+", "-", "×", "÷"].map((op) => <option key={op}>{op}</option>)}
        </select>
        <label htmlFor={`${id}-b`} className="sr-only">Segundo valor</label>
        <input id={`${id}-b`} type="number" step="any" value={segundo} placeholder="0" onChange={(e) => setSegundo(e.target.value)} className={inputCls} />
      </div>
      <output aria-live="polite" className="mt-3 block text-right text-lg font-bold tabular-nums text-[#0f172a]">{resultado === null ? "Informe um divisor diferente de zero" : formatCurrency(resultado)}</output>
    </details>
  );
}
