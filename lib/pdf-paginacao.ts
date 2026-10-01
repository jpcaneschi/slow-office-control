/** Limita a altura estimada por página, sem perder ou repetir linhas. */
export function paginarLinhas<T>(linhas: T[], altura: (linha: T) => number, limite = 490): T[][] {
  const paginas: T[][] = [];
  let atual: T[] = [];
  let usado = 0;
  for (const linha of linhas) {
    const custo = Math.max(1, altura(linha));
    if (atual.length && usado + custo > limite) {
      paginas.push(atual); atual = []; usado = 0;
    }
    atual.push(linha); usado += custo;
  }
  if (atual.length) paginas.push(atual);
  return paginas;
}
