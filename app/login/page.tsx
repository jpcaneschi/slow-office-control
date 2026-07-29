"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Lock, Building2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [modo, setModo] = useState<"entrar" | "criar">("entrar");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  // Se já estiver logado, vai direto pro dashboard.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/dashboard");
    });
  }, [router]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setAviso("");

    if (!email.trim() || !senha) {
      setErro("Informe e-mail e senha.");
      return;
    }
    if (modo === "criar" && senha.length < 6) {
      setErro("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setCarregando(true);

    if (modo === "entrar") {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: senha,
      });
      setCarregando(false);
      if (error) {
        setErro(traduzErro(error.message));
        return;
      }
      router.replace("/dashboard");
    } else {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: senha,
        options: { data: { nome: nome.trim() || email.trim() } },
      });
      setCarregando(false);
      if (error) {
        setErro(traduzErro(error.message));
        return;
      }
      if (data.session) {
        router.replace("/dashboard");
      } else {
        setModo("entrar");
        setAviso(
          "Conta criada! Verifique seu e-mail para confirmar e depois entre."
        );
      }
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#1e40af] to-[#2563eb] p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <p className="text-[22px] font-black leading-none tracking-tight text-[#2563eb]">
            SLOW OFFICE
          </p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.42em] text-[#94a3b8]">
            Control
          </p>
        </div>

        <h1 className="text-center text-xl font-black text-[#0f172a]">
          {modo === "entrar" ? "Entrar na sua conta" : "Criar sua conta"}
        </h1>
        <p className="mt-1 text-center text-sm text-[#64748b]">
          {modo === "entrar"
            ? "Acesse o painel da sua empresa."
            : "Comece a gerenciar sua empresa."}
        </p>

        {aviso && (
          <div className="mt-5 rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2 text-sm text-[#15803d]">
            {aviso}
          </div>
        )}
        {erro && (
          <div className="mt-5 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm text-[#b91c1c]">
            {erro}
          </div>
        )}

        <form onSubmit={enviar} className="mt-5 space-y-3">
          {modo === "criar" && (
            <Campo icon={Building2}>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome da empresa / seu nome"
                className="w-full bg-transparent text-sm text-[#0f172a] outline-none placeholder:text-[#94a3b8]"
              />
            </Campo>
          )}

          <Campo icon={Mail}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              autoComplete="email"
              className="w-full bg-transparent text-sm text-[#0f172a] outline-none placeholder:text-[#94a3b8]"
            />
          </Campo>

          <Campo icon={Lock}>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Senha"
              autoComplete={modo === "entrar" ? "current-password" : "new-password"}
              className="w-full bg-transparent text-sm text-[#0f172a] outline-none placeholder:text-[#94a3b8]"
            />
          </Campo>

          <button
            type="submit"
            disabled={carregando}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563eb] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
          >
            {carregando && <Loader2 className="h-4 w-4 animate-spin" />}
            {modo === "entrar" ? "Entrar" : "Criar conta"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-[#64748b]">
          {modo === "entrar" ? "Ainda não tem conta?" : "Já tem conta?"}{" "}
          <button
            onClick={() => {
              setModo(modo === "entrar" ? "criar" : "entrar");
              setErro("");
              setAviso("");
            }}
            className="font-bold text-[#2563eb] hover:underline"
          >
            {modo === "entrar" ? "Criar conta" : "Entrar"}
          </button>
        </p>
      </div>
    </main>
  );
}

function Campo({
  icon: Icon,
  children,
}: {
  icon: typeof Mail;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-[#e8ecf4] bg-[#f8fafc] px-3 py-3 focus-within:border-[#2563eb] focus-within:bg-white">
      <Icon className="h-4 w-4 shrink-0 text-[#94a3b8]" />
      {children}
    </div>
  );
}

function traduzErro(msg: string) {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed"))
    return "Confirme seu e-mail antes de entrar (veja sua caixa de entrada).";
  if (m.includes("user already registered"))
    return "Este e-mail já tem conta. Tente entrar.";
  if (m.includes("password"))
    return "A senha deve ter pelo menos 6 caracteres.";
  return msg;
}
