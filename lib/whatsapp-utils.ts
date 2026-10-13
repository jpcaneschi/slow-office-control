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
 * Compartilha o arquivo pelo menu nativo do aparelho sem depender de telefone.
 * Em navegadores sem suporte ao compartilhamento de arquivos, baixa o PDF.
 */
export async function compartilharPdf({
  blob,
  nomeArquivo,
  mensagem,
}: {
  blob: Blob;
  nomeArquivo: string;
  mensagem: string;
}) {
  const arquivo = new File([blob], nomeArquivo, { type: "application/pdf" });
  const nav = navigator as Navigator & {
    canShare?: (dados: ShareData) => boolean;
  };

  if (nav.share && nav.canShare?.({ files: [arquivo] })) {
    await nav.share({
      title: nomeArquivo,
      text: mensagem,
      files: [arquivo],
    });
    return "compartilhado" as const;
  }

  baixarPdf(blob, nomeArquivo);
  return "baixado" as const;
}

/**
 * Compartilha o arquivo pelo menu nativo. No fallback de desktop, baixa o PDF
 * e abre a conversa vinculada ao telefone informado.
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
  const resultado = await compartilharPdf({ blob, nomeArquivo, mensagem });
  if (resultado === "compartilhado") return resultado;

  const link = criarLinkWhatsApp(telefone, mensagem);
  if (link) window.open(link, "_blank", "noopener,noreferrer");
  return "baixado" as const;
}
