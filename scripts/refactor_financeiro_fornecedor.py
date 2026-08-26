from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / "components/dashboard/financeiro-simplificado.tsx"
s = path.read_text(encoding="utf-8")


def rep(old: str, new: str, label: str):
    global s
    if old not in s:
        raise RuntimeError(f"Padrão não encontrado: {label}")
    s = s.replace(old, new, 1)

rep(
'''  const [observacao, setObservacao] = useState("");

  const [rDescricao, setRDescricao] = useState("");''',
'''  const [observacao, setObservacao] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [parcelasCompra, setParcelasCompra] = useState("1");

  const [rDescricao, setRDescricao] = useState("");''',
"states fornecedor",
)

rep(
'''  const sobra = Math.max(0, resumo.faturamento_recebido - resumo.despesas_previstas);

  async function registrarDespesa() {''',
'''  const sobra = Math.max(0, resumo.faturamento_recebido - resumo.despesas_previstas);
  const ehCompraFornecedor =
    categoria === "Compra de mercadoria" || categoria === "Fornecedor";
  const qtdParcelasCompra = Math.min(
    60,
    Math.max(1, Math.trunc(Number(parcelasCompra || 1)))
  );

  async function registrarDespesa() {''',
"derived compra",
)

old = '''  async function registrarDespesa() {
    setErro("");
    setSucesso("");
    const n = Number(valor);
    if (!descricao.trim() || !Number.isFinite(n) || n <= 0 || !vencimento) {
      setErro("Informe descrição, valor e vencimento válidos.");
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
new = '''  async function registrarDespesa() {
    setErro("");
    setSucesso("");
    const n = Number(valor);
    if (!descricao.trim() || !Number.isFinite(n) || n <= 0 || !vencimento) {
      setErro("Informe descrição, valor e vencimento válidos.");
      return;
    }
    if (ehCompraFornecedor && !fornecedor.trim()) {
      setErro("Informe o fornecedor ou a marca da mercadoria.");
      return;
    }
    if (!Number.isFinite(qtdParcelasCompra) || qtdParcelasCompra < 1 || qtdParcelasCompra > 60) {
      setErro("Informe uma quantidade de parcelas entre 1 e 60.");
      return;
    }

    setProcessando("nova-despesa");

    if (ehCompraFornecedor && qtdParcelasCompra > 1) {
      const { error } = await supabase.rpc("registrar_compra_fornecedor", {
        p_fornecedor: fornecedor.trim(),
        p_descricao: descricao.trim(),
        p_valor_total: n,
        p_parcelas: qtdParcelasCompra,
        p_primeiro_vencimento: vencimento,
        p_observacao: observacao.trim() || null,
      });
      if (error) {
        setErro(error.message);
        setProcessando(null);
        return;
      }
      setDescricao("");
      setValor("");
      setObservacao("");
      setFornecedor("");
      setParcelasCompra("1");
      setStatus("pendente");
      setSucesso(
        `Compra de fornecedor parcelada em ${qtdParcelasCompra}x. As parcelas foram lançadas nos respectivos meses e ficam pendentes até você marcar o pagamento.`
      );
      await carregar();
      setProcessando(null);
      return;
    }

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
      fornecedor: ehCompraFornecedor ? fornecedor.trim() || null : null,
    });
    if (error) setErro(error.message);
    else {
      setDescricao("");
      setValor("");
      setObservacao("");
      setFornecedor("");
      setParcelasCompra("1");
      setSucesso(
        status === "pago" ? "Despesa registrada como paga." : "Conta registrada como pendente."
      );
      await carregar();
    }
    setProcessando(null);
  }
'''
rep(old, new, "registrar despesa")

rep(
'''            <input
              className={inputCls}
              type="number"
              min="0"
              step="0.01"
              placeholder="Valor"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
            <div>
              <label className="mb-1 block text-xs font-bold text-[#64748b]">Vencimento</label>''',
'''            <input
              className={inputCls}
              type="number"
              min="0"
              step="0.01"
              placeholder={ehCompraFornecedor ? "Valor total da compra" : "Valor"}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
            />
            {ehCompraFornecedor && (
              <>
                <input
                  className={inputCls}
                  placeholder="Fornecedor / marca"
                  value={fornecedor}
                  onChange={(e) => setFornecedor(e.target.value)}
                />
                <div>
                  <label className="mb-1 block text-xs font-bold text-[#64748b]">
                    Parcelas do boleto
                  </label>
                  <input
                    className={inputCls}
                    type="number"
                    min="1"
                    max="60"
                    step="1"
                    value={parcelasCompra}
                    onChange={(e) => setParcelasCompra(e.target.value)}
                  />
                </div>
              </>
            )}
            <div>
              <label className="mb-1 block text-xs font-bold text-[#64748b]">
                {ehCompraFornecedor && qtdParcelasCompra > 1
                  ? "Vencimento da 1ª parcela"
                  : "Vencimento"}
              </label>''',
"campos fornecedor parcelas",
)

rep(
'''            <div>
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
            {status === "pago" && (''',
'''            {!(ehCompraFornecedor && qtdParcelasCompra > 1) && (
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
            )}
            {ehCompraFornecedor && qtdParcelasCompra > 1 && (
              <div className="rounded-2xl border border-[#dbeafe] bg-[#eff6ff] px-4 py-3 text-xs leading-5 text-[#1e40af]">
                O valor total será dividido em {qtdParcelasCompra} parcelas mensais. Cada boleto aparecerá na agenda do mês correto e só vira pago quando você confirmar.
              </div>
            )}
            {status === "pago" && !(ehCompraFornecedor && qtdParcelasCompra > 1) && (''',
"status parcelado",
)

rep(
'''            {processando === "nova-despesa"
              ? "Salvando..."
              : status === "pago"
                ? "Registrar despesa paga"
                : "Adicionar conta pendente"}''',
'''            {processando === "nova-despesa"
              ? "Salvando..."
              : ehCompraFornecedor && qtdParcelasCompra > 1
                ? `Criar ${qtdParcelasCompra} parcelas do boleto`
                : status === "pago"
                  ? "Registrar despesa paga"
                  : "Adicionar conta pendente"}''',
"texto botao",
)

path.write_text(s, encoding="utf-8")
print("Financeiro de fornecedor atualizado")
