"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Cliente = {
  id: string;
  nome: string;
  telefone: string | null;
  cpf: string | null;
  status: string | null;
};

export default function Home() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    async function carregarClientes() {
      const { data, error } = await supabase
        .from("clientes")
        .select("id, nome, telefone, cpf, status")
        .order("created_at", { ascending: false });

      if (error) {
        setErro(error.message);
      } else {
        setClientes(data || []);
      }

      setLoading(false);
    }

    carregarClientes();
  }, []);

  return (
    <main className="min-h-screen bg-[#0a0a0b] px-4 py-8 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 rounded-3xl border border-white/10 bg-white/5 p-6">
          <p className="mb-2 text-sm uppercase tracking-[0.25em] text-yellow-300">
            Slow Office Control
          </p>
          <h1 className="text-3xl font-semibold">Clientes conectados ao Supabase</h1>
          <p className="mt-2 text-zinc-400">
            Primeiro teste real da dashboard com dados vindo do banco.
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          {loading && <p className="text-zinc-400">Carregando clientes...</p>}

          {erro && (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-300">
              Erro ao carregar clientes: {erro}
            </div>
          )}

          {!loading && !erro && (
            <div className="space-y-4">
              {clientes.length === 0 ? (
                <p className="text-zinc-400">Nenhum cliente encontrado.</p>
              ) : (
                clientes.map((cliente) => (
                  <div
                    key={cliente.id}
                    className="rounded-2xl border border-white/10 bg-zinc-950/60 p-4"
                  >
                    <h2 className="text-lg font-semibold text-white">
                      {cliente.nome}
                    </h2>
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
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}