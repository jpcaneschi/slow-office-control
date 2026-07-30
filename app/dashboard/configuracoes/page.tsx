"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/dashboard/page-header";

type Configuracao = {
  id: string;
  nome_operacao: string;
  pix_desconto: number;
  tatuagem_percentual: number;
  max_parcelas: number;
  tema_escuro: boolean;
};

type Profile = {
  id: string;
  nome: string | null;
  avatar_url: string | null;
};

export default function ConfiguracoesPage() {
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const [configuracao, setConfiguracao] = useState<Configuracao | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState("");
  const [emailAtual, setEmailAtual] = useState("");

  const [nome, setNome] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [novoEmail, setNovoEmail] = useState("");
  const [novaSenha, setNovaSenha] = useState("");

  const [nomeOperacao, setNomeOperacao] = useState("");
  const [pixDesconto, setPixDesconto] = useState("");
  const [tatuagemPercentual, setTatuagemPercentual] = useState("");
  const [maxParcelas, setMaxParcelas] = useState("");
  const [temaEscuro, setTemaEscuro] = useState(true);

  const [salvandoPerfil, setSalvandoPerfil] = useState(false);
  const [salvandoConta, setSalvandoConta] = useState(false);
  const [salvandoSistema, setSalvandoSistema] = useState(false);

  async function carregarDados() {
    setLoading(true);
    setErro("");
    setSucesso("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setErro(userError?.message || "Usuário não autenticado.");
      setLoading(false);
      return;
    }

    setUserId(user.id);
    setEmailAtual(user.email || "");
    setNovoEmail(user.email || "");

    const [profileRes, configuracaoRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, nome, avatar_url")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("configuracoes")
        .select("id, nome_operacao, pix_desconto, tatuagem_percentual, max_parcelas, tema_escuro")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    if (profileRes.error) {
      setErro(profileRes.error.message);
    }

    if (configuracaoRes.error) {
      setErro(configuracaoRes.error.message);
    }

    const profileData = profileRes.data;
    const configuracaoData = configuracaoRes.data;

    if (profileData) {
      setProfile(profileData);
      setNome(profileData.nome || "");
      setAvatarUrl(profileData.avatar_url || "");
    } else {
      setProfile(null);
      setNome("");
      setAvatarUrl("");
    }

    if (configuracaoData) {
      setConfiguracao(configuracaoData);
      setNomeOperacao(configuracaoData.nome_operacao || "");
      setPixDesconto(String(configuracaoData.pix_desconto ?? 5));
      setTatuagemPercentual(String(configuracaoData.tatuagem_percentual ?? 10));
      setMaxParcelas(String(configuracaoData.max_parcelas ?? 6));
      setTemaEscuro(Boolean(configuracaoData.tema_escuro));
    }

    setLoading(false);
  }

  useEffect(() => {
    carregarDados();
  }, []);

  async function salvarPerfil() {
    setErro("");
    setSucesso("");

    if (!userId) {
      setErro("Usuário não encontrado.");
      return;
    }

    setSalvandoPerfil(true);

    const payload = {
      id: userId,
      nome: nome.trim() || null,
      avatar_url: avatarUrl.trim() || null,
    };

    if (profile?.id) {
      const { error } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", userId);

      if (error) {
        setErro(error.message);
        setSalvandoPerfil(false);
        return;
      }
    } else {
      const { error } = await supabase.from("profiles").insert(payload);

      if (error) {
        setErro(error.message);
        setSalvandoPerfil(false);
        return;
      }
    }

    setSucesso("Perfil salvo com sucesso.");
    await carregarDados();
    setSalvandoPerfil(false);
  }

  async function salvarConta() {
    setErro("");
    setSucesso("");

    const updatePayload: { email?: string; password?: string } = {};

    if (novoEmail.trim() && novoEmail.trim() !== emailAtual) {
      updatePayload.email = novoEmail.trim();
    }

    if (novaSenha.trim()) {
      if (novaSenha.trim().length < 6) {
        setErro("A nova senha deve ter pelo menos 6 caracteres.");
        return;
      }

      updatePayload.password = novaSenha.trim();
    }

    if (!updatePayload.email && !updatePayload.password) {
      setErro("Altere o email ou informe uma nova senha.");
      return;
    }

    setSalvandoConta(true);

    const { error } = await supabase.auth.updateUser(updatePayload);

    if (error) {
      setErro(error.message);
      setSalvandoConta(false);
      return;
    }

    setNovaSenha("");
    setSucesso(
      "Dados da conta atualizados. Se você alterou o email, o Supabase pode exigir confirmação por email."
    );
    await carregarDados();
    setSalvandoConta(false);
  }

  async function salvarSistema() {
    setErro("");
    setSucesso("");

    const pixNumero = Number(pixDesconto);
    const tatuagemNumero = Number(tatuagemPercentual);
    const parcelasNumero = Number(maxParcelas);

    if (!nomeOperacao.trim()) {
      setErro("Informe o nome da operação.");
      return;
    }

    if (!Number.isFinite(pixNumero) || pixNumero < 0) {
      setErro("Informe um desconto Pix válido.");
      return;
    }

    if (!Number.isFinite(tatuagemNumero) || tatuagemNumero < 0) {
      setErro("Informe um percentual de tatuagem válido.");
      return;
    }

    if (!Number.isFinite(parcelasNumero) || parcelasNumero <= 0) {
      setErro("Informe um número máximo de parcelas válido.");
      return;
    }

    setSalvandoSistema(true);

    const payload = {
      nome_operacao: nomeOperacao.trim(),
      pix_desconto: pixNumero,
      tatuagem_percentual: tatuagemNumero,
      max_parcelas: parcelasNumero,
      tema_escuro: temaEscuro,
    };

    // Atualiza se já existe config; senão cria (nova empresa).
    const { error } = configuracao
      ? await supabase.from("configuracoes").update(payload).eq("id", configuracao.id)
      : await supabase.from("configuracoes").insert(payload);

    if (error) {
      setErro(error.message);
      setSalvandoSistema(false);
      return;
    }

    setSucesso("Configurações do sistema salvas com sucesso.");
    await carregarDados();
    setSalvandoSistema(false);
  }

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Central do sistema"
        title="Configurações"
        description="Gerencie conta, identidade visual básica e parâmetros principais da operação em um só lugar."
      />

      {erro && (
        <div className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-4 text-sm text-[#b91c1c]">
          {erro}
        </div>
      )}

      {sucesso && (
        <div className="rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] p-4 text-sm text-[#15803d]">
          {sucesso}
        </div>
      )}

      {loading ? (
        <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
          <p className="text-[#64748b]">Carregando configurações...</p>
        </div>
      ) : (
        <div className="grid gap-6">
          <div className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
              <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
                Perfil
              </h2>

              <div className="mt-5 space-y-4">
                <div className="flex items-center gap-4 rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] p-4">
                  <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-[#e8ecf4] bg-[#f1f5f9]">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt="Foto de perfil"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-xl font-black text-[#64748b]">
                        {nome?.trim()?.charAt(0)?.toUpperCase() || "S"}
                      </span>
                    )}
                  </div>

                  <div>
                    <p className="text-sm font-bold text-[#0f172a]">
                      {nome || "Slow Office"}
                    </p>
                    <p className="text-sm text-[#64748b]">
                      {emailAtual || "Sem email"}
                    </p>
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#475569]">
                    Nome de exibição
                  </label>
                  <input
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                    placeholder="Ex: João Pedro"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#475569]">
                    URL da foto de perfil
                  </label>
                  <input
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                    placeholder="https://..."
                  />
                </div>

                <button
                  type="button"
                  onClick={salvarPerfil}
                  disabled={salvandoPerfil}
                  className="w-full rounded-2xl bg-[#2563eb] px-4 py-3 font-bold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
                >
                  {salvandoPerfil ? "Salvando..." : "Salvar perfil"}
                </button>
              </div>
            </div>

            <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
              <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
                Conta e acesso
              </h2>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="mb-2 block text-sm text-[#475569]">
                    Email da conta
                  </label>
                  <input
                    type="email"
                    value={novoEmail}
                    onChange={(e) => setNovoEmail(e.target.value)}
                    className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                    placeholder="email@exemplo.com"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#475569]">
                    Nova senha
                  </label>
                  <input
                    type="password"
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                    className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                    placeholder="Digite uma nova senha"
                  />
                </div>

                <div className="rounded-2xl border border-[#bfdbfe] bg-[#eff6ff] p-4 text-sm text-[#1d4ed8]">
                  Alteração de email pode exigir confirmação no próprio email,
                  conforme a configuração do Supabase Auth.
                </div>

                <button
                  type="button"
                  onClick={salvarConta}
                  disabled={salvandoConta}
                  className="w-full rounded-2xl bg-[#2563eb] px-4 py-3 font-bold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
                >
                  {salvandoConta ? "Atualizando..." : "Atualizar conta"}
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
              <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
                Sistema e operação
              </h2>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm text-[#475569]">
                    Nome da operação
                  </label>
                  <input
                    value={nomeOperacao}
                    onChange={(e) => setNomeOperacao(e.target.value)}
                    className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                    placeholder="Slow Office Control"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#475569]">
                    Desconto Pix (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={pixDesconto}
                    onChange={(e) => setPixDesconto(e.target.value)}
                    className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#475569]">
                    Percentual tatuagem (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={tatuagemPercentual}
                    onChange={(e) => setTatuagemPercentual(e.target.value)}
                    className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#475569]">
                    Máximo de parcelas
                  </label>
                  <input
                    type="number"
                    value={maxParcelas}
                    onChange={(e) => setMaxParcelas(e.target.value)}
                    className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                  />
                </div>

                <div className="rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] p-4">
                  <label className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-[#0f172a]">Tema escuro ativo</p>
                      <p className="mt-1 text-sm text-[#64748b]">
                        Mantém o visual dark premium do sistema.
                      </p>
                    </div>

                    <input
                      type="checkbox"
                      checked={temaEscuro}
                      onChange={(e) => setTemaEscuro(e.target.checked)}
                      className="h-5 w-5 accent-[#2563eb]"
                    />
                  </label>
                </div>
              </div>

              <button
                type="button"
                onClick={salvarSistema}
                disabled={salvandoSistema}
                className="mt-5 w-full rounded-2xl bg-[#2563eb] px-4 py-3 font-bold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
              >
                {salvandoSistema ? "Salvando..." : "Salvar sistema"}
              </button>
            </div>

            <div className="space-y-6">
              <div className="rounded-[30px] border border-[#2563eb]/20 bg-[#2563eb]/[0.06] p-6">
                <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
                  Resumo das configurações
                </h2>

                <div className="mt-4 space-y-3 text-sm text-[#475569]">
                  <p>• Perfil com nome e foto.</p>
                  <p>• Conta com email e senha.</p>
                  <p>• Identidade básica da operação.</p>
                  <p>• Regras comerciais centrais do sistema.</p>
                </div>
              </div>

              <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
                <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
                  Leitura rápida
                </h2>

                <div className="mt-4 space-y-3 text-sm text-[#475569]">
                  <p>Nome: {nome || "-"}</p>
                  <p>Email: {emailAtual || "-"}</p>
                  <p>Operação: {nomeOperacao || "-"}</p>
                  <p>Pix: {pixDesconto || "0"}%</p>
                  <p>Tatuagem: {tatuagemPercentual || "0"}%</p>
                  <p>Parcelas: {maxParcelas || "0"}</p>
                  <p>Tema: {temaEscuro ? "Escuro" : "Claro"}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}