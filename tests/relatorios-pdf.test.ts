import { describe, it, expect } from "vitest";
import React from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import {
  FolhaSalarialPdf,
  PromissoriaPdf,
  ValePdf,
  RepasseProfissionalPdf,
} from "@/components/pdf/relatorios-pdf";

// Render de verdade (Área #11): garante que os PDFs geram sem erro depois de
// remover o letterSpacing e itemizar a folha. Um PDF válido começa com "%PDF-".
async function pdfOk(el: React.ReactElement) {
  const buf = await renderToBuffer(el as React.ReactElement<DocumentProps>);
  expect(buf.length).toBeGreaterThan(1000);
  expect(buf.slice(0, 5).toString()).toBe("%PDF-");
}

describe("relatorios-pdf — render", () => {
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
});
