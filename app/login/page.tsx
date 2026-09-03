"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Mail, Lock, Building2, UserRound, ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { acessoPermiteEntrada, mensagemStatusAcesso } from "@/lib/acesso-utils";
import { NexoLogo } from "@/components/brand/nexo-logo";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");

export default function LoginPage() {
  const router = useRouter();
  const [modo, setModo] = useState<"entrar" | "criar">("entrar");
  const [nome, setNome] = useState("");
  const [nomeLoja, setNomeLoja] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [recuperando, setRecuperando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [sessaoEmail, setSessaoEmail] = useState<string | null>(null);
  const [checandoSessao, setChecandoSessao] = useState(true);

  // Se já houver sessão, NÃO redireciona automático — oferece a escolha
  // (continuar na conta atual, ou sair para entrar/criar com outra).
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setSessaoEmail(data.user?.email ?? null);
      setChecandoSessao(false);
    });
  }, []);

  async function sairParaTrocar() {
    await supabase.auth.signOut();
    setSessaoEmail(null);
    setEmail("");
    setSenha("");
    setSenha2("");
    setNome("");
    setNomeLoja("");
    setErro("");
    setAviso("");
  }

  // A landing abre o formulário de solicitação e pode pré-preencher o e-mail.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("novo") === "1") setModo("criar");
    const em = p.get("email");
    if (em) setEmail(em);
    const status = p.get("status");
    if (status === "pendente" || status === "rejeitado") {
      setAviso(mensagemStatusAcesso(status));
    }
  }, []);

  async function encaminharUsuario(userId: string) {
    const [pedidoRes, adminRes] = await Promise.all([
      supabase
        .from("access_requests")
        .select("status")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase.rpc("is_platform_admin"),
    ]);
    const pedido = pedidoRes.data;

    // Administradores da plataforma não são clientes e não precisam criar uma
    // organização só para analisar/decidir solicitações de acesso.
    if (adminRes.data === true) {
      router.replace("/admin");
      return;
    }

    if (pedidoRes.error || !acessoPermiteEntrada(pedido?.status)) {
      await supabase.auth.signOut();
      setSessaoEmail(null);
      const status = pedido?.status === "rejeitado" ? "rejeitado" : "pendente";
      setAviso(mensagemStatusAcesso(status));
      return;
    }

    const { data: membro } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    router.replace(membro?.organization_id ? "/dashboard" : "/onboarding");
  }

  async function continuarSessaoAtual() {
    setCarregando(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) await encaminharUsuario(user.id);
    setCarregando(false);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setAviso("");

    if (!email.trim() || !senha) {
      setErro("Informe e-mail e senha.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErro("Informe um e-mail válido.");
      return;
    }
    if (modo === "criar") {
      if (senha.length < 8 || !/[a-zA-Z]/.test(senha) || !/\d/.test(senha)) {
        setErro("Use pelo menos 8 caracteres, com letras e números.");
        return;
      }
      if (senha !== senha2) {
        setErro("As senhas não conferem.");
        return;
      }
    }

    setCarregando(true);

    if (modo === "entrar") {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: senha,
      });
      if (error) {
        setCarregando(false);
        setErro(traduzErro(error.message));
        return;
      }
      if (data.user) await encaminharUsuario(data.user.id);
      setCarregando(false);
    } else {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: senha,
        options: {
          data: {
            nome: nome.trim(),
            nome_loja: nomeLoja.trim(),
          },
        },
      });
      setCarregando(false);
      if (error) {
        setErro(traduzErro(error.message));
        return;
      }
      if (data.session) await supabase.auth.signOut();
      setModo("entrar");
      setSenha("");
      setSenha2("");
      setAviso(
        "Solicitação recebida! Agora nossa equipe vai analisar e liberar o acesso. Se a confirmação de e-mail estiver ativa, confirme também a mensagem recebida."
      );
    }
  }

  async function enviarRecuperacao() {
    setErro("");
    setAviso("");
    const emailNormalizado = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado)) {
      setErro("Informe seu e-mail acima para recuperar a senha.");
      return;
    }

    setRecuperando(true);
    const { error } = await supabase.auth.resetPasswordForEmail(
      emailNormalizado,
      { redirectTo: `${SITE_URL || window.location.origin}/redefinir-senha` }
    );
    setRecuperando(false);
    if (error) {
      setErro(traduzErro(error.message));
      return;
    }
    // Mensagem neutra: não revela se o e-mail existe na base.
    setAviso(
      "Se este e-mail estiver cadastrado, você receberá um link para criar uma nova senha."
    );
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#07152f] p-4">
      <div className="pointer-events-none absolute -left-32 top-1/4 h-80 w-80 rounded-full bg-[#2563eb]/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-[#06b6d4]/20 blur-3xl" />
      <div className="relative w-full max-w-md rounded-[28px] border border-white/10 bg-white p-8 shadow-[0_30px_90px_rgba(2,8,23,0.45)]">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 text-xs font-bold text-[#64748b] transition hover:text-[#2563eb]"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar ao site
        </Link>
        <div className="mb-6 flex justify-center">
          <NexoLogo priority className="h-14 w-auto" />
        </div>

        {checandoSessao ? (
          <div className="flex justify-center py-10 text-[#64748b]">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : sessaoEmail ? (
          <div className="text-center">
            <h1 className="text-xl font-black text-[#0f172a]">
              Você já está conectado
            </h1>
            <p className="mt-2 text-sm text-[#64748b]">
              Nesta conta:{" "}
              <span className="font-semibold text-[#0f172a]">{sessaoEmail}</span>
            </p>
            <button
              type="button"
              onClick={continuarSessaoAtual}
              disabled={carregando}
              className="mt-6 w-full rounded-xl bg-[#2563eb] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#1d4ed8]"
            >
              {carregando ? "Verificando acesso..." : "Continuar nesta conta"}
            </button>
            <button
              type="button"
              onClick={sairParaTrocar}
              className="mt-3 w-full rounded-xl border border-[#e8ecf4] bg-white px-4 py-3 text-sm font-semibold text-[#334155] transition hover:bg-[#f4f6fb]"
            >
              {modo === "criar"
                ? "Sair e criar uma nova empresa"
                : "Entrar com outra conta"}
            </button>
          </div>
        ) : (
          <>
        <h1 className="text-center text-xl font-black text-[#0f172a]">
          {modo === "entrar" ? "Entrar na sua conta" : "Solicitar acesso"}
        </h1>
        <p className="mt-1 text-center text-sm text-[#64748b]">
          {modo === "entrar"
            ? "Acesse o painel da sua empresa."
            : "Conte quem é você. O acesso só é liberado após análise da equipe Nexo."}
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
            <>
              <Campo icon={UserRound}>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Seu nome"
                  required
                  className="w-full bg-transparent text-sm text-[#0f172a] outline-none placeholder:text-[#94a3b8]"
                />
              </Campo>
              <Campo icon={Building2}>
                <input
                  value={nomeLoja}
                  onChange={(e) => setNomeLoja(e.target.value)}
                  placeholder="Nome da loja"
                  required
                  className="w-full bg-transparent text-sm text-[#0f172a] outline-none placeholder:text-[#94a3b8]"
                />
              </Campo>
            </>
          )}

          <Campo icon={Mail}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              autoComplete="email"
              required
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
              required
              minLength={modo === "criar" ? 8 : undefined}
              className="w-full bg-transparent text-sm text-[#0f172a] outline-none placeholder:text-[#94a3b8]"
            />
          </Campo>

          {modo === "criar" && (
            <>
              {senha.length > 0 && (
                <p
                  className={`-mt-1 px-1 text-xs font-semibold ${
                    senha.length >= 8 && /\d/.test(senha) && /[a-zA-Z]/.test(senha)
                      ? "text-[#15803d]"
                      : senha.length >= 6
                        ? "text-[#b45309]"
                        : "text-[#b91c1c]"
                  }`}
                >
                  Força da senha:{" "}
                  {senha.length >= 8 && /\d/.test(senha) && /[a-zA-Z]/.test(senha)
                    ? "forte"
                    : senha.length >= 6
                        ? "média (use letras + números)"
                        : "fraca (mínimo 8)"}
                </p>
              )}
              <Campo icon={Lock}>
                <input
                  type="password"
                  value={senha2}
                  onChange={(e) => setSenha2(e.target.value)}
                  placeholder="Confirmar senha"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  className="w-full bg-transparent text-sm text-[#0f172a] outline-none placeholder:text-[#94a3b8]"
                />
              </Campo>
            </>
          )}

          <button
            type="submit"
            disabled={carregando || recuperando}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563eb] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
          >
            {carregando && <Loader2 className="h-4 w-4 animate-spin" />}
            {modo === "entrar" ? "Entrar" : "Enviar solicitação"}
          </button>

          {modo === "entrar" && (
            <button
              type="button"
              onClick={enviarRecuperacao}
              disabled={carregando || recuperando}
              className="w-full py-1 text-sm font-semibold text-[#2563eb] hover:underline disabled:opacity-60"
            >
              {recuperando ? "Enviando link..." : "Esqueci minha senha"}
            </button>
          )}
        </form>

        <p className="mt-5 text-center text-sm text-[#64748b]">
          {modo === "entrar" ? "Quer usar o Nexo?" : "Já possui acesso?"}{" "}
          <button
            onClick={() => {
              setModo(modo === "entrar" ? "criar" : "entrar");
              setErro("");
              setAviso("");
            }}
            className="font-bold text-[#2563eb] hover:underline"
          >
            {modo === "entrar" ? "Solicitar acesso" : "Entrar"}
          </button>
        </p>
        <p className="mt-3 text-center text-xs leading-5 text-[#94a3b8]">
          Nenhum cadastro novo entra automaticamente. A liberação é feita pela
          equipe Nexo.
        </p>
          </>
        )}
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
    return "Use pelo menos 8 caracteres, com letras e números.";
  return msg;
}
