import { describe, it, expect } from "vitest";
import React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import {
  FolhaSalarialPdf,
  PromissoriaPdf,
  ValePdf,
  RepasseProfissionalPdf,
  RelatorioFinanceiroPdf,
} from "@/components/pdf/relatorios-pdf";
import { PromissoriaAcordoPdf } from "@/components/pdf/promissoria-acordo-pdf";
import { CondicionalPdfDocument } from "@/components/pdf/condicional-pdf-document";

// Render de verdade (Área #11): garante que os PDFs geram sem erro depois de
// remover o letterSpacing e itemizar a folha. Um PDF válido começa com "%PDF-".
async function pdfOk(el: React.ReactElement) {
  const buf = await renderToBuffer(el as React.ReactElement<DocumentProps>);
  expect(buf.length).toBeGreaterThan(1000);
  expect(buf.slice(0, 5).toString()).toBe("%PDF-");
}

describe("relatorios-pdf — render", () => {
  it("condicional extenso com fonte incorporada e caracteres acentuados", async () => {
    await pdfOk(React.createElement(CondicionalPdfDocument, { nomeLoja: "Loja de Demonstração", clienteNome: "Cliente de Demonstração", responsavel: "Não informado", dataSaida: "2026-10-01", dataLimite: "2026-10-05", itens: Array.from({ length: 14 }, (_, i) => ({ nome: `Camiseta de demonstração ${i + 1} · Preta · GG`, quantidade: 1 })) }));
  }, 20000);
  it("exporta um mês extenso sem falha de paginação", async () => {
    await pdfOk(React.createElement(RelatorioFinanceiroPdf, {
      loja: "Loja de Demonstração", periodoInicio: "2026-09-01", periodoFim: "2026-09-30",
      resumo: { vendas_brutas: 20000, vendas_quantidade: 65, entradas_vendas: 20000, recebimentos_promissorias: 0, receita_servicos: 0, entradas_total: 20000, despesas_operacionais_pagas: 5000, compras_pagas: 10000, folha_vales_pagos: 0, saidas_total: 15000, resultado_caixa: 5000, despesas_pendentes: 0 },
      movimentos: Array.from({ length: 130 }, (_, i) => ({ id: `linha-${i}`, data: `2026-09-${String(i % 30 + 1).padStart(2, "0")}`, natureza: i % 2 ? "entrada" as const : "venda" as const, tipo: i % 2 ? "recebimento_venda" : "venda", descricao: "Venda para cliente de demonstração", detalhe: "2x Camiseta com descrição extensa, cor preta e tamanho GG · 1x Camiseta de outra marca, off-white, M · 1x Short preto, G", forma_pagamento: "cartao", valor: 549.8, status: "concluida" })),
    }));
  }, 20000);
  it("recibo de folha itemizado", async () => {
    await pdfOk(
      React.createElement(FolhaSalarialPdf, {
        loja: "Slow Office",
        funcionario: "João da Conceição",
        cargo: "Vendedor",
        referencia: "Agosto/2026",
        periodoInicio: "2026-08-01",
        periodoFim: "2026-08-31",
        salarioBase: 1500,
        comissao: 29.75,
        qtdVendas: 6,
        totalVendido: 595,
        comissaoPct: 5,
        comissaoBaseLabel: "Lucro total da loja",
        baseComissaoValor: 595,
        dataPagamento: "2026-08-31",
        repasseServicos: 56,
        vales: 200,
        outrosDescontos: 0,
      })
    );
  }, 20000);

  it("folha sem comissão/serviços (só salário)", async () => {
    await pdfOk(
      React.createElement(FolhaSalarialPdf, {
        loja: "Slow Office",
        funcionario: "Maria",
        referencia: "Agosto/2026",
        salarioBase: 1200,
        comissao: 0,
        qtdVendas: 0,
        totalVendido: 0,
        comissaoPct: 0,
        repasseServicos: 0,
        vales: 0,
      })
    );
  }, 20000);

  it("promissória, vale e repasse", async () => {
    await pdfOk(
      React.createElement(PromissoriaPdf, {
        loja: "Slow Office",
        devedor: "Cliente Fulano",
        valor: 400,
        vencimento: "2026-09-10",
        dataEmissao: "2026-08-18",
        parcelas: [
          { numero: 1, vencimento: "2026-09-10", valor: 200 },
          { numero: 2, vencimento: "2026-10-10", valor: 200 },
        ],
      })
    );
    await pdfOk(
      React.createElement(ValePdf, {
        loja: "Slow Office",
        funcionario: "João",
        valor: 200,
        data: "2026-08-18",
        descontarEmFolha: true,
      })
    );
    await pdfOk(
      React.createElement(RepasseProfissionalPdf, {
        loja: "Slow Office",
        profissional: "Leonardo",
        periodoInicio: "2026-08-01",
        periodoFim: "2026-08-31",
        itens: [
          { data: "2026-08-05", cliente: "Cliente A", valor: 300, percentual: 30 },
        ],
      })
    );
  }, 30000);

  it("acordo com vários produtos, descontos e histórico de recebimentos", async () => {
    await pdfOk(
      React.createElement(PromissoriaAcordoPdf, {
        loja: "Slow Office",
        cliente: "Cliente de Teste",
        cpf: "000.000.000-00",
        emissao: "2026-08-31",
        itens: [
          {
            nome: "Produto A",
            detalhe: "Preto · M",
            quantidade: 2,
            precoOriginal: 100,
            descontoValor: 10,
            descontoPercentual: 10,
            precoUnitario: 90,
          },
          {
            nome: "Produto B",
            quantidade: 1,
            precoOriginal: 80,
            descontoValor: 5,
            descontoPercentual: 6.25,
            precoUnitario: 75,
          },
        ],
        subtotalProdutos: 280,
        descontoProdutos: 25,
        valorProdutos: 255,
        acrescimoValor: 25.5,
        acrescimoPercentual: 10,
        entrada: 50,
        valorTotal: 280.5,
        totalPago: 100,
        saldoAtual: 180.5,
        parcelas: [
          { numero: 1, vencimento: "2026-09-30", valor: 115.25 },
          { numero: 2, vencimento: "2026-10-30", valor: 115.25 },
        ],
        recebimentos: [
          { data: "2026-08-31", tipo: "entrada", forma: "Pix", valor: 50 },
          { data: "2026-09-15", tipo: "parcela", forma: "Dinheiro", valor: 50 },
        ],
      })
    );
  }, 20000);

  it("relatório financeiro mensal completo", async () => {
    await pdfOk(
      React.createElement(RelatorioFinanceiroPdf, {
        loja: "Slow Office",
        periodoInicio: "2026-08-01",
        periodoFim: "2026-08-31",
        fechadoEm: "2026-08-31",
        resumo: {
          vendas_brutas: 1000,
          vendas_quantidade: 2,
          entradas_vendas: 700,
          recebimentos_promissorias: 200,
          receita_servicos: 100,
          entradas_total: 1000,
          despesas_operacionais_pagas: 300,
          compras_pagas: 200,
          folha_vales_pagos: 100,
          saidas_total: 600,
          resultado_caixa: 400,
          despesas_pendentes: 50,
        },
        movimentos: [
          {
            id: "venda-1",
            data: "2026-08-05",
            natureza: "venda",
            tipo: "venda",
            descricao: "Venda para Cliente",
            detalhe: "1x Camiseta",
            forma_pagamento: "pix",
            valor: 300,
            status: "concluida",
          },
          {
            id: "entrada-1",
            data: "2026-08-05",
            natureza: "entrada",
            tipo: "recebimento_venda",
            descricao: "Recebimento de venda",
            detalhe: "1x Camiseta",
            forma_pagamento: "pix",
            valor: 300,
            status: "recebido",
          },
          {
            id: "saida-1",
            data: "2026-08-06",
            natureza: "saida",
            tipo: "compra",
            descricao: "Fornecedor",
            detalhe: "Mercadoria",
            forma_pagamento: "não informado",
            valor: 200,
            status: "pago",
          },
        ],
      })
    );
  }, 20000);
});
