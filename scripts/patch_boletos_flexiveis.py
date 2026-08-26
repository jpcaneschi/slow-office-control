from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / "components/dashboard/financeiro-simplificado.tsx"
s = path.read_text(encoding="utf-8")

# Remove loading state, que já não é usado visualmente.
s = s.replace('  const [loading, setLoading] = useState(true);\n', '')
s = s.replace('    setLoading(true);\n', '')
s = s.replace('    setLoading(false);\n', '')

# Substitui os estados antigos de parcelamento mensal por boletos livres.
s = s.replace(
'''  const [observacao, setObservacao] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [parcelasCompra, setParcelasCompra] = useState("1");
''',
'''  const [observacao, setObservacao] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [quantidadeBoletos, setQuantidadeBoletos] = useState("1");
  const [boletosFornecedor, setBoletosFornecedor] = useState<
    { data: string; valor: string }[]
  >([{ data: hojeISO(), valor: "" }]);
''')

s = s.replace(
'''  const ehCompraFornecedor =
    categoria === "Compra de mercadoria" || categoria === "Fornecedor";
  const qtdParcelasCompra = Math.min(
    60,
    Math.max(1, Math.trunc(Number(parcelasCompra || 1)))
  );
''',
'''  const ehCompraFornecedor =
    categoria === "Compra de mercadoria" || categoria === "Fornecedor";
  const qtdBoletos = Math.min(
    60,
    Math.max(1, Math.trunc(Number(quantidadeBoletos || 1)))
  );
  const totalBoletos = boletosFornecedor.reduce(
    (soma, boleto) => soma + (Number(boleto.valor) || 0),
    0
  );

  function ajustarQuantidadeBoletos(valorNovo: string) {
    setQuantidadeBoletos(valorNovo);
    const quantidade = Math.min(60, Math.max(1, Math.trunc(Number(valorNovo || 1))));
    setBoletosFornecedor((atuais) => {
      if (atuais.length === quantidade) return atuais;
      if (atuais.length > quantidade) return atuais.slice(0, quantidade);
      return [
        ...atuais,
        ...Array.from({ length: quantidade - atuais.length }, () => ({ data: "", valor: "" })),
      ];
    });
  }

  function atualizarBoleto(
    indice: number,
    campo: "data" | "valor",
    valorNovo: string
  ) {
    setBoletosFornecedor((atuais) =>
      atuais.map((boleto, i) => (i === indice ? { ...boleto, [campo]: valorNovo } : boleto))
    );
  }
''')

inicio = s.index('  async function registrarDespesa() {')
fim = s.index('  async function adicionarRecorrente() {')
novo_registro = '''  async function registrarDespesa() {
    setErro("");
    setSucesso("");

    if (!descricao.trim()) {
      setErro("Informe a descrição da despesa.");
      return;
    }

    if (ehCompraFornecedor) {
      if (!fornecedor.trim()) {
        setErro("Informe o fornecedor ou a marca.");
        return;
      }
      if (boletosFornecedor.length !== qtdBoletos) {
        setErro("Confira a quantidade de boletos.");
        return;
      }
      const invalido = boletosFornecedor.findIndex(
        (boleto) => !boleto.data || !Number.isFinite(Number(boleto.valor)) || Number(boleto.valor) <= 0
      );
      if (invalido >= 0) {
        setErro(`Informe data e valor válidos no boleto ${invalido + 1}.`);
        return;
      }

      setProcessando("nova-despesa");
      const { error } = await supabase.rpc("registrar_boletos_fornecedor", {
        p_fornecedor: fornecedor.trim(),
        p_descricao: descricao.trim(),
        p_parcelas: boletosFornecedor.map((boleto) => ({
          data: boleto.data,
          valor: Number(boleto.valor),
        })),
        p_observacao: observacao.trim() || null,
      });
      if (error) setErro(error.message);
      else {
        setDescricao("");
        setObservacao("");
        setFornecedor("");
        setQuantidadeBoletos("1");
        setBoletosFornecedor([{ data: hojeISO(), valor: "" }]);
        setSucesso(
          `${qtdBoletos} boleto${qtdBoletos > 1 ? "s" : ""} de fornecedor cadastrado${
            qtdBoletos > 1 ? "s" : ""
          }. Cada um ficou no vencimento informado e pendente até você marcar como pago.`
        );
        await carregar();
      }
      setProcessando(null);
      return;
    }

    const n = Number(valor);
    if (!Number.isFinite(n) || n <= 0 || !vencimento) {
      setErro("Informe valor e vencimento válidos.");
      return;
    }
    setProcessando("nova-despesa");
    const competenciaDespesa = `${vencimento.slice(0, 7)}-01`;
    const { error } = await supabase.from("despesas").insert({
      descricao: descricao.trim(),
      categoria,
      valor: n,
      data: vencimento,
      data_vencimento: vencimento,
      data_pagamento: status === "pago" ? dataPagamento || hojeISO() : null,
      status,
      competencia: competenciaDespesa,
      observacao: observacao.trim() || null,
    });
    if (error) setErro(error.message);
    else {
      setDescricao("");
      setValor("");
      setObservacao("");
      setSucesso(
        status === "pago" ? "Despesa registrada como paga." : "Conta registrada como pendente."
      );
      await carregar();
    }
    setProcessando(null);
  }

'''
s = s[:inicio] + novo_registro + s[fim:]

# Troca somente o card de nova despesa, preservando o card de recorrentes.
marker_inicio = '''        <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
          <div className="flex items-center gap-2">
            <PackageOpen className="h-5 w-5 text-[#2563eb]" />'''
start = s.index(marker_inicio)
marker_fim = '''        <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
          <h2 className="text-lg font-black text-[#0f172a]">Contas recorrentes</h2>'''
end = s.index(marker_fim, start)

novo_card = '''        <div className="rounded-[30px] border border-[#e8ecf4] bg-white p-6">
          <div className="flex items-center gap-2">
            <PackageOpen className="h-5 w-5 text-[#2563eb]" />
            <div>
              <h2 className="text-lg font-black text-[#0f172a]">Nova despesa</h2>
              <p className="text-xs text-[#64748b]">
                Conta avulsa ou boletos de fornecedor. Boletos têm fim e datas livres.
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <input
              className={`${inputCls} sm:col-span-2`}
              placeholder="Descrição"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
            <select className={inputCls} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
              {categorias.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>

            {ehCompraFornecedor ? (
              <>
                <input
                  className={inputCls}
                  placeholder="Fornecedor / marca"
                  value={fornecedor}
                  onChange={(e) => setFornecedor(e.target.value)}
                />
                <div>
                  <label className="mb-1 block text-xs font-bold text-[#64748b]">
                    Quantidade de boletos
                  </label>
                  <input
                    className={inputCls}
                    type="number"
                    min="1"
                    max="60"
                    step="1"
                    value={quantidadeBoletos}
                    onChange={(e) => ajustarQuantidadeBoletos(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2 rounded-2xl border border-[#dbeafe] bg-[#eff6ff] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-[#1e3a8a]">Boletos do fornecedor</p>
                      <p className="mt-1 text-xs leading-5 text-[#1e40af]">
                        Informe a data e o valor de cada boleto. Não existe recorrência automática e não há vínculo com produto ou estoque.
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-black text-[#1d4ed8]">
                      Total {brl(totalBoletos)}
                    </span>
                  </div>
                  <div className="mt-4 space-y-2">
                    {boletosFornecedor.map((boleto, indice) => (
                      <div key={indice} className="grid gap-2 rounded-2xl bg-white p-3 sm:grid-cols-[90px_1fr_1fr] sm:items-end">
                        <p className="pb-3 text-xs font-black text-[#64748b]">
                          Boleto {indice + 1}/{qtdBoletos}
                        </p>
                        <div>
                          <label className="mb-1 block text-[11px] font-bold text-[#64748b]">Vencimento</label>
                          <input
                            className={inputCls}
                            type="date"
                            value={boleto.data}
                            onChange={(e) => atualizarBoleto(indice, "data", e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-bold text-[#64748b]">Valor</label>
                          <input
                            className={inputCls}
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0,00"
                            value={boleto.valor}
                            onChange={(e) => atualizarBoleto(indice, "valor", e.target.value)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <input
                  className={`${inputCls} sm:col-span-2`}
                  placeholder="Observação / número da nota (opcional)"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                />
              </>
            ) : (
              <>
                <input
                  className={inputCls}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Valor"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                />
                <div>
                  <label className="mb-1 block text-xs font-bold text-[#64748b]">Vencimento</label>
                  <input
                    className={inputCls}
                    type="date"
                    value={vencimento}
                    onChange={(e) => setVencimento(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-[#64748b]">Situação</label>
                  <select
                    className={inputCls}
                    value={status}
                    onChange={(e) => setStatus(e.target.value as "pago" | "pendente")}
                  >
                    <option value="pago">Já paguei</option>
                    <option value="pendente">Ainda vou pagar</option>
                  </select>
                </div>
                {status === "pago" && (
                  <div>
                    <label className="mb-1 block text-xs font-bold text-[#64748b]">Data que pagou</label>
                    <input
                      className={inputCls}
                      type="date"
                      value={dataPagamento}
                      onChange={(e) => setDataPagamento(e.target.value)}
                    />
                  </div>
                )}
                <input
                  className={`${inputCls} ${status === "pago" ? "" : "sm:col-span-2"}`}
                  placeholder="Observação (opcional)"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                />
              </>
            )}
          </div>
          <button
            disabled={processando === "nova-despesa"}
            onClick={registrarDespesa}
            className="mt-4 w-full rounded-2xl bg-[#0f172a] px-4 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            {processando === "nova-despesa"
              ? "Salvando..."
              : ehCompraFornecedor
                ? `Cadastrar ${qtdBoletos} boleto${qtdBoletos > 1 ? "s" : ""}`
                : status === "pago"
                  ? "Registrar despesa paga"
                  : "Adicionar conta pendente"}
          </button>
        </div>

'''
s = s[:start] + novo_card + s[end:]

s = s.replace(
'''        Mercadoria é reconhecida no Financeiro pelos boletos e compras de fornecedor lançados como despesa. O preço do produto serve somente para registrar a venda ao cliente.''',
'''        Produto mantém apenas o preço usado na venda. Boletos de fornecedor são despesas independentes, com datas próprias e sem vínculo com produto ou estoque.'''
)

path.write_text(s, encoding="utf-8")

# Remove o formulário duplicado da página financeira.
page = ROOT / "app/dashboard/financeiro/page.tsx"
p = page.read_text(encoding="utf-8")
p = p.replace('import { CompraFornecedorForm } from "@/components/dashboard/compra-fornecedor-form";\n', '')
p = p.replace('      <CompraFornecedorForm />\n', '')
page.write_text(p, encoding="utf-8")

# Corrige aviso simples no Condicional.
cond = ROOT / "app/dashboard/condicional/page.tsx"
c = cond.read_text(encoding="utf-8")
c = c.replace('      const prod = produtos.find((p) => p.id === i.produto_id);\n', '')
cond.write_text(c, encoding="utf-8")

print("Ajuste de boletos flexíveis aplicado")
