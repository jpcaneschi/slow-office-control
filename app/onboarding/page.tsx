"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  Store,
  Package,
  ShoppingCart,
  Users,
  ArrowRight,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { garantirEmpresa } from "@/lib/empresa-config";

export default function OnboardingPage() {
  const router = useRouter();
  const [passo, setPasso] = useState(1);
  const [nomeLoja, setNomeLoja] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [configId, setConfigId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }
      const metaNome = (user.user_metadata?.nome as string) || "";
      if (metaNome) setNomeLoja(metaNome);

      const { data: conf } = await supabase
        .from("configuracoes")
        .select("id, nome_operacao")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (conf) {
        setConfigId(conf.id);
        if (conf.nome_operacao) setNomeLoja(conf.nome_operacao);
      }
      setCarregando(false);
    })();
  }, [router]);

  async function salvar() {
    setErro("");
    if (!nomeLoja.trim()) {
      setErro("Informe o nome da sua loja.");
      return;
    }
    setSalvando(true);

    // Cria empresa + unidade + membership — ou entra na empresa de um convite.
    await garantirEmpresa(nomeLoja);

    // Reconsulta: se a empresa já tem config (ex.: entrei por convite de equipe),
    // não duplica nem sobrescreve — apenas segue para o painel.
    const { data: confExistente } = await supabase
      .from("configuracoes")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    let error = null;
    if (confExistente?.id) {
      // Empresa já configurada pelo dono — nada a fazer aqui.
    } else if (configId) {
      ({ error } = await supabase
        .from("configuracoes")
        .update({ nome_operacao: nomeLoja.trim() })
        .eq("id", configId));
    } else {
      ({ error } = await supabase.from("configuracoes").insert({
        nome_operacao: nomeLoja.trim(),
        pix_desconto: 5,
        tatuagem_percentual: 10,
        max_parcelas: 6,
      }));
    }

    if (error) {
      setErro(error.message);
      setSalvando(false);
      return;
    }
    setSalvando(false);
    setPasso(2);
  }

  const proximosPassos = [
    {
      icon: Package,
      titulo: "Cadastre seus produtos",
      texto: "Monte seu catálogo com preço, custo e estoque.",
      href: "/dashboard/produtos",
    },
    {
      icon: Users,
      titulo: "Cadastre seus clientes",
      texto: "Tenha o histórico e os dados de quem compra com você.",
      href: "/dashboard/clientes",
    },
    {
      icon: ShoppingCart,
      titulo: "Registre sua primeira venda",
      texto: "Veja o caixa e o estoque se movimentarem na hora.",
      href: "/dashboard/vendas",
    },
  ];

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#1e40af] to-[#2563eb] p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <p className="text-[24px] font-black leading-none tracking-tight text-[#2563eb]">
            Nexo
          </p>
        </div>

        {carregando ? (
          <div className="flex items-center justify-center py-10 text-[#64748b]">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : passo === 1 ? (
          <>
            <div className="flex justify-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#2563eb]/10 text-[#2563eb]">
                <Store className="h-7 w-7" />
              </span>
            </div>
            <h1 className="mt-4 text-center text-2xl font-black text-[#0f172a]">
              Bem-vindo ao Nexo! 👋
            </h1>
            <p className="mt-2 text-center text-sm text-[#64748b]">
              Vamos configurar sua loja em segundos. Como ela se chama?
            </p>

            {erro && (
              <div className="mt-5 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm text-[#b91c1c]">
                {erro}
              </div>
            )}

            <div className="mt-6">
              <label className="mb-2 block text-sm font-semibold text-[#475569]">
                Nome da loja
              </label>
              <input
                value={nomeLoja}
                onChange={(e) => setNomeLoja(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && salvar()}
                placeholder="Ex: Loja da Ana"
                className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none focus:border-[#2563eb] focus:bg-white"
                autoFocus
              />
              <p className="mt-2 text-xs text-[#94a3b8]">
                Esse nome aparece no seu painel e nos documentos (você pode mudar
                depois em Configurações).
              </p>
            </div>

            <button
              type="button"
              onClick={salvar}
              disabled={salvando}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#2563eb] px-4 py-3.5 text-sm font-bold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
            >
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              Continuar <ArrowRight className="h-4 w-4" />
            </button>
          </>
        ) : (
          <>
            <div className="flex justify-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#dcfce7] text-3xl">
                🎉
              </span>
            </div>
            <h1 className="mt-4 text-center text-2xl font-black text-[#0f172a]">
              Tudo pronto{nomeLoja ? `, ${nomeLoja}` : ""}!
            </h1>
            <p className="mt-2 text-center text-sm text-[#64748b]">
              Sua loja está criada. Que tal dar os primeiros passos?
            </p>

            <div className="mt-6 space-y-3">
              {proximosPassos.map((p) => {
                const Icon = p.icon;
                return (
                  <Link
                    key={p.titulo}
                    href={p.href}
                    className="flex items-center gap-3 rounded-2xl border border-[#eef2f7] bg-[#f8fafc] p-4 transition hover:border-[#c7d7fb] hover:bg-white"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#2563eb]/10 text-[#2563eb]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-[#0f172a]">
                        {p.titulo}
                      </span>
                      <span className="block text-xs text-[#64748b]">
                        {p.texto}
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-[#94a3b8]" />
                  </Link>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => router.replace("/dashboard")}
              className="mt-6 w-full rounded-2xl bg-[#2563eb] px-4 py-3.5 text-sm font-bold text-white transition hover:bg-[#1d4ed8]"
            >
              Ir para o painel
            </button>
          </>
        )}
      </div>
    </main>
  );
}
