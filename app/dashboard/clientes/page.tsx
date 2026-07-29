"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Cliente = {
  id: string;
  nome: string;
  telefone: string | null;
  cpf: string | null;
  status: string | null;
  data_nascimento: string | null;
};

const statusOptions = ["ativo", "inativo", "vip", "em atraso"];

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cpf, setCpf] = useState("");
  const [status, setStatus] = useState("ativo");
  const [dataNascimento, setDataNascimento] = useState("");

  async function carregarClientes() {
    setLoading(true);

    const { data, error } = await supabase
      .from("clientes")
      .select("id, nome, telefone, cpf, status, data_nascimento")
      .order("created_at", { ascending: false });

    if (error) {
      setErro(error.message);
    } else {
      setClientes(data || []);
      setErro("");
    }

    setLoading(false);
  }

  useEffect(() => {
    carregarClientes();
  }, []);

  function limparFormulario() {
    setNome("");
    setTelefone("");
    setCpf("");
    setStatus("ativo");
    setDataNascimento("");
    setEditandoId(null);
  }

  function editarCliente(cliente: Cliente) {
    setEditandoId(cliente.id);
    setNome(cliente.nome || "");
    setTelefone(cliente.telefone || "");
    setCpf(cliente.cpf || "");
    setStatus(cliente.status || "ativo");
    setDataNascimento(cliente.data_nascimento || "");
    setErro("");
  }

  async function excluirCliente(id: string) {
    const confirmar = window.confirm("Tem certeza que deseja excluir este cliente?");
    if (!confirmar) return;

    const { error } = await supabase.from("clientes").delete().eq("id", id);

    if (error) {
      setErro(error.message);
      return;
    }

    if (editandoId === id) {
      limparFormulario();
    }

    await carregarClientes();
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!nome.trim()) {
      setErro("O nome do cliente é obrigatório.");
      return;
    }

    setSaving(true);
    setErro("");

    if (editandoId) {
      const { error } = await supabase
        .from("clientes")
        .update({
          nome: nome.trim(),
          telefone: telefone.trim() || null,
          cpf: cpf.trim() || null,
          status,
          data_nascimento: dataNascimento || null,
        })
        .eq("id", editandoId);

      if (error) {
        setErro(error.message);
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase.from("clientes").insert({
        nome: nome.trim(),
        telefone: telefone.trim() || null,
        cpf: cpf.trim() || null,
        status,
        data_nascimento: dataNascimento || null,
      });

      if (error) {
        setErro(error.message);
        setSaving(false);
        return;
      }
    }

    limparFormulario();
    await carregarClientes();
    setSaving(false);
  }

  return (
    <main className="min-h-screen bg-[#0a0a0b] px-4 py-8 text-white">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between gap-4 rounded-3xl border border-white/10 bg-white/5 p-6">
          <div>
            <p className="mb-2 text-sm uppercase tracking-[0.25em] text-yellow-300">
              Slow Office Control
            </p>
            <h1 className="text-3xl font-semibold">Clientes</h1>
            <p className="mt-2 text-zinc-400">
              Cadastro, edição e exclusão de clientes.
            </p>
          </div>

          <Link
            href="/dashboard"
            className="rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-white hover:bg-zinc-800"
          >
            Voltar
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">
                {editandoId ? "Editar cliente" : "Novo cliente"}
              </h2>

              {editandoId && (
                <button
                  type="button"
                  onClick={limparFormulario}
                  className="rounded-2xl border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-white hover:bg-zinc-800"
                >
                  Cancelar
                </button>
              )}
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-sm text-zinc-300">Nome</label>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none"
                  placeholder="Nome completo"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-300">Telefone</label>
                <input
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none"
                  placeholder="(31) 99999-0000"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-300">CPF</label>
                <input
                  value={cpf}
                  onChange={(e) => setCpf(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none"
                  placeholder="000.000.000-00"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-300">
                  Data de nascimento
                </label>
                <input
                  type="date"
                  value={dataNascimento}
                  onChange={(e) => setDataNascimento(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-zinc-300">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none"
                >
                  {statusOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-2xl bg-yellow-400 px-4 py-3 font-medium text-black transition hover:bg-yellow-300 disabled:opacity-60"
              >
                {saving
                  ? "Salvando..."
                  : editandoId
                  ? "Salvar alterações"
                  : "Cadastrar cliente"}
              </button>
            </form>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
            {erro && (
              <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-300">
                {erro}
              </div>
            )}

            {loading && <p className="text-zinc-400">Carregando clientes...</p>}

            {!loading && !erro && clientes.length === 0 && (
              <p className="text-zinc-400">Nenhum cliente encontrado.</p>
            )}

            {!loading && clientes.length > 0 && (
              <div className="space-y-4">
                {clientes.map((cliente) => (
                  <div
                    key={cliente.id}
                    className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h2 className="text-lg font-semibold">{cliente.nome}</h2>
                        <p className="mt-1 text-sm text-zinc-400">
                          Telefone: {cliente.telefone || "Não informado"}
                        </p>
                        <p className="text-sm text-zinc-400">
                          CPF: {cliente.cpf || "Não informado"}
                        </p>
                        <p className="mt-2 inline-flex rounded-full bg-yellow-500/10 px-3 py-1 text-xs font-medium text-yellow-300">
                          Status: {cliente.status || "ativo"}
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => editarCliente(cliente)}
                          className="rounded-2xl border border-white/10 bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800"
                        >
                          Editar
                        </button>

                        <button
                          type="button"
                          onClick={() => excluirCliente(cliente.id)}
                          className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-300 hover:bg-red-500/20"
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}