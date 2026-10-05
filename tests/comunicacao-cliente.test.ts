import { describe, expect, it } from "vitest";
import { mensagemAcordo, mensagemCondicional, nomeArquivoCliente, resumirAcordo } from "@/lib/comunicacao-cliente";

const acordo = { cliente: "Cliente de demonstração", loja: "Loja de demonstração", status: "em_aberto", valorTotal: 1000, totalPago: 0, entrada: 100, parcelas: 3, primeiraParcela: "2026-09-10", hoje: "2026-09-05" };

describe("documentos e mensagens seguem a posição do acordo", () => {
  it("a entrada não é deduzida duas vezes e pagamentos avançam o vencimento", () => {
    const resumo = resumirAcordo({ ...acordo, totalPago: 450 });
    expect(resumo.saldo).toBe(550);
    expect(resumo.parcelas.map((p) => p.restante)).toEqual([0, 250, 300]);
    expect(resumo.proxima?.vencimento).toBe("2026-10-10");
    const texto = mensagemAcordo({ ...acordo, totalPago: 450 });
    expect(texto).toContain("Seu pagamento está registrado");
    expect(texto).toContain("550,00");
    expect(texto).toContain("2/3");
    expect(texto).not.toContain("10/09/2026");
  });
  it("diferencia acordo novo, vencimento hoje e vencido", () => {
    expect(mensagemAcordo(acordo)).toContain("datas combinadas");
    expect(mensagemAcordo({ ...acordo, totalPago: 100, hoje: "2026-09-10" })).toContain("vencimento hoje");
    const texto = mensagemAcordo({ ...acordo, totalPago: 100, hoje: "2026-10-11" });
    expect(texto).toContain("pagamento em atraso");
    expect(texto).toContain("600,00");
    expect(texto).toContain("900,00");
  });
  it("pagamento exato em centavos quita, sem mensagem de cobrança ou vencimento", () => {
    const dados = { ...acordo, valorTotal: 100.01, entrada: 0, totalPago: 100.01 };
    expect(resumirAcordo(dados).saldo).toBe(0);
    expect(resumirAcordo(dados).parcelas.map((p) => p.valor)).toEqual([33.34, 33.34, 33.33]);
    const texto = mensagemAcordo(dados);
    expect(texto).toContain("comprovante de quitação");
    expect(texto).not.toMatch(/Próxima parcela|vencimento|em atraso|fale.*pagamento/);
  });
  it("uma parcela vencida já paga deixa de gerar mensagem de atraso", () => {
    const dados = { ...acordo, status: "atrasado", totalPago: 450, hoje: "2026-10-05" };
    expect(resumirAcordo(dados).situacao).toBe("parcial");
    expect(mensagemAcordo(dados)).not.toContain("pagamento em atraso");
    expect(mensagemAcordo(dados)).toContain("10/10/2026");
  });
  it("cancelamento preserva recebimentos e nunca vira quitação", () => {
    const texto = mensagemAcordo({ ...acordo, status: "cancelado", totalPago: 100 });
    expect(texto).toContain("foi cancelado");
    expect(texto).toContain("100,00");
    expect(texto).not.toMatch(/quitado|Próxima parcela|Falta pagar/);
  });
  it("não inventa recebimentos quando há quitação antiga por status", () => {
    const resumo = resumirAcordo({ ...acordo, status: "pago", totalPago: 100 });
    expect(resumo.saldo).toBe(0);
    expect(resumo.parcelas.map((p) => p.pago)).toEqual([0, 0, 0]);
    expect(resumo.parcelas[0].situacao).toBe("Quitada no cadastro");
  });
  it("acordo sem vencimento não mostra data inventada", () => {
    const texto = mensagemAcordo({ ...acordo, primeiraParcela: null });
    expect(texto).toContain("ainda precisa ser combinada");
    expect(texto).not.toContain("Próxima parcela");
  });
  it("condicional devolvido não pede peças, decisão ou novo pagamento", () => {
    const texto = mensagemCondicional({ cliente: acordo.cliente, loja: acordo.loja, status: "recolhido", prazo: "2026-09-05", pendentes: 0 });
    expect(texto).toContain("Recebemos as peças de volta");
    expect(texto).not.toMatch(/aguardam|quais peças|pagamento/);
  });
  it("nomes dos arquivos diferenciam acordos do mesmo cliente", () => {
    expect(nomeArquivoCliente("acordo", "João da Conceição", "12345678-abcd")).toBe("acordo-joao-da-conceicao-12345678.pdf");
  });
});
