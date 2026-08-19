"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Trash2, Plus } from "lucide-react";
import { primeiroErro, validarTaxaPercentual, validarTaxaFixa } from "@/lib/validacoes";

type Taxa = {
  id: string;
  operadora: string | null;
  tipo: string;
  bandeira: string | null;
  parcelas_min: number;
  parcelas_max: number;
  taxa_percentual: number;
  taxa_fixa: number;
  permite_ajuste_manual_pdv: boolean;
  ativo: boolean;
};

const inputClass =
  "w-full rounded-xl border border-[#e8ecf4] bg-[#f8fafc] px-3 py-2 text-sm text-[#0f172a] outline-none focus:border-[#2563eb] focus:bg-white";

export function TaxasCartaoSection() {
  const [taxas, setTaxas] = useState<Taxa[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [operadora, setOperadora] = useState("");
  const [tipo, setTipo] = useState("credito");
  const [bandeira, setBandeira] = useState("");
  const [parcelasMin, setParcelasMin] = useState("1");
  const [parcelasMax, setParcelasMax] = useState("1");
  const [taxaPct, setTaxaPct] = useState("");
  const [taxaFixa, setTaxaFixa] = useState("0");
  const [ajusteManual, setAjusteManual] = useState(true);

  async function carregar() {
    setLoading(true);
    const { data, error } = await supabase
      .from("taxas_cartao")
      .select(
        "id, operadora, tipo, bandeira, parcelas_min, parcelas_max, taxa_percentual, taxa_fixa, permite_ajuste_manual_pdv, ativo"
      )
      .order("tipo", { ascending: true })
      .order("parcelas_min", { ascending: true });
    if (error) setErro(error.message);
    else setTaxas((data as Taxa[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  async function adicionar() {
    setErro("");
    const min = Math.max(1, Math.round(Number(parcelasMin) || 1));
    const max = Math.max(min, Math.round(Number(parcelasMax) || min));
    const pct = Number(taxaPct);
    const fixa = Number(taxaFixa) || 0;

    const erro = primeiroErro(
      validarTaxaPercentual(taxaPct, "a taxa (%)"),
      validarTaxaFixa(taxaFixa, false)
    );
    if (erro) {
      setErro(erro);
      return;
    }

    setSalvando(true);
    const { error } = await supabase.from("taxas_cartao").insert({
      operadora: operadora.trim() || null,
      tipo,
      bandeira: bandeira.trim() || null,
      parcelas_min: min,
      parcelas_max: max,
      taxa_percentual: pct,
      taxa_fixa: fixa,
      permite_ajuste_manual_pdv: ajusteManual,
      ativo: true,
    });
    if (error) {
      setErro(error.message);
      setSalvando(false);
      return;
    }
    setOperadora("");
    setBandeira("");
    setTaxaPct("");
    setTaxaFixa("0");
    setParcelasMin("1");
    setParcelasMax("1");
    await carregar();
    setSalvando(false);
  }

  async function alternarAtivo(t: Taxa) {
    const { error } = await supabase
      .from("taxas_cartao")
      .update({ ativo: !t.ativo })
      .eq("id", t.id);
    if (error) setErro(error.message);
    else await carregar();
  }

  async function excluir(id: string) {
    if (!window.confirm("Excluir esta regra de taxa?")) return;
    const { error } = await supabase.from("taxas_cartao").delete().eq("id", id);
    if (error) setErro(error.message);
    else await carregar();
  }

  return (
    <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
      <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
        Taxas de cartão
      </h2>
      <p className="mt-1 text-sm text-[#64748b]">
        Cadastre as taxas da maquininha por tipo, bandeira e faixa de parcelas. A
        venda congela a taxa aplicada — mudar aqui não altera vendas antigas.
      </p>

      {erro && (
        <div className="mt-4 rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-3 text-sm text-[#b91c1c]">
          {erro}
        </div>
      )}

      {/* Form de nova regra */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-[#475569]">
            Operadora
          </label>
          <input
            value={operadora}
            onChange={(e) => setOperadora(e.target.value)}
            placeholder="Ex: Stone"
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[#475569]">
            Tipo
          </label>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className={inputClass}
          >
            <option value="credito">Crédito</option>
            <option value="debito">Débito</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[#475569]">
            Bandeira (opcional)
          </label>
          <input
            value={bandeira}
            onChange={(e) => setBandeira(e.target.value)}
            placeholder="Todas"
            className={inputClass}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#475569]">
              Parc. mín.
            </label>
            <input
              type="number"
              min="1"
              value={parcelasMin}
              onChange={(e) => setParcelasMin(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[#475569]">
              Parc. máx.
            </label>
            <input
              type="number"
              min="1"
              value={parcelasMax}
              onChange={(e) => setParcelasMax(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[#475569]">
            Taxa (%)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={taxaPct}
            onChange={(e) => setTaxaPct(e.target.value)}
            placeholder="Ex: 4.5"
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-[#475569]">
            Taxa fixa (R$)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={taxaFixa}
            onChange={(e) => setTaxaFixa(e.target.value)}
            className={inputClass}
          />
        </div>
        <label className="flex items-center gap-2 self-end pb-2">
          <input
            type="checkbox"
            checked={ajusteManual}
            onChange={(e) => setAjusteManual(e.target.checked)}
            className="h-4 w-4 accent-[#2563eb]"
          />
          <span className="text-xs font-semibold text-[#475569]">
            Permite ajuste manual no PDV
          </span>
        </label>
        <button
          type="button"
          onClick={adicionar}
          disabled={salvando}
          className="inline-flex items-center justify-center gap-2 self-end rounded-xl bg-[#2563eb] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          {salvando ? "..." : "Adicionar"}
        </button>
      </div>

      {/* Lista */}
      <div className="mt-6">
        {loading ? (
          <p className="text-sm text-[#64748b]">Carregando taxas...</p>
        ) : taxas.length === 0 ? (
          <p className="text-sm text-[#94a3b8]">
            Nenhuma taxa cadastrada. Sem regra, o PDV usa a taxa digitada
            manualmente.
          </p>
        ) : (
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-[#94a3b8]">
                  <th className="px-2 pb-2">Operadora</th>
                  <th className="px-2 pb-2">Tipo</th>
                  <th className="px-2 pb-2">Bandeira</th>
                  <th className="px-2 pb-2">Parcelas</th>
                  <th className="px-2 pb-2">Taxa</th>
                  <th className="px-2 pb-2">Ajuste PDV</th>
                  <th className="px-2 pb-2">Status</th>
                  <th className="px-2 pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {taxas.map((t) => (
                  <tr key={t.id} className="border-t border-[#f1f5f9] text-sm">
                    <td className="px-2 py-2.5 font-semibold text-[#0f172a]">
                      {t.operadora || "—"}
                    </td>
                    <td className="px-2 py-2.5 capitalize text-[#475569]">
                      {t.tipo}
                    </td>
                    <td className="px-2 py-2.5 text-[#475569]">
                      {t.bandeira || "Todas"}
                    </td>
                    <td className="px-2 py-2.5 text-[#475569]">
                      {t.parcelas_min === t.parcelas_max
                        ? `${t.parcelas_min}x`
                        : `${t.parcelas_min}–${t.parcelas_max}x`}
                    </td>
                    <td className="px-2 py-2.5 text-[#475569]">
                      {Number(t.taxa_percentual)}%
                      {Number(t.taxa_fixa) > 0
                        ? ` + R$ ${Number(t.taxa_fixa).toFixed(2)}`
                        : ""}
                    </td>
                    <td className="px-2 py-2.5 text-[#475569]">
                      {t.permite_ajuste_manual_pdv ? "Sim" : "Não"}
                    </td>
                    <td className="px-2 py-2.5">
                      <button
                        type="button"
                        onClick={() => alternarAtivo(t)}
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                          t.ativo
                            ? "bg-[#f0fdf4] text-[#15803d]"
                            : "bg-[#f1f5f9] text-[#64748b]"
                        }`}
                      >
                        {t.ativo ? "Ativa" : "Inativa"}
                      </button>
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => excluir(t.id)}
                        aria-label="Excluir taxa"
                        className="rounded-lg border border-[#fecaca] bg-[#fef2f2] p-1.5 text-[#dc2626] transition hover:bg-[#fee2e2]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
