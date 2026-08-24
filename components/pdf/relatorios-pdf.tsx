import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import { montarFolha } from "@/lib/folha-utils";
import { PDF_FONT_BOLD, PDF_FONT_REGULAR } from "@/lib/pdf-fonts";

// ─────────────────────────────────────────────────────────────────────────────
// Modelos de PDF em PRETO & BRANCO (para impressão em folha branca).
// Fundo branco, texto preto, bordas pretas. Layout de documento oficial:
// cabeçalho, caixas de informação, tabelas, cláusulas e assinaturas.
//
// Tipografia incorporada ao arquivo: evita diferenças de espaçamento entre os
// leitores de PDF do navegador, celular e impressão.
// ─────────────────────────────────────────────────────────────────────────────

// Não hifenizar: retorna a palavra inteira (evita quebras estranhas como "sa-
// lário"). Precisa rodar só uma vez no carregamento do módulo.
Font.registerHyphenationCallback((word) => [word]);
Font.register({
  family: "DejaVuPDF",
  fonts: [
    { src: PDF_FONT_REGULAR, fontWeight: 400 },
    { src: PDF_FONT_BOLD, fontWeight: 700 },
  ],
});

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

function hojeISO() {
  // Data de emissão no fuso de São Paulo (evita virar o dia à noite via UTC).
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// Número de documento a partir da data + sufixo curto (ex.: PROM-20260803-482).
function gerarNumero(prefixo: string) {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate()
  ).padStart(2, "0")}`;
  const suf = String(Math.floor(Math.random() * 900) + 100);
  return `${prefixo}-${ymd}-${suf}`;
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#ffffff",
    color: "#111111",
    paddingVertical: 40,
    paddingHorizontal: 46,
    paddingBottom: 64,
    fontFamily: "DejaVuPDF",
    fontSize: 10.5,
    lineHeight: 1.5,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 2,
    borderBottomColor: "#000000",
    paddingBottom: 12,
  },
  loja: { fontSize: 18, fontFamily: "DejaVuPDF", fontWeight: 700, color: "#000000" },
  lojaSub: { fontSize: 8, color: "#555555", marginTop: 3 },
  headRight: { alignItems: "flex-end" },
  docTitle: {
    fontSize: 12,
    fontFamily: "DejaVuPDF",
    fontWeight: 700,
    textTransform: "uppercase",
    color: "#000000",
  },
  docMeta: { fontSize: 8.5, color: "#555555", marginTop: 4 },
  sectionTitle: {
    fontSize: 9,
    fontFamily: "DejaVuPDF",
    fontWeight: 700,
    textTransform: "uppercase",
    color: "#000000",
    marginTop: 18,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 10.5,
    color: "#111111",
    lineHeight: 1.7,
    marginTop: 12,
    textAlign: "justify",
  },
  // Destaque de valor
  valorBox: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#000000",
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  valorLabel: {
    fontSize: 9,
    color: "#555555",
    textTransform: "uppercase",
  },
  valorForte: { fontSize: 18, fontFamily: "DejaVuPDF", fontWeight: 700, color: "#000000" },
  // Grade de informações (caixas)
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -5,
  },
  infoCard: { width: "50%", paddingHorizontal: 5, marginBottom: 10 },
  infoInner: {
    borderWidth: 1,
    borderColor: "#111111",
    padding: 10,
    minHeight: 46,
  },
  infoLabel: {
    fontSize: 7.5,
    color: "#666666",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  infoValue: { fontSize: 11, color: "#000000", fontFamily: "DejaVuPDF", fontWeight: 700 },
  // Tabela
  table: { borderWidth: 1, borderColor: "#000000", marginTop: 8 },
  tHead: { flexDirection: "row", backgroundColor: "#000000" },
  tHeadCell: {
    color: "#ffffff",
    fontSize: 8.5,
    fontFamily: "DejaVuPDF",
    fontWeight: 700,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#dddddd" },
  tCell: { fontSize: 9.5, color: "#111111", paddingVertical: 6, paddingHorizontal: 8 },
  totalBox: {
    marginTop: 12,
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
    fontFamily: "DejaVuPDF",
    fontWeight: 700,
    textTransform: "uppercase",
  },
  totalValue: { fontSize: 15, fontFamily: "DejaVuPDF", fontWeight: 700 },
  // Cláusulas
  clauseBox: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#cccccc",
    padding: 12,
  },
  clauseText: {
    fontSize: 9,
    color: "#333333",
    lineHeight: 1.55,
    marginBottom: 4,
  },
  // Assinaturas
  signRow: { flexDirection: "row", gap: 30, marginTop: 50 },
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
    fontSize: 7.5,
    color: "#888888",
    textAlign: "center",
  },
});

function Header({
  loja,
  titulo,
  numero,
}: {
  loja: string;
  titulo: string;
  numero: string;
}) {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.loja}>{loja || "Sua Empresa"}</Text>
        <Text style={styles.lojaSub}>Documento oficial da loja</Text>
      </View>
      <View style={styles.headRight}>
        <Text style={styles.docTitle}>{titulo}</Text>
        <Text style={styles.docMeta}>Nº {numero}</Text>
        <Text style={styles.docMeta}>Emitido em {fmtData(hojeISO())}</Text>
      </View>
    </View>
  );
}

function InfoGrid({
  itens,
}: {
  itens: { label: string; value: string }[];
}) {
  return (
    <View style={styles.infoGrid}>
      {itens.map((it, i) => (
        <View key={i} style={styles.infoCard}>
          <View style={styles.infoInner}>
            <Text style={styles.infoLabel}>{it.label}</Text>
            <Text style={styles.infoValue}>{it.value || "—"}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function Clausulas({ itens }: { itens: string[] }) {
  return (
    <View style={styles.clauseBox}>
      {itens.map((c, i) => (
        <Text key={i} style={styles.clauseText}>
          • {c}
        </Text>
      ))}
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
        `${loja || "Sua Empresa"}  ·  Documento gerado pelo sistema  ·  Página ${pageNumber}/${totalPages}`
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
  parcelas?: { numero: number; vencimento: string; valor: number }[];
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
  parcelas = [],
}: PromissoriaProps) {
  const parcelada = parcelas.length > 1;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Header loja={loja} titulo="Nota Promissória" numero={gerarNumero("PROM")} />

        <View style={styles.valorBox}>
          <Text style={styles.valorLabel}>Valor a pagar</Text>
          <Text style={styles.valorForte}>{brl(valor)}</Text>
        </View>

        <Text style={styles.paragraph}>
          Reconheço dever a {loja || "Sua Empresa"}, ou à sua ordem, a quantia
          total de {brl(valor)} em moeda corrente deste país, pagável em{" "}
          {cidade || "praça do credor"}
          {parcelada
            ? ` conforme o plano de ${parcelas.length} parcelas mensais abaixo.`
            : ` com vencimento em ${fmtData(vencimento)}.`}
          {referencia ? ` Referente a: ${referencia}.` : ""}
        </Text>

        <Text style={styles.sectionTitle}>Dados do emitente</Text>
        <InfoGrid
          itens={[
            { label: "Emitente (devedor)", value: devedor },
            { label: "CPF / documento", value: cpf || "—" },
            {
              label: "Local e data de emissão",
              value: `${cidade ? cidade + ", " : ""}${fmtData(dataEmissao)}`,
            },
            {
              label: parcelada ? "Primeira parcela" : "Vencimento",
              value: fmtData(vencimento),
            },
          ]}
        />

        {parcelas.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>Plano de pagamento</Text>
            <View style={styles.table}>
              <View style={styles.tHead}>
                <Text style={[styles.tHeadCell, { width: "20%" }]}>Parcela</Text>
                <Text style={[styles.tHeadCell, { width: "40%" }]}>Vencimento</Text>
                <Text style={[styles.tHeadCell, { width: "40%", textAlign: "right" }]}>Valor</Text>
              </View>
              {parcelas.map((parcela) => (
                <View key={parcela.numero} style={styles.tRow} wrap={false}>
                  <Text style={[styles.tCell, { width: "20%" }]}>
                    {parcela.numero}/{parcelas.length}
                  </Text>
                  <Text style={[styles.tCell, { width: "40%" }]}>
                    {fmtData(parcela.vencimento)}
                  </Text>
                  <Text style={[styles.tCell, { width: "40%", textAlign: "right" }]}>
                    {brl(parcela.valor)}
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        <Clausulas
          itens={[
            parcelada
              ? "Cada parcela torna-se exigível na respectiva data indicada no plano de pagamento."
              : "Esta nota promissória é líquida, certa e exigível na data de vencimento.",
            "O não pagamento na data combinada sujeita o emitente aos acréscimos legais aplicáveis.",
            "O foro da praça de pagamento fica eleito para dirimir eventuais dúvidas.",
          ]}
        />

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
        <Header loja={loja} titulo="Vale / Adiantamento" numero={gerarNumero("VALE")} />

        <View style={styles.valorBox}>
          <Text style={styles.valorLabel}>Valor recebido</Text>
          <Text style={styles.valorForte}>{brl(valor)}</Text>
        </View>

        <Text style={styles.paragraph}>
          Recebi de {loja || "Sua Empresa"} a quantia de {brl(valor)} a título de
          vale/adiantamento
          {motivo ? `, referente a ${motivo}` : ""}.
          {descontarEmFolha
            ? " Declaro estar ciente de que este valor será descontado do meu próximo pagamento."
            : ""}
        </Text>

        <Text style={styles.sectionTitle}>Dados do recebimento</Text>
        <InfoGrid
          itens={[
            { label: "Funcionário", value: funcionario },
            { label: "Data", value: fmtData(data) },
            { label: "Motivo", value: motivo || "—" },
            {
              label: "Descontar em folha",
              value: descontarEmFolha ? "Sim" : "Não",
            },
          ]}
        />

        <Assinaturas
          esquerda="Assinatura do funcionário"
          direita="Responsável pela loja"
        />
        <Rodape loja={loja} />
      </Page>
    </Document>
  );
}

// ── 3) Recibo de pagamento (folha salarial) ──────────────────────────────────
// Itemizado (Área #11): salário, comissão de vendas, repasse de serviços e
// descontos vêm da FONTE ÚNICA de comissão (#3), batendo com a tela e o relatório.
export type FolhaProps = {
  loja: string;
  funcionario: string;
  cargo?: string;
  referencia: string;
  periodoInicio?: string;
  periodoFim?: string;
  salarioBase: number;
  comissao: number;
  qtdVendas: number;
  totalVendido: number;
  comissaoPct: number;
  repasseServicos: number;
  vales: number;
  outrosDescontos?: number;
  outrosDescontosLabel?: string;
  comissaoBaseLabel?: string;
  baseComissaoValor?: number;
  dataPagamento?: string;
};

export function FolhaSalarialPdf({
  loja,
  funcionario,
  cargo,
  referencia,
  periodoInicio,
  periodoFim,
  salarioBase,
  comissao,
  qtdVendas,
  totalVendido,
  comissaoPct,
  repasseServicos,
  vales,
  outrosDescontos,
  outrosDescontosLabel,
  comissaoBaseLabel = "Vendas do funcionário",
  baseComissaoValor,
  dataPagamento,
}: FolhaProps) {
  const { linhas, totalProventos, totalDescontos, liquido } = montarFolha({
    salarioBase,
    comissao,
    qtdVendas,
    repasseServicos,
    vales,
    outrosDescontos,
    outrosDescontosLabel,
    comissaoDescricao: `Comissão sobre ${comissaoBaseLabel.toLowerCase()}`,
  });

  const periodo =
    periodoInicio && periodoFim
      ? `${fmtData(periodoInicio)} a ${fmtData(periodoFim)}`
      : referencia;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Header loja={loja} titulo="Recibo de Pagamento" numero={gerarNumero("REC")} />

        <Text style={styles.sectionTitle}>Funcionário</Text>
        <InfoGrid
          itens={[
            { label: "Nome", value: funcionario },
            { label: "Cargo", value: cargo || "—" },
            { label: "Referência", value: referencia },
            { label: "Período apurado", value: periodo },
            { label: "Data do pagamento", value: dataPagamento ? fmtData(dataPagamento) : "—" },
          ]}
        />

        <Text style={styles.sectionTitle}>Base de comissão no período</Text>
        <InfoGrid
          itens={[
            { label: "Vendas concluídas", value: String(qtdVendas) },
            { label: comissaoBaseLabel, value: brl(baseComissaoValor ?? totalVendido) },
            { label: "Percentual de comissão", value: `${comissaoPct}%` },
            { label: "Emissão", value: fmtData(hojeISO()) },
          ]}
        />

        <Text style={styles.sectionTitle}>Composição do pagamento</Text>
        <View style={styles.table}>
          <View style={styles.tHead}>
            <Text style={[styles.tHeadCell, { width: 84 }]}>Tipo</Text>
            <Text style={[styles.tHeadCell, { flex: 1 }]}>Descrição</Text>
            <Text style={[styles.tHeadCell, { width: 120, textAlign: "right" }]}>
              Valor
            </Text>
          </View>
          {linhas.map((l, i) => (
            <View key={i} style={styles.tRow}>
              <Text style={[styles.tCell, { width: 84 }]}>{l.tipo}</Text>
              <Text style={[styles.tCell, { flex: 1 }]}>{l.desc}</Text>
              <Text style={[styles.tCell, { width: 120, textAlign: "right" }]}>
                {l.tipo === "Desconto" ? `- ${brl(l.valor)}` : brl(l.valor)}
              </Text>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 12 }}>
          <InfoGrid
            itens={[
              { label: "Total de proventos", value: brl(totalProventos) },
              { label: "Total de descontos", value: brl(totalDescontos) },
            ]}
          />
        </View>

        <View style={styles.totalBox}>
          <Text style={styles.totalLabel}>Líquido a receber</Text>
          <Text style={styles.totalValue}>{brl(liquido)}</Text>
        </View>

        <Text style={styles.paragraph}>
          Recebi de {loja || "Sua Empresa"} a importância líquida de {brl(liquido)},
          referente ao pagamento acima descrito ({referencia}), dando plena e
          geral quitação.
        </Text>

        <Assinaturas
          esquerda="Assinatura do funcionário"
          direita="Responsável pela loja"
        />
        <Rodape loja={loja} />
      </Page>
    </Document>
  );
}

// ── 4) Repasse de serviços ───────────────────────────────────────────────────
export type RepasseItem = {
  data: string;
  cliente: string;
  valor: number;
  percentual: number;
};

export type RepasseProps = {
  loja: string;
  profissional: string;
  periodoInicio: string;
  periodoFim: string;
  itens: RepasseItem[];
};

export function RepasseProfissionalPdf({
  loja,
  profissional,
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
  const ficaProfissional = faturado - aLoja;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Header loja={loja} titulo="Repasse — Serviços" numero={gerarNumero("REP")} />

        <Text style={styles.sectionTitle}>Referência</Text>
        <InfoGrid
          itens={[
            { label: "Profissional", value: profissional },
            {
              label: "Período",
              value: `${fmtData(periodoInicio)} a ${fmtData(periodoFim)}`,
            },
            { label: "Atendimentos", value: String(itens.length) },
            { label: "Total faturado", value: brl(faturado) },
          ]}
        />

        <Text style={styles.sectionTitle}>Atendimentos</Text>
        <View style={styles.table}>
          <View style={styles.tHead}>
            <Text style={[styles.tHeadCell, { width: 60 }]}>Data</Text>
            <Text style={[styles.tHeadCell, { flex: 1 }]}>Cliente</Text>
            <Text style={[styles.tHeadCell, { width: 76, textAlign: "right" }]}>
              Valor
            </Text>
            <Text style={[styles.tHeadCell, { width: 32, textAlign: "right" }]}>
              %
            </Text>
            <Text style={[styles.tHeadCell, { width: 78, textAlign: "right" }]}>
              À loja
            </Text>
          </View>
          {itens.map((it, i) => (
            <View key={i} style={styles.tRow}>
              <Text style={[styles.tCell, { width: 60 }]}>{fmtData(it.data)}</Text>
              <Text style={[styles.tCell, { flex: 1 }]}>{it.cliente}</Text>
              <Text style={[styles.tCell, { width: 76, textAlign: "right" }]}>
                {brl(it.valor || 0)}
              </Text>
              <Text style={[styles.tCell, { width: 32, textAlign: "right" }]}>
                {it.percentual}
              </Text>
              <Text style={[styles.tCell, { width: 78, textAlign: "right" }]}>
                {brl(((it.valor || 0) * (it.percentual || 0)) / 100)}
              </Text>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 12 }}>
          <InfoGrid
            itens={[
              { label: "Total faturado", value: brl(faturado) },
              { label: "Fica com o profissional", value: brl(ficaProfissional) },
            ]}
          />
        </View>

        <View style={styles.totalBox}>
          <Text style={styles.totalLabel}>Total a repassar à loja</Text>
          <Text style={styles.totalValue}>{brl(aLoja)}</Text>
        </View>

        <Assinaturas
          esquerda="Assinatura do profissional"
          direita="Responsável pela loja"
        />
        <Rodape loja={loja} />
      </Page>
    </Document>
  );
}
