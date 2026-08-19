"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { usePapel } from "@/components/dashboard/role-context";
import { expirado, formatDataBR } from "@/lib/datas";
import {
  PAPEIS,
  PAPEL_LABEL,
  PAPEL_DESCRICAO,
  podeGerenciarEquipe,
  type Papel,
} from "@/lib/permissoes";

type Membro = {
  id: string;
  user_id: string;
  papel: string;
  email: string | null;
};

type Convite = {
  id: string;
  email: string;
  papel: string;
  status: string;
  expires_at: string | null;
};

export function EquipeSection() {
  const { papel } = usePapel();
  const [userId, setUserId] = useState("");
  const [membros, setMembros] = useState<Membro[]>([]);
  const [convites, setConvites] = useState<Convite[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const [novoEmail, setNovoEmail] = useState("");
  const [novoPapel, setNovoPapel] = useState<Papel>("caixa");
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    setErro("");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      setUserId(user.id);
      // Garante que a própria membership tenha e-mail preenchido.
      await supabase
        .from("organization_members")
        .update({ email: user.email })
        .eq("user_id", user.id)
        .is("email", null);
    }

    const [membrosRes, convitesRes] = await Promise.all([
      supabase
        .from("organization_members")
        .select("id, user_id, papel, email")
        .order("created_at", { ascending: true }),
      supabase
        .from("organization_invites")
        .select("id, email, papel, status, expires_at")
        .eq("status", "pendente")
        .order("created_at", { ascending: false }),
    ]);

    if (membrosRes.error) setErro(membrosRes.error.message);
    setMembros(membrosRes.data || []);
    setConvites(convitesRes.data || []);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  async function criarConvite() {
    setErro("");
    setSucesso("");
    const email = novoEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      setErro("Informe um e-mail válido.");
      return;
    }
    if (membros.some((m) => (m.email || "").toLowerCase() === email)) {
      setErro("Esse e-mail já faz parte da equipe.");
      return;
    }
    setSalvando(true);
    const { error } = await supabase.from("organization_invites").insert({
      email,
      papel: novoPapel,
      status: "pendente",
    });
    if (error) {
      setErro(error.message);
      setSalvando(false);
      return;
    }
    setNovoEmail("");
    setNovoPapel("caixa");
    setSucesso(
      "Convite criado. Peça para a pessoa criar a conta com esse mesmo e-mail — ela entra direto na sua empresa."
    );
    await carregar();
    setSalvando(false);
  }

  async function revogarConvite(id: string) {
    if (!window.confirm("Revogar este convite? A pessoa não poderá mais entrar com ele."))
      return;
    const { error } = await supabase
      .from("organization_invites")
      .delete()
      .eq("id", id);
    if (error) {
      setErro(error.message);
      return;
    }
    await carregar();
  }

  async function mudarPapel(membro: Membro, valor: string) {
    setErro("");
    const { error } = await supabase
      .from("organization_members")
      .update({ papel: valor })
      .eq("id", membro.id);
    if (error) {
      setErro(error.message);
      return;
    }
    await supabase.rpc("log_auditoria", {
      p_acao: "papel_alterado",
      p_entidade: "organization_members",
      p_registro_id: membro.id,
      p_dados: { email: membro.email, de: membro.papel, para: valor },
    });
    await carregar();
  }

  async function removerMembro(membro: Membro) {
    if (!window.confirm(`Remover ${membro.email || "este membro"} da equipe?`))
      return;
    const { error } = await supabase
      .from("organization_members")
      .delete()
      .eq("id", membro.id);
    if (error) {
      setErro(error.message);
      return;
    }
    await supabase.rpc("log_auditoria", {
      p_acao: "membro_removido",
      p_entidade: "organization_members",
      p_registro_id: membro.id,
      p_dados: { email: membro.email, papel: membro.papel },
    });
    await carregar();
  }

  // Só o dono gerencia equipe.
  if (!podeGerenciarEquipe(papel)) return null;

  return (
    <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
      <h2 className="text-xl font-black tracking-tight text-[#0f172a]">Equipe</h2>
      <p className="mt-1 text-sm text-[#64748b]">
        Convide sua equipe e defina o que cada pessoa pode acessar.
      </p>

      {erro && (
        <div className="mt-4 rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-3 text-sm text-[#b91c1c]">
          {erro}
        </div>
      )}
      {sucesso && (
        <div className="mt-4 rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] p-3 text-sm text-[#15803d]">
          {sucesso}
        </div>
      )}

      {/* Membros atuais */}
      <div className="mt-5 space-y-3">
        {carregando ? (
          <p className="text-sm text-[#64748b]">Carregando equipe...</p>
        ) : (
          membros.map((m) => {
            const souEu = m.user_id === userId;
            return (
              <div
                key={m.id}
                className="flex flex-col gap-3 rounded-2xl border border-[#e8ecf4] bg-[#f8fafc]/70 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-bold text-[#0f172a]">
                    {m.email || "—"}{" "}
                    {souEu && (
                      <span className="ml-1 text-xs font-semibold text-[#2563eb]">
                        (você)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-[#94a3b8]">
                    {PAPEL_DESCRICAO[(m.papel as Papel) || "caixa"] || ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={m.papel}
                    onChange={(e) => mudarPapel(m, e.target.value)}
                    disabled={souEu}
                    className="rounded-xl border border-[#e8ecf4] bg-white px-3 py-2 text-sm outline-none disabled:opacity-60"
                  >
                    {PAPEIS.map((p) => (
                      <option key={p} value={p}>
                        {PAPEL_LABEL[p]}
                      </option>
                    ))}
                  </select>
                  {!souEu && (
                    <button
                      type="button"
                      onClick={() => removerMembro(m)}
                      className="rounded-xl px-3 py-2 text-sm font-semibold text-[#b91c1c] transition hover:bg-[#fef2f2]"
                    >
                      Remover
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Convites pendentes */}
      {convites.length > 0 && (
        <div className="mt-5">
          <p className="text-sm font-bold text-[#475569]">Convites pendentes</p>
          <div className="mt-2 space-y-2">
            {convites.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-2 rounded-2xl border border-[#fde68a] bg-[#fffbeb] px-4 py-2.5"
              >
                <span className="text-sm text-[#92400e]">
                  {c.email}
                  <span className="ml-2 text-xs font-semibold">
                    {PAPEL_LABEL[(c.papel as Papel) || "caixa"]}
                  </span>
                  <span className="ml-2 text-xs">
                    {expirado(c.expires_at) ? (
                      <span className="font-semibold text-[#b91c1c]">expirado</span>
                    ) : c.expires_at ? (
                      `expira em ${formatDataBR(c.expires_at)}`
                    ) : (
                      ""
                    )}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => revogarConvite(c.id)}
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-[#b45309] hover:bg-[#fef3c7]"
                >
                  Revogar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Novo convite */}
      <div className="mt-6 rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] p-4">
        <p className="text-sm font-bold text-[#475569]">Convidar pessoa</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            type="email"
            value={novoEmail}
            onChange={(e) => setNovoEmail(e.target.value)}
            placeholder="email@pessoa.com"
            className="flex-1 rounded-xl border border-[#e8ecf4] bg-white px-3 py-2.5 text-sm outline-none"
          />
          <select
            value={novoPapel}
            onChange={(e) => setNovoPapel(e.target.value as Papel)}
            className="rounded-xl border border-[#e8ecf4] bg-white px-3 py-2.5 text-sm outline-none"
          >
            {PAPEIS.filter((p) => p !== "owner").map((p) => (
              <option key={p} value={p}>
                {PAPEL_LABEL[p]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={criarConvite}
            disabled={salvando}
            className="rounded-xl bg-[#2563eb] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
          >
            {salvando ? "..." : "Convidar"}
          </button>
        </div>
        <p className="mt-2 text-xs text-[#94a3b8]">
          A pessoa cria a conta com esse mesmo e-mail e entra direto na sua
          empresa, com o papel escolhido.
        </p>
      </div>
    </div>
  );
}
