import { hojeISO, somarDiasISO } from "@/lib/datas";

export type PecaCondicional = {
  nome: string; quantidade: number; precoUnitario?: number | null; precoOriginal?: number | null;
  vendido?: number; devolvido?: number;
};
export type EtapaCondicional = "avaliacao" | "amanha" | "hoje" | "vencido" | "devolvido" | "compra" | "finalizado" | "cancelado" | "conferencia";
const ROTULOS: Record<EtapaCondicional, string> = {
  avaliacao: "Em avaliação", amanha: "Retorno amanhã", hoje: "Retorno hoje", vencido: "Prazo de retorno vencido",
  devolvido: "Peças devolvidas", compra: "Compra registrada", finalizado: "Condicional finalizado", cancelado: "Condicional cancelado", conferencia: "Conferência a concluir",
};

export function resumirCondicional({ status, prazo, itens, hoje = hojeISO(), pendentes }: {
  status: string; prazo?: string; itens?: PecaCondicional[]; hoje?: string; pendentes?: number;
}) {
  const aberto = status === "aberto";
  const pecas = itens || [];
  const enviado = pecas.reduce((total, item) => total + item.quantidade, 0);
  const detalhado = pecas.length > 0 && pecas.every(item => item.vendido != null && item.devolvido != null
    && item.vendido >= 0 && item.devolvido >= 0 && item.vendido + item.devolvido <= item.quantidade);
  const comprado = detalhado ? pecas.reduce((total, item) => total + (item.vendido || 0), 0) : null;
  const devolvido = detalhado ? pecas.reduce((total, item) => total + (item.devolvido || 0), 0) : null;
  const restante = aberto ? enviado || pendentes || 0 : detalhado ? enviado - (comprado || 0) - (devolvido || 0) : pendentes ?? null;
  const referencia = pecas.length > 0 && pecas.every(item => item.precoUnitario != null && Number.isFinite(item.precoUnitario) && item.precoUnitario >= 0)
    ? pecas.reduce((total, item) => total + Math.round(Number(item.precoUnitario) * 100) * item.quantidade, 0) / 100 : null;
  const original = pecas.length > 0 && pecas.every(item => item.precoOriginal != null && Number.isFinite(item.precoOriginal) && item.precoOriginal >= 0)
    ? pecas.reduce((total, item) => total + Math.round(Number(item.precoOriginal) * 100) * item.quantidade, 0) / 100 : null;
  const economia = original != null && referencia != null ? Math.max(0, Math.round((original - referencia) * 100) / 100) : null;
  const etapa: EtapaCondicional = status === "cancelado" ? "cancelado"
    : !aberto && ((itens != null && (!detalhado || (restante || 0) > 0)) || (pendentes || 0) > 0 || (status === "recolhido" && (comprado || 0) > 0)) ? "conferencia"
    : status === "recolhido" ? "devolvido"
    : !aberto ? (comprado || 0) > 0 ? "compra" : "finalizado"
    : prazo && prazo < hoje ? "vencido" : prazo === hoje ? "hoje"
    : prazo === somarDiasISO(hoje, 1) ? "amanha" : "avaliacao";
  const texto: Record<EtapaCondicional, string> = {
    avaliacao: "Experimente as peças e escolha o que combina com você. Avise a loja sobre sua escolha e devolva as demais no prazo combinado.",
    amanha: "Seu prazo de retorno é amanhã. Conte à loja quais peças deseja comprar e combine a devolução das demais.",
    hoje: "Hoje é o prazo combinado para a conferência. Entre em contato com a loja para concluir sua escolha e o retorno das peças.",
    vencido: "O prazo combinado já passou. Fale com a loja para organizar a conferência das peças e o retorno.",
    devolvido: "Devolução registrada e condicional encerrado. Obrigado por experimentar nossa seleção!",
    compra: "Sua escolha foi registrada. Confira abaixo as peças compradas e devolvidas. Os detalhes do pagamento estão no comprovante da venda.",
    finalizado: "Este documento apresenta o encerramento registrado do seu condicional.",
    cancelado: "Este condicional foi cancelado. O documento preserva o registro original para sua conferência.",
    conferencia: "Há um encerramento registrado. O detalhamento das peças ainda precisa ser conferido pela loja.",
  };
  return { aberto, etapa, rotulo: ROTULOS[etapa], orientacao: texto[etapa], enviado, comprado, devolvido, restante, referencia, original, economia, detalhado };
}
