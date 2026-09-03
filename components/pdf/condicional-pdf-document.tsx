import {
  Document,
  Image as PdfImage,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import nexoLogo from "@/public/nexo-gestao-horizontal.png";
import { formatDataBR } from "@/lib/datas";

const nexoLogoAsset = nexoLogo as unknown;
const NEXO_LOGO_SRC =
  typeof nexoLogoAsset === "string"
    ? nexoLogoAsset.startsWith("/public/") && typeof process !== "undefined"
      ? `${process.cwd()}${nexoLogoAsset}`
      : nexoLogoAsset
    : nexoLogoAsset && typeof nexoLogoAsset === "object" && "src" in nexoLogoAsset
      ? String(nexoLogoAsset.src)
      : "";

type PdfItem = {
  nome: string;
  quantidade: number;
};

type CondicionalPdfDocumentProps = {
  nomeLoja: string;
  clienteNome: string;
  responsavel: string;
  dataSaida: string;
  dataLimite: string;
  observacao?: string | null;
  itens: PdfItem[];
  codigo?: string;
};

function formatDate(value: string) {
  return formatDataBR(value);
}

function safeText(value: string | null | undefined) {
  return value?.trim() || "Não informado";
}

// Preto & branco, para impressão em folha branca.
const styles = StyleSheet.create({
  page: {
    backgroundColor: "#ffffff",
    color: "#111111",
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 44,
    fontFamily: "Helvetica",
    fontSize: 10,
  },
  shell: {
    borderWidth: 1,
    borderColor: "#000000",
    padding: 22,
    backgroundColor: "#ffffff",
  },
  topBar: {
    height: 4,
    width: 92,
    backgroundColor: "#000000",
    marginBottom: 18,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 18,
  },
  brandBlock: { flex: 1 },
  logo: { width: 92, height: 28, objectFit: "contain", objectPosition: "left", marginBottom: 8 },
  eyebrow: {
    fontSize: 8.5,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    color: "#555555",
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: "#000000",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 9.5,
    lineHeight: 1.5,
    color: "#444444",
    maxWidth: 330,
  },
  codeCard: {
    minWidth: 110,
    borderWidth: 1,
    borderColor: "#000000",
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#ffffff",
    alignSelf: "flex-start",
  },
  codeLabel: {
    fontSize: 8,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#666666",
    marginBottom: 4,
  },
  codeValue: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#000000" },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -5,
    marginBottom: 16,
  },
  infoCard: { width: "50%", paddingHorizontal: 5, marginBottom: 10 },
  infoInner: {
    borderWidth: 1,
    borderColor: "#111111",
    padding: 12,
    backgroundColor: "#ffffff",
    minHeight: 74,
  },
  infoLabel: {
    fontSize: 8,
    textTransform: "uppercase",
    letterSpacing: 0.9,
    color: "#666666",
    marginBottom: 6,
  },
  infoValue: {
    fontSize: 12,
    color: "#000000",
    fontFamily: "Helvetica-Bold",
    marginBottom: 3,
  },
  infoHint: { fontSize: 9, color: "#555555", lineHeight: 1.4 },
  sectionTitle: {
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 1,
    fontFamily: "Helvetica-Bold",
    color: "#000000",
    marginBottom: 10,
  },
  itemBox: {
    borderWidth: 1,
    borderColor: "#000000",
    marginBottom: 14,
  },
  itemHead: {
    flexDirection: "row",
    backgroundColor: "#000000",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  itemRow: {
    flexDirection: "row",
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: "#dddddd",
  },
  colProduto: { width: "76%", paddingRight: 8 },
  colQtd: { width: "24%", textAlign: "right" },
  th: {
    fontSize: 8.5,
    color: "#ffffff",
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  td: { fontSize: 10, color: "#111111", lineHeight: 1.45 },
  notesBox: {
    borderWidth: 1,
    borderColor: "#cccccc",
    padding: 14,
    marginBottom: 14,
  },
  notesTitle: {
    fontSize: 9.5,
    color: "#000000",
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  notesText: { fontSize: 9.5, color: "#111111", lineHeight: 1.6 },
  accentNote: { marginTop: 10, fontSize: 8.5, color: "#555555" },
  rulesBox: {
    borderWidth: 1,
    borderColor: "#cccccc",
    padding: 14,
    marginBottom: 16,
  },
  rulesText: {
    fontSize: 9.3,
    color: "#333333",
    lineHeight: 1.55,
    marginBottom: 4,
  },
  footer: { flexDirection: "row", gap: 14, marginTop: 20 },
  signature: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: "#000000",
    paddingTop: 10,
  },
  signatureText: { fontSize: 9, color: "#444444", textAlign: "center" },
});

export function CondicionalPdfDocument({
  nomeLoja,
  clienteNome,
  responsavel,
  dataSaida,
  dataLimite,
  observacao,
  itens,
  codigo,
}: CondicionalPdfDocumentProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.shell}>
          <View style={styles.topBar} />

          <View style={styles.header}>
            <View style={styles.brandBlock}>
              {NEXO_LOGO_SRC ? <PdfImage src={NEXO_LOGO_SRC} style={styles.logo} /> : null}
              <Text style={styles.eyebrow}>{nomeLoja}</Text>
              <Text style={styles.title}>Termo de Condicional</Text>
              <Text style={styles.subtitle}>
                Documento de conferência e controle interno para peças entregues
                em condicional. Este termo organiza os itens, prazo e
                responsável pela liberação.
              </Text>
            </View>

            <View style={styles.codeCard}>
              <Text style={styles.codeLabel}>Código</Text>
              <Text style={styles.codeValue}>{codigo || "S/O-COND-0001"}</Text>
            </View>
          </View>

          <View style={styles.infoGrid}>
            <View style={styles.infoCard}>
              <View style={styles.infoInner}>
                <Text style={styles.infoLabel}>Cliente</Text>
                <Text style={styles.infoValue}>{safeText(clienteNome)}</Text>
                <Text style={styles.infoHint}>Nome do cliente responsável pelo condicional.</Text>
              </View>
            </View>

            <View style={styles.infoCard}>
              <View style={styles.infoInner}>
                <Text style={styles.infoLabel}>Responsável</Text>
                <Text style={styles.infoValue}>{safeText(responsavel)}</Text>
                <Text style={styles.infoHint}>Pessoa interna que liberou as peças.</Text>
              </View>
            </View>

            <View style={styles.infoCard}>
              <View style={styles.infoInner}>
                <Text style={styles.infoLabel}>Saída</Text>
                <Text style={styles.infoValue}>{formatDate(dataSaida)}</Text>
                <Text style={styles.infoHint}>Data da liberação das peças.</Text>
              </View>
            </View>

            <View style={styles.infoCard}>
              <View style={styles.infoInner}>
                <Text style={styles.infoLabel}>Prazo limite</Text>
                <Text style={styles.infoValue}>{formatDate(dataLimite)}</Text>
                <Text style={styles.infoHint}>Retorno previsto para conferência.</Text>
              </View>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Itens liberados</Text>

          <View style={styles.itemBox}>
            <View style={styles.itemHead}>
              <Text style={[styles.th, styles.colProduto]}>Produto</Text>
              <Text style={[styles.th, styles.colQtd]}>Qtd</Text>
            </View>

            {itens.map((item, index) => (
              <View
                key={`${item.nome}-${index}`}
                style={[
                  styles.itemRow,
                  index === 0 ? { borderTopWidth: 0 } : {},
                ]}
              >
                <Text style={[styles.td, styles.colProduto]}>{item.nome}</Text>
                <Text style={[styles.td, styles.colQtd]}>{item.quantidade}</Text>
              </View>
            ))}
          </View>

          <View style={styles.notesBox}>
            <Text style={styles.notesTitle}>Observações</Text>
            <Text style={styles.notesText}>
              {observacao?.trim()
                ? observacao
                : "Sem observações adicionais no momento da emissão."}
            </Text>
            <Text style={styles.accentNote}>
              Recomendação operacional: revisar o retorno das peças no prazo e registrar a conferência no sistema.
            </Text>
          </View>

          <View style={styles.rulesBox}>
            <Text style={styles.rulesText}>• Este termo não representa venda concluída.</Text>
            <Text style={styles.rulesText}>• As peças foram separadas para avaliação e possível compra.</Text>
            <Text style={styles.rulesText}>• O retorno deve ser conferido pela equipe da loja.</Text>
            <Text style={styles.rulesText}>• Se houver conversão em venda, o registro financeiro deve ser feito separadamente.</Text>
          </View>

          <View style={styles.footer}>
            <View style={styles.signature}>
              <Text style={styles.signatureText}>Assinatura / confirmação do cliente</Text>
            </View>
            <View style={styles.signature}>
              <Text style={styles.signatureText}>Responsável — {nomeLoja}</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}
