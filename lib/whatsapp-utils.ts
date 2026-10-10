export function normalizarTelefoneWhatsApp(telefone: string) {
  const numeros = telefone.replace(/\D/g, "");
  if (!numeros) return "";
  if (numeros.length === 10 || numeros.length === 11) {
    return `55${numeros}`;
  }
  return numeros;
}

export function criarLinkWhatsApp(telefone: string, mensagem: string) {
  const numero = normalizarTelefoneWhatsApp(telefone);
  if (!numero) return "";
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}

export function baixarPdf(blob: Blob, nomeArquivo: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Baixa o PDF e abre a conversa pelo link oficial do WhatsApp.
 * O wa.me não permite anexar arquivos automaticamente; o PDF baixado fica
 * pronto para o usuário anexar, enquanto a mensagem já chega preenchida.
 */
export async function compartilharPdfWhatsApp({
  blob,
  nomeArquivo,
  telefone,
  mensagem,
}: {
  blob: Blob;
  nomeArquivo: string;
  telefone: string;
  mensagem: string;
}) {
  baixarPdf(blob, nomeArquivo);
  const link = criarLinkWhatsApp(telefone, mensagem);
  if (!link) return "baixado" as const;

  // A navegação direta não é bloqueada como pop-up quando o PDF demorou para
  // ser gerado. O histórico permite voltar ao Nexo após anexar o documento.
  window.location.assign(link);
  return "whatsapp_aberto" as const;
}
