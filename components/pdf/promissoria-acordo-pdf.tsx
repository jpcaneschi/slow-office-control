import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, color: "#0f172a", fontFamily: "Helvetica" },
  header: { borderBottomWidth: 1, borderBottomColor: "#dbe3ef", paddingBottom: 14, marginBottom: 18 },
  eyebrow: { fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: 1.2 },
  title: { fontSize: 22, fontWeight: 700, marginTop: 4 },
  subtitle: { fontSize: 10, color: "#64748b", marginTop: 5 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5 },
  card: { width: "50%", padding: 5 },
  cardInner: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 7, padding: 10 },
  label: { fontSize: 8, color: "#64748b", textTransform: "uppercase" },
  value: { fontSize: 11, fontWeight: 700, marginTop: 4 },
  section: { fontSize: 12, fontWeight: 700, marginTop: 18, marginBottom: 8 },
  table: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 7, overflow: "hidden" },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#eef2f7" },
  head: { backgroundColor: "#f8fafc" },
  cell: { padding: 8 },
  textMuted: { color: "#64748b" },
  totalBox: { marginTop: 16, borderWidth: 1, borderColor: "#bfdbfe", backgroundColor: "#eff6ff", borderRadius: 8, padding: 12 },
  totalLine: { flexDirection: "row", justifyContent: "space-between", marginBottom: 5 },
  totalStrong: { fontSize: 13, fontWeight: 700 },
  note: { marginTop: 16, padding: 10, backgroundColor: "#f8fafc", borderRadius: 7, lineHeight: 1.45 },
  sign: { marginTop: 42, borderTopWidth: 1, borderTopColor: "#94a3b8", width: "48%", paddingTop: 6, textAlign: "center", color: "#475569" },
  footer: { position: "absolute", bottom: 20, left: 36, right: 36, fontSize: 8, color: "#94a3b8", textAlign: "center" },
});

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));
const dataBR = (v: string) => {
  const s = (v || "").slice(0, 10);
  const [a, m, d] = s.split("-");
  return d && m && a ? `${d}/${m}/${a}` : "—";
};

export type AcordoItem = { nome: string; detalhe?: string; quantidade: number; precoUnitario: number };
export type AcordoParcela = { numero: number; vencimento: string; valor: number };

type Props = {
  loja: string;
  cliente: string;
  cpf?: string | null;
  emissao: string;
  itens: AcordoItem[];
  valorProdutos: number;
  acrescimoValor: number;
  acrescimoPercentual: number;
  entrada: number;
  valorTotal: number;
  totalPago: number;
  saldoAtual: number;
  parcelas: AcordoParcela[];
  observacao?: string | null;
};

export function PromissoriaAcordoPdf({
  loja, cliente, cpf, emissao, itens, valorProdutos, acrescimoValor,
  acrescimoPercentual, entrada, valorTotal, totalPago, saldoAtual, parcelas, observacao,
}: Props) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>{loja || "Loja"}</Text>
          <Text style={styles.title}>Acordo de pagamento</Text>
          <Text style={styles.subtitle}>Promissória detalhada e posição atual do saldo</Text>
        </View>

        <View style={styles.grid}>
          <View style={styles.card}><View style={styles.cardInner}><Text style={styles.label}>Cliente</Text><Text style={styles.value}>{cliente}</Text></View></View>
          <View style={styles.card}><View style={styles.cardInner}><Text style={styles.label}>CPF / documento</Text><Text style={styles.value}>{cpf || "Não informado"}</Text></View></View>
          <View style={styles.card}><View style={styles.cardInner}><Text style={styles.label}>Emissão</Text><Text style={styles.value}>{dataBR(emissao)}</Text></View></View>
          <View style={styles.card}><View style={styles.cardInner}><Text style={styles.label}>Saldo atual</Text><Text style={styles.value}>{brl(saldoAtual)}</Text></View></View>
        </View>

        <Text style={styles.section}>Produtos / origem da dívida</Text>
        {itens.length ? (
          <View style={styles.table}>
            <View style={[styles.row, styles.head]}>
              <Text style={[styles.cell, { width: "48%" }]}>Produto</Text>
              <Text style={[styles.cell, { width: "14%" }]}>Qtd.</Text>
              <Text style={[styles.cell, { width: "19%", textAlign: "right" }]}>Unitário</Text>
              <Text style={[styles.cell, { width: "19%", textAlign: "right" }]}>Total</Text>
            </View>
            {itens.map((it, i) => (
              <View key={`${it.nome}-${i}`} style={styles.row} wrap={false}>
                <View style={[styles.cell, { width: "48%" }]}><Text>{it.nome}</Text>{it.detalhe ? <Text style={styles.textMuted}>{it.detalhe}</Text> : null}</View>
                <Text style={[styles.cell, { width: "14%" }]}>{it.quantidade}</Text>
                <Text style={[styles.cell, { width: "19%", textAlign: "right" }]}>{brl(it.precoUnitario)}</Text>
                <Text style={[styles.cell, { width: "19%", textAlign: "right" }]}>{brl(it.precoUnitario * it.quantidade)}</Text>
              </View>
            ))}
          </View>
        ) : <View style={styles.note}><Text>Dívida sem produto vinculado (ex.: saldo anterior ao sistema).</Text></View>}

        <View style={styles.totalBox}>
          <View style={styles.totalLine}><Text>Preço/base</Text><Text>{brl(valorProdutos)}</Text></View>
          <View style={styles.totalLine}><Text>Acréscimo / juros ({acrescimoPercentual.toFixed(2)}%)</Text><Text>{brl(acrescimoValor)}</Text></View>
          <View style={styles.totalLine}><Text style={styles.totalStrong}>Total do acordo</Text><Text style={styles.totalStrong}>{brl(valorTotal)}</Text></View>
          <View style={styles.totalLine}><Text>Entrada</Text><Text>- {brl(entrada)}</Text></View>
          <View style={styles.totalLine}><Text>Total já recebido (inclui entrada)</Text><Text>{brl(totalPago)}</Text></View>
          <View style={[styles.totalLine, { marginBottom: 0 }]}><Text style={styles.totalStrong}>Saldo atual</Text><Text style={styles.totalStrong}>{brl(saldoAtual)}</Text></View>
        </View>

        <Text style={styles.section}>Plano de parcelas</Text>
        <View style={styles.table}>
          <View style={[styles.row, styles.head]}>
            <Text style={[styles.cell, { width: "20%" }]}>Parcela</Text>
            <Text style={[styles.cell, { width: "40%" }]}>Vencimento</Text>
            <Text style={[styles.cell, { width: "40%", textAlign: "right" }]}>Valor previsto</Text>
          </View>
          {parcelas.map((p) => (
            <View key={p.numero} style={styles.row} wrap={false}>
              <Text style={[styles.cell, { width: "20%" }]}>{p.numero}/{parcelas.length}</Text>
              <Text style={[styles.cell, { width: "40%" }]}>{dataBR(p.vencimento)}</Text>
              <Text style={[styles.cell, { width: "40%", textAlign: "right" }]}>{brl(p.valor)}</Text>
            </View>
          ))}
        </View>

        {observacao ? <View style={styles.note}><Text style={styles.label}>Observações</Text><Text style={{ marginTop: 5 }}>{observacao}</Text></View> : null}

        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={styles.sign}>Assinatura do cliente</Text>
          <Text style={styles.sign}>Responsável da loja</Text>
        </View>
        <Text style={styles.footer}>{loja || "Loja"} · Documento gerado pelo sistema</Text>
      </Page>
    </Document>
  );
}
