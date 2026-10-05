import { formatDataBR, hojeISO } from "@/lib/datas";
import { formatCurrency, gerarCronogramaPromissoria } from "@/lib/promissorias-utils";
import { resumirCondicional, type PecaCondicional } from "@/lib/condicional-comunicacao";

export type SituacaoAcordo = "aberto" | "parcial" | "vence_hoje" | "atrasado" | "quitado" | "cancelado";
export type ParcelaAtualizada = {
  numero: number; vencimento: string; valor: number; pago: number; restante: number;
  situacao: "Paga" | "Quitada no cadastro" | "Parcial" | "Em aberto" | "Vence hoje" | "Atrasada" | "Cancelada";
};
export type DadosAcordo = {
  status: string; valorTotal: number; totalPago: number; entrada: number;
  parcelas: number; primeiraParcela?: string | null; hoje?: string;
};

const centavos = (valor: number) => Math.max(0, Math.round((Number(valor) || 0) * 100));
export const ROTULO_ACORDO: Record<SituacaoAcordo, string> = {
  aberto: "Em aberto", parcial: "Pagamento parcial", vence_hoje: "Vence hoje",
  atrasado: "Pagamento em atraso", quitado: "Quitado", cancelado: "Cancelado",
};

/** Pagamentos são distribuídos na ordem do acordo, sempre em centavos. */
export function resumirAcordo(dados: DadosAcordo) {
  const hoje = dados.hoje || hojeISO();
  const total = centavos(dados.valorTotal);
  const pago = centavos(dados.totalPago);
  const entrada = Math.min(total, centavos(dados.entrada));
  const cancelado = dados.status === "cancelado";
  const quitado = !cancelado && (dados.status === "pago" || (total > 0 && pago >= total));
  const saldo = cancelado || quitado ? 0 : Math.max(0, total - pago) / 100;
  let disponivel = Math.max(0, pago - entrada);
  const parcelas: ParcelaAtualizada[] = gerarCronogramaPromissoria(
    (total - entrada) / 100, dados.parcelas, dados.primeiraParcela || ""
  ).map((parcela) => {
    const valor = centavos(parcela.valor);
    const recebido = Math.min(valor, disponivel);
    disponivel = Math.max(0, disponivel - recebido);
    const restante = cancelado || quitado ? 0 : (valor - recebido) / 100;
    const situacao = cancelado ? "Cancelada" : quitado && recebido < valor ? "Quitada no cadastro" : restante === 0 ? "Paga"
      : parcela.vencimento < hoje ? "Atrasada" : parcela.vencimento === hoje ? "Vence hoje"
      : recebido > 0 ? "Parcial" : "Em aberto";
    return { ...parcela, pago: recebido / 100, restante, situacao };
  });
  const proxima = parcelas.find((parcela) => parcela.restante > 0) || null;
  const vencido = parcelas.filter((parcela) => parcela.vencimento < hoje)
    .reduce((soma, parcela) => soma + centavos(parcela.restante), 0) / 100;
  const situacao: SituacaoAcordo = cancelado ? "cancelado" : quitado ? "quitado"
    : vencido > 0 || (!proxima && dados.status === "atrasado") ? "atrasado"
    : proxima?.vencimento === hoje ? "vence_hoje" : pago > 0 ? "parcial" : "aberto";
  return { situacao, rotulo: ROTULO_ACORDO[situacao], saldo, pago: pago / 100, total: total / 100, parcelas, proxima, vencido };
}

export function mensagemAcordo({ cliente, loja, ...dados }: DadosAcordo & { cliente: string; loja: string }) {
  const resumo = resumirAcordo(dados);
  const inicio = `Olá, ${cliente.trim() || "cliente"}! Aqui é da ${loja.trim() || "loja"}.`;
  if (resumo.situacao === "cancelado") {
    return `${inicio}\n\nO acordo foi cancelado. Segue o documento atualizado para sua conferência. Não há cobrança deste acordo nesta mensagem.${resumo.pago > 0 ? `\nPagamentos registrados: ${formatCurrency(resumo.pago)}. Qualquer ajuste desses valores será tratado com a loja.` : ""}\n\nSe precisar de alguma informação, estamos à disposição.`;
  }
  if (resumo.situacao === "quitado") {
    return `${inicio}\n\nSeu acordo está quitado! Segue o comprovante de quitação.\nTotal do acordo: ${formatCurrency(resumo.total)}.\nSaldo restante: ${formatCurrency(0)}.\n\nObrigado pela compra e pela confiança!`;
  }
  const abertura = resumo.situacao === "atrasado" ? "Segue a posição atual do seu acordo. Há pagamento em atraso."
    : resumo.situacao === "vence_hoje" ? "Passando para lembrar que há uma parcela do seu acordo com vencimento hoje."
    : resumo.situacao === "parcial" ? "Seu pagamento está registrado. Segue o acordo atualizado com o que ainda falta pagar."
    : "Segue o seu acordo de pagamento, com os valores e as datas combinadas.";
  const proxima = resumo.proxima;
  const vencimento = proxima
    ? `\n${proxima.vencimento < (dados.hoje || hojeISO()) ? "Parcela pendente" : "Próxima parcela"}: ${proxima.numero}/${dados.parcelas}, ${formatCurrency(proxima.restante)}, vencimento ${formatDataBR(proxima.vencimento)}.`
    : "\nA data do próximo pagamento ainda precisa ser combinada com a loja.";
  return `${inicio}\n\n${abertura}\nTotal do acordo: ${formatCurrency(resumo.total)}.\nJá pago: ${formatCurrency(resumo.pago)}.\nFalta pagar: ${formatCurrency(resumo.saldo)}.${resumo.vencido > 0 ? `\nDesse saldo, ${formatCurrency(resumo.vencido)} está vencido.` : ""}${vencimento}\n\nConfira os detalhes no PDF. Se precisar conversar sobre o pagamento, fale com a gente.`;
}

export function mensagemCondicional({ cliente, loja, status, prazo, pendentes, hoje = hojeISO(), itens, codigo }: {
  cliente: string; loja: string; status: string; prazo: string; pendentes: number; hoje?: string; itens?: PecaCondicional[]; codigo?: string;
}) {
  const resumo = resumirCondicional({ status, prazo, pendentes, itens, hoje });
  const inicio = `Olá, ${cliente.trim() || "cliente"}! Aqui é da ${loja.trim() || "loja"}.`;
  const abertura = {
    avaliacao: "Preparamos o resumo das peças do seu condicional. Experimente e conte para a gente o que mais gostou!",
    amanha: "Seu prazo para concluir o condicional é amanhã. Já conseguiu escolher suas peças favoritas?",
    hoje: "Hoje é o dia combinado para concluir seu condicional. Vamos conferir sua escolha e o retorno das demais peças?",
    vencido: `O prazo do seu condicional encerrou em ${formatDataBR(prazo)}. Vamos organizar a conferência das peças e o retorno?`,
    devolvido: "Recebemos as peças de volta e encerramos seu condicional. Obrigado por experimentar nossa seleção!",
    compra: "Sua escolha foi registrada! Obrigado pela compra e pela confiança. Segue o resumo final do seu condicional.",
    finalizado: "Seu condicional foi finalizado. Segue o registro atualizado para sua conferência.",
    cancelado: "Seu condicional foi cancelado. Segue o registro atualizado para sua conferência. Estamos à disposição quando precisar.",
    conferencia: "Seu condicional possui um encerramento registrado. O detalhamento das peças ainda está sendo conferido pela loja.",
  }[resumo.etapa];
  const selecao = resumo.aberto && itens?.length ? `\n\nSua seleção:\n${itens.slice(0, 6).map(item => `• ${item.quantidade}× ${item.nome}`).join("\n")}${itens.length > 6 ? "\nVeja a seleção completa no PDF." : ""}` : "";
  const prazoTexto = resumo.aberto ? prazo ? `\n\n${resumo.etapa === "vencido" ? "Prazo original" : "Retorno combinado"}: ${formatDataBR(prazo)}.` : "\n\nO prazo de retorno será combinado com a loja." : "";
  const resultado = !resumo.aberto && resumo.detalhado && resumo.etapa !== "cancelado"
    ? `\n\nPeças compradas: ${resumo.comprado}.\nPeças devolvidas: ${resumo.devolvido}.${resumo.etapa === "conferencia" ? "\nA conferência ainda precisa ser concluída." : ""}` : "";
  const encerramento = resumo.aberto ? "Nos avise quais peças deseja comprar e quais vai devolver. Se precisar ajustar o retorno, fale com a gente. Os valores no PDF são de referência; a compra será registrada após sua confirmação."
    : resumo.etapa === "compra" ? "Os detalhes do pagamento estão no comprovante da venda. Esperamos ver você novamente!"
    : resumo.etapa === "devolvido" ? "Foi um prazer atender você. Quando quiser experimentar outras peças, conte com a gente!" : "Se precisar de alguma informação, fale com a gente.";
  return `${inicio}\n\n${abertura}${selecao}${prazoTexto}${resultado}\n\n${encerramento}\n\nSegue seu PDF${codigo ? ` · Condicional ${codigo}` : ""}.`;
}

export function nomeArquivoCliente(tipo: string, cliente: string, codigo: string) {
  const nome = cliente.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return `${tipo}-${nome || "cliente"}-${codigo.slice(0, 8)}.pdf`;
}
