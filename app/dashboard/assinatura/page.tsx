"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/dashboard/page-header";
import { CheckCircle2, AlertTriangle, CreditCard, ExternalLink } from "lucide-react";

type Assinatura = {
  status: string;
  plano: string | null;
  valor: number | null;
  current_period_end: string | null;
  provider: string | null;
};

const STATUS_INFO: Record<
  string,
  { label: string; cor: string; bg: string; borda: string }
> = {
  ativa: { label: "Ativa", cor: "#15803d", bg: "#f0fdf4", borda: "#bbf7d0" },
  trial: { label: "Teste gratuito", cor: "#1d4ed8", bg: "#eff6ff", borda: "#bfdbfe" },
  atrasada: { label: "Pagamento atrasado", cor: "#b45309", bg: "#fffbeb", borda: "#fde68a" },
  cancelada: { label: "Cancelada", cor: "#b91c1c", bg: "#fef2f2", borda: "#fecaca" },
  inativa: { label: "Sem assinatura", cor: "#475569", bg: "#f8fafc", borda: "#e8ecf4" },
};

export default function AssinaturaPage() {
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);

  const checkoutBase = process.env.NEXT_PUBLIC_CHECKOUT_URL || "";
  const portalUrl = process.env.NEXT_PUBLIC_CHECKOUT_PORTAL_URL || "";

  async function carregar() {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setEmail(user?.email || "");

    const { data } = await supabase
      .from("subscriptions")
      .select("status, plano, valor, current_period_end, provider")
      .limit(1)
      .maybeSingle();
    setAssinatura(data);
    setLoading(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  const status = assinatura?.status || "inativa";
  const info = STATUS_INFO[status] || STATUS_INFO.inativa;
  const ativa = status === "ativa" || status === "trial";

  const checkoutUrl = checkoutBase
    ? `${checkoutBase}${checkoutBase.includes("?") ? "&" : "?"}email=${encodeURIComponent(email)}`
    : "";

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Plano e cobrança"
        title="Assinatura"
        description="Gerencie o plano do Nexo para a sua empresa."
      />

      {loading ? (
        <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
          <p className="text-[#64748b]">Carregando...</p>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          {/* Status atual */}
          <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
            <div className="flex items-center gap-3">
              <span
                className="flex h-11 w-11 items-center justify-center rounded-2xl"
                style={{ background: info.bg, color: info.cor }}
              >
                {ativa ? (
                  <CheckCircle2 className="h-6 w-6" />
                ) : (
                  <AlertTriangle className="h-6 w-6" />
                )}
              </span>
              <div>
                <p className="text-sm text-[#64748b]">Status da assinatura</p>
                <p className="text-xl font-black text-[#0f172a]">{info.label}</p>
              </div>
              <span
                className="ml-auto rounded-full border px-3 py-1 text-xs font-bold"
                style={{ color: info.cor, background: info.bg, borderColor: info.borda }}
              >
                {info.label}
              </span>
            </div>

            <div className="mt-5 grid gap-3 rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] p-4 text-sm text-[#475569]">
              <p>
                E-mail da conta:{" "}
                <span className="font-bold text-[#0f172a]">{email || "—"}</span>
              </p>
              {assinatura?.provider && (
                <p>
                  Provedor:{" "}
                  <span className="font-bold text-[#0f172a]">
                    {assinatura.provider}
                  </span>
                </p>
              )}
              {assinatura?.current_period_end && (
                <p>
                  Válida até:{" "}
                  <span className="font-bold text-[#0f172a]">
                    {new Date(assinatura.current_period_end).toLocaleDateString(
                      "pt-BR"
                    )}
                  </span>
                </p>
              )}
              <p className="text-xs text-[#94a3b8]">
                Use o mesmo e-mail acima ao pagar — é assim que a assinatura é
                vinculada à sua empresa automaticamente.
              </p>
            </div>

            {!ativa ? (
              checkoutUrl ? (
                <a
                  href={checkoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#2563eb] px-4 py-3.5 font-bold text-white transition hover:bg-[#1d4ed8]"
                >
                  <CreditCard className="h-5 w-5" />
                  Assinar agora
                </a>
              ) : (
                <p className="mt-5 rounded-2xl border border-[#fde68a] bg-[#fffbeb] p-4 text-sm text-[#92400e]">
                  O link de checkout ainda não foi configurado. Defina{" "}
                  <code>NEXT_PUBLIC_CHECKOUT_URL</code> nas variáveis de ambiente
                  com o link do produto de assinatura (Kiwify/Cacto).
                </p>
              )
            ) : (
              portalUrl && (
                <a
                  href={portalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-[#e8ecf4] px-4 py-3 font-bold text-[#334155] transition hover:bg-[#f4f6fb]"
                >
                  Gerenciar assinatura <ExternalLink className="h-4 w-4" />
                </a>
              )
            )}
          </div>

          {/* O que está incluído */}
          <div className="rounded-[30px] border border-[#2563eb]/20 bg-[#2563eb]/[0.05] p-6">
            <p className="text-sm font-black uppercase tracking-wide text-[#2563eb]">
              Plano {assinatura?.plano || "Nexo"}
            </p>
            <ul className="mt-4 space-y-2.5 text-sm text-[#334155]">
              {[
                "Vendas, estoque e variações",
                "Financeiro com lucro e COGS",
                "Promissórias e fiado",
                "Funcionários, comissões e vales",
                "Serviços e atendimentos",
                "Papéis e permissões da equipe",
                "Relatórios e documentos em PDF",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#2563eb]" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
