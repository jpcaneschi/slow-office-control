export type StatusAcesso = "pendente" | "aprovado" | "rejeitado";

export function acessoPermiteEntrada(
  status: string | null | undefined
): status is "aprovado" {
  return status === "aprovado";
}

export function mensagemStatusAcesso(status: string | null | undefined) {
  if (status === "pendente") {
    return "Seu cadastro foi recebido e está aguardando aprovação. Avisaremos assim que o acesso for liberado.";
  }
  if (status === "rejeitado") {
    return "Este cadastro ainda não está liberado. Fale com a equipe Nexo para revisar o acesso.";
  }
  return "Não foi possível confirmar a liberação desta conta. Fale com a equipe Nexo.";
}
