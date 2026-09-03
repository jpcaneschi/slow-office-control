"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/dashboard/page-header";
import { CsvTools } from "@/components/dashboard/csv-tools";
import { RankingClientes } from "@/components/dashboard/ranking-clientes";
import {
  paraInputDate,
  dataValida,
  hojeISO,
} from "@/lib/datas";
import {
  planejarImportacaoClientes,
  prepararImportacaoClientes,
  type ClienteExistente,
} from "@/lib/clientes-import";

type Cliente = {
  id: string;
  nome: string;
  telefone: string | null;
  cpf: string | null;
  status: string | null;
  data_nascimento: string | null;
  email: string | null;
  endereco: string | null;
  observacoes: string | null;
};

const statusOptions = ["ativo", "inativo", "vip", "em atraso"];

const inputClass =
  "w-full rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] px-4 py-3 text-sm text-[#0f172a] outline-none transition placeholder:text-[#94a3b8] focus:border-[#2563eb] focus:bg-white focus:ring-2 focus:ring-[#2563eb]/15";
const labelClass = "mb-1.5 block text-sm font-semibold text-[#475569]";
const cardClass =
  "rounded-3xl border border-[#eef2f7] bg-white p-6 shadow-[0_2px_12px_rgba(15,23,42,0.05)]";

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cpf, setCpf] = useState("");
  const [status, setStatus] = useState("ativo");
  const [dataNascimento, setDataNascimento] = useState("");
  const [email, setEmail] = useState("");
  const [endereco, setEndereco] = useState("");
  const [observacoes, setObservacoes] = useState("");

  async function carregarClientes() {
    setLoading(true);

    const { data, error } = await supabase
      .from("clientes")
      .select(
        "id, nome, telefone, cpf, status, data_nascimento, email, endereco, observacoes"
      )
      .order("created_at", { ascending: false });

    if (error) {
      setErro(error.message);
    } else {
      setClientes(data || []);
      setErro("");
    }

    setLoading(false);
  }

  useEffect(() => {
    carregarClientes();
  }, []);

  function limparFormulario() {
    setNome("");
    setTelefone("");
    setCpf("");
    setStatus("ativo");
    setDataNascimento("");
    setEmail("");
    setEndereco("");
    setObservacoes("");
    setEditandoId(null);
  }

  function editarCliente(cliente: Cliente) {
    setEditandoId(cliente.id);
    setNome(cliente.nome || "");
    setTelefone(cliente.telefone || "");
    setCpf(cliente.cpf || "");
    setStatus(cliente.status || "ativo");
    setDataNascimento(paraInputDate(cliente.data_nascimento));
    setEmail(cliente.email || "");
    setEndereco(cliente.endereco || "");
    setObservacoes(cliente.observacoes || "");
    setErro("");
  }

  async function excluirCliente(id: string) {
    const confirmar = window.confirm("Tem certeza que deseja excluir este cliente?");
    if (!confirmar) return;

    const { error } = await supabase.from("clientes").delete().eq("id", id);

    if (error) {
      setErro(error.message);
      return;
    }

    if (editandoId === id) {
      limparFormulario();
    }

    await carregarClientes();
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!nome.trim()) {
      setErro("O nome do cliente é obrigatório.");
      return;
    }

    if (!dataValida(dataNascimento)) {
      setErro("Data de nascimento inválida.");
      return;
    }

    setSaving(true);
    setErro("");

    if (editandoId) {
      const { error } = await supabase
        .from("clientes")
        .update({
          nome: nome.trim(),
          telefone: telefone.trim() || null,
          cpf: cpf.trim() || null,
          status,
          data_nascimento: dataNascimento || null,
          email: email.trim().toLocaleLowerCase() || null,
          endereco: endereco.trim() || null,
          observacoes: observacoes.trim() || null,
        })
        .eq("id", editandoId);

      if (error) {
        setErro(error.message);
        setSaving(false);
        return;
      }
    } else {
      const { error } = await supabase.from("clientes").insert({
        nome: nome.trim(),
        telefone: telefone.trim() || null,
        cpf: cpf.trim() || null,
        status,
        data_nascimento: dataNascimento || null,
        email: email.trim().toLocaleLowerCase() || null,
        endereco: endereco.trim() || null,
        observacoes: observacoes.trim() || null,
      });

      if (error) {
        setErro(error.message);
        setSaving(false);
        return;
      }
    }

    limparFormulario();
    await carregarClientes();
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          eyebrow="Cadastro"
          title="Clientes"
          description="Cadastro, histórico e ranking dos clientes que mais compram."
        />
        <Link
          href="/dashboard"
          className="rounded-xl border border-[#e8ecf4] bg-white px-4 py-2.5 text-sm font-semibold text-[#334155] transition hover:bg-[#f4f6fb]"
        >
          Voltar
        </Link>
      </div>

      <RankingClientes />

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className={cardClass}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-[#0f172a]">
              {editandoId ? "Editar cliente" : "Novo cliente"}
            </h2>

            {editandoId && (
              <button
                type="button"
                onClick={limparFormulario}
                className="rounded-lg border border-[#e8ecf4] bg-white px-3 py-1.5 text-xs font-semibold text-[#334155] transition hover:bg-[#f4f6fb]"
              >
                Cancelar
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <p className="rounded-xl border border-[#dbeafe] bg-[#eff6ff] px-3 py-2 text-xs text-[#1e40af]">
              Somente o nome é obrigatório. Os demais dados são opcionais.
            </p>
            <div>
              <label htmlFor="cliente-nome" className={labelClass}>Nome</label>
              <input
                id="cliente-nome"
                required
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className={inputClass}
                placeholder="Nome completo"
              />
            </div>

            <div>
              <label htmlFor="cliente-telefone" className={labelClass}>Telefone <span className="font-normal text-[#94a3b8]">(opcional)</span></label>
              <input
                id="cliente-telefone"
                type="tel"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                className={inputClass}
                placeholder="(31) 99999-0000"
              />
            </div>

            <div>
              <label htmlFor="cliente-email" className={labelClass}>E-mail <span className="font-normal text-[#94a3b8]">(opcional)</span></label>
              <input
                id="cliente-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="cliente@exemplo.com"
              />
            </div>

            <div>
              <label htmlFor="cliente-cpf" className={labelClass}>CPF <span className="font-normal text-[#94a3b8]">(opcional)</span></label>
              <input
                id="cliente-cpf"
                value={cpf}
                onChange={(e) => setCpf(e.target.value)}
                className={inputClass}
                placeholder="000.000.000-00"
              />
            </div>

            <div>
              <label htmlFor="cliente-nascimento" className={labelClass}>Data de nascimento <span className="font-normal text-[#94a3b8]">(opcional)</span></label>
              <input
                id="cliente-nascimento"
                type="date"
                value={dataNascimento}
                max={hojeISO()}
                onChange={(e) => setDataNascimento(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="cliente-status" className={labelClass}>Status</label>
              <select
                id="cliente-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={inputClass}
              >
                {statusOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="cliente-endereco" className={labelClass}>Endereço <span className="font-normal text-[#94a3b8]">(opcional)</span></label>
              <textarea
                id="cliente-endereco"
                value={endereco}
                onChange={(e) => setEndereco(e.target.value)}
                className={inputClass}
                rows={3}
                placeholder="Rua, número, bairro, cidade, UF e CEP"
              />
            </div>

            <div>
              <label htmlFor="cliente-observacoes" className={labelClass}>Observações <span className="font-normal text-[#94a3b8]">(opcional)</span></label>
              <textarea
                id="cliente-observacoes"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                className={inputClass}
                rows={4}
                placeholder="Preferências e informações importantes do cliente"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-[#2563eb] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#1d4ed8] disabled:opacity-60"
            >
              {saving
                ? "Salvando..."
                : editandoId
                ? "Salvar alterações"
                : "Cadastrar cliente"}
            </button>
          </form>
        </div>

        <div className={cardClass}>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-lg font-bold text-[#0f172a]">Clientes</h2>
            <CsvTools
              nomeArquivo="clientes"
              headers={[
                "nome",
                "telefone",
                "cpf",
                "email",
                "endereco",
                "observacoes",
                "status",
                "data_nascimento",
              ]}
              linhas={clientes.map((c) => [
                c.nome,
                c.telefone || "",
                c.cpf || "",
                c.email || "",
                c.endereco || "",
                c.observacoes || "",
                c.status || "ativo",
                paraInputDate(c.data_nascimento),
              ])}
              ajuda="Aceita o CSV do Nexo ou a exportação de clientes da Shopify. Reimportações são identificadas e ignoradas."
              onImportar={async (linhas) => {
                const preparacao = prepararImportacaoClientes(linhas);
                if (preparacao.clientes.length === 0 && preparacao.erros.length === 0)
                  return { ok: 0, erro: "Nenhuma linha com nome válido." };

                // Bloqueia o arquivo inteiro se houver data inválida: nada entra
                // parcialmente sem o operador perceber.
                if (preparacao.erros.length > 0) {
                  const nums = preparacao.erros.map((c) => c.linha).join(", ");
                  return {
                    ok: 0,
                    erro: `Data de nascimento inválida na(s) linha(s): ${nums}. Use AAAA-MM-DD ou DD/MM/AAAA.`,
                  };
                }

                // Consulta novamente antes de gravar para deduplicar contra o
                // estado mais recente, sempre limitado à empresa atual pela RLS.
                const { data: existentes, error: erroConsulta } = await supabase
                  .from("clientes")
                  .select("nome, telefone, cpf, email, endereco, observacoes");
                if (erroConsulta) return { ok: 0, erro: erroConsulta.message };

                const plano = planejarImportacaoClientes(
                  preparacao.clientes,
                  (existentes || []) as ClienteExistente[]
                );
                const avisos: string[] = [];
                if (plano.duplicados > 0) {
                  avisos.push(
                    `${plano.duplicados} registro(s) já existente(s) foram ignorado(s).`
                  );
                }
                if (preparacao.semNome > 0) {
                  avisos.push(
                    `${preparacao.semNome} linha(s) sem nome foram ignorada(s).`
                  );
                }

                if (plano.novos.length === 0) {
                  return {
                    ok: 0,
                    aviso: avisos.join(" ") || "Nenhum cliente novo encontrado.",
                  };
                }

                const { error } = await supabase
                  .from("clientes")
                  .insert(plano.novos);
                if (error) return { ok: 0, erro: error.message };
                await carregarClientes();
                return { ok: plano.novos.length, aviso: avisos.join(" ") };
              }}
            />
          </div>

          {erro && (
            <div className="mb-4 rounded-xl border border-[#fecaca] bg-[#fef2f2] p-4 text-sm text-[#b91c1c]">
              {erro}
            </div>
          )}

          {loading && <p className="text-[#64748b]">Carregando clientes...</p>}

          {!loading && !erro && clientes.length === 0 && (
            <p className="text-[#64748b]">Nenhum cliente encontrado.</p>
          )}

          {!loading && clientes.length > 0 && (
            <div className="space-y-3">
              {clientes.map((cliente) => (
                <div
                  key={cliente.id}
                  className="rounded-xl border border-[#eef2f7] bg-[#f8fafc] p-4"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-[#0f172a]">
                        {cliente.nome}
                      </h2>
                      <p className="mt-1 text-sm text-[#64748b]">
                        Telefone: {cliente.telefone || "Não informado"}
                      </p>
                      <p className="text-sm text-[#64748b]">
                        CPF: {cliente.cpf || "Não informado"}
                      </p>
                      <p className="text-sm text-[#64748b]">
                        E-mail: {cliente.email || "Não informado"}
                      </p>
                      {cliente.endereco && (
                        <p className="mt-1 max-w-2xl text-sm text-[#64748b]">
                          Endereço: {cliente.endereco}
                        </p>
                      )}
                      <p className="mt-2 inline-flex rounded-full bg-[#eff6ff] px-3 py-1 text-xs font-semibold text-[#2563eb]">
                        {cliente.status || "ativo"}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <Link
                        href={`/dashboard/clientes/${cliente.id}`}
                        className="rounded-lg border border-[#2563eb]/20 bg-[#2563eb]/10 px-4 py-2 text-sm font-semibold text-[#2563eb] transition hover:bg-[#2563eb]/20"
                      >
                        Ver histórico
                      </Link>

                      <button
                        type="button"
                        onClick={() => editarCliente(cliente)}
                        className="rounded-lg border border-[#e8ecf4] bg-white px-4 py-2 text-sm font-semibold text-[#334155] transition hover:bg-[#f4f6fb]"
                      >
                        Editar
                      </button>

                      <button
                        type="button"
                        onClick={() => excluirCliente(cliente.id)}
                        className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-4 py-2 text-sm font-semibold text-[#dc2626] transition hover:bg-[#fee2e2]"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
