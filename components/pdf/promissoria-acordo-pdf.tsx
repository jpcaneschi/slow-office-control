import { Document, Font, Image as PdfImage, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import nexoLogo from "@/public/nexo-gestao-horizontal.png";
import { PDF_FONT_BOLD, PDF_FONT_REGULAR } from "@/lib/pdf-fonts";
import { resumirAcordo } from "@/lib/comunicacao-cliente";
import { hojeISO } from "@/lib/datas";

Font.register({ family: "DejaVuAcordo", fonts: [{ src: PDF_FONT_REGULAR, fontWeight: 400 }, { src: PDF_FONT_BOLD, fontWeight: 700 }] });
Font.registerHyphenationCallback((word) => [word]);

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
  page: { padding: 36, paddingBottom: 64, fontSize: 9.5, color: "#0f172a", fontFamily: "DejaVuAcordo" },
  header: { borderBottomWidth: 1, borderBottomColor: "#dbe3ef", paddingBottom: 10, marginBottom: 12 },
  logo: { width: 96, height: 30, objectFit: "contain", objectPosition: "left", marginBottom: 8 },
  eyebrow: { fontSize: 9, color: "#64748b", textTransform: "uppercase" },
  title: { fontSize: 22, fontWeight: 700, marginTop: 4 },
  subtitle: { fontSize: 10, color: "#64748b", marginTop: 5 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5 },
  card: { width: "50%", padding: 5 },
  cardInner: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 7, padding: 8 },
  label: { fontSize: 8, color: "#64748b", textTransform: "uppercase" },
  value: { fontSize: 11, fontWeight: 700, marginTop: 4 },
  section: { fontSize: 12, fontWeight: 700, marginTop: 12, marginBottom: 8 },
  table: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 7, overflow: "hidden" },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#eef2f7" },
  head: { backgroundColor: "#f8fafc" },
  cell: { padding: 6 },
  textMuted: { color: "#64748b" },
  totalBox: { marginTop: 10, borderWidth: 1, borderColor: "#e2e8f0", backgroundColor: "#f8fafc", borderRadius: 7, padding: 10 },
  totalLine: { flexDirection: "row", justifyContent: "space-between", marginBottom: 5 },
  totalStrong: { fontSize: 13, fontWeight: 700 },
  note: { marginTop: 16, padding: 10, backgroundColor: "#f8fafc", borderRadius: 7, lineHeight: 1.45 },
  sign: { marginTop: 24, borderTopWidth: 1, borderTopColor: "#94a3b8", width: "48%", paddingTop: 6, textAlign: "center", color: "#475569" },
  footer: { position: "absolute", height: 32, bottom: 22, left: 36, right: 36, fontSize: 8, color: "#64748b", textAlign: "center" },
  statusBox: { marginBottom: 14, padding: 12, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 7, backgroundColor: "#f8fafc" },
  status: { fontSize: 14, fontWeight: 700 },
  summary: { flexDirection: "row", marginTop: 10 },
  metric: { width: "33.33%", paddingRight: 8 },
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
  status?: string;
  codigo?: string;
  atualizadoEm?: string;
};

export function PromissoriaAcordoPdf({
  loja, cliente, cpf, emissao, itens, valorProdutos, acrescimoValor,
  subtotalProdutos = valorProdutos, descontoProdutos = 0, acrescimoPercentual,
  entrada, valorTotal, totalPago, saldoAtual, parcelas, recebimentos = [], observacao,
  status = saldoAtual <= 0 && valorTotal > 0 ? "pago" : "em_aberto", codigo, atualizadoEm = hojeISO(),
}: Props) {
  const resumo = resumirAcordo({ status, valorTotal, totalPago, entrada, parcelas: parcelas.length,
    primeiraParcela: parcelas[0]?.vencimento, hoje: atualizadoEm });
  const encerrado = resumo.situacao === "quitado" || resumo.situacao === "cancelado";
  return (
    <Document title={`${resumo.rotulo} - ${cliente}`} author={loja} subject="Posição do acordo de pagamento">
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={{ fontSize: 13, fontWeight: 700 }}>{loja || "Loja"}</Text>
          <Text style={styles.title}>{resumo.situacao === "quitado" ? "Comprovante de quitação" : resumo.situacao === "cancelado" ? "Acordo cancelado" : "Acordo de pagamento"}</Text>
          <Text style={styles.subtitle}>Atualizado em {dataBR(atualizadoEm)}{codigo ? ` · Acordo ${codigo}` : ""}</Text>
        </View>

        <View style={styles.statusBox} wrap={false}>
          <Text style={styles.status}>{resumo.rotulo}</Text>
          <View style={styles.summary}>
            <View style={styles.metric}><Text style={styles.label}>Total do acordo</Text><Text style={styles.value}>{brl(valorTotal)}</Text></View>
            <View style={styles.metric}><Text style={styles.label}>Já pago</Text><Text style={styles.value}>{brl(totalPago)}</Text></View>
            <View style={styles.metric}><Text style={styles.label}>{resumo.situacao === "cancelado" ? "Saldo para cobrança" : "Falta pagar"}</Text><Text style={styles.value}>{brl(resumo.saldo)}</Text></View>
          </View>
          <Text style={[styles.subtitle, { marginTop: 8 }]}>{resumo.situacao === "quitado" ? "Pagamento concluído. Não há valor pendente neste acordo." : resumo.situacao === "cancelado" ? "Registro cancelado. Este documento não solicita pagamento." : resumo.proxima ? `Parcela ${resumo.proxima.numero}/${parcelas.length}: falta ${brl(resumo.proxima.restante)} · vence em ${dataBR(resumo.proxima.vencimento)}${resumo.vencido > 0 ? ` · Total vencido: ${brl(resumo.vencido)}` : ""}` : "Data de pagamento a combinar com a loja."}</Text>
        </View>

        <View style={styles.grid}>
          <View style={styles.card}><View style={styles.cardInner}><Text style={styles.label}>Cliente</Text><Text style={styles.value}>{cliente}</Text></View></View>
          <View style={styles.card}><View style={styles.cardInner}><Text style={styles.label}>Data do acordo</Text><Text style={styles.value}>{dataBR(emissao)}</Text>{cpf ? <Text style={styles.subtitle}>Documento: {cpf}</Text> : null}</View></View>
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
          {descontoProdutos > 0 ? <View style={styles.totalLine}><Text>Produtos após descontos</Text><Text>{brl(valorProdutos)}</Text></View> : null}
          {acrescimoValor > 0 ? <View style={styles.totalLine}><Text>Acréscimo / juros ({acrescimoPercentual.toFixed(2)}%)</Text><Text>{brl(acrescimoValor)}</Text></View> : null}
          <View style={styles.totalLine}><Text style={styles.totalStrong}>Total do acordo</Text><Text style={styles.totalStrong}>{brl(valorTotal)}</Text></View>
          {entrada > 0 ? <View style={styles.totalLine}><Text>Entrada (incluída no recebido)</Text><Text>{brl(entrada)}</Text></View> : null}
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

        {resumo.parcelas.length > 0 ? <><Text style={styles.section}>{encerrado ? "Histórico das parcelas" : "Parcelas e saldo restante"}</Text>
        <View style={styles.table}>
          <View style={[styles.row, styles.head]}>
            <Text style={[styles.cell, { width: "10%" }]}>Nº</Text>
            <Text style={[styles.cell, { width: "20%" }]}>Vencimento</Text>
            <Text style={[styles.cell, { width: "18%", textAlign: "right" }]}>Previsto</Text>
            <Text style={[styles.cell, { width: "17%", textAlign: "right" }]}>Pago</Text>
            <Text style={[styles.cell, { width: "17%", textAlign: "right" }]}>Falta</Text>
            <Text style={[styles.cell, { width: "18%" }]}>Situação</Text>
          </View>
          {resumo.parcelas.map((p) => (
            <View key={p.numero} style={styles.row} wrap={false}>
              <Text style={[styles.cell, { width: "10%" }]}>{p.numero}</Text>
              <Text style={[styles.cell, { width: "20%" }]}>{dataBR(p.vencimento)}</Text>
              <Text style={[styles.cell, { width: "18%", textAlign: "right" }]}>{brl(p.valor)}</Text>
              <Text style={[styles.cell, { width: "17%", textAlign: "right" }]}>{brl(p.pago)}</Text>
              <Text style={[styles.cell, { width: "17%", textAlign: "right" }]}>{brl(p.restante)}</Text>
              <Text style={[styles.cell, { width: "18%" }]}>{p.situacao}</Text>
            </View>
          ))}
        </View><Text style={[styles.subtitle, { marginTop: 6 }]}>Pagamentos distribuídos na ordem das parcelas do acordo. A entrada é contabilizada separadamente.</Text></> : null}

        {observacao ? <View style={styles.note}><Text style={styles.label}>Observações</Text><Text style={{ marginTop: 5 }}>{observacao}</Text></View> : null}

        {!encerrado ? <View style={{ flexDirection: "row", justifyContent: "space-between" }} wrap={false}>
          <Text style={styles.sign}>Assinatura do cliente</Text>
          <Text style={styles.sign}>Responsável da loja</Text>
        </View> : null}
        <View style={styles.footer} fixed>
          {NEXO_LOGO_SRC ? <PdfImage src={NEXO_LOGO_SRC} style={{ width: 58, height: 18, alignSelf: "center", marginBottom: 3 }} /> : null}
          <Text render={({ pageNumber, totalPages }) => `${loja || "Loja"} · Atualizado em ${dataBR(atualizadoEm)} · Página ${pageNumber}/${totalPages}`}>Documento gerado pelo sistema</Text>
        </View>
      </Page>
    </Document>
  );
}
