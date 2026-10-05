import { describe, expect, it } from "vitest";
import { resumirCondicional } from "@/lib/condicional-comunicacao";
import { mensagemCondicional } from "@/lib/comunicacao-cliente";
const itens = [{ nome: "Camiseta exemplo · Preta · G", quantidade: 2, precoUnitario: 189.9 }];
const base = { cliente: "Cliente de demonstração", loja: "Loja de demonstração", status: "aberto", prazo: "2026-10-07", pendentes: 2, itens, hoje: "2026-10-05", codigo: "DEMO0001" };
describe("atendimento em condicional", () => {
  it("personaliza a seleção com peças e valor de referência em centavos", () => {
    expect(resumirCondicional(base).referencia).toBe(379.8);
    const mensagem = mensagemCondicional(base);
    expect(mensagem).toContain("2× Camiseta exemplo · Preta · G");
    expect(mensagem).toContain("07/10/2026");
    expect(mensagem).toContain("DEMO0001");
    expect(mensagem).not.toContain("Falta pagar");
  });
  it("diferencia lembrete de amanhã, retorno hoje e prazo vencido", () => {
    expect(mensagemCondicional({ ...base, prazo: "2026-10-06" })).toContain("é amanhã");
    expect(mensagemCondicional({ ...base, prazo: "2026-10-05" })).toContain("Hoje é o dia");
    expect(mensagemCondicional({ ...base, prazo: "2026-10-04" })).toContain("encerrou em 04/10/2026");
  });
  it("compra e devolução têm quantidades reais e não afirmam pagamento", () => {
    const dados = { ...base, status: "convertido", pendentes: 0, itens: [{ ...itens[0], vendido: 1, devolvido: 1 }] };
    const mensagem = mensagemCondicional(dados);
    expect(resumirCondicional(dados).etapa).toBe("compra");
    expect(mensagem).toContain("Peças compradas: 1");
    expect(mensagem).toContain("Peças devolvidas: 1");
    expect(mensagem).not.toMatch(/está pago|quitado|Retorno combinado|é amanhã/);
  });
  it("devolução completa agradece o atendimento e não solicita retorno", () => {
    const mensagem = mensagemCondicional({ ...base, status: "recolhido", pendentes: 0, itens: [{ ...itens[0], vendido: 0, devolvido: 2 }] });
    expect(mensagem).toContain("Recebemos as peças de volta");
    expect(mensagem).not.toMatch(/Retorno combinado|prazo|Falta pagar/);
  });
  it("detalhamento incompleto não presume compra nem devolução", () => {
    const dados = { ...base, status: "convertido", pendentes: 0 };
    expect(resumirCondicional(dados).etapa).toBe("conferencia");
    expect(mensagemCondicional(dados)).not.toMatch(/Obrigado pela compra|Recebemos as peças|Peças compradas: 0/);
    expect(resumirCondicional({ ...dados, itens: [{ ...itens[0], vendido: 0, devolvido: 1 }] }).restante).toBe(1);
  });
  it("preço ausente e cancelamento não viram saldo ou prazo a cumprir", () => {
    expect(resumirCondicional({ ...base, itens: [{ ...itens[0], precoUnitario: null }] }).referencia).toBeNull();
    const mensagem = mensagemCondicional({ ...base, status: "cancelado" });
    expect(mensagem).toContain("foi cancelado");
    expect(mensagem).not.toMatch(/Retorno combinado|Nos avise quais|pagamento/);
  });
});
