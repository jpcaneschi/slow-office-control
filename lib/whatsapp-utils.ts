export function normalizarTelefoneWhatsApp(telefone: string) {
  const numeros = telefone.replace(/\D/g, "");
  if (!numeros) return "";
  if ((numeros.length === 10 || numeros.length === 11) && !numeros.startsWith("55")) {
    return `55${numeros}`;
  }
  return numeros;
}

export function criarLinkWhatsApp(telefone: string, mensagem: string) {
  const numero = normalizarTelefoneWhatsApp(telefone);
  if (!numero) return "";
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}

function baixarBlob(blob: Blob, nomeArquivo: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Celular: compartilha o PDF como arquivo pelo menu nativo.
 * Desktop/fallback: baixa o arquivo e abre a conversa com a mensagem pronta.
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

  baixarBlob(blob, nomeArquivo);
  const link = criarLinkWhatsApp(telefone, mensagem);
  if (link) window.open(link, "_blank", "noopener,noreferrer");
  return "baixado" as const;
}
