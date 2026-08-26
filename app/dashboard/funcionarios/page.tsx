"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/dashboard/page-header";
import { formatCurrency } from "@/lib/vendas-utils";
import { usePeriod, isoToDate } from "@/components/dashboard/period-context";
import { calcularAcerto, rotuloBaseComissao } from "@/lib/comissao-utils";
import { calcularResultadoLoja } from "@/lib/resultado-loja-utils";
import {
  formatarDataCurta,
  gerarDatasPagamentoMes,
  gerarProximosPagamentos,
  nomeDiaSemana,
  type FrequenciaPagamento,
} from "@/lib/agenda-pagamentos-utils";

type Funcionario = {
  id: string;
  nome: string;
  comissao_percentual: number | null;
  salario_fixo: number | null;
  ativo: boolean | null;
  observacao: string | null;
  telefone: string | null;
  comissao_base: "vendas_funcionario" | "faturamento_loja" | "lucro_loja";
  frequencia_pagamento: FrequenciaPagamento;
  dia_pagamento: number;
  dia_pagamento_2: number;
  dia_semana_pagamento: number;
  vale_recorrente_valor: number;
  vale_recorrente_dia: number;
  vale_recorrente_ativo: boolean;
};

type Vale = {
  id: string;
  funcionario_id: string;
  valor: number;
  data: string;
  observacao: string | null;
};

type ValeDesconto = {
  id: string;
  vale_id: string;
  funcionario_id: string;
  competencia: string;
  parcela_pagamento: number;
  data_prevista: string;
  sequencia: number;
  total_divisoes: number;
  valor: number;
  status: string;
};

type VendaLite = {
  id: string;
  funcionario_id: string | null;
  total: number | null;
  status: string;
  created_at: string;
};

type DespesaLite = { valor: number; data: string };
type ModoVale = "proximo_pagamento" | "pagamento_especifico" | "dividido";

function hojeISO() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function dataBR(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export default function FuncionariosPage() {
  const { period } = usePeriod();
  const janela = useMemo(() => {
    const startOfDay = (d: Date) => {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      return x;
    };
    const ini = startOfDay(isoToDate(period.inicio)).getTime();
    const fim = startOfDay(isoToDate(period.fim));
    fim.setDate(fim.getDate() + 1);
    return { ini, fim: fim.getTime() };
  }, [period]);

  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [vales, setVales] = useState<Vale[]>([]);
  const [descontosVale, setDescontosVale] = useState<ValeDesconto[]>([]);
  const [vendas, setVendas] = useState<VendaLite[]>([]);
  const [despesas, setDespesas] = useState<DespesaLite[]>([]);
  const [atendServico, setAtendServico] = useState<
    { funcionario_id: string | null; valor: number; percentual_loja: number; data: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Formulário funcionário
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [comissao, setComissao] = useState("0");
  const [salario, setSalario] = useState("0");
  const [ativo, setAtivo] = useState(true);
  const [telefone, setTelefone] = useState("");
  const [comissaoBase, setComissaoBase] = useState<Funcionario["comissao_base"]>("vendas_funcionario");
  const [frequenciaPagamento, setFrequenciaPagamento] = useState<FrequenciaPagamento>("mensal");
  const [diaPagamento, setDiaPagamento] = useState("5");
  const [diaPagamento2, setDiaPagamento2] = useState("30");
  const [diaSemanaPagamento, setDiaSemanaPagamento] = useState("5");
  const [valeRecorrenteAtivo, setValeRecorrenteAtivo] = useState(false);
  const [valeRecorrenteValor, setValeRecorrenteValor] = useState("0");
  const [valeRecorrenteDia, setValeRecorrenteDia] = useState("5");

  // Formulário vale
  const [valeFuncId, setValeFuncId] = useState("");
  const [valeValor, setValeValor] = useState("");
  const [valeObs, setValeObs] = useState("");
  const [valeModo, setValeModo] = useState<ModoVale>("proximo_pagamento");
  const [valeDataInicio, setValeDataInicio] = useState("");
  const [valeParcelas, setValeParcelas] = useState("2");
  const [salvandoVale, setSalvandoVale] = useState(false);

  async function carregar() {
    setLoading(true);
    setErro("");
    await supabase.rpc("gerar_vales_recorrentes", { p_competencia: period.inicio });
    const [funcRes, valesRes, descontosRes, vendasRes, servRes, despesasRes] = await Promise.all([
      supabase
        .from("funcionarios")
        .select("id, nome, comissao_percentual, salario_fixo, ativo, observacao, telefone, comissao_base, frequencia_pagamento, dia_pagamento, dia_pagamento_2, dia_semana_pagamento, vale_recorrente_valor, vale_recorrente_dia, vale_recorrente_ativo")
        .order("created_at", { ascending: true }),
      supabase.from("vales").select("id, funcionario_id, valor, data, observacao"),
      supabase
        .from("vale_descontos")
        .select("id, vale_id, funcionario_id, competencia, parcela_pagamento, data_prevista, sequencia, total_divisoes, valor, status"),
      supabase.from("vendas").select("id, funcionario_id, total, status, created_at"),
      supabase.from("atendimentos_servico").select("funcionario_id, valor, percentual_loja, data"),
      supabase.from("despesas").select("valor, data"),
    ]);
    const primeiroErro = funcRes.error || valesRes.error || descontosRes.error || vendasRes.error || servRes.error || despesasRes.error;
    if (primeiroErro) setErro(primeiroErro.message);
    setFuncionarios((funcRes.data as Funcionario[] | null) || []);
    setVales((valesRes.data as Vale[] | null) || []);
    setDescontosVale((descontosRes.data as ValeDesconto[] | null) || []);
    setVendas((vendasRes.data as VendaLite[] | null) || []);
    setAtendServico(servRes.data || []);
    setDespesas((despesasRes.data as DespesaLite[] | null) || []);
    setLoading(false);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const competenciaAtual = `${hojeISO().slice(0, 7)}-01`;
  const agendaPreview = useMemo(
    () =>
      gerarDatasPagamentoMes(
        {
          frequencia_pagamento: frequenciaPagamento,
          dia_pagamento: Number(diaPagamento || 5),
          dia_pagamento_2: Number(diaPagamento2 || 30),
          dia_semana_pagamento: Number(diaSemanaPagamento || 5),
        },
        competenciaAtual
      ),
    [frequenciaPagamento, diaPagamento, diaPagamento2, diaSemanaPagamento, competenciaAtual]
  );

  const funcionarioVale = funcionarios.find((f) => f.id === valeFuncId);
  const proximosPagamentosVale = useMemo(() => {
    if (!funcionarioVale) return [];
    return gerarProximosPagamentos(funcionarioVale, hojeISO(), 12);
  }, [funcionarioVale]);

  function limpar() {
    setEditandoId(null);
    setNome("");
    setComissao("0");
    setSalario("0");
    setAtivo(true);
    setTelefone("");
    setComissaoBase("vendas_funcionario");
    setFrequenciaPagamento("mensal");
    setDiaPagamento("5");
    setDiaPagamento2("30");
    setDiaSemanaPagamento("5");
    setValeRecorrenteAtivo(false);
    setValeRecorrenteValor("0");
    setValeRecorrenteDia("5");
  }

  function editar(f: Funcionario) {
    setEditandoId(f.id);
    setNome(f.nome || "");
    setComissao(String(f.comissao_percentual ?? 0));
    setSalario(String(f.salario_fixo ?? 0));
    setAtivo(f.ativo !== false);
    setTelefone(f.telefone || "");
    setComissaoBase(f.comissao_base || "vendas_funcionario");
    setFrequenciaPagamento(f.frequencia_pagamento || "mensal");
    setDiaPagamento(String(f.dia_pagamento || 5));
    setDiaPagamento2(String(f.dia_pagamento_2 || 30));
    setDiaSemanaPagamento(String(f.dia_semana_pagamento ?? 5));
    setValeRecorrenteAtivo(Boolean(f.vale_recorrente_ativo));
    setValeRecorrenteValor(String(f.vale_recorrente_valor || 0));
    setValeRecorrenteDia(String(f.vale_recorrente_dia || 5));
    setErro("");
    setSucesso("");
  }

  function trocarFrequencia(nova: FrequenciaPagamento) {
    setFrequenciaPagamento(nova);
    if (nova === "quinzenal") {
      setDiaPagamento("15");
      setDiaPagamento2("30");
    } else if (nova === "semanal") {
      setDiaSemanaPagamento("5");
    }
  }

  async function salvar() {
    setErro("");
    setSucesso("");
    if (!nome.trim()) {
      setErro("Informe o nome do funcionário.");
      return;
    }
    const pct = Number(comissao || 0);
    if (pct < 0 || pct > 100) {
      setErro("A comissão deve ficar entre 0 e 100%.");
      return;
    }
    if (frequenciaPagamento === "quinzenal" && Number(diaPagamento2) <= Number(diaPagamento)) {
      setErro("No quinzenal, o segundo pagamento precisa ser depois do primeiro.");
      return;
    }

    setSalvando(true);
    const payload = {
      nome: nome.trim(),
      comissao_percentual: pct,
      salario_fixo: Number(salario || 0),
      ativo,
      telefone: telefone.trim() || null,
      comissao_base: comissaoBase,
      frequencia_pagamento: frequenciaPagamento,
      dia_pagamento: Math.min(31, Math.max(1, Number(diaPagamento) || (frequenciaPagamento === "quinzenal" ? 15 : 5))),
      dia_pagamento_2: Math.min(31, Math.max(1, Number(diaPagamento2) || 30)),
      dia_semana_pagamento: Math.min(6, Math.max(0, Number(diaSemanaPagamento) || 0)),
      vale_recorrente_ativo: valeRecorrenteAtivo,
      vale_recorrente_valor: Math.max(0, Number(valeRecorrenteValor) || 0),
      vale_recorrente_dia: Math.min(31, Math.max(1, Number(valeRecorrenteDia) || 5)),
    };
    const { error } = editandoId
      ? await supabase.from("funcionarios").update(payload).eq("id", editandoId)
      : await supabase.from("funcionarios").insert(payload);
    if (error) {
      setErro(error.message);
      setSalvando(false);
      return;
    }
    setSucesso(editandoId ? "Funcionário atualizado." : "Funcionário cadastrado.");
    limpar();
    await carregar();
    setSalvando(false);
  }

  async function excluir(id: string) {
    if (!window.confirm("Excluir este funcionário?")) return;
    const { error } = await supabase.from("funcionarios").delete().eq("id", id);
    if (error) {
      setErro(error.message);
      return;
    }
    if (editandoId === id) limpar();
    await carregar();
  }

  async function registrarVale() {
    setErro("");
    setSucesso("");
    if (!valeFuncId) {
      setErro("Selecione o funcionário do vale.");
      return;
    }
    const valor = Number(valeValor || 0);
    if (valor <= 0) {
      setErro("Informe um valor de vale válido.");
      return;
    }
    if (valeModo !== "proximo_pagamento" && !valeDataInicio) {
      setErro("Escolha em qual pagamento o desconto deve começar.");
      return;
    }
    const qtd = valeModo === "dividido" ? Math.min(12, Math.max(2, Number(valeParcelas) || 2)) : 1;

    setSalvandoVale(true);
    const { error } = await supabase.rpc("registrar_vale_planejado", {
      p_funcionario_id: valeFuncId,
      p_valor: valor,
      p_observacao: valeObs.trim() || null,
      p_modo: valeModo,
      p_data_inicio: valeModo === "proximo_pagamento" ? null : valeDataInicio,
      p_parcelas: qtd,
    });
    if (error) {
      setErro(error.message);
      setSalvandoVale(false);
      return;
    }

    const descricao =
      valeModo === "proximo_pagamento"
        ? "no próximo pagamento"
        : valeModo === "pagamento_especifico"
          ? `no pagamento de ${dataBR(valeDataInicio)}`
          : `em ${qtd} pagamentos a partir de ${dataBR(valeDataInicio)}`;
    setSucesso(`Vale registrado e programado para desconto ${descricao}.`);
    setValeFuncId("");
    setValeValor("");
    setValeObs("");
    setValeModo("proximo_pagamento");
    setValeDataInicio("");
    setValeParcelas("2");
    await carregar();
    setSalvandoVale(false);
  }

  // Para o resumo, vales novos entram pela data em que realmente serão descontados.
  // Vales antigos sem plano mantêm a regra anterior por data de emissão.
  const valesParaAcerto = useMemo(() => {
    const planejados = new Set(descontosVale.map((d) => d.vale_id));
    const legado = vales.filter((v) => !planejados.has(v.id));
    const novos = descontosVale
      .filter((d) => d.status !== "cancelado")
      .map((d) => ({
        id: d.id,
        funcionario_id: d.funcionario_id,
        valor: Number(d.valor || 0),
        data: d.data_prevista,
        observacao: null,
      }));
    return [...legado, ...novos];
  }, [vales, descontosVale]);

  const acerto = useMemo(() => {
    const vendaNoPeriodo = (v: { created_at: string }) => {
      const t = new Date(v.created_at).getTime();
      return t >= janela.ini && t < janela.fim;
    };
    const dataNoPeriodo = (d: string) => {
      const t = isoToDate(d).getTime();
      return t >= janela.ini && t < janela.fim;
    };
    const resultadoLoja = calcularResultadoLoja(
      { vendas, despesas, servicos: atendServico },
      { vendaNoPeriodo, dataNoPeriodo }
    );
    return funcionarios.map((f) => {
      const a = calcularAcerto(
        f,
        { vendas, servicos: atendServico, vales: valesParaAcerto, resultadoLoja },
        { vendaNoPeriodo, dataNoPeriodo }
      );
      return {
        funcionario: f,
        qtdVendas: a.qtdVendas,
        vendido: a.vendido,
        comissaoValor: a.comissao,
        repasseServicos: a.repasse,
        valesPeriodo: a.vales,
        salarioFixo: a.salario,
        aPagar: a.aPagar,
        baseComissao: a.baseComissao,
        baseTipo: a.baseTipo,
      };
    });
  }, [funcionarios, vendas, valesParaAcerto, atendServico, despesas, janela]);

  const inputCls =
    "w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/10";

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Equipe e folha"
        title="Funcionários"
        description="Cadastre a equipe, configure a agenda de pagamentos, comissão, salário e vales."
      />

      {erro && <div className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-4 text-sm text-[#b91c1c]">{erro}</div>}
      {sucesso && <div className="rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] p-4 text-sm text-[#15803d]">{sucesso}</div>}

      <div className="grid gap-6 xl:grid-cols-[430px_1fr]">
        <div className="space-y-6">
          <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
            <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
              {editandoId ? "Editar funcionário" : "Novo funcionário"}
            </h2>
            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-sm text-[#475569]">Nome</label>
                <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputCls} placeholder="Nome do funcionário" />
              </div>
              <div>
                <label className="mb-2 block text-sm text-[#475569]">WhatsApp (opcional)</label>
                <input value={telefone} onChange={(e) => setTelefone(e.target.value)} className={inputCls} placeholder="(31) 99999-9999" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-2 block text-sm text-[#475569]">Comissão (%)</label>
                  <input type="number" step="0.01" min="0" max="100" value={comissao} onChange={(e) => setComissao(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="mb-2 block text-sm text-[#475569]">Salário fixo</label>
                  <input type="number" step="0.01" min="0" value={salario} onChange={(e) => setSalario(e.target.value)} className={inputCls} />
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm text-[#475569]">Base da comissão</label>
                <select value={comissaoBase} onChange={(e) => setComissaoBase(e.target.value as Funcionario["comissao_base"])} className={inputCls}>
                  <option value="vendas_funcionario">Vendas do funcionário</option>
                  <option value="faturamento_loja">Faturamento total da loja</option>
                  <option value="lucro_loja">Lucro total da loja</option>
                </select>
                <p className="mt-1.5 text-xs text-[#64748b]">Na comissão sobre lucro, o mês é fechado e o valor entra na competência seguinte.</p>
              </div>

              <div className="rounded-2xl border border-[#dbeafe] bg-[#eff6ff] p-4">
                <label className="mb-2 block text-sm font-bold text-[#1e40af]">Frequência de pagamento</label>
                <select value={frequenciaPagamento} onChange={(e) => trocarFrequencia(e.target.value as FrequenciaPagamento)} className={inputCls}>
                  <option value="mensal">Mensal</option>
                  <option value="quinzenal">Quinzenal</option>
                  <option value="semanal">Semanal</option>
                </select>

                {frequenciaPagamento === "mensal" && (
                  <div className="mt-3">
                    <label className="mb-1 block text-xs font-semibold text-[#475569]">Dia do pagamento</label>
                    <input type="number" min="1" max="31" value={diaPagamento} onChange={(e) => setDiaPagamento(e.target.value)} className={inputCls} />
                  </div>
                )}

                {frequenciaPagamento === "quinzenal" && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[#475569]">1º pagamento</label>
                      <input type="number" min="1" max="30" value={diaPagamento} onChange={(e) => setDiaPagamento(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[#475569]">2º pagamento</label>
                      <input type="number" min="2" max="31" value={diaPagamento2} onChange={(e) => setDiaPagamento2(e.target.value)} className={inputCls} />
                    </div>
                  </div>
                )}

                {frequenciaPagamento === "semanal" && (
                  <div className="mt-3">
                    <label className="mb-1 block text-xs font-semibold text-[#475569]">Dia da semana</label>
                    <select value={diaSemanaPagamento} onChange={(e) => setDiaSemanaPagamento(e.target.value)} className={inputCls}>
                      {[0, 1, 2, 3, 4, 5, 6].map((dia) => <option key={dia} value={dia}>{nomeDiaSemana(dia)}</option>)}
                    </select>
                  </div>
                )}

                <div className="mt-3 rounded-xl border border-[#bfdbfe] bg-white p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-[#1d4ed8]">Prévia deste mês</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {agendaPreview.map((item) => (
                      <span key={item.data_pagamento} className="rounded-full bg-[#eff6ff] px-3 py-1 text-xs font-bold text-[#1d4ed8]">
                        {formatarDataCurta(item.data_pagamento)} · {item.parcela_numero}/{item.total_parcelas}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-[#fde68a] bg-[#fffbeb] p-3">
                <label className="flex cursor-pointer items-center gap-3">
                  <input type="checkbox" checked={valeRecorrenteAtivo} onChange={(e) => setValeRecorrenteAtivo(e.target.checked)} className="h-4 w-4 accent-[#b45309]" />
                  <span className="text-sm font-semibold text-[#92400e]">Vale mensal automático</span>
                </label>
                {valeRecorrenteAtivo && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs text-[#92400e]">Valor mensal</label>
                      <input type="number" min="0" step="0.01" value={valeRecorrenteValor} onChange={(e) => setValeRecorrenteValor(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-[#92400e]">Dia do vale</label>
                      <input type="number" min="1" max="31" value={valeRecorrenteDia} onChange={(e) => setValeRecorrenteDia(e.target.value)} className={inputCls} />
                    </div>
                    <p className="col-span-2 text-xs text-[#a16207]">O vale recorrente é programado automaticamente para o próximo pagamento do funcionário.</p>
                  </div>
                )}
              </div>

              <label className="flex cursor-pointer items-center gap-3">
                <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="h-4 w-4 accent-[#2563eb]" />
                <span className="text-sm font-semibold text-[#334155]">Ativo</span>
              </label>

              <div className="flex gap-2">
                <button type="button" onClick={salvar} disabled={salvando} className="flex-1 rounded-2xl bg-[#2563eb] px-4 py-3 font-bold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60">
                  {salvando ? "Salvando..." : editandoId ? "Salvar alterações" : "Cadastrar funcionário"}
                </button>
                {editandoId && <button type="button" onClick={limpar} className="rounded-2xl border border-[#e8ecf4] px-4 py-3 font-bold text-[#475569] transition hover:bg-[#f4f6fb]">Cancelar</button>}
              </div>
            </div>
          </div>

          <div className="rounded-[30px] border border-[#fde68a] bg-[#fffbeb] p-5">
            <h2 className="text-lg font-black text-[#92400e]">Registrar vale</h2>
            <p className="mt-1 text-xs text-[#a16207]">Por padrão, o desconto entra no próximo pagamento. Você também pode escolher uma data ou dividir.</p>
            <div className="mt-4 space-y-3">
              <select
                value={valeFuncId}
                onChange={(e) => {
                  const id = e.target.value;
                  setValeFuncId(id);
                  const f = funcionarios.find((item) => item.id === id);
                  const proximo = f ? gerarProximosPagamentos(f, hojeISO(), 1)[0] : undefined;
                  setValeDataInicio(proximo?.data_pagamento || "");
                }}
                className="w-full rounded-xl border border-[#fde68a] bg-white px-3 py-2.5 text-sm outline-none"
              >
                <option value="">Selecione o funcionário</option>
                {funcionarios.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>

              {funcionarioVale && (
                <div className="rounded-xl border border-[#fde68a] bg-white px-3 py-2 text-xs text-[#92400e]">
                  Próximos pagamentos: {proximosPagamentosVale.slice(0, 5).map((p) => formatarDataCurta(p.data_pagamento)).join(" · ") || "nenhum"}
                </div>
              )}

              <div className="flex gap-2">
                <input type="number" step="0.01" min="0" value={valeValor} onChange={(e) => setValeValor(e.target.value)} placeholder="Valor" className="w-32 rounded-xl border border-[#fde68a] bg-white px-3 py-2.5 text-sm outline-none" />
                <input value={valeObs} onChange={(e) => setValeObs(e.target.value)} placeholder="Observação (opcional)" className="min-w-0 flex-1 rounded-xl border border-[#fde68a] bg-white px-3 py-2.5 text-sm outline-none" />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-[#92400e]">Como descontar?</label>
                <select value={valeModo} onChange={(e) => setValeModo(e.target.value as ModoVale)} className="w-full rounded-xl border border-[#fde68a] bg-white px-3 py-2.5 text-sm outline-none">
                  <option value="proximo_pagamento">Próximo pagamento (padrão)</option>
                  <option value="pagamento_especifico">Escolher um pagamento</option>
                  <option value="dividido">Dividir entre pagamentos</option>
                </select>
              </div>

              {valeModo !== "proximo_pagamento" && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-[#92400e]">{valeModo === "dividido" ? "Começar no pagamento" : "Cobrar no pagamento"}</label>
                    <select value={valeDataInicio} onChange={(e) => setValeDataInicio(e.target.value)} className="w-full rounded-xl border border-[#fde68a] bg-white px-3 py-2.5 text-sm outline-none">
                      <option value="">Escolha a data</option>
                      {proximosPagamentosVale.map((p) => (
                        <option key={`${p.competencia}-${p.parcela_numero}`} value={p.data_pagamento}>
                          {dataBR(p.data_pagamento)} · pagamento {p.parcela_numero}/{p.total_parcelas}
                        </option>
                      ))}
                    </select>
                  </div>
                  {valeModo === "dividido" && (
                    <div>
                      <label className="mb-1 block text-xs font-bold text-[#92400e]">Quantidade de pagamentos</label>
                      <input type="number" min="2" max="12" value={valeParcelas} onChange={(e) => setValeParcelas(e.target.value)} className="w-full rounded-xl border border-[#fde68a] bg-white px-3 py-2.5 text-sm outline-none" />
                    </div>
                  )}
                </div>
              )}

              <button type="button" onClick={registrarVale} disabled={salvandoVale} className="w-full rounded-xl bg-[#b45309] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#92400e] disabled:opacity-60">
                {salvandoVale ? "Programando..." : "Registrar e programar desconto"}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
            <h2 className="text-xl font-black tracking-tight text-[#0f172a]">Resumo do período</h2>
            <p className="mt-1 text-sm text-[#64748b]">Os vales novos entram no resumo na data em que foram programados para desconto.</p>

            {loading ? (
              <p className="mt-4 text-[#64748b]">Carregando...</p>
            ) : funcionarios.length === 0 ? (
              <p className="mt-4 text-[#64748b]">Nenhum funcionário cadastrado ainda.</p>
            ) : (
              <div className="mt-5 space-y-3">
                {acerto.map((a) => {
                  const agenda = gerarDatasPagamentoMes(a.funcionario, competenciaAtual);
                  return (
                    <div key={a.funcionario.id} className="rounded-[24px] border border-[#e8ecf4] bg-[#f8fafc]/70 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-black text-[#0f172a]">{a.funcionario.nome}</p>
                            {a.funcionario.ativo === false && <span className="rounded-full bg-[#f1f5f9] px-2 py-0.5 text-xs font-semibold text-[#64748b]">inativo</span>}
                            <span className="text-xs text-[#94a3b8]">{Number(a.funcionario.comissao_percentual || 0)}% sobre {rotuloBaseComissao(a.baseTipo)}</span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {agenda.map((p) => <span key={p.data_pagamento} className="rounded-full border border-[#dbeafe] bg-white px-2.5 py-1 text-[11px] font-bold text-[#1d4ed8]">{formatarDataCurta(p.data_pagamento)} · {p.parcela_numero}/{p.total_parcelas}</span>)}
                          </div>
                        </div>
                        <div className="flex gap-1.5">
                          <button type="button" onClick={() => editar(a.funcionario)} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-[#2563eb] hover:bg-[#eff6ff]">Editar</button>
                          <button type="button" onClick={() => excluir(a.funcionario.id)} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-[#b91c1c] hover:bg-[#fef2f2]">Excluir</button>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                        <p className="text-[#64748b]">Vendido: <span className="font-bold text-[#0f172a]">{formatCurrency(a.vendido)}</span> ({a.qtdVendas})</p>
                        <p className="text-[#64748b]">Comissão: <span className="font-bold text-[#15803d]">{formatCurrency(a.comissaoValor)}</span></p>
                        <p className="text-[#64748b]">Base: <span className="font-bold text-[#0f172a]">{formatCurrency(a.baseComissao)}</span></p>
                        <p className="text-[#64748b]">Serviços: <span className="font-bold text-[#15803d]">{formatCurrency(a.repasseServicos)}</span></p>
                        <p className="text-[#64748b]">Salário: <span className="font-bold text-[#0f172a]">{formatCurrency(a.salarioFixo)}</span></p>
                        <p className="text-[#64748b]">Vales programados: <span className="font-bold text-[#b45309]">− {formatCurrency(a.valesPeriodo)}</span></p>
                        <p className="text-[#64748b] sm:col-span-2">A pagar no período: <span className="text-base font-black text-[#1d4ed8]">{formatCurrency(a.aPagar)}</span></p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
