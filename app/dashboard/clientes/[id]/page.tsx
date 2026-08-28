"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/dashboard/page-header";
import { EntityTimeline, type TimelineItem } from "@/components/dashboard/entity-timeline";
import { formatDataBR } from "@/lib/datas";
import { formatCurrency } from "@/lib/vendas-utils";
import {
  agregarPagamentosPromissoria,
  calcularSaldoPromissoria,
  calcularSaldoTotalPromissorias,
} from "@/lib/promissorias-utils";
import { ArrowLeft, ShoppingCart, FileText, ClipboardList, Sparkles } from "lucide-react";

type Cliente = {
  id: string;
  nome: string;
  telefone: string | null;
  cpf: string | null;
  status: string | null;
  email: string | null;
  endereco: string | null;
  observacoes: string | null;
  data_nascimento: string | null;
};

type Venda = {
  id: string;
  total: number | null;
  forma_pagamento: string | null;
  status: string;
  created_at: string;
};
type Promissoria = {
  id: string;
  valor_total: number | null;
  status: string;
  data_vencimento: string | null;
  created_at: string;
};
type Condicional = {
  id: string;
  status: string;
  data_saida: string | null;
  data_limite: string | null;
};
type Servico = {
  id: string;
  descricao: string | null;
  valor: number | null;
  percentual_loja: number | null;
  data: string;
};
type Tatuagem = {
  id: string;
  descricao: string | null;
  tatuador: string | null;
  valor: number | null;
  data: string;
};

function dataBR(d: string | null) {
  if (!d) return "—";
  const iso = d.length > 10 ? d : `${d}T00:00:00`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function ClienteHistoricoPage() {
  const params = useParams<{ id: string }>();
  const clienteId = params?.id as string;

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [promissorias, setPromissorias] = useState<Promissoria[]>([]);
  const [pagamentos, setPagamentos] = useState<
    { promissoria_id: string; valor: number }[]
  >([]);
  const [condicionais, setCondicionais] = useState<Condicional[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [tatuagens, setTatuagens] = useState<Tatuagem[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const clientePromise = supabase
        .from("clientes")
        .select(
          "id, nome, telefone, cpf, status, email, endereco, observacoes, data_nascimento"
        )
        .eq("id", clienteId)
        .maybeSingle();

      const [clienteRes, vRes, pRes, cRes, sRes, tRes, timelineRes] = await Promise.all([
        clientePromise,
        supabase
          .from("vendas")
          .select("id, total, forma_pagamento, status, created_at")
          .eq("cliente_id", clienteId)
          .order("created_at", { ascending: false }),
        supabase
          .from("promissorias")
          .select("id, valor_total, status, data_vencimento, created_at")
          .eq("cliente_id", clienteId)
          .order("created_at", { ascending: false }),
        supabase
          .from("condicionais")
          .select("id, status, data_saida, data_limite")
          .eq("cliente_id", clienteId)
          .order("created_at", { ascending: false }),
        supabase
          .from("atendimentos_servico")
          .select("id, descricao, valor, percentual_loja, data")
          .eq("cliente_id", clienteId)
          .order("data", { ascending: false }),
        supabase
          .from("tatuagem_atendimentos")
          .select("id, descricao, tatuador, valor, data")
          .eq("cliente_id", clienteId)
          .order("data", { ascending: false }),
        supabase.rpc("timeline_cliente", { p_cliente_id: clienteId }),
      ]);
      setCliente(clienteRes.data);
      setVendas(vRes.data || []);
      setPromissorias(pRes.data || []);
      setCondicionais(cRes.data || []);
      setServicos(sRes.data || []);
      setTatuagens(tRes.data || []);
      setTimeline((timelineRes.data as TimelineItem[] | null) || []);

      const ids = (pRes.data || []).map((p) => p.id);
      if (ids.length) {
        const pagRes = await supabase
          .from("promissoria_pagamentos")
          .select("promissoria_id, valor")
          .in("promissoria_id", ids);
        setPagamentos(pagRes.data || []);
      } else {
        setPagamentos([]);
      }
      setLoading(false);
    })();
  }, [clienteId]);

  const pagoPorProm = useMemo(() => {
    return agregarPagamentosPromissoria(pagamentos);
  }, [pagamentos]);

  const resumo = useMemo(() => {
    const concluidas = vendas.filter((v) => v.status === "concluida");
    const totalComprado = concluidas.reduce(
      (s, v) => s + Number(v.total || 0),
      0
    );
    const saldoDevedor = calcularSaldoTotalPromissorias(
      promissorias,
      pagoPorProm
    );
    const condAbertos = condicionais.filter((c) => c.status === "aberto").length;
    return {
      totalComprado,
      compras: concluidas.length,
      saldoDevedor,
      condAbertos,
    };
  }, [vendas, promissorias, condicionais, pagoPorProm]);

  if (loading) {
    return (
      <section className="space-y-6">
        <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
          <p className="text-[#64748b]">Carregando histórico...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <Link
        href="/dashboard/clientes"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#2563eb] hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar aos clientes
      </Link>

      <PageHeader
        eyebrow="Cliente"
        title={cliente?.nome || "Cliente"}
        description={`${cliente?.telefone || "Sem telefone"} · CPF ${cliente?.cpf || "—"}`}
      />

      <div className="grid gap-4 rounded-[30px] border border-[#e8ecf4] bg-white p-6 sm:grid-cols-2 xl:grid-cols-4">
        <DadoCliente titulo="E-mail" valor={cliente?.email || "Não informado"} />
        <DadoCliente
          titulo="Nascimento"
          valor={formatDataBR(cliente?.data_nascimento)}
        />
        <DadoCliente titulo="Status" valor={cliente?.status || "ativo"} />
        <DadoCliente titulo="Endereço" valor={cliente?.endereco || "Não informado"} />
        {cliente?.observacoes && (
          <div className="sm:col-span-2 xl:col-span-4">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[#94a3b8]">
              Observações
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-[#334155]">
              {cliente.observacoes}
            </p>
          </div>
        )}
      </div>

      {/* Resumo */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[28px] border border-[#bbf7d0] bg-[#f0fdf4] p-5">
          <p className="text-sm font-bold text-[#15803d]">Total comprado</p>
          <p className="mt-2 text-2xl font-black text-[#0f172a]">
            {formatCurrency(resumo.totalComprado)}
          </p>
        </div>
        <div className="rounded-[28px] border border-[#e8ecf4] bg-white p-5">
          <p className="text-sm font-bold text-[#475569]">Compras</p>
          <p className="mt-2 text-2xl font-black text-[#0f172a]">
            {resumo.compras}
          </p>
        </div>
        <div className="rounded-[28px] border border-[#fde68a] bg-[#fffbeb] p-5">
          <p className="text-sm font-bold text-[#92400e]">Saldo devedor</p>
          <p className="mt-2 text-2xl font-black text-[#0f172a]">
            {formatCurrency(resumo.saldoDevedor)}
          </p>
        </div>
        <div className="rounded-[28px] border border-[#bfdbfe] bg-[#eff6ff] p-5">
          <p className="text-sm font-bold text-[#1d4ed8]">Condicionais abertos</p>
          <p className="mt-2 text-2xl font-black text-[#0f172a]">
            {resumo.condAbertos}
          </p>
        </div>
      </div>

      <div>
        <div className="mb-3">
          <h2 className="text-lg font-black text-[#0f172a]">Linha do tempo</h2>
          <p className="text-sm text-[#64748b]">
            Compras, pagamentos, promissórias, condicionais e atendimentos em uma única sequência cronológica.
          </p>
        </div>
        <EntityTimeline items={timeline} vazio="Este cliente ainda não possui movimentações." />
      </div>

      <div className="border-t border-[#e8ecf4] pt-2">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#94a3b8]">Detalhes por tipo</p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Compras */}
        <Secao titulo="Compras" icon={ShoppingCart} vazio={vendas.length === 0}>
          {vendas.map((v) => (
            <Linha
              key={v.id}
              esquerda={
                <>
                  <p className="font-bold text-[#0f172a]">
                    {formatCurrency(Number(v.total || 0))}
                  </p>
                  <p className="text-xs text-[#64748b]">
                    {dataBR(v.created_at)} · {v.forma_pagamento}
                  </p>
                </>
              }
              direita={
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                    v.status === "concluida"
                      ? "bg-[#f0fdf4] text-[#15803d]"
                      : "bg-[#fef2f2] text-[#b91c1c]"
                  }`}
                >
                  {v.status}
                </span>
              }
            />
          ))}
        </Secao>

        {/* Promissórias */}
        <Secao
          titulo="Promissórias"
          icon={FileText}
          vazio={promissorias.length === 0}
        >
          {promissorias.map((p) => {
            const saldo = calcularSaldoPromissoria(
              Number(p.valor_total || 0),
              pagoPorProm[p.id] || 0,
              p.status
            );
            return (
              <Linha
                key={p.id}
                esquerda={
                  <>
                    <p className="font-bold text-[#0f172a]">
                      {formatCurrency(Number(p.valor_total || 0))}
                    </p>
                    <p className="text-xs text-[#64748b]">
                      Venc. {dataBR(p.data_vencimento)} · Saldo{" "}
                      {formatCurrency(saldo)}
                    </p>
                  </>
                }
                direita={
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                      p.status === "pago"
                        ? "bg-[#f0fdf4] text-[#15803d]"
                        : "bg-[#fffbeb] text-[#92400e]"
                    }`}
                  >
                    {p.status}
                  </span>
                }
              />
            );
          })}
        </Secao>

        {/* Condicionais */}
        <Secao
          titulo="Condicionais"
          icon={ClipboardList}
          vazio={condicionais.length === 0}
        >
          {condicionais.map((c) => (
            <Linha
              key={c.id}
              esquerda={
                <>
                  <p className="font-bold text-[#0f172a]">
                    Saída {dataBR(c.data_saida)}
                  </p>
                  <p className="text-xs text-[#64748b]">
                    Limite {dataBR(c.data_limite)}
                  </p>
                </>
              }
              direita={
                <span className="rounded-full bg-[#eff6ff] px-2.5 py-1 text-xs font-bold text-[#1d4ed8]">
                  {c.status}
                </span>
              }
            />
          ))}
        </Secao>

        {/* Serviços & Tatuagens */}
        <Secao
          titulo="Serviços & Tatuagens"
          icon={Sparkles}
          vazio={servicos.length === 0 && tatuagens.length === 0}
        >
          {servicos.map((s) => (
            <Linha
              key={s.id}
              esquerda={
                <>
                  <p className="font-bold text-[#0f172a]">
                    {s.descricao || "Serviço"}
                  </p>
                  <p className="text-xs text-[#64748b]">{dataBR(s.data)}</p>
                </>
              }
              direita={
                <p className="font-bold text-[#0f172a]">
                  {formatCurrency(Number(s.valor || 0))}
                </p>
              }
            />
          ))}
          {tatuagens.map((t) => (
            <Linha
              key={t.id}
              esquerda={
                <>
                  <p className="font-bold text-[#0f172a]">
                    {t.descricao || "Tatuagem"}
                    <span className="ml-1 text-xs font-normal text-[#64748b]">
                      {t.tatuador ? `· ${t.tatuador}` : ""}
                    </span>
                  </p>
                  <p className="text-xs text-[#64748b]">{dataBR(t.data)}</p>
                </>
              }
              direita={
                <p className="font-bold text-[#0f172a]">
                  {formatCurrency(Number(t.valor || 0))}
                </p>
              }
            />
          ))}
        </Secao>
      </div>
    </section>
  );
}

function Secao({
  titulo,
  icon: Icon,
  vazio,
  children,
}: {
  titulo: string;
  icon: typeof ShoppingCart;
  vazio: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-[#2563eb]" />
        <h2 className="text-lg font-black tracking-tight text-[#0f172a]">
          {titulo}
        </h2>
      </div>
      {vazio ? (
        <p className="mt-4 text-sm text-[#94a3b8]">Nada por aqui ainda.</p>
      ) : (
        <div className="mt-4 space-y-2">{children}</div>
      )}
    </div>
  );
}

function DadoCliente({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.12em] text-[#94a3b8]">
        {titulo}
      </p>
      <p className="mt-1 break-words text-sm font-semibold text-[#334155]">
        {valor}
      </p>
    </div>
  );
}

function Linha({
  esquerda,
  direita,
}: {
  esquerda: React.ReactNode;
  direita: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#e8ecf4] bg-[#f8fafc]/70 px-4 py-2.5">
      <div>{esquerda}</div>
      <div className="text-right">{direita}</div>
    </div>
  );
}
