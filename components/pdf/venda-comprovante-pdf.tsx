import { Document, Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { PDF_FONT_BOLD, PDF_FONT_REGULAR } from "@/lib/pdf-fonts";
import { formatDataBR, hojeISO } from "@/lib/datas";
import { formatCurrency } from "@/lib/promissorias-utils";

Font.register({ family: "DejaVuVenda", fonts: [{ src: PDF_FONT_REGULAR, fontWeight: 400 }, { src: PDF_FONT_BOLD, fontWeight: 700 }] });
const styles = StyleSheet.create({
  page: { padding: 36, paddingBottom: 62, fontFamily: "DejaVuVenda", fontSize: 10, color: "#0f172a" },
  title: { fontSize: 23, fontWeight: 700, marginTop: 6 },
  muted: { fontSize: 9, color: "#64748b" },
  summary: { marginVertical: 18, padding: 14, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 6, backgroundColor: "#f8fafc" },
  line: { flexDirection: "row", justifyContent: "space-between", marginTop: 5 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e2e8f0", paddingVertical: 8 },
  footer: { position: "absolute", height: 16, bottom: 22, left: 36, right: 36, textAlign: "center", fontSize: 8, color: "#64748b" },
});

export type ComprovanteVenda = {
  loja: string; cliente: string; codigo: string; data: string; status: string;
  total: number; desconto: number; forma: string; parcelas: number;
  recebido: number | null; saldo: number | null;
  acordoCancelado?: boolean;
  itens: { nome: string; detalhe?: string; quantidade: number; unitario: number; total: number }[];
};

export function VendaComprovantePdf({ loja, cliente, codigo, data, status, total, desconto, forma, parcelas, recebido, saldo, acordoCancelado, itens }: ComprovanteVenda) {
  const cancelada = status === "cancelada" || status === "cancelado";
  const situacao = cancelada ? "Venda cancelada" : acordoCancelado ? "Acordo cancelado" : saldo === null ? "Pagamento a conferir" : saldo > 0 ? "Pagamento em aberto" : "Compra paga";
  return <Document title={`Comprovante de compra - ${codigo}`} author={loja}>
    <Page size="A4" style={styles.page}>
      <View wrap={false}><Text style={{ fontSize: 13, fontWeight: 700 }}>{loja}</Text><Text style={styles.title}>Comprovante de compra</Text><Text style={styles.muted}>Venda {codigo} · {formatDataBR(data)}</Text></View>
      <View style={styles.summary} wrap={false}>
        <Text style={{ fontSize: 14, fontWeight: 700 }}>{situacao}</Text>
        <Text style={{ marginTop: 5 }}>Cliente: {cliente}</Text>
        <View style={styles.line}><Text>{cancelada ? "Valor original da compra" : "Total da compra"}</Text><Text style={{ fontWeight: 700 }}>{formatCurrency(total)}</Text></View>
        <View style={styles.line}><Text>Forma de pagamento</Text><Text>{forma}{parcelas > 1 ? ` · ${parcelas}x` : ""}</Text></View>
        {!cancelada && recebido !== null && <View style={styles.line}><Text>Já pago</Text><Text>{formatCurrency(recebido)}</Text></View>}
        {!cancelada && saldo !== null && <View style={styles.line}><Text>Falta pagar à loja</Text><Text style={{ fontWeight: 700 }}>{formatCurrency(saldo)}</Text></View>}
        {cancelada && <Text style={[styles.muted, { marginTop: 8 }]}>Este comprovante registra o cancelamento. Eventual estorno deve ser conferido com a loja.</Text>}
      </View>
      <Text style={{ fontWeight: 700, fontSize: 12 }}>Produtos da compra</Text>
      <View style={[styles.row, { backgroundColor: "#f8fafc" }]}><Text style={{ width: "52%", paddingLeft: 5 }}>Produto / tamanho / cor</Text><Text style={{ width: "10%" }}>Qtd.</Text><Text style={{ width: "18%", textAlign: "right" }}>Unitário</Text><Text style={{ width: "20%", textAlign: "right", paddingRight: 5 }}>Total</Text></View>
      {itens.map((item, index) => <View key={index} style={styles.row} wrap={false}><View style={{ width: "52%", paddingRight: 8, paddingLeft: 5 }}><Text>{item.nome}</Text>{item.detalhe && <Text style={styles.muted}>{item.detalhe}</Text>}</View><Text style={{ width: "10%" }}>{item.quantidade}</Text><Text style={{ width: "18%", textAlign: "right" }}>{formatCurrency(item.unitario)}</Text><Text style={{ width: "20%", textAlign: "right", paddingRight: 5 }}>{formatCurrency(item.total)}</Text></View>)}
      <View wrap={false} style={{ marginTop: 14 }}>{desconto > 0 && <View style={styles.line}><Text>Descontos aplicados</Text><Text>{formatCurrency(desconto)}</Text></View>}<View style={styles.line}><Text style={{ fontWeight: 700 }}>Total da compra</Text><Text style={{ fontWeight: 700 }}>{formatCurrency(total)}</Text></View><Text style={[styles.muted, { marginTop: 12 }]}>Documento de conferência da compra. Não substitui o documento fiscal. {saldo && saldo > 0 ? "Consulte o acordo de pagamento para as parcelas e vencimentos." : "Guarde este comprovante para consultar sua compra."}</Text></View>
      <Text style={styles.footer} fixed render={({ pageNumber, totalPages }) => `${loja} · Atualizado em ${formatDataBR(hojeISO())} · Página ${pageNumber}/${totalPages}`}>Documento gerado pelo sistema</Text>
    </Page>
  </Document>;
}
