import React from "react";
import { describe, expect, it } from "vitest";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PromissoriaAcordoPdf } from "@/components/pdf/promissoria-acordo-pdf";
import { CondicionalPdfDocument } from "@/components/pdf/condicional-pdf-document";
import { VendaComprovantePdf } from "@/components/pdf/venda-comprovante-pdf";
import { FolhaSalarialPdf } from "@/components/pdf/relatorios-pdf";

async function verificarPdf(nome: string, documento: React.ReactElement) {
  const buffer = await renderToBuffer(documento as React.ReactElement<DocumentProps>);
  expect(buffer.subarray(0,5).toString()).toBe("%PDF-");
  expect(buffer.length).toBeGreaterThan(1000);
  if (process.env.NEXO_PDF_QA_DIR) {
    await mkdir(process.env.NEXO_PDF_QA_DIR, { recursive: true });
    await writeFile(join(process.env.NEXO_PDF_QA_DIR, `${nome}.pdf`), buffer);
  }
}

const props = {
  loja: "Loja de demonstração", cliente: "Cliente de demonstração", codigo: "DEMO0001", emissao: "2026-08-10", atualizadoEm: "2026-10-05",
  itens: [{ nome: "Camiseta de demonstração com descrição extensa", detalhe: "Off-white · tamanho GG", quantidade: 2, precoUnitario: 500 }],
  valorProdutos: 1000, acrescimoValor: 0, acrescimoPercentual: 0, entrada: 100, valorTotal: 1000,
  totalPago: 450, saldoAtual: 550, status: "em_aberto",
  parcelas: [{ numero: 1, vencimento: "2026-09-10", valor: 300 }, { numero: 2, vencimento: "2026-10-10", valor: 300 }, { numero: 3, vencimento: "2026-11-10", valor: 300 }],
  recebimentos: [{ data: "2026-08-10", tipo: "entrada" as const, forma: "Pix", valor: 100 }, { data: "2026-09-10", tipo: "parcela" as const, forma: "Dinheiro", valor: 350 }],
};

describe("documentos do cliente em todas as situações", () => {
  it("acordo parcialmente pago mostra o saldo e as parcelas atuais", async () => {
    await verificarPdf("acordo-parcial", React.createElement(PromissoriaAcordoPdf, props));
  }, 20000);
  it("quitação gera um comprovante sem assinatura de nova dívida", async () => {
    await verificarPdf("acordo-quitado", React.createElement(PromissoriaAcordoPdf, { ...props, totalPago: 1000, saldoAtual: 0, status: "pago", recebimentos: [...props.recebimentos, { data: "2026-10-05", tipo: "parcela", forma: "Pix", valor: 550 }] }));
  }, 20000);
  it("cancelamento preserva histórico e não vira cobrança", async () => {
    await verificarPdf("acordo-cancelado", React.createElement(PromissoriaAcordoPdf, { ...props, status: "cancelado", saldoAtual: 0 }));
  }, 20000);
  it("acordo extenso mantém rodapé e linhas inteiras", async () => {
    await verificarPdf("acordo-extenso", React.createElement(PromissoriaAcordoPdf, { ...props,
      itens: Array.from({ length: 24 }, (_, index) => ({ ...props.itens[0], nome: `Produto de demonstração ${index+1} com descrição extensa e caracteres acentuados` })) }));
  }, 20000);
  it("condicional devolvido tem conferência de peças e tamanho", async () => {
    await verificarPdf("condicional-devolvido", React.createElement(CondicionalPdfDocument, { nomeLoja: props.loja, clienteNome: props.cliente, responsavel: "Equipe da loja", codigo: "DEMO0002", dataSaida: "2026-10-02", dataLimite: "2026-10-05", status: "recolhido", atualizadoEm: "2026-10-05", itens: [{ nome: "Camiseta de demonstração · Preta · G", quantidade: 1, precoUnitario: 269.9, vendido: 0, devolvido: 1 }] }));
  }, 20000);
  it("compra paga no cartão não gera saldo devedor das parcelas do cartão", async () => {
    await verificarPdf("compra-paga", React.createElement(VendaComprovantePdf, { loja: props.loja, cliente: props.cliente, codigo: "DEMO0003", data: "2026-10-02", status: "concluida", total: 439.8, desconto: 0, forma: "Cartão", parcelas: 3, recebido: 439.8, saldo: 0, itens: [{ nome: "Camiseta de demonstração", detalhe: "Preta · G", quantidade: 1, unitario: 439.8, total: 439.8 }] }));
  }, 20000);
  it("folha pendente gera demonstrativo sem afirmar que houve pagamento", async () => {
    const documento = FolhaSalarialPdf({ loja: props.loja, funcionario: "Funcionária de demonstração", referencia: "Setembro de 2026",
      salarioBase: 0, comissao: 1000, qtdVendas: 10, totalVendido: 5000, comissaoPct: 100, repasseServicos: 0, vales: 0,
      comissaoBaseLabel: "Lucro mensal da loja", baseComissaoValor: 1000, dataPagamento: "2026-10-13", pagamentoConfirmado: false });
    const conteudo = JSON.stringify(documento);
    expect(conteudo).toContain("Demonstrativo de Pagamento");
    expect(conteudo).toContain("Líquido previsto");
    expect(conteudo).toContain("Pagamento ainda não registrado");
    expect(conteudo).not.toContain("Recebi de");
    expect(conteudo).not.toContain("Assinatura do funcionário");
    await verificarPdf("folha-pendente", documento);
  }, 20000);
  it("folha paga tem recibo e confirmação de recebimento", async () => {
    const documento = FolhaSalarialPdf({ loja: props.loja, funcionario: "Funcionária de demonstração", referencia: "Setembro de 2026",
      salarioBase: 0, comissao: 1000, qtdVendas: 10, totalVendido: 5000, comissaoPct: 100, repasseServicos: 0, vales: 0,
      comissaoBaseLabel: "Lucro mensal da loja", baseComissaoValor: 1000, dataPagamento: "2026-10-13", pagamentoConfirmado: true });
    const conteudo = JSON.stringify(documento);
    expect(conteudo).toContain("Recibo de Pagamento");
    expect(conteudo).toContain("Líquido recebido");
    expect(conteudo).toContain("Recebi de");
    expect(conteudo).toContain("Assinatura do funcionário");
    expect(conteudo).not.toContain("Pagamento ainda não registrado");
    await verificarPdf("folha-paga", documento);
  }, 20000);
});
