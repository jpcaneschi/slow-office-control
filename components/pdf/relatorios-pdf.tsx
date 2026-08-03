import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

// ─────────────────────────────────────────────────────────────────────────────
// Modelos de PDF em PRETO & BRANCO (para impressão em folha branca).
// Fundo branco, texto preto, bordas pretas. Sem cor.
// ─────────────────────────────────────────────────────────────────────────────

function brl(n: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(n) ? n : 0);
}

function fmtData(iso: string) {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#ffffff",
    color: "#111111",
    paddingVertical: 42,
    paddingHorizontal: 46,
    paddingBottom: 60,
    fontFamily: "Helvetica",
    fontSize: 11,
    lineHeight: 1.5,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 2,
    borderBottomColor: "#000000",
    paddingBottom: 12,
    marginBottom: 4,
  },
  loja: { fontSize: 17, fontFamily: "Helvetica-Bold", color: "#000000" },
  lojaSub: { fontSize: 8.5, color: "#555555", marginTop: 3, letterSpacing: 0.5 },
  headRight: { alignItems: "flex-end" },
  docTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#000000",
  },
  docCode: { fontSize: 9, color: "#555555", marginTop: 4 },
  sectionTitle: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#000000",
    marginTop: 18,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#cccccc",
    paddingBottom: 4,
  },
  row: { flexDirection: "row", marginBottom: 5 },
  rowLabel: { width: 135, color: "#555555" },
  rowValue: { flex: 1, color: "#000000", fontFamily: "Helvetica-Bold" },
  paragraph: {
    fontSize: 11,
    color: "#111111",
    lineHeight: 1.65,
    marginTop: 10,
  },
  valorLinha: { flexDirection: "row", alignItems: "baseline", marginTop: 14 },
  valorLabel: {
    fontSize: 10,
    color: "#555555",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginRight: 8,
  },
  valorDestaque: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#000000" },
  table: { borderWidth: 1, borderColor: "#000000", marginTop: 8 },
  tHead: { flexDirection: "row", backgroundColor: "#000000" },
  tHeadCell: {
    color: "#ffffff",
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#dddddd" },
  tCell: { fontSize: 10, color: "#111111", paddingVertical: 6, paddingHorizontal: 8 },
  totalBox: {
    marginTop: 14,
    borderWidth: 1.5,
    borderColor: "#000000",
    paddingVertical: 11,
    paddingHorizontal: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  totalValue: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  signRow: { flexDirection: "row", gap: 30, marginTop: 54 },
  sign: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: "#000000",
    paddingTop: 6,
    alignItems: "center",
  },
  signText: { fontSize: 9, color: "#333333" },
  footer: {
    position: "absolute",
    bottom: 26,
    left: 46,
    right: 46,
    borderTopWidth: 1,
    borderTopColor: "#dddddd",
    paddingTop: 7,
    fontSize: 8,
    color: "#888888",
    textAlign: "center",
  },
});

function Header({
  loja,
  titulo,
  codigo,
}: {
  loja: string;
  titulo: string;
  codigo?: string;
}) {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.loja}>{loja}</Text>
        <Text style={styles.lojaSub}>Documento oficial da loja</Text>
      </View>
      <View style={styles.headRight}>
        <Text style={styles.docTitle}>{titulo}</Text>
        {codigo ? <Text style={styles.docCode}>{codigo}</Text> : null}
      </View>
    </View>
  );
}

function Campo({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value || "—"}</Text>
    </View>
  );
}

function Assinaturas({ esquerda, direita }: { esquerda: string; direita?: string }) {
  return (
    <View style={styles.signRow}>
      <View style={styles.sign}>
        <Text style={styles.signText}>{esquerda}</Text>
      </View>
      {direita ? (
        <View style={styles.sign}>
          <Text style={styles.signText}>{direita}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Rodape({ loja }: { loja: string }) {
  return (
    <Text
      style={styles.footer}
      fixed
      render={({ pageNumber, totalPages }) =>
        `${loja}  ·  Documento gerado pelo sistema  ·  Página ${pageNumber}/${totalPages}`
      }
    />
  );
}

// ── 1) Promissória ───────────────────────────────────────────────────────────
export type PromissoriaProps = {
  loja: string;
  devedor: string;
  cpf?: string;
  valor: number;
  vencimento: string;
  cidade?: string;
  dataEmissao: string;
  referencia?: string;
};

export function PromissoriaPdf({
  loja,
  devedor,
  cpf,
  valor,
  vencimento,
  cidade,
  dataEmissao,
  referencia,
}: PromissoriaProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Header loja={loja} titulo="Nota Promissória" />

        <View style={styles.valorLinha}>
          <Text style={styles.valorLabel}>Valor</Text>
          <Text style={styles.valorDestaque}>{brl(valor)}</Text>
        </View>

        <Text style={styles.paragraph}>
          No dia {fmtData(vencimento)}, pagarei por esta única via de NOTA
          PROMISSÓRIA a {loja || "credor"}, ou à sua ordem, a quantia de{" "}
          {brl(valor)} em moeda corrente deste país.
          {referencia ? ` Referente a: ${referencia}.` : ""}
        </Text>

        <Text style={styles.sectionTitle}>Dados do emitente</Text>
        <Campo label="Emitente (devedor)" value={devedor} />
        <Campo label="CPF / documento" value={cpf || "—"} />
        <Campo
          label="Local e data"
          value={`${cidade ? cidade + ", " : ""}${fmtData(dataEmissao)}`}
        />
        <Campo label="Vencimento" value={fmtData(vencimento)} />

        <Assinaturas esquerda="Assinatura do emitente" />
        <Rodape loja={loja} />
      </Page>
    </Document>
  );
}

// ── 2) Vale / Adiantamento ───────────────────────────────────────────────────
export type ValeProps = {
  loja: string;
  funcionario: string;
  valor: number;
  data: string;
  motivo?: string;
  descontarEmFolha: boolean;
};

export function ValePdf({
  loja,
  funcionario,
  valor,
  data,
  motivo,
  descontarEmFolha,
}: ValeProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Header loja={loja} titulo="Vale / Adiantamento" />

        <View style={styles.valorLinha}>
          <Text style={styles.valorLabel}>Valor</Text>
          <Text style={styles.valorDestaque}>{brl(valor)}</Text>
        </View>

        <Text style={styles.paragraph}>
          Recebi de {loja || "empresa"} a quantia de {brl(valor)} a título de
          vale/adiantamento
          {motivo ? `, referente a ${motivo}` : ""}.
          {descontarEmFolha
            ? " Este valor será descontado do meu próximo pagamento."
            : ""}
        </Text>

        <Text style={styles.sectionTitle}>Dados</Text>
        <Campo label="Funcionário" value={funcionario} />
        <Campo label="Data" value={fmtData(data)} />
        <Campo
          label="Descontar em folha"
          value={descontarEmFolha ? "Sim" : "Não"}
        />

        <Assinaturas esquerda="Assinatura do funcionário" direita="Responsável pela loja" />
        <Rodape loja={loja} />
      </Page>
    </Document>
  );
}

// ── 3) Recibo de pagamento (folha salarial) ──────────────────────────────────
export type FolhaProps = {
  loja: string;
  funcionario: string;
  cargo?: string;
  referencia: string;
  salarioBase: number;
  bonus: number;
  bonusLabel?: string;
  descontos: number;
  descontosLabel?: string;
};

export function FolhaSalarialPdf({
  loja,
  funcionario,
  cargo,
  referencia,
  salarioBase,
  bonus,
  bonusLabel,
  descontos,
  descontosLabel,
}: FolhaProps) {
  const liquido = (salarioBase || 0) + (bonus || 0) - (descontos || 0);

  const linhas: { desc: string; valor: string }[] = [
    { desc: "Salário base", valor: `+ ${brl(salarioBase || 0)}` },
  ];
  if (bonus > 0) {
    linhas.push({
      desc: bonusLabel?.trim() || "Bônus / adicional",
      valor: `+ ${brl(bonus)}`,
    });
  }
  if (descontos > 0) {
    linhas.push({
      desc: descontosLabel?.trim() || "Descontos",
      valor: `- ${brl(descontos)}`,
    });
  }

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Header loja={loja} titulo="Recibo de Pagamento" />

        <Text style={styles.sectionTitle}>Funcionário</Text>
        <Campo label="Nome" value={funcionario} />
        {cargo ? <Campo label="Cargo" value={cargo} /> : null}
        <Campo label="Referência" value={referencia} />

        <Text style={styles.sectionTitle}>Composição</Text>
        <View style={styles.table}>
          <View style={styles.tHead}>
            <Text style={[styles.tHeadCell, { flex: 1 }]}>Descrição</Text>
            <Text style={[styles.tHeadCell, { width: 130, textAlign: "right" }]}>
              Valor
            </Text>
          </View>
          {linhas.map((l, i) => (
            <View key={i} style={styles.tRow}>
              <Text style={[styles.tCell, { flex: 1 }]}>{l.desc}</Text>
              <Text style={[styles.tCell, { width: 130, textAlign: "right" }]}>
                {l.valor}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.totalBox}>
          <Text style={styles.totalLabel}>Total líquido a receber</Text>
          <Text style={styles.totalValue}>{brl(liquido)}</Text>
        </View>

        <Text style={styles.paragraph}>
          Recebi de {loja || "empresa"} a importância líquida de {brl(liquido)},
          referente ao pagamento acima descrito, dando plena quitação.
        </Text>

        <Assinaturas esquerda="Assinatura do funcionário" direita="Responsável pela loja" />
        <Rodape loja={loja} />
      </Page>
    </Document>
  );
}

// ── 4) Repasse do tatuador ───────────────────────────────────────────────────
export type RepasseItem = {
  data: string;
  cliente: string;
  valor: number;
  percentual: number;
};

export type RepasseProps = {
  loja: string;
  tatuador: string;
  periodoInicio: string;
  periodoFim: string;
  itens: RepasseItem[];
};

export function RepasseTatuadorPdf({
  loja,
  tatuador,
  periodoInicio,
  periodoFim,
  itens,
}: RepasseProps) {
  let faturado = 0;
  let aLoja = 0;
  for (const it of itens) {
    faturado += it.valor || 0;
    aLoja += ((it.valor || 0) * (it.percentual || 0)) / 100;
  }
  const ficaTatuador = faturado - aLoja;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Header loja={loja} titulo="Repasse — Tatuagem" />

        <Text style={styles.sectionTitle}>Referência</Text>
        <Campo label="Tatuador" value={tatuador} />
        <Campo
          label="Período"
          value={`${fmtData(periodoInicio)} a ${fmtData(periodoFim)}`}
        />
        <Campo label="Atendimentos" value={String(itens.length)} />

        <Text style={styles.sectionTitle}>Atendimentos</Text>
        <View style={styles.table}>
          <View style={styles.tHead}>
            <Text style={[styles.tHeadCell, { width: 62 }]}>Data</Text>
            <Text style={[styles.tHeadCell, { flex: 1 }]}>Cliente</Text>
            <Text style={[styles.tHeadCell, { width: 78, textAlign: "right" }]}>
              Valor
            </Text>
            <Text style={[styles.tHeadCell, { width: 34, textAlign: "right" }]}>
              %
            </Text>
            <Text style={[styles.tHeadCell, { width: 80, textAlign: "right" }]}>
              À loja
            </Text>
          </View>
          {itens.map((it, i) => (
            <View key={i} style={styles.tRow}>
              <Text style={[styles.tCell, { width: 62 }]}>{fmtData(it.data)}</Text>
              <Text style={[styles.tCell, { flex: 1 }]}>{it.cliente}</Text>
              <Text style={[styles.tCell, { width: 78, textAlign: "right" }]}>
                {brl(it.valor || 0)}
              </Text>
              <Text style={[styles.tCell, { width: 34, textAlign: "right" }]}>
                {it.percentual}
              </Text>
              <Text style={[styles.tCell, { width: 80, textAlign: "right" }]}>
                {brl(((it.valor || 0) * (it.percentual || 0)) / 100)}
              </Text>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 12 }}>
          <Campo label="Total faturado" value={brl(faturado)} />
          <Campo label="Fica com o tatuador" value={brl(ficaTatuador)} />
        </View>

        <View style={styles.totalBox}>
          <Text style={styles.totalLabel}>Total a repassar à loja</Text>
          <Text style={styles.totalValue}>{brl(aLoja)}</Text>
        </View>

        <Assinaturas esquerda="Assinatura do tatuador" direita="Responsável pela loja" />
        <Rodape loja={loja} />
      </Page>
    </Document>
  );
}
