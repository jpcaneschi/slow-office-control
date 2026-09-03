import { Document, Image as PdfImage, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import nexoLogo from "@/public/nexo-gestao-horizontal.png";

const nexoLogoAsset = nexoLogo as unknown;
const NEXO_LOGO_SRC =
  typeof nexoLogoAsset === "string"
    ? nexoLogoAsset.startsWith("/public/") && typeof process !== "undefined"
      ? `${process.cwd()}${nexoLogoAsset}`
      : nexoLogoAsset
    : nexoLogoAsset && typeof nexoLogoAsset === "object" && "src" in nexoLogoAsset
      ? String(nexoLogoAsset.src)
      : "";

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, color: "#0f172a", fontFamily: "Helvetica" },
  header: { borderBottomWidth: 1, borderBottomColor: "#dbe3ef", paddingBottom: 14, marginBottom: 18 },
  logo: { width: 96, height: 30, objectFit: "contain", objectPosition: "left", marginBottom: 8 },
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

export type AcordoItem = {
  nome: string;
  detalhe?: string;
  quantidade: number;
  precoUnitario: number;
  precoOriginal?: number;
  descontoValor?: number;
  descontoPercentual?: number;
};
export type AcordoParcela = { numero: number; vencimento: string; valor: number };
export type AcordoRecebimento = {
  data: string;
  tipo: "entrada" | "parcela";
  forma?: string | null;
  valor: number;
};

type Props = {
  loja: string;
  cliente: string;
  cpf?: string | null;
  emissao: string;
  itens: AcordoItem[];
  subtotalProdutos?: number;
  descontoProdutos?: number;
  valorProdutos: number;
  acrescimoValor: number;
  acrescimoPercentual: number;
  entrada: number;
  valorTotal: number;
  totalPago: number;
  saldoAtual: number;
  parcelas: AcordoParcela[];
  recebimentos?: AcordoRecebimento[];
  observacao?: string | null;
};

export function PromissoriaAcordoPdf({
  loja, cliente, cpf, emissao, itens, valorProdutos, acrescimoValor,
  subtotalProdutos = valorProdutos, descontoProdutos = 0, acrescimoPercentual,
  entrada, valorTotal, totalPago, saldoAtual, parcelas, recebimentos = [], observacao,
}: Props) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {NEXO_LOGO_SRC ? <PdfImage src={NEXO_LOGO_SRC} style={styles.logo} /> : null}
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
              <Text style={[styles.cell, { width: "36%" }]}>Produto</Text>
              <Text style={[styles.cell, { width: "10%" }]}>Qtd.</Text>
              <Text style={[styles.cell, { width: "18%", textAlign: "right" }]}>Valor</Text>
              <Text style={[styles.cell, { width: "18%", textAlign: "right" }]}>Desc./un.</Text>
              <Text style={[styles.cell, { width: "18%", textAlign: "right" }]}>Total</Text>
            </View>
            {itens.map((it, i) => {
              const precoOriginal = Number(it.precoOriginal ?? it.precoUnitario);
              const descontoUnitario = Number(it.descontoValor || 0);
              return (
                <View key={`${it.nome}-${i}`} style={styles.row} wrap={false}>
                  <View style={[styles.cell, { width: "36%" }]}><Text>{it.nome}</Text>{it.detalhe ? <Text style={styles.textMuted}>{it.detalhe}</Text> : null}</View>
                  <Text style={[styles.cell, { width: "10%" }]}>{it.quantidade}</Text>
                  <Text style={[styles.cell, { width: "18%", textAlign: "right" }]}>{brl(precoOriginal)}</Text>
                  <Text style={[styles.cell, { width: "18%", textAlign: "right" }]}>
                    {descontoUnitario > 0
                      ? `${brl(descontoUnitario)}${Number(it.descontoPercentual || 0) > 0 ? ` (${Number(it.descontoPercentual).toFixed(2)}%)` : ""}`
                      : "—"}
                  </Text>
                  <Text style={[styles.cell, { width: "18%", textAlign: "right" }]}>{brl(it.precoUnitario * it.quantidade)}</Text>
                </View>
              );
            })}
          </View>
        ) : <View style={styles.note}><Text>Dívida sem produto vinculado (ex.: saldo anterior ao sistema).</Text></View>}

        <View style={styles.totalBox}>
          <View style={styles.totalLine}><Text>Subtotal dos produtos</Text><Text>{brl(subtotalProdutos)}</Text></View>
          {descontoProdutos > 0 ? <View style={styles.totalLine}><Text>Descontos nos produtos</Text><Text>- {brl(descontoProdutos)}</Text></View> : null}
          <View style={styles.totalLine}><Text>Produtos após descontos</Text><Text>{brl(valorProdutos)}</Text></View>
          <View style={styles.totalLine}><Text>Acréscimo / juros ({acrescimoPercentual.toFixed(2)}%)</Text><Text>{brl(acrescimoValor)}</Text></View>
          <View style={styles.totalLine}><Text style={styles.totalStrong}>Total do acordo</Text><Text style={styles.totalStrong}>{brl(valorTotal)}</Text></View>
          <View style={styles.totalLine}><Text>Entrada</Text><Text>- {brl(entrada)}</Text></View>
          <View style={styles.totalLine}><Text>Total já recebido (inclui entrada)</Text><Text>{brl(totalPago)}</Text></View>
          <View style={[styles.totalLine, { marginBottom: 0 }]}><Text style={styles.totalStrong}>Saldo atual</Text><Text style={styles.totalStrong}>{brl(saldoAtual)}</Text></View>
        </View>

        {recebimentos.length > 0 ? (
          <>
            <Text style={styles.section}>Histórico de recebimentos</Text>
            <View style={styles.table}>
              <View style={[styles.row, styles.head]}>
                <Text style={[styles.cell, { width: "24%" }]}>Data</Text>
                <Text style={[styles.cell, { width: "26%" }]}>Tipo</Text>
                <Text style={[styles.cell, { width: "26%" }]}>Forma</Text>
                <Text style={[styles.cell, { width: "24%", textAlign: "right" }]}>Valor</Text>
              </View>
              {recebimentos.map((recebimento, index) => (
                <View key={`${recebimento.data}-${index}`} style={styles.row} wrap={false}>
                  <Text style={[styles.cell, { width: "24%" }]}>{dataBR(recebimento.data)}</Text>
                  <Text style={[styles.cell, { width: "26%" }]}>{recebimento.tipo === "entrada" ? "Entrada" : "Parcela recebida"}</Text>
                  <Text style={[styles.cell, { width: "26%" }]}>{recebimento.forma || "Não informada"}</Text>
                  <Text style={[styles.cell, { width: "24%", textAlign: "right" }]}>{brl(recebimento.valor)}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

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
