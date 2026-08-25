export type CupomPosVenda = {
  id: string;
  cliente_id: string;
  codigo: string;
  status: "ativo" | "usado" | "cancelado";
  validade: string;
  utilizado_em?: string | null;
  created_at: string;
};

export function cupomExpirado(validade: string, hoje = new Date()) {
  const limite = new Date(`${validade}T23:59:59`);
  return limite.getTime() < hoje.getTime();
}

export function statusVisualCupom(cupom: Pick<CupomPosVenda, "status" | "validade">, hoje = new Date()) {
  if (cupom.status === "usado") return "usado" as const;
  if (cupom.status === "cancelado") return "cancelado" as const;
  if (cupomExpirado(cupom.validade, hoje)) return "expirado" as const;
  return "ativo" as const;
}

export function formatarDataCurta(data: string) {
  const [ano, mes, dia] = data.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

export function mensagemCuponsPosVenda({
  nomeCliente,
  nomeLoja,
  cupons,
}: {
  nomeCliente: string;
  nomeLoja: string;
  cupons: Pick<CupomPosVenda, "codigo" | "validade">[];
}) {
  if (cupons.length === 0) return "";
  const validade = formatarDataCurta(cupons[0].validade);
  const lista = cupons.map((cupom) => `• ${cupom.codigo}`).join("\n");
  return `Olá, ${nomeCliente}! 👋✨\n\nObrigado pela sua compra na ${nomeLoja || "nossa loja"}! Você acabou de ganhar ${cupons.length} ${cupons.length === 1 ? "cupom" : "cupons"} para usar na sua próxima compra. 🎁\n\n${lista}\n\n⏰ Eles são válidos até ${validade}. Depois dessa data, expiram automaticamente.\n\nEsperamos você de volta! 💙`;
}
