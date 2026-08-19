"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function RedefinirSenhaPage() {
  const router = useRouter();
  const [checando, setChecando] = useState(true);
  const [sessaoValida, setSessaoValida] = useState(false);
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return;
      setSessaoValida(Boolean(data.session));
      setChecando(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!ativo) return;
      setSessaoValida(Boolean(session));
      setChecando(false);
    });
    return () => {
      ativo = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (senha.length < 8 || !/[a-zA-Z]/.test(senha) || !/\d/.test(senha)) {
      setErro("Use pelo menos 8 caracteres, com letras e números.");
      return;
    }
    if (senha !== confirmacao) {
      setErro("As senhas não conferem.");
      return;
    }

    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) {
      setErro(error.message);
      setSalvando(false);
      return;
    }
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#1e40af] to-[#2563eb] p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <p className="text-center text-[26px] font-black leading-none tracking-tight text-[#2563eb]">
          Nexo
        </p>
        <h1 className="mt-6 text-center text-xl font-black text-[#0f172a]">
          Criar nova senha
        </h1>

        {checando ? (
          <div className="flex justify-center py-10 text-[#2563eb]">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !sessaoValida ? (
          <div className="mt-6 text-center">
            <p className="rounded-xl border border-[#fecaca] bg-[#fef2f2] p-4 text-sm text-[#b91c1c]">
              Este link é inválido ou já expirou. Solicite um novo link de
              recuperação.
            </p>
            <Link
              href="/login"
              className="mt-5 inline-block text-sm font-bold text-[#2563eb] hover:underline"
            >
              Voltar para o login
            </Link>
          </div>
        ) : (
          <form onSubmit={salvar} className="mt-6 space-y-4">
            {erro && (
              <p className="rounded-xl border border-[#fecaca] bg-[#fef2f2] p-3 text-sm text-[#b91c1c]">
                {erro}
              </p>
            )}
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[#475569]">
                Nova senha
              </span>
              <span className="flex items-center gap-2 rounded-xl border border-[#e8ecf4] bg-[#f8fafc] px-3 py-3 focus-within:border-[#2563eb]">
                <Lock className="h-4 w-4 text-[#94a3b8]" />
                <input
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  autoComplete="new-password"
                  className="w-full bg-transparent text-sm outline-none"
                  required
                />
              </span>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-[#475569]">
                Confirmar nova senha
              </span>
              <span className="flex items-center gap-2 rounded-xl border border-[#e8ecf4] bg-[#f8fafc] px-3 py-3 focus-within:border-[#2563eb]">
                <Lock className="h-4 w-4 text-[#94a3b8]" />
                <input
                  type="password"
                  value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value)}
                  autoComplete="new-password"
                  className="w-full bg-transparent text-sm outline-none"
                  required
                />
              </span>
            </label>
            <p className="text-xs text-[#64748b]">
              Use no mínimo 8 caracteres, incluindo letras e números.
            </p>
            <button
              type="submit"
              disabled={salvando}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563eb] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
            >
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar nova senha
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
