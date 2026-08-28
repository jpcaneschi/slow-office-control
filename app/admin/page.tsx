"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Building2,
  Clock3,
  Copy,
  CreditCard,
  History,
  MailPlus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
  WalletCards,
  XCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/vendas-utils";

type Resumo = {
  solicitacoes_pendentes: number;
  clientes_liberados: number;
  assinaturas_ativas: number;
  assinaturas_atrasadas: number;
  receita_mensal_prevista: number;
  convites_pendentes: number;
};

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
  valor_mensal: number | null;
  current_period_end: string | null;
  provider: string | null;
  total_membros: number;
  ultimo_login: string | null;
};

type Convite = {
  id: string;
  email: string;
  nome: string | null;
  nome_loja: string | null;
  plano: string;
  valor_mensal: number | null;
  status: "pendente" | "usado" | "cancelado";
  expires_at: string | null;
  created_at: string;
};

type Mensalidade = {
  invoice_id: string | null;
  organization_id: string;
  user_id: string;
  organization_nome: string;
  email: string | null;
  plano: string | null;
  valor: number | null;
  competencia: string;
  vencimento: string | null;
  status: "nao_gerada" | "pendente" | "paga" | "atrasada" | "cancelada";
  pago_em: string | null;
  observacoes: string | null;
};

type Auditoria = {
  id: number;
  acao: string;
  admin_email: string;
  target_email: string | null;
  organization_nome: string | null;
  detalhes: Record<string, unknown>;
  created_at: string;
};

type EdicaoCliente = {
  plano: string;
  status: string;
  valor: string;
  validade: string;
};

const PLANOS = ["Essencial", "Profissional", "Master"] as const;
const STATUS_ASSINATURA = [
  { value: "ativa", label: "Ativa — acesso liberado" },
  { value: "trial", label: "Teste gratuito" },
  { value: "atrasada", label: "Em atraso — acesso bloqueado" },
  { value: "inativa", label: "Inativa — acesso bloqueado" },
  { value: "cancelada", label: "Cancelada — acesso bloqueado" },
] as const;

const resumoVazio: Resumo = {
  solicitacoes_pendentes: 0,
  clientes_liberados: 0,
  assinaturas_ativas: 0,
  assinaturas_atrasadas: 0,
  receita_mensal_prevista: 0,
  convites_pendentes: 0,
};

function hojeISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

function mesAtual() {
  return hojeISO().slice(0, 7);
}

function vencimentoPadrao(mes: string) {
  return `${mes}-10`;
}

function daquiADias(dias: number) {
  const data = new Date();
  data.setDate(data.getDate() + dias);
  return data.toISOString().slice(0, 10);
}

function dataBR(valor: string | null) {
  if (!valor) return "—";
  return new Date(valor.length === 10 ? `${valor}T12:00:00` : valor).toLocaleDateString(
    "pt-BR"
  );
}

function dataHoraBR(valor: string | null) {
  if (!valor) return "Nunca entrou";
  return new Date(valor).toLocaleString("pt-BR");
}

function numeroOuNull(valor: string) {
  if (!valor.trim()) return null;
  const numero = Number(valor.replace(",", "."));
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
}

const badgeAcesso = {
  pendente: "border-[#fed7aa] bg-[#fff7ed] text-[#c2410c]",
  aprovado: "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]",
  rejeitado: "border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]",
};

const badgeMensalidade: Record<string, string> = {
  paga: "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]",
  pendente: "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]",
  atrasada: "border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]",
  cancelada: "border-[#e2e8f0] bg-[#f8fafc] text-[#64748b]",
  nao_gerada: "border-[#fde68a] bg-[#fffbeb] text-[#b45309]",
};

const rotuloMensalidade: Record<string, string> = {
  paga: "Paga",
  pendente: "Pendente",
  atrasada: "Em atraso",
  cancelada: "Cancelada",
  nao_gerada: "Não gerada",
};

export default function AdminPage() {
  const [resumo, setResumo] = useState<Resumo>(resumoVazio);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [convites, setConvites] = useState<Convite[]>([]);
  const [mensalidades, setMensalidades] = useState<Mensalidade[]>([]);
  const [auditoria, setAuditoria] = useState<Auditoria[]>([]);
  const [edicoes, setEdicoes] = useState<Record<string, EdicaoCliente>>({});
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [accessFilter, setAccessFilter] = useState("todos");
  const [competencia, setCompetencia] = useState(mesAtual());
  const [dueDate, setDueDate] = useState(vencimentoPadrao(mesAtual()));

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteStore, setInviteStore] = useState("");
  const [invitePlan, setInvitePlan] = useState("Master");
  const [inviteValue, setInviteValue] = useState("");
  const [inviteExpires, setInviteExpires] = useState(daquiADias(14));

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [summaryRes, accessRes, inviteRes, invoiceRes, auditRes] =
      await Promise.all([
        supabase.rpc("admin_resumo_plataforma"),
        supabase.rpc("admin_listar_acessos"),
        supabase.rpc("admin_listar_convites"),
        supabase.rpc("admin_listar_mensalidades", {
          p_competencia: `${competencia}-01`,
        }),
        supabase.rpc("admin_listar_auditoria", { p_limite: 30 }),
      ]);

    const firstError =
      summaryRes.error ||
      accessRes.error ||
      inviteRes.error ||
      invoiceRes.error ||
      auditRes.error;
    if (firstError) setError(firstError.message);

    const accessList = (accessRes.data as unknown as Pedido[] | null) || [];
    setResumo((summaryRes.data as unknown as Resumo | null) || resumoVazio);
    setPedidos(accessList);
    setConvites((inviteRes.data as unknown as Convite[] | null) || []);
    setMensalidades((invoiceRes.data as unknown as Mensalidade[] | null) || []);
    setAuditoria((auditRes.data as unknown as Auditoria[] | null) || []);
    setEdicoes(
      Object.fromEntries(
        accessList.map((pedido) => [
          pedido.user_id,
          {
            plano: pedido.plano || "Master",
            status: pedido.assinatura_status || "ativa",
            valor:
              pedido.valor_mensal === null || pedido.valor_mensal === undefined
                ? ""
                : String(pedido.valor_mensal),
            validade: pedido.current_period_end?.slice(0, 10) || "",
          },
        ])
      )
    );
    setLoading(false);
  }, [competencia]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleRequests = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return pedidos.filter((pedido) => {
      if (accessFilter !== "todos" && pedido.status !== accessFilter) return false;
      if (!term) return true;
      return [
        pedido.nome,
        pedido.nome_loja,
        pedido.organization_nome,
        pedido.email,
        pedido.plano,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(term);
    });
  }, [accessFilter, pedidos, search]);

  function clearMessages() {
    setError("");
    setSuccess("");
  }

  function updateEdit(userId: string, patch: Partial<EdicaoCliente>) {
    setEdicoes((current) => ({
      ...current,
      [userId]: { ...current[userId], ...patch },
    }));
  }

  async function decideAccess(pedido: Pedido, approve: boolean) {
    const edit = edicoes[pedido.user_id];
    const action = approve ? "aprovar" : "revogar";
    if (
      !window.confirm(
        `Confirma ${action} o acesso de ${pedido.nome_loja || pedido.email}?`
      )
    ) {
      return;
    }

    clearMessages();
    setActing(`access-${pedido.id}`);
    const { error: rpcError } = await supabase.rpc("admin_decidir_acesso", {
      p_pedido_id: pedido.id,
      p_status: approve ? "aprovado" : "rejeitado",
      p_plano: approve ? edit?.plano || "Master" : null,
      p_valor_mensal: approve ? numeroOuNull(edit?.valor || "") : null,
    });
    if (rpcError) setError(rpcError.message);
    else {
      setSuccess(approve ? "Acesso aprovado com sucesso." : "Acesso revogado com sucesso.");
      await load();
    }
    setActing(null);
  }

  async function saveSubscription(pedido: Pedido) {
    const edit = edicoes[pedido.user_id];
    if (!edit) return;
    if (
      (edit.status === "atrasada" || edit.status === "cancelada") &&
      !window.confirm(
        "Esse status bloqueará imediatamente o acesso da loja ao sistema. Deseja continuar?"
      )
    ) {
      return;
    }

    clearMessages();
    setActing(`subscription-${pedido.id}`);
    const { error: rpcError } = await supabase.rpc("admin_definir_assinatura", {
      p_user_id: pedido.user_id,
      p_plano: edit.plano,
      p_status: edit.status,
      p_valor_mensal: numeroOuNull(edit.valor),
      p_current_period_end: edit.validade
        ? new Date(`${edit.validade}T23:59:59`).toISOString()
        : null,
    });
    if (rpcError) setError(rpcError.message);
    else {
      setSuccess("Plano e situação de acesso atualizados.");
      await load();
    }
    setActing(null);
  }

  async function createInvite(event: React.FormEvent) {
    event.preventDefault();
    clearMessages();
    setActing("invite-new");
    const { error: rpcError } = await supabase.rpc("admin_criar_convite", {
      p_email: inviteEmail.trim(),
      p_nome: inviteName.trim(),
      p_nome_loja: inviteStore.trim(),
      p_plano: invitePlan,
      p_valor_mensal: numeroOuNull(inviteValue),
      p_expira_em: inviteExpires
        ? new Date(`${inviteExpires}T23:59:59`).toISOString()
        : null,
    });
    if (rpcError) setError(rpcError.message);
    else {
      setSuccess(
        "Acesso adicionado. Se o e-mail já existia, ele foi liberado; caso contrário, o convite ficou pronto para cadastro."
      );
      setInviteEmail("");
      setInviteName("");
      setInviteStore("");
      await load();
    }
    setActing(null);
  }

  async function cancelInvite(invite: Convite) {
    if (!window.confirm(`Cancelar o convite de ${invite.email}?`)) return;
    clearMessages();
    setActing(`invite-${invite.id}`);
    const { error: rpcError } = await supabase.rpc("admin_cancelar_convite", {
      p_convite_id: invite.id,
    });
    if (rpcError) setError(rpcError.message);
    else {
      setSuccess("Convite cancelado.");
      await load();
    }
    setActing(null);
  }

  async function copyInvite(invite: Convite) {
    const url = `${window.location.origin}/login?novo=1&email=${encodeURIComponent(
      invite.email
    )}`;
    await navigator.clipboard.writeText(url);
    setSuccess("Link de cadastro copiado.");
  }

  async function generateInvoices() {
    clearMessages();
    setActing("invoice-generate");
    const { data, error: rpcError } = await supabase.rpc(
      "admin_gerar_mensalidades",
      {
        p_competencia: `${competencia}-01`,
        p_vencimento: dueDate,
      }
    );
    if (rpcError) setError(rpcError.message);
    else {
      setSuccess(`${Number(data || 0)} mensalidade(s) nova(s) gerada(s).`);
      await load();
    }
    setActing(null);
  }

  async function updateInvoice(invoice: Mensalidade, status: string) {
    if (!invoice.invoice_id) return;
    if (
      status === "atrasada" &&
      !window.confirm("Marcar como atrasada bloqueará o acesso dessa loja. Continuar?")
    ) {
      return;
    }
    clearMessages();
    setActing(`invoice-${invoice.invoice_id}`);
    const { error: rpcError } = await supabase.rpc(
      "admin_atualizar_mensalidade",
      {
        p_invoice_id: invoice.invoice_id,
        p_status: status,
        p_pago_em: status === "paga" ? new Date().toISOString() : null,
        p_observacoes: invoice.observacoes,
      }
    );
    if (rpcError) setError(rpcError.message);
    else {
      setSuccess("Mensalidade e acesso sincronizados.");
      await load();
    }
    setActing(null);
  }

  return (
    <div className="space-y-8">
      <section
        id="visao-geral"
        className="scroll-mt-24 overflow-hidden rounded-[30px] bg-gradient-to-br from-[#0b1f44] via-[#112f66] to-[#1d4ed8] p-6 text-white shadow-[0_20px_50px_rgba(15,47,102,0.2)] sm:p-8"
      >
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-blue-100">
              <ShieldCheck className="h-4 w-4" /> Área exclusiva do administrador
            </div>
            <h1 className="mt-5 text-3xl font-black tracking-tight sm:text-4xl">
              Controle a operação do Nexo pelo próprio site.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-blue-100/80 sm:text-base">
              Aprove cadastros, gerencie planos, acompanhe mensalidades e bloqueie ou
              reative acessos sem entrar no Supabase ou na Vercel.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/15 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar dados
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm font-semibold text-[#b91c1c]">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 text-sm font-semibold text-[#15803d]">
          {success}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          {
            label: "Aguardando aprovação",
            value: resumo.solicitacoes_pendentes,
            icon: Clock3,
            color: "#ea580c",
          },
          {
            label: "Clientes liberados",
            value: resumo.clientes_liberados,
            icon: Users,
            color: "#2563eb",
          },
          {
            label: "Assinaturas ativas",
            value: resumo.assinaturas_ativas,
            icon: UserCheck,
            color: "#16a34a",
          },
          {
            label: "Acessos em atraso",
            value: resumo.assinaturas_atrasadas,
            icon: AlertTriangle,
            color: "#dc2626",
          },
          {
            label: "Mensal previsto",
            value: formatCurrency(Number(resumo.receita_mensal_prevista || 0)),
            icon: WalletCards,
            color: "#7c3aed",
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="min-w-0 rounded-[24px] border border-[#e8ecf4] bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.04)]"
            >
              <span
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${card.color}16`, color: card.color }}
              >
                <Icon className="h-5 w-5" />
              </span>
              <p className="mt-4 text-2xl font-black tracking-tight text-[#0f172a]">
                {loading ? "…" : card.value}
              </p>
              <p className="mt-1 text-xs font-semibold text-[#64748b]">{card.label}</p>
            </div>
          );
        })}
      </section>

      <section id="clientes" className="scroll-mt-24 space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2563eb]">
              Clientes e acessos
            </p>
            <h2 className="mt-1 text-2xl font-black tracking-tight">Lojas da plataforma</h2>
            <p className="mt-1 text-sm text-[#64748b]">
              Aprovação do login e cobrança são controles separados, ambos protegidos no banco.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 sm:w-80">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar loja, responsável ou e-mail"
                className="w-full rounded-xl border border-[#dbe4f0] bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[#2563eb]"
              />
            </div>
            <select
              value={accessFilter}
              onChange={(event) => setAccessFilter(event.target.value)}
              className="rounded-xl border border-[#dbe4f0] bg-white px-3 py-2.5 text-sm font-semibold text-[#334155] outline-none focus:border-[#2563eb]"
            >
              <option value="todos">Todos os acessos</option>
              <option value="pendente">Aguardando</option>
              <option value="aprovado">Aprovados</option>
              <option value="rejeitado">Revogados</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="rounded-[26px] border border-[#e8ecf4] bg-white p-10 text-center text-sm text-[#64748b]">
            Carregando clientes…
          </div>
        ) : visibleRequests.length === 0 ? (
          <div className="rounded-[26px] border border-[#e8ecf4] bg-white p-10 text-center text-sm text-[#64748b]">
            Nenhum cliente encontrado neste filtro.
          </div>
        ) : (
          <div className="space-y-3">
            {visibleRequests.map((pedido) => {
              const edit = edicoes[pedido.user_id] || {
                plano: "Master",
                status: "ativa",
                valor: "",
                validade: "",
              };
              const busy = acting?.endsWith(pedido.id);
              return (
                <article
                  key={pedido.id}
                  className="rounded-[26px] border border-[#e8ecf4] bg-white p-5 shadow-[0_2px_10px_rgba(15,23,42,0.03)] sm:p-6"
                >
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-lg font-black text-[#0f172a]">
                          {pedido.organization_nome ||
                            pedido.nome_loja ||
                            "Loja ainda não criada"}
                        </h3>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${badgeAcesso[pedido.status]}`}
                        >
                          {pedido.status === "pendente"
                            ? "Aguardando"
                            : pedido.status === "aprovado"
                              ? "Login aprovado"
                              : "Login revogado"}
                        </span>
                        {pedido.assinatura_status && (
                          <span className="rounded-full border border-[#dbe4f0] bg-[#f8fafc] px-2.5 py-1 text-[11px] font-bold text-[#475569]">
                            Assinatura {pedido.assinatura_status}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-[#475569]">
                        {pedido.nome || "Responsável não informado"} · {pedido.email}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#94a3b8]">
                        <span>Solicitado: {dataBR(pedido.created_at)}</span>
                        <span>Último login: {dataHoraBR(pedido.ultimo_login)}</span>
                        {pedido.organization_id && (
                          <span>{Number(pedido.total_membros || 0)} usuário(s) na loja</span>
                        )}
                      </div>
                      {pedido.status === "aprovado" && !pedido.organization_id && (
                        <p className="mt-3 rounded-xl border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-xs font-semibold text-[#92400e]">
                          Aprovado. A loja será criada quando o cliente entrar pela primeira vez.
                        </p>
                      )}
                    </div>

                    <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:w-[620px] xl:grid-cols-4">
                      <label className="text-xs font-bold text-[#64748b]">
                        Plano
                        <select
                          value={edit.plano}
                          onChange={(event) =>
                            updateEdit(pedido.user_id, { plano: event.target.value })
                          }
                          className="mt-1.5 w-full rounded-xl border border-[#dbe4f0] bg-white px-3 py-2.5 text-sm font-semibold text-[#0f172a] outline-none focus:border-[#2563eb]"
                        >
                          {PLANOS.map((plan) => (
                            <option key={plan}>{plan}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs font-bold text-[#64748b]">
                        Mensalidade
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={edit.valor}
                          onChange={(event) =>
                            updateEdit(pedido.user_id, { valor: event.target.value })
                          }
                          placeholder="R$ 0,00"
                          className="mt-1.5 w-full rounded-xl border border-[#dbe4f0] bg-white px-3 py-2.5 text-sm font-semibold text-[#0f172a] outline-none focus:border-[#2563eb]"
                        />
                      </label>
                      {pedido.organization_id && pedido.status === "aprovado" ? (
                        <>
                          <label className="text-xs font-bold text-[#64748b]">
                            Situação
                            <select
                              value={edit.status}
                              onChange={(event) =>
                                updateEdit(pedido.user_id, { status: event.target.value })
                              }
                              className="mt-1.5 w-full rounded-xl border border-[#dbe4f0] bg-white px-3 py-2.5 text-sm font-semibold text-[#0f172a] outline-none focus:border-[#2563eb]"
                            >
                              {STATUS_ASSINATURA.map((status) => (
                                <option key={status.value} value={status.value}>
                                  {status.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-xs font-bold text-[#64748b]">
                            Acesso válido até
                            <input
                              type="date"
                              value={edit.validade}
                              onChange={(event) =>
                                updateEdit(pedido.user_id, {
                                  validade: event.target.value,
                                })
                              }
                              className="mt-1.5 w-full rounded-xl border border-[#dbe4f0] bg-white px-3 py-2.5 text-sm font-semibold text-[#0f172a] outline-none focus:border-[#2563eb]"
                            />
                          </label>
                        </>
                      ) : (
                        <div className="sm:col-span-2" />
                      )}
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-[#eef2f7] pt-4">
                    {pedido.status === "aprovado" && pedido.organization_id && (
                      <button
                        type="button"
                        onClick={() => saveSubscription(pedido)}
                        disabled={busy}
                        className="inline-flex items-center gap-2 rounded-xl border border-[#bfdbfe] bg-[#eff6ff] px-4 py-2.5 text-sm font-bold text-[#1d4ed8] transition hover:bg-[#dbeafe] disabled:opacity-50"
                      >
                        <CreditCard className="h-4 w-4" /> Salvar plano e acesso
                      </button>
                    )}
                    {pedido.status !== "rejeitado" && (
                      <button
                        type="button"
                        onClick={() => decideAccess(pedido, false)}
                        disabled={busy}
                        className="inline-flex items-center gap-2 rounded-xl border border-[#fecaca] px-4 py-2.5 text-sm font-bold text-[#b91c1c] transition hover:bg-[#fef2f2] disabled:opacity-50"
                      >
                        <Ban className="h-4 w-4" /> Revogar login
                      </button>
                    )}
                    {pedido.status !== "aprovado" && (
                      <button
                        type="button"
                        onClick={() => decideAccess(pedido, true)}
                        disabled={busy}
                        className="inline-flex items-center gap-2 rounded-xl bg-[#2563eb] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#1d4ed8] disabled:opacity-50"
                      >
                        <UserCheck className="h-4 w-4" />
                        {busy ? "Salvando…" : "Aprovar e liberar"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section id="mensalidades" className="scroll-mt-24 space-y-4">
        <div className="rounded-[28px] border border-[#e8ecf4] bg-white p-5 sm:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#7c3aed]">
                Cobrança mensal
              </p>
              <h2 className="mt-1 text-2xl font-black tracking-tight">Mensalidades</h2>
              <p className="mt-1 text-sm text-[#64748b]">
                Marcar “em atraso” bloqueia o acesso; marcar “paga” reativa automaticamente.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-[160px_180px_auto]">
              <label className="text-xs font-bold text-[#64748b]">
                Competência
                <input
                  type="month"
                  value={competencia}
                  onChange={(event) => {
                    setCompetencia(event.target.value);
                    setDueDate(vencimentoPadrao(event.target.value));
                  }}
                  className="mt-1.5 w-full rounded-xl border border-[#dbe4f0] px-3 py-2.5 text-sm font-semibold outline-none focus:border-[#7c3aed]"
                />
              </label>
              <label className="text-xs font-bold text-[#64748b]">
                Vencimento
                <input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[#dbe4f0] px-3 py-2.5 text-sm font-semibold outline-none focus:border-[#7c3aed]"
                />
              </label>
              <button
                type="button"
                onClick={generateInvoices}
                disabled={acting === "invoice-generate"}
                className="self-end rounded-xl bg-[#7c3aed] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#6d28d9] disabled:opacity-50"
              >
                Gerar mensalidades
              </button>
            </div>
          </div>

          <div className="mt-6 divide-y divide-[#eef2f7] border-t border-[#eef2f7]">
            {mensalidades.length === 0 ? (
              <p className="py-10 text-center text-sm text-[#64748b]">
                Nenhuma loja disponível nesta competência.
              </p>
            ) : (
              mensalidades.map((invoice) => (
                <div
                  key={invoice.organization_id}
                  className="flex flex-col gap-4 py-4 lg:flex-row lg:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-black text-[#0f172a]">
                        {invoice.organization_nome}
                      </p>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${badgeMensalidade[invoice.status]}`}
                      >
                        {rotuloMensalidade[invoice.status]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[#64748b]">
                      {invoice.email || "Sem e-mail"} · Plano {invoice.plano || "não definido"}
                    </p>
                    <p className="mt-1 text-xs text-[#94a3b8]">
                      Vencimento: {dataBR(invoice.vencimento)}
                      {invoice.pago_em ? ` · Pago em ${dataBR(invoice.pago_em)}` : ""}
                    </p>
                  </div>
                  <p className="text-lg font-black text-[#0f172a]">
                    {invoice.valor === null ? "Valor não definido" : formatCurrency(invoice.valor)}
                  </p>
                  {invoice.invoice_id ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => updateInvoice(invoice, "paga")}
                        disabled={acting === `invoice-${invoice.invoice_id}`}
                        className="rounded-xl border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2 text-xs font-bold text-[#15803d] disabled:opacity-50"
                      >
                        Marcar paga
                      </button>
                      <button
                        type="button"
                        onClick={() => updateInvoice(invoice, "atrasada")}
                        disabled={acting === `invoice-${invoice.invoice_id}`}
                        className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-xs font-bold text-[#b91c1c] disabled:opacity-50"
                      >
                        Em atraso
                      </button>
                      <button
                        type="button"
                        onClick={() => updateInvoice(invoice, "pendente")}
                        disabled={acting === `invoice-${invoice.invoice_id}`}
                        className="rounded-xl border border-[#dbe4f0] px-3 py-2 text-xs font-bold text-[#475569] disabled:opacity-50"
                      >
                        Pendente
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs font-semibold text-[#b45309]">
                      Defina valor e gere a mensalidade.
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section id="convites" className="scroll-mt-24 grid gap-5 xl:grid-cols-[1fr_1.15fr]">
        <form
          onSubmit={createInvite}
          className="rounded-[28px] border border-[#e8ecf4] bg-white p-5 sm:p-6"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eff6ff] text-[#2563eb]">
              <MailPlus className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2563eb]">
                Adicionar acesso
              </p>
              <h2 className="text-xl font-black">Convidar novo cliente</h2>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-[#64748b]">
            O cliente cria a própria senha. Se o e-mail já estiver cadastrado, a
            aprovação acontece imediatamente.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-[#64748b] sm:col-span-2">
              E-mail
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[#dbe4f0] px-3 py-3 text-sm outline-none focus:border-[#2563eb]"
                placeholder="cliente@loja.com.br"
              />
            </label>
            <label className="text-xs font-bold text-[#64748b]">
              Responsável
              <input
                value={inviteName}
                onChange={(event) => setInviteName(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[#dbe4f0] px-3 py-3 text-sm outline-none focus:border-[#2563eb]"
                placeholder="Nome do cliente"
              />
            </label>
            <label className="text-xs font-bold text-[#64748b]">
              Loja
              <input
                value={inviteStore}
                onChange={(event) => setInviteStore(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[#dbe4f0] px-3 py-3 text-sm outline-none focus:border-[#2563eb]"
                placeholder="Nome da empresa"
              />
            </label>
            <label className="text-xs font-bold text-[#64748b]">
              Plano
              <select
                value={invitePlan}
                onChange={(event) => setInvitePlan(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[#dbe4f0] bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-[#2563eb]"
              >
                {PLANOS.map((plan) => (
                  <option key={plan}>{plan}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-[#64748b]">
              Valor mensal
              <input
                type="number"
                min="0"
                step="0.01"
                value={inviteValue}
                onChange={(event) => setInviteValue(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[#dbe4f0] px-3 py-3 text-sm outline-none focus:border-[#2563eb]"
                placeholder="Ex.: 149,90"
              />
            </label>
            <label className="text-xs font-bold text-[#64748b] sm:col-span-2">
              Convite válido até
              <input
                type="date"
                value={inviteExpires}
                onChange={(event) => setInviteExpires(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[#dbe4f0] px-3 py-3 text-sm outline-none focus:border-[#2563eb]"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={acting === "invite-new"}
            className="mt-5 w-full rounded-xl bg-[#2563eb] px-4 py-3 font-bold text-white transition hover:bg-[#1d4ed8] disabled:opacity-50"
          >
            {acting === "invite-new" ? "Adicionando…" : "Adicionar e liberar acesso"}
          </button>
        </form>

        <div className="rounded-[28px] border border-[#e8ecf4] bg-white p-5 sm:p-6">
          <h2 className="text-xl font-black">Convites recentes</h2>
          <p className="mt-1 text-sm text-[#64748b]">
            {resumo.convites_pendentes} convite(s) aguardando cadastro.
          </p>
          <div className="mt-5 divide-y divide-[#eef2f7]">
            {convites.length === 0 ? (
              <p className="py-8 text-center text-sm text-[#64748b]">
                Nenhum convite criado.
              </p>
            ) : (
              convites.slice(0, 12).map((invite) => (
                <div key={invite.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-black text-[#0f172a]">
                        {invite.nome_loja || invite.nome || invite.email}
                      </p>
                      <span className="rounded-full bg-[#f1f5f9] px-2 py-0.5 text-[10px] font-black uppercase text-[#64748b]">
                        {invite.status}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-[#64748b]">{invite.email}</p>
                    <p className="mt-1 text-[11px] text-[#94a3b8]">
                      {invite.plano} · {invite.valor_mensal === null ? "sem valor" : formatCurrency(invite.valor_mensal)} · vence {dataBR(invite.expires_at)}
                    </p>
                  </div>
                  {invite.status === "pendente" && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => copyInvite(invite)}
                        className="rounded-lg border border-[#dbe4f0] p-2 text-[#475569] hover:bg-[#f8fafc]"
                        aria-label={`Copiar link para ${invite.email}`}
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => cancelInvite(invite)}
                        disabled={acting === `invite-${invite.id}`}
                        className="rounded-lg border border-[#fecaca] p-2 text-[#b91c1c] hover:bg-[#fef2f2] disabled:opacity-50"
                        aria-label={`Cancelar convite de ${invite.email}`}
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section
        id="historico"
        className="scroll-mt-24 rounded-[28px] border border-[#e8ecf4] bg-white p-5 sm:p-6"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f1f5f9] text-[#475569]">
            <History className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-xl font-black">Histórico administrativo</h2>
            <p className="text-xs text-[#64748b]">Registro das ações sensíveis realizadas.</p>
          </div>
        </div>
        <div className="mt-5 divide-y divide-[#eef2f7] border-t border-[#eef2f7]">
          {auditoria.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#64748b]">
              O histórico começará após a primeira ação nesta central.
            </p>
          ) : (
            auditoria.map((event) => (
              <div key={event.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:gap-4">
                <span className="rounded-lg bg-[#f1f5f9] px-2.5 py-1 text-xs font-black text-[#475569]">
                  {event.acao.replaceAll("_", " ")}
                </span>
                <p className="min-w-0 flex-1 truncate text-sm text-[#334155]">
                  {event.organization_nome || event.target_email || "Plataforma"}
                </p>
                <p className="text-xs text-[#94a3b8]">{dataHoraBR(event.created_at)}</p>
              </div>
            ))
          )}
        </div>
      </section>

      <div className="flex items-center gap-2 rounded-2xl border border-[#dbe4f0] bg-[#f8fafc] px-4 py-3 text-xs text-[#64748b]">
        <Building2 className="h-4 w-4 shrink-0 text-[#2563eb]" />
        Esta central administra somente cadastros e cobrança. Ela não concede acesso às vendas,
        clientes, estoque ou financeiro de nenhuma loja.
      </div>
    </div>
  );
}
