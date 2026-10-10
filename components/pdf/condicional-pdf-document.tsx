import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import { formatDataBR, hojeISO } from "@/lib/datas";
import { PDF_FONT_BOLD, PDF_FONT_REGULAR } from "@/lib/pdf-fonts";
import { paginarLinhas } from "@/lib/pdf-paginacao";
import { resumirCondicional, type PecaCondicional } from "@/lib/condicional-comunicacao";

Font.register({ family: "DejaVuCondicional", fonts: [{ src: PDF_FONT_REGULAR, fontWeight: 400 }, { src: PDF_FONT_BOLD, fontWeight: 700 }] });
Font.registerHyphenationCallback(word => [word]);

type Props = {
  nomeLoja: string; clienteNome: string; responsavel: string; dataSaida: string; dataLimite: string;
  observacao?: string | null; itens: PecaCondicional[]; codigo?: string; status?: string; atualizadoEm?: string;
  maxParcelas?: number;
};
const brl = (valor: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
const styles = StyleSheet.create({
  page: { padding: 38, paddingBottom: 64, fontFamily: "DejaVuCondicional", fontSize: 9.5, color: "#172033", backgroundColor: "#ffffff" },
  header: { paddingBottom: 14, marginBottom: 16, borderBottomWidth: 1, borderBottomColor: "#dce3eb" },
  store: { fontSize: 15, fontWeight: 700, marginBottom: 8 },
  kicker: { fontSize: 8, color: "#64748b", textTransform: "uppercase", marginBottom: 5 },
  title: { fontSize: 23, fontWeight: 700, marginBottom: 6 },
  muted: { fontSize: 9, color: "#64748b" },
  client: { fontSize: 12, fontWeight: 700, marginTop: 5 },
  grid: { flexDirection: "row", marginVertical: 14 },
  card: { width: "33.33%", paddingRight: 12 },
  label: { fontSize: 8, color: "#64748b", marginBottom: 5 },
  value: { fontSize: 11, fontWeight: 700 },
  status: { padding: 12, borderRadius: 6, backgroundColor: "#f3f6fa", marginBottom: 16 },
  statusTitle: { fontSize: 11, fontWeight: 700, marginBottom: 5 },
  paragraph: { fontSize: 9.5, lineHeight: 1.5 },
  section: { fontSize: 11, fontWeight: 700, marginBottom: 8 },
  row: { flexDirection: "row", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#e8edf3" },
  head: { flexDirection: "row", paddingVertical: 8, backgroundColor: "#f3f6fa", fontSize: 8, fontWeight: 700 },
  product: { paddingHorizontal: 7, lineHeight: 1.4 },
  number: { textAlign: "right", paddingRight: 7 },
  note: { marginTop: 16, padding: 12, borderRadius: 6, borderWidth: 1, borderColor: "#e2e8f0" },
  signature: { flexDirection: "row", gap: 28, marginTop: 36 },
  sign: { width: "50%", borderTopWidth: 1, borderTopColor: "#cbd5e1", paddingTop: 7, fontSize: 8, textAlign: "center", color: "#64748b" },
  footer: { position: "absolute", height: 26, bottom: 22, left: 38, right: 38, fontSize: 7.5, color: "#64748b", textAlign: "center" },
});

export function CondicionalPdfDocument({ nomeLoja, clienteNome, responsavel, dataSaida, dataLimite, observacao, itens, codigo, status = "aberto", atualizadoEm = hojeISO(), maxParcelas = 6 }: Props) {
  const resumo = resumirCondicional({ status, prazo: dataLimite, itens, hoje: atualizadoEm });
  const titulo = resumo.aberto ? "Sua seleção de peças" : resumo.etapa === "devolvido" ? "Devolução confirmada"
    : resumo.etapa === "compra" ? "Sua escolha, registrada" : resumo.etapa === "cancelado" ? "Condicional cancelado" : "Conferência do condicional";
  const altura = (item: PecaCondicional) => 20 + Math.ceil((item.nome.length + 4) / 36) * 14;
  const primeira = paginarLinhas(itens, altura, 280)[0] || [];
  const paginas = [primeira, ...paginarLinhas(itens.slice(primeira.length), altura, 440)];
  return <Document title={`${titulo} - ${clienteNome}`} author={nomeLoja} subject="Seleção e conferência das peças em condicional">
    {paginas.map((pecas, indice) => <Page key={indice} size="A4" style={styles.page}>
      <View style={styles.header} wrap={false}>
        <Text style={styles.store}>{nomeLoja || "Loja"}</Text>
        <Text style={styles.kicker}>Atendimento em condicional · {codigo || "Código não informado"}</Text>
        <Text style={styles.title}>{indice === 0 ? titulo : "Sua seleção · continuação"}</Text>
        <Text style={styles.muted}>Preparado para</Text><Text style={styles.client}>{clienteNome || "Cliente"}</Text>
      </View>
      {indice === 0 && <>
        <View style={styles.grid} wrap={false}>
          <View style={styles.card}><Text style={styles.label}>Peças enviadas</Text><Text style={styles.value}>{resumo.enviado}</Text></View>
          <View style={styles.card}><Text style={styles.label}>Data da saída</Text><Text style={styles.value}>{formatDataBR(dataSaida)}</Text></View>
          <View style={styles.card}><Text style={styles.label}>{resumo.aberto ? "Retorno combinado" : "Prazo original"}</Text><Text style={styles.value}>{formatDataBR(dataLimite)}</Text></View>
        </View>
        <View style={styles.status} wrap={false}><Text style={styles.statusTitle}>{resumo.rotulo}</Text><Text style={styles.paragraph}>{resumo.orientacao}</Text></View>
      </>}
      <Text style={styles.section}>{resumo.aberto ? "Peças para experimentar" : "Resultado por peça"}</Text>
      <View style={styles.head} wrap={false}>
        <Text style={{ ...styles.product, width: resumo.aberto ? "42%" : "50%" }}>Produto · tamanho · cor</Text>
        <Text style={{ ...styles.number, width: "10%" }}>Qtd.</Text>
        {resumo.aberto ? <><Text style={{ ...styles.number, width: "16%" }}>Original</Text><Text style={{ ...styles.number, width: "16%" }}>Combinado</Text><Text style={{ ...styles.number, width: "16%" }}>Desconto</Text></>
          : <><Text style={{ ...styles.number, width: "13%" }}>Compradas</Text><Text style={{ ...styles.number, width: "13%" }}>Devolvidas</Text><Text style={{ ...styles.number, width: "14%" }}>A conferir</Text></>}
      </View>
      {pecas.map((item, i) => {
        const conhecido = item.vendido != null && item.devolvido != null && item.vendido >= 0 && item.devolvido >= 0 && item.vendido + item.devolvido <= item.quantidade;
        return <View key={i} style={styles.row} wrap={false}>
          <Text style={{ ...styles.product, width: resumo.aberto ? "42%" : "50%" }}>{item.nome}</Text><Text style={{ ...styles.number, width: "10%" }}>{item.quantidade}</Text>
          {resumo.aberto ? <><Text style={{ ...styles.number, width: "16%" }}>{item.precoOriginal != null ? brl(item.precoOriginal) : "—"}</Text><Text style={{ ...styles.number, width: "16%" }}>{item.precoUnitario != null ? brl(item.precoUnitario) : "—"}</Text><Text style={{ ...styles.number, width: "16%" }}>{item.precoOriginal != null && item.precoUnitario != null && item.precoOriginal > item.precoUnitario ? brl(item.precoOriginal - item.precoUnitario) : "—"}</Text></>
            : <><Text style={{ ...styles.number, width: "13%" }}>{conhecido ? item.vendido : "—"}</Text><Text style={{ ...styles.number, width: "13%" }}>{conhecido ? item.devolvido : "—"}</Text><Text style={{ ...styles.number, width: "14%" }}>{conhecido ? item.quantidade - (item.vendido || 0) - (item.devolvido || 0) : "—"}</Text></>}
        </View>;
      })}
      {itens.length === 0 && <Text style={{ ...styles.paragraph, marginTop: 10 }}>As peças deste registro ainda precisam ser conferidas com a loja.</Text>}
      {indice === paginas.length - 1 && <>
        {resumo.aberto ? <><View style={styles.grid} wrap={false}><View style={styles.card}><Text style={styles.label}>Total original</Text><Text style={styles.value}>{resumo.original != null ? brl(resumo.original) : "A conferir"}</Text></View><View style={styles.card}><Text style={styles.label}>Total combinado</Text><Text style={styles.value}>{resumo.referencia != null ? brl(resumo.referencia) : "A conferir"}</Text></View><View style={styles.card}><Text style={styles.label}>Economia</Text><Text style={styles.value}>{resumo.economia != null ? brl(resumo.economia) : "A conferir"}</Text></View></View><View style={styles.note} wrap={false}><Text style={styles.section}>Condições de pagamento</Text><Text style={styles.paragraph}>Compra em até {maxParcelas}x sem juros no cartão. Para pagamento à vista no Pix ou em dinheiro, a loja oferece condição especial; confirme o valor final no fechamento.</Text><Text style={{ ...styles.muted, marginTop: 6 }}>Os valores acima são informativos. A venda e o pagamento só serão registrados após a confirmação das peças escolhidas.</Text></View></>
          : resumo.detalhado && resumo.etapa !== "cancelado" && <View style={styles.grid} wrap={false}><View style={styles.card}><Text style={styles.label}>Peças compradas</Text><Text style={styles.value}>{resumo.comprado}</Text></View><View style={styles.card}><Text style={styles.label}>Peças devolvidas</Text><Text style={styles.value}>{resumo.devolvido}</Text></View><View style={styles.card}><Text style={styles.label}>A conferir</Text><Text style={styles.value}>{resumo.restante}</Text></View></View>}
        {observacao?.trim() && <View style={styles.note}><Text style={styles.section}>Observações da loja</Text><Text style={styles.paragraph}>{observacao}</Text></View>}
        <View style={styles.note} wrap={false}><Text style={styles.section}>{resumo.aberto ? "Como concluir sua escolha" : "Seu atendimento"}</Text><Text style={styles.paragraph}>{resumo.aberto ? "Avise a loja quais peças deseja comprar e combine o retorno das demais. Se precisar ajustar o prazo, entre em contato antes da devolução." : resumo.etapa === "compra" ? "Obrigado pela sua escolha! Guarde este resumo. Os valores efetivos, descontos e pagamentos estão no comprovante da venda." : resumo.etapa === "devolvido" ? "Obrigado por experimentar nossa seleção. Quando quiser conhecer outras peças, conte com a gente!" : resumo.orientacao}</Text></View>
        {responsavel.trim() && responsavel !== "Não informado" && <Text style={{ ...styles.muted, marginTop: 12 }}>Atendimento: {responsavel}</Text>}
        {resumo.aberto && <View style={styles.signature} wrap={false}><Text style={styles.sign}>Confirmação de recebimento · cliente</Text><Text style={styles.sign}>Responsável pela loja</Text></View>}
      </>}
      <Text style={styles.footer} fixed render={({ pageNumber, totalPages }) => `${nomeLoja || "Loja"} · ${codigo || "Condicional"} · Atualizado em ${formatDataBR(atualizadoEm)}\nNexo Gestão · Página ${pageNumber}/${totalPages}`}>Documento atualizado da loja</Text>
    </Page>)}
  </Document>;
}
