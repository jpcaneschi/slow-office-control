import {
  Document,
  Image as PdfImage,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import nexoLogo from "@/public/nexo-gestao-horizontal.png";
import { formatDataBR, hojeISO } from "@/lib/datas";
import { PDF_FONT_BOLD, PDF_FONT_REGULAR } from "@/lib/pdf-fonts";

Font.register({ family: "DejaVuCondicional", fonts: [{ src: PDF_FONT_REGULAR, fontWeight: 400 }, { src: PDF_FONT_BOLD, fontWeight: 700 }] });
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

type PdfItem = {
  nome: string;
  quantidade: number;
  precoUnitario?: number;
  vendido?: number;
  devolvido?: number;
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
  status?: string;
  atualizadoEm?: string;
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
    fontFamily: "DejaVuCondicional",
    fontSize: 10,
  },
  shell: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 16,
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
    color: "#555555",
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontFamily: "DejaVuCondicional", fontWeight: 700,
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
    color: "#666666",
    marginBottom: 4,
  },
  codeValue: { fontSize: 12, fontFamily: "DejaVuCondicional", fontWeight: 700, color: "#000000" },
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
    color: "#666666",
    marginBottom: 6,
  },
  infoValue: {
    fontSize: 12,
    color: "#000000",
    fontFamily: "DejaVuCondicional", fontWeight: 700,
    marginBottom: 3,
  },
  infoHint: { fontSize: 9, color: "#555555", lineHeight: 1.4 },
  sectionTitle: {
    fontSize: 10,
    textTransform: "uppercase",
    fontFamily: "DejaVuCondicional", fontWeight: 700,
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
    fontFamily: "DejaVuCondicional", fontWeight: 700,
    textTransform: "uppercase",
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
    fontFamily: "DejaVuCondicional", fontWeight: 700,
    textTransform: "uppercase",
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
  pageFooter: { position: "absolute", height: 32, bottom: 22, left: 44, right: 44, fontSize: 8, color: "#64748b", textAlign: "center" },
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
  status = "aberto",
  atualizadoEm = hojeISO(),
}: CondicionalPdfDocumentProps) {
  const aberto = status === "aberto";
  const situacao = status === "recolhido" ? "Peças devolvidas" : status === "cancelado" ? "Cancelado" : !aberto ? "Finalizado" : dataLimite && dataLimite < atualizadoEm ? "Prazo de retorno vencido" : "Em condicional";
  const brl = (valor: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
  return (
    <Document title={`${situacao} - ${clienteNome}`} author={nomeLoja}>
      <Page size="A4" style={styles.page}>
        <View style={styles.shell}>
          <View style={styles.topBar} />

          <View style={styles.header}>
            <View style={styles.brandBlock}>
              <Text style={[styles.eyebrow, { fontSize: 13, fontWeight: 700 }]}>{nomeLoja}</Text>
              <Text style={styles.title}>{aberto ? "Peças em condicional" : "Resumo do condicional"}</Text>
              <Text style={styles.subtitle}>
                {situacao} · Atualizado em {formatDate(atualizadoEm)}
              </Text>
            </View>

            <View style={styles.codeCard}>
              <Text style={styles.codeLabel}>Código</Text>
              <Text style={styles.codeValue}>{codigo || "Não informado"}</Text>
            </View>
          </View>

          <View style={styles.infoGrid}>
            <View style={styles.infoCard}>
              <View style={styles.infoInner}>
                <Text style={styles.infoLabel}>Cliente</Text>
                <Text style={styles.infoValue}>{safeText(clienteNome)}</Text>
              </View>
            </View>

            <View style={styles.infoCard}>
              <View style={styles.infoInner}>
                <Text style={styles.infoLabel}>Responsável</Text>
                <Text style={styles.infoValue}>{safeText(responsavel)}</Text>
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
                <Text style={styles.infoLabel}>{aberto ? "Prazo de retorno" : "Prazo combinado na saída"}</Text>
                <Text style={styles.infoValue}>{formatDate(dataLimite)}</Text>
                <Text style={styles.infoHint}>Retorno previsto para conferência.</Text>
              </View>
            </View>
          </View>

          <Text style={styles.sectionTitle}>{aberto ? "Peças para sua conferência" : "Peças e resultado da conferência"}</Text>

          <View style={styles.itemBox}>
            <View style={styles.itemHead}>
              <Text style={[styles.th, { width: "56%" }]}>Produto / tamanho / cor</Text>
              <Text style={[styles.th, { width: "14%", textAlign: "right" }]}>Qtd.</Text>
              <Text style={[styles.th, { width: "30%", textAlign: "right" }]}>{aberto ? "Valor unitário" : "Compradas / devolvidas"}</Text>
            </View>

            {itens.map((item, index) => (
              <View
                key={`${item.nome}-${index}`}
                wrap={false}
                style={[
                  styles.itemRow,
                  index === 0 ? { borderTopWidth: 0 } : {},
                ]}
              >
                <Text style={[styles.td, { width: "56%" }]}>{item.nome}</Text>
                <Text style={[styles.td, { width: "14%", textAlign: "right" }]}>{item.quantidade}</Text>
                <Text style={[styles.td, { width: "30%", textAlign: "right" }]}>{aberto ? item.precoUnitario != null ? brl(item.precoUnitario) : "Não informado" : item.vendido != null || item.devolvido != null ? `${item.vendido || 0} / ${item.devolvido || 0}` : "Sem detalhamento"}</Text>
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
          </View>

          <View style={styles.rulesBox}>
            <Text style={styles.rulesText}>{aberto ? "Escolha as peças que deseja comprar e devolva as demais no prazo combinado com a loja." : "Este documento registra a situação do condicional. Eventuais compras e pagamentos constam no comprovante da venda."}</Text>
            <Text style={styles.rulesText}>Valores de peças em condicional são informativos e não representam cobrança. Fale com a loja em caso de dúvida.</Text>
          </View>

          {aberto ? <View style={styles.footer} wrap={false}>
            <View style={styles.signature}>
              <Text style={styles.signatureText}>Assinatura / confirmação do cliente</Text>
            </View>
            <View style={styles.signature}>
              <Text style={styles.signatureText}>Responsável — {nomeLoja}</Text>
            </View>
          </View> : null}
        </View>
        <View style={styles.pageFooter} fixed>{NEXO_LOGO_SRC ? <PdfImage src={NEXO_LOGO_SRC} style={{ width: 58, height: 18, alignSelf: "center", marginBottom: 3 }}/> : null}<Text render={({ pageNumber, totalPages }) => `${nomeLoja} · ${formatDate(atualizadoEm)} · Página ${pageNumber}/${totalPages}`}>Documento gerado pelo sistema</Text></View>
      </Page>
    </Document>
  );
}
