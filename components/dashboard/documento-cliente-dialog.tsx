"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Copy, Download, MessageCircle, X } from "lucide-react";
import { baixarPdf, criarLinkWhatsApp } from "@/lib/whatsapp-utils";

export type DocumentoCliente = { blob: Blob; nomeArquivo: string; mensagem: string; telefone?: string | null; titulo: string };

export function DocumentoClienteDialog({ documento, onFechar }: { documento: DocumentoCliente; onFechar: () => void }) {
  const [mensagem, setMensagem] = useState(documento.mensagem);
  const [feedback, setFeedback] = useState("");
  const [erro, setErro] = useState("");
  const [urlPdf, setUrlPdf] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    const url = URL.createObjectURL(documento.blob);
    setUrlPdf(url);
    return () => URL.revokeObjectURL(url);
  }, [documento.blob]);
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    function teclado(event: KeyboardEvent) {
      if (event.key === "Escape") onFechar();
      if (event.key !== "Tab") return;
      const itens = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea, a[href]') || []);
      const primeiro = itens[0]; const ultimo = itens[itens.length - 1];
      if (event.shiftKey && document.activeElement === primeiro) { event.preventDefault(); ultimo?.focus(); }
      if (!event.shiftKey && document.activeElement === ultimo) { event.preventDefault(); primeiro?.focus(); }
    }
    document.addEventListener("keydown", teclado);
    return () => { document.removeEventListener("keydown", teclado); document.body.style.overflow = overflow; anterior?.focus(); };
  }, [onFechar]);

  const linkWhatsApp = criarLinkWhatsApp(documento.telefone || "", mensagem);

  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-3 backdrop-blur-sm" onClick={(event) => { if (event.target === event.currentTarget) onFechar(); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${id}-titulo`} className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-[var(--foreground)] shadow-xl sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xs font-semibold text-[var(--text-muted)]">Documento e mensagem</p><h2 id={`${id}-titulo`} className="mt-1 text-xl font-bold">{documento.titulo}</h2></div>
        <button type="button" onClick={onFechar} aria-label="Fechar prévia" className="rounded-lg p-3 hover:bg-[var(--background)]"><X size={20}/></button>
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">Confira a mensagem antes de compartilhar. Você pode adaptar o texto para este cliente.</p>
      <label htmlFor={`${id}-mensagem`} className="mt-5 block text-sm font-semibold">Mensagem para o cliente</label>
      <textarea id={`${id}-mensagem`} value={mensagem} onChange={(event) => setMensagem(event.target.value)} rows={11} className="mt-2 w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 text-sm leading-6"/>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => setMensagem(documento.mensagem)} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm">Restaurar mensagem sugerida</button>
        <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(mensagem); setFeedback("Mensagem copiada."); setErro(""); } catch { setErro("Não foi possível copiar. Selecione o texto e copie manualmente."); } }} className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"><Copy size={16}/>Copiar mensagem</button>
      </div>
      {feedback && <p role="status" className="mt-3 text-sm text-emerald-700">{feedback}</p>}
      {erro && <p role="alert" className="mt-3 text-sm text-red-600">{erro}</p>}
      {!documento.telefone && <p className="mt-3 text-sm text-[var(--text-muted)]">Cliente sem telefone cadastrado. Use a mensagem copiada e o PDF baixado.</p>}
      <div className="mt-5 flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
        {urlPdf && <a href={urlPdf} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-[var(--border)] px-4 py-3 text-sm font-semibold">Visualizar PDF</a>}
        <button type="button" onClick={() => baixarPdf(documento.blob, documento.nomeArquivo)} className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-4 py-3 text-sm font-semibold"><Download size={16}/>Baixar PDF</button>
        {linkWhatsApp ? <a href={linkWhatsApp} target="_blank" rel="noopener noreferrer" onClick={() => { baixarPdf(documento.blob, documento.nomeArquivo); setFeedback("PDF baixado. Anexe o arquivo na conversa aberta."); setErro(""); }} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1fb85a]"><MessageCircle size={17}/>Abrir WhatsApp</a> : <button type="button" disabled className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-300 px-4 py-3 text-sm font-semibold text-white"><MessageCircle size={17}/>WhatsApp indisponível</button>}
      </div>
      <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]">O botão baixa o PDF e abre a conversa pelo link oficial do WhatsApp com a mensagem pronta. Depois, basta anexar o arquivo baixado e confirmar o envio.</p>
    </div>
  </div>;
}
