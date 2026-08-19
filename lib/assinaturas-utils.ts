export type AssinaturaAcesso = {
  status: string;
  provider: string | null;
  current_period_end: string | null;
};

/** Espelha no front a regra autoritativa de acesso da migration 0047. */
export function assinaturaPermiteAcesso(
  assinatura: AssinaturaAcesso | null,
  agora = new Date()
): boolean {
  // Compatibilidade durante deploy: o banco antigo ainda não cria a linha.
  if (!assinatura) return true;

  const vencimento = assinatura.current_period_end
    ? new Date(assinatura.current_period_end)
    : null;
  const dentroDaValidade =
    vencimento !== null &&
    !Number.isNaN(vencimento.getTime()) &&
    vencimento.getTime() >= agora.getTime();

  if (assinatura.status === "ativa") {
    return vencimento === null || dentroDaValidade;
  }
  if (assinatura.status === "trial") return dentroDaValidade;

  return assinatura.provider === null && vencimento === null;
}
