"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  CreditCard,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/dashboard/page-header";

type Pedido = {
  id: string;
  user_id: string;
  email: string;
  nome: string | null;
  nome_loja: string | null;
  status: "pendente" | "aprovado" | "rejeitado";
  created_at: string;
  decided_at: string | null;
  organization_id: string | null;
  organization_nome: string | null;
  plano: string | null;
  assinatura_status: string | null;
  current_period_end: string | null;
};

const PLANOS = ["Essencial", "Profissional", "Master"] as const;

const statusVisual = {
  pendente: {
    label: "Aguardando",
    className: "bg-[#fff7ed] text-[#c2410c]",
    icon: Clock3,
  },
  aprovado: {
    label: "Aprovado",
    className: "bg-[#f0fdf4] text-[#15803d]",
    icon: CheckCircle2,
  },
  rejeitado: {
    label: "Não liberado",
    className: "bg-[#fef2f2] text-[#b91c1c]",
    icon: XCircle,
  },
};

export default function AcessosPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState<"todos" | Pedido["status"]>("pendente");
  const [planoSelecionado, setPlanoSelecionado] = useState<Record<string, string>>(
    {}
  );

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro("");
    const { data, error } = await supabase.rpc("admin_listar_acessos");
    if (error) setErro(error.message);
    const lista = (data as Pedido[]) || [];
    setPedidos(lista);
    setPlanoSelecionado((atual) => {
      const proximo = { ...atual };
      for (const pedido of lista) {
        if (!proximo[pedido.user_id]) {
          proximo[pedido.user_id] = pedido.plano || "Master";
        }
      }
      return proximo;
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const totais = useMemo(
    () => ({
      pendente: pedidos.filter((p) => p.status === "pendente").length,
      aprovado: pedidos.filter((p) => p.status === "aprovado").length,
      rejeitado: pedidos.filter((p) => p.status === "rejeitado").length,
    }),
    [pedidos]
  );

  const visiveis =
    filtro === "todos" ? pedidos : pedidos.filter((p) => p.status === filtro);

  async function decidir(pedido: Pedido, aprovar: boolean) {
    const acao = aprovar ? "liberar" : "não liberar";
    if (!window.confirm(`Deseja ${acao} o acesso de ${pedido.email}?`)) return;

    setSalvando(pedido.id);
    setErro("");
    const { error } = await supabase.rpc("admin_decidir_acesso", {
      p_pedido_id: pedido.id,
      p_status: aprovar ? "aprovado" : "rejeitado",
    });

    if (error) setErro(error.message);
    else await carregar();
    setSalvando(null);
  }

  async function ativarPlano(pedido: Pedido) {
    const plano = planoSelecionado[pedido.user_id] || "Master";
    setSalvando(pedido.id);
    setErro("");
    const { error } = await supabase.rpc("admin_definir_assinatura", {
      p_user_id: pedido.user_id,
      p_plano: plano,
      p_status: "ativa",
    });
    if (error) setErro(error.message);
    else await carregar();
    setSalvando(null);
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          eyebrow="Administração Nexo"
          title="Novos acessos"
          description="Analise cada solicitação antes de permitir que uma nova loja entre no sistema. Nenhum cadastro é liberado automaticamente."
        />
        <button
          type="button"
          onClick={carregar}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-[#dbe4f0] bg-white px-4 py-2.5 text-sm font-bold text-[#334155] transition hover:bg-[#f8fafc] disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {(["pendente", "aprovado", "rejeitado"] as const).map((status) => {
          const visual = statusVisual[status];
          const Icon = visual.icon;
          return (
            <button
              key={status}
              type="button"
              onClick={() => setFiltro(status)}
              className={`rounded-[24px] border bg-white p-5 text-left transition ${
                filtro === status
                  ? "border-[#2563eb] ring-2 ring-[#2563eb]/10"
                  : "border-[#e8ecf4] hover:border-[#bfdbfe]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`rounded-xl p-2.5 ${visual.className}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-3xl font-black text-[#0f172a]">
                  {totais[status]}
                </span>
              </div>
              <p className="mt-4 text-sm font-bold text-[#475569]">{visual.label}</p>
            </button>
          );
        })}
      </div>

      {erro && (
        <div className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">
          {erro}
        </div>
      )}

      <div className="overflow-hidden rounded-[28px] border border-[#e8ecf4] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eef2f7] px-6 py-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[#2563eb]" />
            <h2 className="font-black text-[#0f172a]">Solicitações</h2>
          </div>
          <button
            type="button"
            onClick={() => setFiltro("todos")}
            className="text-xs font-bold text-[#2563eb] hover:underline"
          >
            Ver todas
          </button>
        </div>

        {loading ? (
          <p className="px-6 py-10 text-center text-sm text-[#64748b]">
            Carregando solicitações...
          </p>
        ) : visiveis.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <CheckCircle2 className="mx-auto h-9 w-9 text-[#22c55e]" />
            <p className="mt-3 font-bold text-[#0f172a]">Tudo em dia</p>
            <p className="mt-1 text-sm text-[#64748b]">
              Não há solicitações neste filtro.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#eef2f7]">
            {visiveis.map((pedido) => {
              const visual = statusVisual[pedido.status];
              const Icon = visual.icon;
              return (
                <div
                  key={pedido.id}
                  className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-black text-[#0f172a]">
                        {pedido.nome_loja || "Loja ainda não informada"}
                      </p>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${visual.className}`}
                      >
                        <Icon className="h-3.5 w-3.5" /> {visual.label}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[#475569]">
                      {pedido.nome || "Responsável não informado"} · {pedido.email}
                    </p>
                    <p className="mt-1 text-xs text-[#94a3b8]">
                      Solicitado em {new Date(pedido.created_at).toLocaleString("pt-BR")}
                    </p>
                    {pedido.organization_id ? (
                      <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#475569]">
                        <span className="font-bold">
                          {pedido.organization_nome || pedido.nome_loja || "Empresa"}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          Plano {pedido.plano || "não definido"} — {pedido.assinatura_status || "inativo"}
                        </span>
                      </p>
                    ) : pedido.status === "aprovado" ? (
                      <p className="mt-2 text-xs font-semibold text-[#b45309]">
                        Aguardando o cliente entrar e concluir a criação da loja.
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {pedido.organization_id && pedido.status === "aprovado" && (
                      <>
                        <select
                          value={planoSelecionado[pedido.user_id] || pedido.plano || "Master"}
                          onChange={(event) =>
                            setPlanoSelecionado((atual) => ({
                              ...atual,
                              [pedido.user_id]: event.target.value,
                            }))
                          }
                          aria-label={`Plano de ${pedido.email}`}
                          className="rounded-xl border border-[#dbe4f0] bg-white px-3 py-2.5 text-sm font-bold text-[#334155] outline-none focus:border-[#2563eb]"
                        >
                          {PLANOS.map((plano) => (
                            <option key={plano} value={plano}>
                              {plano}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => ativarPlano(pedido)}
                          disabled={salvando === pedido.id}
                          className="inline-flex items-center gap-2 rounded-xl border border-[#bfdbfe] bg-[#eff6ff] px-4 py-2.5 text-sm font-bold text-[#1d4ed8] transition hover:bg-[#dbeafe] disabled:opacity-50"
                        >
                          <CreditCard className="h-4 w-4" /> Ativar plano
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => decidir(pedido, false)}
                      disabled={salvando === pedido.id}
                      className="rounded-xl border border-[#fecaca] px-4 py-2.5 text-sm font-bold text-[#b91c1c] transition hover:bg-[#fef2f2] disabled:opacity-50"
                    >
                      Não liberar
                    </button>
                    <button
                      type="button"
                      onClick={() => decidir(pedido, true)}
                      disabled={salvando === pedido.id}
                      className="rounded-xl bg-[#2563eb] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#1d4ed8] disabled:opacity-50"
                    >
                      {salvando === pedido.id ? "Salvando..." : "Liberar acesso"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
