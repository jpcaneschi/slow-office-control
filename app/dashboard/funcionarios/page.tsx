"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/dashboard/page-header";
import { formatCurrency } from "@/lib/vendas-utils";
import { usePeriod, isoToDate } from "@/components/dashboard/period-context";

type Funcionario = {
  id: string;
  nome: string;
  comissao_percentual: number | null;
  salario_fixo: number | null;
  ativo: boolean | null;
  observacao: string | null;
};

type Vale = {
  id: string;
  funcionario_id: string;
  valor: number;
  data: string;
  observacao: string | null;
};

type VendaLite = {
  id: string;
  funcionario_id: string | null;
  total: number | null;
  status: string;
  created_at: string;
};

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
  const [vendas, setVendas] = useState<VendaLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Formulário funcionário
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [comissao, setComissao] = useState("0");
  const [salario, setSalario] = useState("0");
  const [ativo, setAtivo] = useState(true);

  // Formulário vale
  const [valeFuncId, setValeFuncId] = useState("");
  const [valeValor, setValeValor] = useState("");
  const [valeObs, setValeObs] = useState("");
  const [salvandoVale, setSalvandoVale] = useState(false);

  async function carregar() {
    setLoading(true);
    setErro("");
    const [funcRes, valesRes, vendasRes] = await Promise.all([
      supabase
        .from("funcionarios")
        .select("id, nome, comissao_percentual, salario_fixo, ativo, observacao")
        .order("created_at", { ascending: true }),
      supabase.from("vales").select("id, funcionario_id, valor, data, observacao"),
      supabase
        .from("vendas")
        .select("id, funcionario_id, total, status, created_at"),
    ]);
    if (funcRes.error) setErro(funcRes.error.message);
    setFuncionarios(funcRes.data || []);
    setVales(valesRes.data || []);
    setVendas(vendasRes.data || []);
    setLoading(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  function limpar() {
    setEditandoId(null);
    setNome("");
    setComissao("0");
    setSalario("0");
    setAtivo(true);
  }

  function editar(f: Funcionario) {
    setEditandoId(f.id);
    setNome(f.nome || "");
    setComissao(String(f.comissao_percentual ?? 0));
    setSalario(String(f.salario_fixo ?? 0));
    setAtivo(f.ativo !== false);
    setErro("");
  }

  async function salvar() {
    setErro("");
    if (!nome.trim()) {
      setErro("Informe o nome do funcionário.");
      return;
    }
    const pct = Number(comissao || 0);
    if (pct < 0 || pct > 100) {
      setErro("A comissão deve ficar entre 0 e 100%.");
      return;
    }
    setSalvando(true);
    const payload = {
      nome: nome.trim(),
      comissao_percentual: pct,
      salario_fixo: Number(salario || 0),
      ativo,
    };
    const { error } = editandoId
      ? await supabase.from("funcionarios").update(payload).eq("id", editandoId)
      : await supabase.from("funcionarios").insert(payload);
    if (error) {
      setErro(error.message);
      setSalvando(false);
      return;
    }
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
    if (!valeFuncId) {
      setErro("Selecione o funcionário do vale.");
      return;
    }
    const valor = Number(valeValor || 0);
    if (valor <= 0) {
      setErro("Informe um valor de vale válido.");
      return;
    }
    setSalvandoVale(true);
    const { error } = await supabase.from("vales").insert({
      funcionario_id: valeFuncId,
      valor,
      observacao: valeObs.trim() || null,
    });
    if (error) {
      setErro(error.message);
      setSalvandoVale(false);
      return;
    }
    setValeFuncId("");
    setValeValor("");
    setValeObs("");
    await carregar();
    setSalvandoVale(false);
  }

  // Acerto do período por funcionário
  const acerto = useMemo(() => {
    return funcionarios.map((f) => {
      const vendasFunc = vendas.filter((v) => {
        const t = new Date(v.created_at).getTime();
        return (
          v.funcionario_id === f.id &&
          v.status === "concluida" &&
          t >= janela.ini &&
          t < janela.fim
        );
      });
      const vendido = vendasFunc.reduce((a, v) => a + Number(v.total || 0), 0);
      const comissaoValor = vendido * (Number(f.comissao_percentual || 0) / 100);
      const valesPeriodo = vales
        .filter((vl) => {
          const t = isoToDate(vl.data).getTime();
          return vl.funcionario_id === f.id && t >= janela.ini && t < janela.fim;
        })
        .reduce((a, vl) => a + Number(vl.valor || 0), 0);
      const salarioFixo = Number(f.salario_fixo || 0);
      const aPagar = salarioFixo + comissaoValor - valesPeriodo;
      return {
        funcionario: f,
        qtdVendas: vendasFunc.length,
        vendido,
        comissaoValor,
        valesPeriodo,
        salarioFixo,
        aPagar,
      };
    });
  }, [funcionarios, vendas, vales, janela]);

  const inputCls =
    "w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-[#0f172a] outline-none";

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Equipe e folha"
        title="Funcionários"
        description="Cadastre a equipe, defina comissão e salário, e faça o acerto do período (comissões e vales)."
      />

      {erro && (
        <div className="rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-4 text-sm text-[#b91c1c]">
          {erro}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        {/* Cadastro */}
        <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
          <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
            {editandoId ? "Editar funcionário" : "Novo funcionário"}
          </h2>
          <div className="mt-5 space-y-4">
            <div>
              <label className="mb-2 block text-sm text-[#475569]">Nome</label>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className={inputCls}
                placeholder="Nome do funcionário"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-2 block text-sm text-[#475569]">
                  Comissão (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={comissao}
                  onChange={(e) => setComissao(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm text-[#475569]">
                  Salário fixo
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={salario}
                  onChange={(e) => setSalario(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={ativo}
                onChange={(e) => setAtivo(e.target.checked)}
                className="h-4 w-4 accent-[#2563eb]"
              />
              <span className="text-sm font-semibold text-[#334155]">Ativo</span>
            </label>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={salvar}
                disabled={salvando}
                className="flex-1 rounded-2xl bg-[#2563eb] px-4 py-3 font-bold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
              >
                {salvando
                  ? "Salvando..."
                  : editandoId
                    ? "Salvar alterações"
                    : "Cadastrar funcionário"}
              </button>
              {editandoId && (
                <button
                  type="button"
                  onClick={limpar}
                  className="rounded-2xl border border-[#e8ecf4] px-4 py-3 font-bold text-[#475569] transition hover:bg-[#f4f6fb]"
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>

          {/* Registrar vale */}
          <div className="mt-6 rounded-2xl border border-[#fde68a] bg-[#fffbeb] p-4">
            <p className="text-sm font-bold text-[#92400e]">Registrar vale</p>
            <div className="mt-3 space-y-2">
              <select
                value={valeFuncId}
                onChange={(e) => setValeFuncId(e.target.value)}
                className="w-full rounded-xl border border-[#fde68a] bg-white px-3 py-2.5 text-sm outline-none"
              >
                <option value="">Selecione o funcionário</option>
                {funcionarios.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  value={valeValor}
                  onChange={(e) => setValeValor(e.target.value)}
                  placeholder="Valor"
                  className="w-32 rounded-xl border border-[#fde68a] bg-white px-3 py-2.5 text-sm outline-none"
                />
                <input
                  value={valeObs}
                  onChange={(e) => setValeObs(e.target.value)}
                  placeholder="Observação (opcional)"
                  className="flex-1 rounded-xl border border-[#fde68a] bg-white px-3 py-2.5 text-sm outline-none"
                />
              </div>
              <button
                type="button"
                onClick={registrarVale}
                disabled={salvandoVale}
                className="w-full rounded-xl bg-[#b45309] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#92400e] disabled:opacity-60"
              >
                {salvandoVale ? "..." : "Registrar vale"}
              </button>
            </div>
          </div>
        </div>

        {/* Lista + acerto */}
        <div className="space-y-6">
          <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
            <h2 className="text-xl font-black tracking-tight text-[#0f172a]">
              Acerto do período
            </h2>
            <p className="mt-1 text-sm text-[#64748b]">
              Comissão sobre vendas concluídas no período selecionado, menos vales.
            </p>

            {loading ? (
              <p className="mt-4 text-[#64748b]">Carregando...</p>
            ) : funcionarios.length === 0 ? (
              <p className="mt-4 text-[#64748b]">
                Nenhum funcionário cadastrado ainda.
              </p>
            ) : (
              <div className="mt-5 space-y-3">
                {acerto.map((a) => (
                  <div
                    key={a.funcionario.id}
                    className="rounded-[24px] border border-[#e8ecf4] bg-[#f8fafc]/70 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-black text-[#0f172a]">
                          {a.funcionario.nome}
                        </p>
                        {a.funcionario.ativo === false && (
                          <span className="rounded-full bg-[#f1f5f9] px-2 py-0.5 text-xs font-semibold text-[#64748b]">
                            inativo
                          </span>
                        )}
                        <span className="text-xs text-[#94a3b8]">
                          {Number(a.funcionario.comissao_percentual || 0)}% comissão
                        </span>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => editar(a.funcionario)}
                          className="rounded-lg px-2.5 py-1 text-xs font-semibold text-[#2563eb] hover:bg-[#eff6ff]"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => excluir(a.funcionario.id)}
                          className="rounded-lg px-2.5 py-1 text-xs font-semibold text-[#b91c1c] hover:bg-[#fef2f2]"
                        >
                          Excluir
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                      <p className="text-[#64748b]">
                        Vendido:{" "}
                        <span className="font-bold text-[#0f172a]">
                          {formatCurrency(a.vendido)}
                        </span>{" "}
                        ({a.qtdVendas})
                      </p>
                      <p className="text-[#64748b]">
                        Comissão:{" "}
                        <span className="font-bold text-[#15803d]">
                          {formatCurrency(a.comissaoValor)}
                        </span>
                      </p>
                      <p className="text-[#64748b]">
                        Salário:{" "}
                        <span className="font-bold text-[#0f172a]">
                          {formatCurrency(a.salarioFixo)}
                        </span>
                      </p>
                      <p className="text-[#64748b]">
                        Vales:{" "}
                        <span className="font-bold text-[#b45309]">
                          − {formatCurrency(a.valesPeriodo)}
                        </span>
                      </p>
                      <p className="text-[#64748b] sm:col-span-2">
                        A pagar:{" "}
                        <span className="text-base font-black text-[#1d4ed8]">
                          {formatCurrency(a.aPagar)}
                        </span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
