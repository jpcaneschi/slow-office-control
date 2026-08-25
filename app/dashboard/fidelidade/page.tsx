"use client";

import { useEffect, useMemo, useState } from "react";
import { Gift, MessageCircle, CheckCircle2, Clock3, Ticket } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { supabase } from "@/lib/supabase";
import { carregarConfigEmpresa } from "@/lib/empresa-config";
import { criarLinkWhatsApp } from "@/lib/whatsapp-utils";
import {
  type CupomPosVenda,
  formatarDataCurta,
  mensagemCuponsPosVenda,
  statusVisualCupom,
} from "@/lib/fidelidade-utils";

type Cliente = {
  id: string;
  nome: string;
  telefone: string | null;
};

const statusClasses = {
  ativo: "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]",
  usado: "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]",
  expirado: "border-[#fed7aa] bg-[#fff7ed] text-[#c2410c]",
  cancelado: "border-[#e2e8f0] bg-[#f8fafc] text-[#64748b]",
};

export default function FidelidadePage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cupons, setCupons] = useState<CupomPosVenda[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [quantidade, setQuantidade] = useState<5 | 10>(5);
  const [loading, setLoading] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [usandoId, setUsandoId] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [nomeLoja, setNomeLoja] = useState("Nexo");

  async function carregar() {
    setLoading(true);
    setErro("");
    const cfg = await carregarConfigEmpresa();
    setNomeLoja(cfg.nome_operacao || "Nexo");

    const [clientesRes, cuponsRes] = await Promise.all([
      supabase.from("clientes").select("id, nome, telefone").order("nome"),
      supabase
        .from("cupons_pos_venda")
        .select("id, cliente_id, codigo, status, validade, utilizado_em, created_at")
        .order("created_at", { ascending: false }),
    ]);

    if (clientesRes.error) setErro(clientesRes.error.message);
    if (cuponsRes.error) {
      setErro(
        cuponsRes.error.code === "42P01"
          ? "A atualização de fidelidade ainda não foi aplicada ao banco."
          : cuponsRes.error.message
      );
    }
    setClientes((clientesRes.data as Cliente[] | null) || []);
    setCupons((cuponsRes.data as CupomPosVenda[] | null) || []);
    setLoading(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  const clienteSelecionado = clientes.find((cliente) => cliente.id === clienteId);
  const clientesPorId = useMemo(
    () => new Map(clientes.map((cliente) => [cliente.id, cliente])),
    [clientes]
  );

  const resumo = useMemo(() => {
    let ativos = 0;
    let usados = 0;
    let expirados = 0;
    for (const cupom of cupons) {
      const status = statusVisualCupom(cupom);
      if (status === "ativo") ativos++;
      else if (status === "usado") usados++;
      else if (status === "expirado") expirados++;
    }
    return { ativos, usados, expirados };
  }, [cupons]);

  async function gerarEEnviar() {
    setErro("");
    setSucesso("");
    if (!clienteSelecionado) {
      setErro("Selecione um cliente.");
      return;
    }
    if (!clienteSelecionado.telefone) {
      setErro("Cadastre o WhatsApp do cliente antes de gerar e enviar os cupons.");
      return;
    }

    setGerando(true);
    const { data, error } = await supabase.rpc("gerar_cupons_pos_venda", {
      p_cliente_id: clienteSelecionado.id,
      p_quantidade: quantidade,
      p_validade_dias: 7,
    });

    if (error) {
      setErro(error.message);
      setGerando(false);
      return;
    }

    const gerados = (data as CupomPosVenda[] | null) || [];
    const mensagem = mensagemCuponsPosVenda({
      nomeCliente: clienteSelecionado.nome,
      nomeLoja,
      cupons: gerados,
    });
    const link = criarLinkWhatsApp(clienteSelecionado.telefone, mensagem);
    if (link) window.open(link, "_blank", "noopener,noreferrer");
    setSucesso(`${gerados.length} cupons gerados com validade de 7 dias. WhatsApp aberto com a mensagem pronta.`);
    setGerando(false);
    await carregar();
  }

  async function marcarUsado(cupom: CupomPosVenda) {
    setErro("");
    setSucesso("");
    setUsandoId(cupom.id);
    const { error } = await supabase.rpc("marcar_cupom_pos_venda_usado", {
      p_cupom_id: cupom.id,
    });
    if (error) setErro(error.message);
    else setSucesso(`Cupom ${cupom.codigo} marcado como usado.`);
    setUsandoId(null);
    await carregar();
  }

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Relacionamento"
        title="Fidelidade e pós-venda"
        description="Gere 5 ou 10 cupons após a compra, com validade automática de 7 dias e mensagem pronta no WhatsApp."
      />

      {erro && <div className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-4 text-sm text-[#b91c1c]">{erro}</div>}
      {sucesso && <div className="rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] p-4 text-sm text-[#15803d]">{sucesso}</div>}

      <div className="grid gap-4 sm:grid-cols-3">
        <ResumoCard icon={Ticket} label="Cupons ativos" valor={resumo.ativos} detalhe="dentro da validade" />
        <ResumoCard icon={CheckCircle2} label="Cupons usados" valor={resumo.usados} detalhe="já resgatados" />
        <ResumoCard icon={Clock3} label="Cupons expirados" valor={resumo.expirados} detalhe="validade encerrada" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[400px_1fr]">
        <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#eef4ff] text-[#2563eb]"><Gift className="h-5 w-5" /></span>
            <div>
              <h2 className="font-black text-[#0f172a]">Benefício pós-compra</h2>
              <p className="text-xs text-[#64748b]">Validade padrão: 7 dias</p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-2 block text-sm text-[#475569]">Cliente</label>
              <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} className="w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 outline-none">
                <option value="">Selecione o cliente</option>
                {clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nome}</option>)}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm text-[#475569]">Quantidade de cupons</label>
              <div className="grid grid-cols-2 gap-2">
                {[5, 10].map((valor) => (
                  <button key={valor} type="button" onClick={() => setQuantidade(valor as 5 | 10)} className={`rounded-2xl border px-4 py-3 text-sm font-black transition ${quantidade === valor ? "border-[#2563eb] bg-[#eff6ff] text-[#1d4ed8]" : "border-[#e8ecf4] bg-white text-[#475569]"}`}>
                    {valor} cupons
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-[#dbeafe] bg-[#eff6ff] p-4 text-sm leading-6 text-[#1e40af]">
              A mensagem informa a quantidade, os códigos e a data limite. Depois de 7 dias, o cupom aparece como expirado automaticamente.
            </div>

            <button type="button" onClick={gerarEEnviar} disabled={gerando || loading} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#16a34a] px-4 py-3 font-black text-white transition hover:bg-[#15803d] disabled:opacity-50">
              <MessageCircle className="h-5 w-5" />
              {gerando ? "Gerando..." : `Gerar ${quantidade} e abrir WhatsApp`}
            </button>
          </div>
        </div>

        <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-[#0f172a]">Cupons registrados</h2>
              <p className="mt-1 text-sm text-[#64748b]">Histórico da loja, sem misturar dados entre empresas.</p>
            </div>
          </div>

          {loading ? (
            <p className="mt-5 text-sm text-[#64748b]">Carregando...</p>
          ) : cupons.length === 0 ? (
            <p className="mt-5 text-sm text-[#64748b]">Nenhum cupom gerado ainda.</p>
          ) : (
            <div className="mt-5 space-y-3">
              {cupons.slice(0, 60).map((cupom) => {
                const visual = statusVisualCupom(cupom);
                const cliente = clientesPorId.get(cupom.cliente_id);
                return (
                  <div key={cupom.id} className="flex flex-col gap-3 rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-black text-[#0f172a]">{cupom.codigo}</p>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusClasses[visual]}`}>{visual}</span>
                      </div>
                      <p className="mt-1 text-sm text-[#64748b]">{cliente?.nome || "Cliente"} · válido até {formatarDataCurta(cupom.validade)}</p>
                    </div>
                    {visual === "ativo" && (
                      <button type="button" onClick={() => marcarUsado(cupom)} disabled={usandoId === cupom.id} className="rounded-xl border border-[#bfdbfe] bg-white px-3 py-2 text-xs font-black text-[#1d4ed8] hover:bg-[#eff6ff] disabled:opacity-50">
                        {usandoId === cupom.id ? "Salvando..." : "Marcar como usado"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ResumoCard({ icon: Icon, label, valor, detalhe }: { icon: typeof Ticket; label: string; valor: number; detalhe: string }) {
  return (
    <div className="rounded-[26px] border border-[#e8ecf4] bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-[#475569]">{label}</p>
        <Icon className="h-5 w-5 text-[#2563eb]" />
      </div>
      <p className="mt-3 text-3xl font-black text-[#0f172a]">{valor}</p>
      <p className="mt-1 text-xs text-[#94a3b8]">{detalhe}</p>
    </div>
  );
}
