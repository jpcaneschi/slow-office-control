"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/dashboard/page-header";
import { CATEGORIAS_PADRAO } from "@/lib/empresa-config";
import { EquipeSection } from "@/components/dashboard/equipe-section";
import { TaxasCartaoSection } from "@/components/dashboard/taxas-cartao-section";
import { usePapel } from "@/components/dashboard/role-context";
import {
  MODULOS_OPCIONAIS,
  MODULOS_PADRAO,
  MODULO_LABEL,
  MODULO_DESCRICAO,
} from "@/lib/modulos";

type Configuracao = {
  id: string;
  nome_operacao: string;
  pix_desconto: number;
  tatuagem_percentual: number;
  max_parcelas: number;
  condicional_prazo_dias: number;
  parcela_minima: number;
  promissoria_prazo_meses: number;
  categorias_produto: string[];
  responsaveis: string[];
};

type Profile = {
  id: string;
  nome: string | null;
  avatar_url: string | null;
};

export default function ConfiguracoesPage() {
  const { recarregar: recarregarPapel } = usePapel();
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

  // Defaults visíveis = os mesmos usados pelo sistema (carregarConfigEmpresa),
  // para a tela nunca mostrar vazio enquanto o backend aplica um padrão.
  const [nomeOperacao, setNomeOperacao] = useState("");
  const [pixDesconto, setPixDesconto] = useState("5");
  const [tatuagemPercentual, setTatuagemPercentual] = useState("10");
  const [maxParcelas, setMaxParcelas] = useState("6");
  const [condicionalPrazo, setCondicionalPrazo] = useState("2");
  const [parcelaMinima, setParcelaMinima] = useState("0");
  const [promissoriaPrazo, setPromissoriaPrazo] = useState("4");
  const [categorias, setCategorias] = useState<string[]>([]);
  const [novaCategoria, setNovaCategoria] = useState("");
  const [responsaveis, setResponsaveis] = useState<string[]>([]);
  const [novoResponsavel, setNovoResponsavel] = useState("");
  const [modulosAtivos, setModulosAtivos] = useState<string[]>([...MODULOS_PADRAO]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        .select(
          "id, nome_operacao, pix_desconto, tatuagem_percentual, max_parcelas, condicional_prazo_dias, parcela_minima, promissoria_prazo_meses, categorias_produto, responsaveis, modulos_ativos"
        )
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
      setCondicionalPrazo(String(configuracaoData.condicional_prazo_dias ?? 2));
      setParcelaMinima(String(configuracaoData.parcela_minima ?? 0));
      setPromissoriaPrazo(String(configuracaoData.promissoria_prazo_meses ?? 4));
      setCategorias(
        configuracaoData.categorias_produto?.length
          ? configuracaoData.categorias_produto
          : CATEGORIAS_PADRAO
      );
      setResponsaveis(configuracaoData.responsaveis ?? []);
      setModulosAtivos(
        (configuracaoData.modulos_ativos as string[] | null)?.length
          ? (configuracaoData.modulos_ativos as string[])
          : [...MODULOS_PADRAO]
      );
    } else {
      // Ainda sem configuração: já mostra os padrões pra facilitar o 1º salvamento.
      setCategorias(CATEGORIAS_PADRAO);
    }

    setLoading(false);
  }

  useEffect(() => {
    carregarDados();
  }, []);

  function onEscolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErro("Selecione um arquivo de imagem.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        // Redimensiona/recorta para um quadrado de 256px (centralizado).
        const size = 256;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const menor = Math.min(img.width, img.height);
        const sx = (img.width - menor) / 2;
        const sy = (img.height - menor) / 2;
        ctx.drawImage(img, sx, sy, menor, menor, 0, 0, size, size);
        setAvatarUrl(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);

    // Permite reenviar o mesmo arquivo depois.
    e.target.value = "";
  }

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

    if (!Number.isFinite(tatuagemNumero) || tatuagemNumero < 0 || tatuagemNumero > 100) {
      setErro("O percentual de tatuagem deve ficar entre 0% e 100%.");
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
      condicional_prazo_dias: Math.max(0, Math.round(Number(condicionalPrazo) || 0)),
      parcela_minima: Math.max(0, Number(parcelaMinima) || 0),
      promissoria_prazo_meses: Math.max(0, Math.round(Number(promissoriaPrazo) || 0)),
      categorias_produto: categorias,
      responsaveis,
      modulos_ativos: modulosAtivos,
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
    // Revalida papel + módulos no contexto → o menu reflete o toggle na hora,
    // sem exigir novo login / recarregar a página.
    await recarregarPapel();
    setSalvandoSistema(false);
  }

  function addCategoria() {
    const v = novaCategoria.trim();
    if (v && !categorias.includes(v)) setCategorias([...categorias, v]);
    setNovaCategoria("");
  }
  function addResponsavel() {
    const v = novoResponsavel.trim();
    if (v && !responsaveis.includes(v)) setResponsaveis([...responsaveis, v]);
    setNovoResponsavel("");
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
          <EquipeSection />

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
                      {nome || nomeOperacao || "Meu perfil"}
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
                    Foto de perfil
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={onEscolherFoto}
                    className="hidden"
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-2.5 text-sm font-semibold text-[#334155] transition hover:bg-[#eef2f7]"
                    >
                      {avatarUrl ? "Trocar foto" : "Adicionar foto"}
                    </button>
                    {avatarUrl && (
                      <button
                        type="button"
                        onClick={() => setAvatarUrl("")}
                        className="rounded-2xl px-3 py-2.5 text-sm font-semibold text-[#dc2626] transition hover:bg-[#fef2f2]"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-[#94a3b8]">
                    Escolha uma imagem do seu dispositivo — ela é reduzida
                    automaticamente. Clique em &quot;Salvar perfil&quot; para
                    confirmar.
                  </p>
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

          <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
            <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
              Negócio
            </h2>
            <p className="mt-1 text-sm text-[#64748b]">
              Dados e regras da sua loja usados no sistema e nos documentos.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm text-[#475569]">
                  Nome da loja
                </label>
                <input
                  value={nomeOperacao}
                  onChange={(e) => setNomeOperacao(e.target.value)}
                  className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                  placeholder="Ex: Slow Office"
                />
                <p className="mt-1.5 text-xs text-[#94a3b8]">
                  Aparece nos documentos e relatórios (ex.: promissórias, vales).
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#475569]">
                  Desconto Pix (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={pixDesconto}
                  onChange={(e) => setPixDesconto(e.target.value)}
                  className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#475569]">
                  Percentual da loja na tatuagem (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
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

              <div>
                <label className="mb-2 block text-sm text-[#475569]">
                  Prazo padrão do condicional (dias)
                </label>
                <input
                  type="number"
                  min="0"
                  value={condicionalPrazo}
                  onChange={(e) => setCondicionalPrazo(e.target.value)}
                  className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#475569]">
                  Parcela mínima (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={parcelaMinima}
                  onChange={(e) => setParcelaMinima(e.target.value)}
                  className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-[#475569]">
                  Prazo máx. da promissória (meses)
                </label>
                <input
                  type="number"
                  min="0"
                  value={promissoriaPrazo}
                  onChange={(e) => setPromissoriaPrazo(e.target.value)}
                  className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none"
                />
              </div>
            </div>

            {/* Categorias e responsáveis (chips) */}
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-[#475569]">
                  Categorias de produto
                </label>
                <div className="flex flex-wrap gap-2">
                  {categorias.map((c) => (
                    <span
                      key={c}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#eff6ff] px-3 py-1.5 text-xs font-semibold text-[#1d4ed8]"
                    >
                      {c}
                      <button
                        type="button"
                        onClick={() => setCategorias(categorias.filter((x) => x !== c))}
                        aria-label={`Remover ${c}`}
                        className="text-[#93c5fd] transition hover:text-[#1d4ed8]"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {categorias.length === 0 && (
                    <span className="text-xs text-[#94a3b8]">Nenhuma categoria.</span>
                  )}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={novaCategoria}
                    onChange={(e) => setNovaCategoria(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCategoria();
                      }
                    }}
                    placeholder="Nova categoria"
                    className="w-full rounded-xl border border-[#e8ecf4] bg-[#f8fafc] px-3 py-2 text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={addCategoria}
                    className="shrink-0 rounded-xl border border-[#e8ecf4] bg-white px-3 py-2 text-sm font-semibold text-[#334155] transition hover:bg-[#f4f6fb]"
                  >
                    Adicionar
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-[#475569]">
                  Responsáveis / equipe (legado)
                </label>
                <p className="mb-2 text-xs text-[#94a3b8]">
                  Os responsáveis das vendas agora vêm de{" "}
                  <b>Funcionários</b> (que também têm comissão e salário). Esta
                  lista é opcional e serve só para nomes avulsos.
                </p>
                <div className="flex flex-wrap gap-2">
                  {responsaveis.map((r) => (
                    <span
                      key={r}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#f1f5f9] px-3 py-1.5 text-xs font-semibold text-[#334155]"
                    >
                      {r}
                      <button
                        type="button"
                        onClick={() => setResponsaveis(responsaveis.filter((x) => x !== r))}
                        aria-label={`Remover ${r}`}
                        className="text-[#94a3b8] transition hover:text-[#334155]"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {responsaveis.length === 0 && (
                    <span className="text-xs text-[#94a3b8]">
                      Nenhum responsável cadastrado.
                    </span>
                  )}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={novoResponsavel}
                    onChange={(e) => setNovoResponsavel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addResponsavel();
                      }
                    }}
                    placeholder="Nome do responsável"
                    className="w-full rounded-xl border border-[#e8ecf4] bg-[#f8fafc] px-3 py-2 text-sm outline-none"
                  />
                  <button
                    type="button"
                    onClick={addResponsavel}
                    className="shrink-0 rounded-xl border border-[#e8ecf4] bg-white px-3 py-2 text-sm font-semibold text-[#334155] transition hover:bg-[#f4f6fb]"
                  >
                    Adicionar
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-[#94a3b8]">
                  Viram opção de &quot;responsável&quot; em Vendas, Condicional e
                  Financeiro.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-[#475569]">
                  Módulos do negócio
                </label>
                <p className="mb-3 text-xs text-[#94a3b8]">
                  Ative só o que a sua loja usa. O que estiver desligado some do
                  menu (e é bloqueado no sistema).
                </p>
                <div className="space-y-2">
                  {MODULOS_OPCIONAIS.map((m) => {
                    const ativo = modulosAtivos.includes(m);
                    return (
                      <label
                        key={m}
                        className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3"
                      >
                        <input
                          type="checkbox"
                          checked={ativo}
                          onChange={(e) =>
                            setModulosAtivos((atual) =>
                              e.target.checked
                                ? [...new Set([...atual, m])]
                                : atual.filter((x) => x !== m)
                            )
                          }
                          className="mt-0.5 h-4 w-4 accent-[#2563eb]"
                        />
                        <span>
                          <span className="text-sm font-semibold text-[#334155]">
                            {MODULO_LABEL[m]}
                          </span>
                          <span className="block text-xs text-[#94a3b8]">
                            {MODULO_DESCRICAO[m]}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-[#94a3b8]">
                  Vendas, produtos, clientes, financeiro e promissórias são o
                  núcleo e ficam sempre ativos.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={salvarSistema}
              disabled={salvandoSistema}
              className="mt-5 w-full rounded-2xl bg-[#2563eb] px-4 py-3 font-bold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60 sm:w-auto sm:px-8"
            >
              {salvandoSistema ? "Salvando..." : "Salvar negócio"}
            </button>
          </div>

          <TaxasCartaoSection />
        </div>
      )}
    </section>
  );
}