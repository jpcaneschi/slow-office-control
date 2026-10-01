"use client";

import { useId, useState } from "react";
import { supabase } from "@/lib/supabase";

type Cliente = { id: string; nome: string; cpf: string | null; telefone: string | null; email: string | null };
export function ClienteRapido({ clientes, onCriado }: { clientes: Cliente[]; onCriado: (cliente: Cliente) => void }) {
  const id = useId();
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  async function salvar() {
    setErro("");
    if (!nome.trim()) { setErro("Informe o nome do cliente."); return; }
    const digitos = telefone.replace(/\D/g, "");
    if (digitos && ![10, 11].includes(digitos.length)) { setErro("Confira o telefone com DDD: use 10 ou 11 dígitos."); return; }
    const existentes = clientes.filter((c) => (digitos && c.telefone?.replace(/\D/g, "") === digitos) || c.nome.trim().toLocaleLowerCase() === nome.trim().toLocaleLowerCase());
    if (existentes.length) { setErro("Já existe um cliente com esse nome ou telefone. Localize-o na busca acima antes de cadastrar."); return; }
    setSalvando(true);
    const { data, error } = await supabase.rpc("cadastrar_cliente_caixa", { p_nome: nome.trim(), p_telefone: digitos || null });
    setSalvando(false);
    if (error || !data?.[0]) { setErro(error?.message || "Não foi possível cadastrar o cliente."); return; }
    onCriado(data[0]); setNome(""); setTelefone("");
  }
  const cls = "mt-1 w-full rounded-xl border border-[#e8ecf4] bg-white px-3 py-2 text-sm";
  return <details className="rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] p-3">
    <summary className="cursor-pointer text-sm font-semibold text-blue-700">Cadastrar novo cliente</summary>
    <p className="mt-2 text-xs text-[#64748b]">Confira a busca primeiro. CPF e nascimento podem ser completados depois.</p>
    <label htmlFor={`${id}-nome`} className="mt-3 block text-sm">Nome<input id={`${id}-nome`} value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" className={cls} /></label>
    <label htmlFor={`${id}-telefone`} className="mt-2 block text-sm">Telefone com DDD (opcional)<input id={`${id}-telefone`} type="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} className={cls} /></label>
    {erro && <p role="alert" className="mt-2 text-xs text-red-700">{erro}</p>}
    <button type="button" onClick={salvar} disabled={salvando} className="mt-3 rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-60">{salvando ? "Cadastrando..." : "Cadastrar e selecionar"}</button>
  </details>;
}
