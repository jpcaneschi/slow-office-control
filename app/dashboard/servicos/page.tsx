"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/dashboard/page-header";
import { formatCurrency } from "@/lib/vendas-utils";
import { usePeriod, isoToDate } from "@/components/dashboard/period-context";

type Servico = {
  id: string;
  nome: string;
  preco: number | null;
  percentual_loja: number | null;
  ativo: boolean | null;
};

type Atendimento = {
  id: string;
  servico_id: string | null;
  descricao: string | null;
  cliente_id: string | null;
  funcionario_id: string | null;
  valor: number;
  percentual_loja: number;
  data: string;
};

type Ref = { id: string; nome: string };

export default function ServicosPage() {
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

  const [servicos, setServicos] = useState<Servico[]>([]);
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [clientes, setClientes] = useState<Ref[]>([]);
  const [funcionarios, setFuncionarios] = useState<Ref[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  // Catálogo
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [preco, setPreco] = useState("0");
  const [pct, setPct] = useState("100");
  const [ativo, setAtivo] = useState(true);
  const [salvandoCat, setSalvandoCat] = useState(false);

  // Atendimento
  const [aServicoId, setAServicoId] = useState("");
  const [aDescricao, setADescricao] = useState("");
  const [aClienteId, setAClienteId] = useState("");
  const [aFuncId, setAFuncId] = useState("");
  const [aValor, setAValor] = useState("");
  const [aPct, setAPct] = useState("100");
  const [salvandoAt, setSalvandoAt] = useState(false);

  async function carregar() {
    setLoading(true);
    setErro("");
    const [sRes, aRes, cRes, fRes] = await Promise.all([
      supabase
        .from("servicos")
        .select("id, nome, preco, percentual_loja, ativo")
        .order("created_at", { ascending: true }),
      supabase
        .from("atendimentos_servico")
        .select(
          "id, servico_id, descricao, cliente_id, funcionario_id, valor, percentual_loja, data"
        )
        .order("data", { ascending: false }),
      supabase.from("clientes").select("id, nome").order("nome"),
      supabase
        .from("funcionarios")
        .select("id, nome, ativo")
        .order("nome"),
    ]);
    if (sRes.error) setErro(sRes.error.message);
    setServicos(sRes.data || []);
    setAtendimentos(aRes.data || []);
    setClientes(cRes.data || []);
    setFuncionarios(
      (fRes.data || [])
        .filter((f) => f.ativo !== false)
        .map((f) => ({ id: f.id as string, nome: f.nome as string }))
    );
    setLoading(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  function limparCat() {
    setEditandoId(null);
    setNome("");
    setPreco("0");
    setPct("100");
    setAtivo(true);
  }

  function editarServico(s: Servico) {
    setEditandoId(s.id);
    setNome(s.nome || "");
    setPreco(String(s.preco ?? 0));
    setPct(String(s.percentual_loja ?? 100));
    setAtivo(s.ativo !== false);
    setErro("");
  }

  async function salvarServico() {
    setErro("");
    if (!nome.trim()) {
      setErro("Informe o nome do serviço.");
      return;
    }
    const p = Number(pct || 0);
    if (p < 0 || p > 100) {
      setErro("O % da loja deve ficar entre 0 e 100.");
      return;
    }
    setSalvandoCat(true);
    const payload = {
      nome: nome.trim(),
      preco: Number(preco || 0),
      percentual_loja: p,
      ativo,
    };
    const { error } = editandoId
      ? await supabase.from("servicos").update(payload).eq("id", editandoId)
      : await supabase.from("servicos").insert(payload);
    if (error) {
      setErro(error.message);
      setSalvandoCat(false);
      return;
    }
    limparCat();
    await carregar();
    setSalvandoCat(false);
  }

  async function excluirServico(id: string) {
    if (!window.confirm("Excluir este serviço do catálogo?")) return;
    const { error } = await supabase.from("servicos").delete().eq("id", id);
    if (error) {
      setErro(error.message);
      return;
    }
    if (editandoId === id) limparCat();
    await carregar();
  }

  function aoEscolherServico(id: string) {
    setAServicoId(id);
    const s = servicos.find((x) => x.id === id);
    if (s) {
      if (!aValor) setAValor(String(s.preco ?? 0));
      setAPct(String(s.percentual_loja ?? 100));
      if (!aDescricao) setADescricao(s.nome);
    }
  }

  async function registrarAtendimento() {
    setErro("");
    const valor = Number(aValor || 0);
    if (valor <= 0) {
      setErro("Informe o valor do atendimento.");
      return;
    }
    if (!aServicoId && !aDescricao.trim()) {
      setErro("Escolha um serviço ou descreva o atendimento.");
      return;
    }
    setSalvandoAt(true);
    const { error } = await supabase.from("atendimentos_servico").insert({
      servico_id: aServicoId || null,
      descricao: aDescricao.trim() || null,
      cliente_id: aClienteId || null,
      funcionario_id: aFuncId || null,
      valor,
      percentual_loja: Number(aPct || 100),
    });
    if (error) {
      setErro(error.message);
      setSalvandoAt(false);
      return;
    }
    setAServicoId("");
    setADescricao("");
    setAClienteId("");
    setAFuncId("");
    setAValor("");
    setAPct("100");
    await carregar();
    setSalvandoAt(false);
  }

  async function excluirAtendimento(id: string) {
    if (!window.confirm("Excluir este atendimento?")) return;
    const { error } = await supabase
      .from("atendimentos_servico")
      .delete()
      .eq("id", id);
    if (error) {
      setErro(error.message);
      return;
    }
    await carregar();
  }

  const atendimentosPeriodo = useMemo(
    () =>
      atendimentos.filter((a) => {
        const t = isoToDate(a.data).getTime();
        return t >= janela.ini && t < janela.fim;
      }),
    [atendimentos, janela]
  );

  const resumo = useMemo(() => {
    const bruto = atendimentosPeriodo.reduce((s, a) => s + Number(a.valor || 0), 0);
    const receitaLoja = atendimentosPeriodo.reduce(
      (s, a) => s + Number(a.valor || 0) * (Number(a.percentual_loja || 0) / 100),
      0
    );
    return {
      qtd: atendimentosPeriodo.length,
      bruto,
      receitaLoja,
      repasse: bruto - receitaLoja,
    };
  }, [atendimentosPeriodo]);

  function nomeCliente(id: string | null) {
    if (!id) return "—";
    return clientes.find((c) => c.id === id)?.nome || "—";
  }
  function nomeFunc(id: string | null) {
    if (!id) return "—";
    return funcionarios.find((f) => f.id === id)?.nome || "—";
  }

  const inputCls =
    "w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none";
  const inputSm =
    "w-full rounded-xl border border-[#e8ecf4] bg-white px-3 py-2.5 text-sm outline-none";

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Serviços e atendimentos"
        title="Serviços"
        description="Cadastre serviços com preço e % da loja, registre atendimentos e veja a receita entrar no financeiro."
      />

      {erro && (
        <div className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-4 text-sm text-[#b91c1c]">
          {erro}
        </div>
      )}

      {/* Resumo */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[28px] border border-[#e8ecf4] bg-white p-5">
          <p className="text-sm font-bold text-[#475569]">Atendimentos</p>
          <p className="mt-2 text-3xl font-black text-[#0f172a]">{resumo.qtd}</p>
        </div>
        <div className="rounded-[28px] border border-[#e8ecf4] bg-white p-5">
          <p className="text-sm font-bold text-[#475569]">Faturado (bruto)</p>
          <p className="mt-2 text-2xl font-black text-[#0f172a]">
            {formatCurrency(resumo.bruto)}
          </p>
        </div>
        <div className="rounded-[28px] border border-[#bbf7d0] bg-[#f0fdf4] p-5">
          <p className="text-sm font-bold text-[#15803d]">Receita da loja</p>
          <p className="mt-2 text-2xl font-black text-[#0f172a]">
            {formatCurrency(resumo.receitaLoja)}
          </p>
        </div>
        <div className="rounded-[28px] border border-[#fde68a] bg-[#fffbeb] p-5">
          <p className="text-sm font-bold text-[#92400e]">Repasse profissional</p>
          <p className="mt-2 text-2xl font-black text-[#0f172a]">
            {formatCurrency(resumo.repasse)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        {/* Catálogo + registrar */}
        <div className="space-y-6">
          <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
            <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
              Registrar atendimento
            </h2>
            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-sm text-[#475569]">Serviço</label>
                <select
                  value={aServicoId}
                  onChange={(e) => aoEscolherServico(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Avulso (descrever abaixo)</option>
                  {servicos
                    .filter((s) => s.ativo !== false)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nome}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm text-[#475569]">
                  Descrição
                </label>
                <input
                  value={aDescricao}
                  onChange={(e) => setADescricao(e.target.value)}
                  className={inputCls}
                  placeholder="Ex: corte + barba"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-2 block text-sm text-[#475569]">Valor</label>
                  <input
                    type="number"
                    step="0.01"
                    value={aValor}
                    onChange={(e) => setAValor(e.target.value)}
                    className={inputCls}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm text-[#475569]">
                    % da loja
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={aPct}
                    onChange={(e) => setAPct(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-2 block text-sm text-[#475569]">
                    Cliente (opcional)
                  </label>
                  <select
                    value={aClienteId}
                    onChange={(e) => setAClienteId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">—</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-sm text-[#475569]">
                    Profissional
                  </label>
                  <select
                    value={aFuncId}
                    onChange={(e) => setAFuncId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">—</option>
                    {funcionarios.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                type="button"
                onClick={registrarAtendimento}
                disabled={salvandoAt}
                className="w-full rounded-2xl bg-[#2563eb] px-4 py-3 font-bold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
              >
                {salvandoAt ? "Salvando..." : "Registrar atendimento"}
              </button>
            </div>
          </div>

          {/* Catálogo */}
          <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
            <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
              {editandoId ? "Editar serviço" : "Catálogo de serviços"}
            </h2>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome do serviço"
                className={inputSm}
              />
              <input
                type="number"
                step="0.01"
                value={preco}
                onChange={(e) => setPreco(e.target.value)}
                placeholder="Preço"
                className="w-full rounded-xl border border-[#e8ecf4] bg-white px-3 py-2.5 text-sm outline-none sm:w-28"
              />
              <input
                type="number"
                step="0.01"
                value={pct}
                onChange={(e) => setPct(e.target.value)}
                placeholder="% loja"
                className="w-full rounded-xl border border-[#e8ecf4] bg-white px-3 py-2.5 text-sm outline-none sm:w-24"
              />
            </div>
            <label className="mt-2 flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={ativo}
                onChange={(e) => setAtivo(e.target.checked)}
                className="h-4 w-4 accent-[#2563eb]"
              />
              <span className="text-sm text-[#334155]">Ativo</span>
            </label>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={salvarServico}
                disabled={salvandoCat}
                className="flex-1 rounded-xl bg-[#2563eb] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
              >
                {salvandoCat ? "..." : editandoId ? "Salvar" : "Adicionar ao catálogo"}
              </button>
              {editandoId && (
                <button
                  type="button"
                  onClick={limparCat}
                  className="rounded-xl border border-[#e8ecf4] px-4 py-2.5 text-sm font-bold text-[#475569] hover:bg-[#f4f6fb]"
                >
                  Cancelar
                </button>
              )}
            </div>

            {servicos.length > 0 && (
              <div className="mt-4 space-y-2">
                {servicos.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-[#e8ecf4] bg-[#f8fafc]/70 px-3 py-2"
                  >
                    <span className="text-sm text-[#0f172a]">
                      {s.nome}
                      <span className="ml-2 text-xs text-[#64748b]">
                        {formatCurrency(Number(s.preco || 0))} · {Number(s.percentual_loja || 0)}% loja
                        {s.ativo === false ? " · inativo" : ""}
                      </span>
                    </span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => editarServico(s)}
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-[#2563eb] hover:bg-[#eff6ff]"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => excluirServico(s.id)}
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-[#b91c1c] hover:bg-[#fef2f2]"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Atendimentos do período */}
        <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
          <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
            Atendimentos do período
          </h2>
          {loading ? (
            <p className="mt-4 text-[#64748b]">Carregando...</p>
          ) : atendimentosPeriodo.length === 0 ? (
            <p className="mt-4 text-[#64748b]">
              Nenhum atendimento neste período.
            </p>
          ) : (
            <div className="mt-5 space-y-3">
              {atendimentosPeriodo.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-col gap-2 rounded-[22px] border border-[#e8ecf4] bg-[#f8fafc]/70 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-bold text-[#0f172a]">
                      {a.descricao ||
                        servicos.find((s) => s.id === a.servico_id)?.nome ||
                        "Atendimento"}
                    </p>
                    <p className="mt-1 text-xs text-[#64748b]">
                      {new Date(isoToDate(a.data)).toLocaleDateString("pt-BR")} ·
                      Cliente: {nomeCliente(a.cliente_id)} · Prof.:{" "}
                      {nomeFunc(a.funcionario_id)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-black text-[#0f172a]">
                        {formatCurrency(Number(a.valor || 0))}
                      </p>
                      <p className="text-xs text-[#15803d]">
                        loja {formatCurrency(
                          Number(a.valor || 0) *
                            (Number(a.percentual_loja || 0) / 100)
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => excluirAtendimento(a.id)}
                      className="rounded-lg px-2 py-1 text-xs font-semibold text-[#b91c1c] hover:bg-[#fef2f2]"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
