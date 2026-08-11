"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/dashboard/page-header";
import { ShieldCheck } from "lucide-react";

type Log = {
  id: string;
  user_id: string | null;
  acao: string;
  entidade: string | null;
  registro_id: string | null;
  dados: Record<string, unknown> | null;
  created_at: string;
};

const ACAO_LABEL: Record<string, string> = {
  venda_criada: "Venda criada",
  venda_cancelada: "Venda cancelada",
  papel_alterado: "Papel alterado",
  membro_removido: "Membro removido",
  produto_excluido: "Produto excluído",
};

const ACAO_COR: Record<string, string> = {
  venda_criada: "#15803d",
  venda_cancelada: "#b91c1c",
  papel_alterado: "#1d4ed8",
  membro_removido: "#b91c1c",
  produto_excluido: "#b45309",
};

export default function AuditoriaPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [emailPorUser, setEmailPorUser] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  async function carregar() {
    setLoading(true);
    const [logsRes, membrosRes] = await Promise.all([
      supabase
        .from("audit_logs")
        .select("id, user_id, acao, entidade, registro_id, dados, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("organization_members").select("user_id, email"),
    ]);
    setLogs((logsRes.data as Log[]) || []);
    const mapa: Record<string, string> = {};
    for (const m of membrosRes.data || []) {
      if (m.user_id) mapa[m.user_id as string] = (m.email as string) || "";
    }
    setEmailPorUser(mapa);
    setLoading(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  const linhas = useMemo(
    () =>
      logs.map((l) => ({
        ...l,
        autor: (l.user_id && emailPorUser[l.user_id]) || "—",
        label: ACAO_LABEL[l.acao] || l.acao,
        cor: ACAO_COR[l.acao] || "#475569",
        detalhe: l.dados
          ? Object.entries(l.dados)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ")
          : "",
      })),
    [logs, emailPorUser]
  );

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Segurança"
        title="Auditoria"
        description="Histórico de ações importantes na sua empresa: quem fez o quê e quando."
      />

      <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
        <div className="flex items-center gap-2 text-[#475569]">
          <ShieldCheck className="h-5 w-5 text-[#2563eb]" />
          <p className="text-sm">
            Registro imutável das últimas 200 ações. Somente o dono tem acesso.
          </p>
        </div>

        {loading ? (
          <p className="mt-5 text-[#64748b]">Carregando...</p>
        ) : linhas.length === 0 ? (
          <p className="mt-5 text-[#64748b]">
            Nenhuma ação registrada ainda. Ações como criar/cancelar venda,
            trocar papéis e excluir produtos aparecem aqui.
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-[#e8ecf4] text-left text-xs uppercase tracking-wide text-[#94a3b8]">
                  <th className="pb-3 pr-4 font-bold">Quando</th>
                  <th className="pb-3 pr-4 font-bold">Quem</th>
                  <th className="pb-3 pr-4 font-bold">Ação</th>
                  <th className="pb-3 font-bold">Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id} className="border-b border-[#f1f5f9]">
                    <td className="py-3 pr-4 whitespace-nowrap text-[#64748b]">
                      {new Date(l.created_at).toLocaleString("pt-BR")}
                    </td>
                    <td className="py-3 pr-4 text-[#0f172a]">{l.autor}</td>
                    <td className="py-3 pr-4">
                      <span
                        className="rounded-full px-2.5 py-1 text-xs font-bold"
                        style={{ color: l.cor, background: `${l.cor}15` }}
                      >
                        {l.label}
                      </span>
                    </td>
                    <td className="py-3 text-[#64748b]">{l.detalhe || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
