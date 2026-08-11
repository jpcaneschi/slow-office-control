// Utilitários de CSV (export + parse) — sem dependências externas.

type Celula = string | number | null | undefined;

function escapar(valor: Celula): string {
  const s = valor === null || valor === undefined ? "" : String(valor);
  // Envolve em aspas se tiver vírgula, aspas ou quebra de linha.
  if (/[",\n;]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Gera o texto CSV a partir de cabeçalho + linhas. */
export function gerarCSV(headers: string[], linhas: Celula[][]): string {
  const linhasTexto = linhas.map((linha) => linha.map(escapar).join(","));
  return [headers.join(","), ...linhasTexto].join("\r\n");
}

/** Baixa um CSV no navegador (com BOM p/ acentos abrirem certo no Excel). */
export function baixarCSV(nomeArquivo: string, headers: string[], linhas: Celula[][]) {
  const conteudo = "﻿" + gerarCSV(headers, linhas);
  const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo.endsWith(".csv") ? nomeArquivo : `${nomeArquivo}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Faz o parse de um texto CSV em uma lista de objetos (1ª linha = cabeçalho). */
export function parseCSV(texto: string): Record<string, string>[] {
  const limpo = texto.replace(/^﻿/, ""); // remove BOM
  const linhas = dividirLinhas(limpo);
  if (linhas.length === 0) return [];

  const sep = detectarSeparador(linhas[0]);
  const headers = dividirCampos(linhas[0], sep).map((h) => h.trim().toLowerCase());

  const registros: Record<string, string>[] = [];
  for (let i = 1; i < linhas.length; i++) {
    if (linhas[i].trim() === "") continue;
    const campos = dividirCampos(linhas[i], sep);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (campos[idx] ?? "").trim();
    });
    registros.push(obj);
  }
  return registros;
}

function detectarSeparador(linhaCabecalho: string): string {
  // Excel PT-BR costuma exportar com ';'. Escolhe o que mais aparece.
  const virgulas = (linhaCabecalho.match(/,/g) || []).length;
  const pontoVirgula = (linhaCabecalho.match(/;/g) || []).length;
  return pontoVirgula > virgulas ? ";" : ",";
}

// Divide o texto em linhas respeitando aspas (campos podem ter \n dentro).
function dividirLinhas(texto: string): string[] {
  const linhas: string[] = [];
  let atual = "";
  let dentroAspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === '"') {
      dentroAspas = !dentroAspas;
      atual += c;
    } else if ((c === "\n" || c === "\r") && !dentroAspas) {
      if (c === "\r" && texto[i + 1] === "\n") i++; // pula \r\n
      linhas.push(atual);
      atual = "";
    } else {
      atual += c;
    }
  }
  if (atual !== "") linhas.push(atual);
  return linhas;
}

// Divide uma linha em campos respeitando aspas e "" escapado.
function dividirCampos(linha: string, sep: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let dentroAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (dentroAspas && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else {
        dentroAspas = !dentroAspas;
      }
    } else if (c === sep && !dentroAspas) {
      campos.push(atual);
      atual = "";
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos;
}
