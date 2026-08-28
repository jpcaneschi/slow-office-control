export type OpcaoBuscaRapida = {
  value: string;
  label: string;
  searchText?: string;
  description?: string;
  disabled?: boolean;
};

export function normalizarBuscaRapida(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function filtrarOpcoesBuscaRapida(
  opcoes: OpcaoBuscaRapida[],
  termo: string,
  limite = 40
): OpcaoBuscaRapida[] {
  const consulta = normalizarBuscaRapida(termo);
  const palavras = consulta.split(" ").filter(Boolean);

  if (palavras.length === 0) return opcoes.slice(0, limite);

  return opcoes
    .map((opcao, indice) => {
      const rotulo = normalizarBuscaRapida(opcao.label);
      const complemento = normalizarBuscaRapida(opcao.searchText || "");
      const conteudoBase = `${rotulo} ${complemento}`;
      const conteudo = `${conteudoBase} ${conteudoBase.replace(/\s/g, "")}`;

      if (!palavras.every((palavra) => conteudo.includes(palavra))) return null;

      const pontuacao = rotulo === consulta ? 0 : rotulo.startsWith(consulta) ? 1 : 2;
      return { opcao, indice, pontuacao };
    })
    .filter(
      (resultado): resultado is {
        opcao: OpcaoBuscaRapida;
        indice: number;
        pontuacao: number;
      } => resultado !== null
    )
    .sort((a, b) => a.pontuacao - b.pontuacao || a.indice - b.indice)
    .slice(0, limite)
    .map(({ opcao }) => opcao);
}
