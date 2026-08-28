export function formatarEixoBrl(valor: number): string {
  const numero = Number(valor || 0);
  const absoluto = Math.abs(numero);
  const formatar = (divisor: number) =>
    (numero / divisor).toLocaleString("pt-BR", {
      maximumFractionDigits: 1,
    });

  if (absoluto >= 1_000_000) return `R$ ${formatar(1_000_000)} mi`;
  if (absoluto >= 1_000) return `R$ ${formatar(1_000)} mil`;
  return `R$ ${numero.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

/** Gera no máximo cerca de seis marcas, evitando um eixo vertical congestionado. */
export function calcularEscalaGrafico(maximo: number, permitir25 = true) {
  if (!Number.isFinite(maximo) || maximo <= 0) {
    return { max: 100, ticks: [0, 25, 50, 75, 100] };
  }

  const bruto = maximo / 5;
  const magnitude = Math.pow(10, Math.floor(Math.log10(bruto)));
  const normalizado = bruto / magnitude;
  let passo: number;
  if (normalizado <= 1) passo = 1;
  else if (normalizado <= 2) passo = 2;
  else if (permitir25 && normalizado <= 2.5) passo = 2.5;
  else if (normalizado <= 5) passo = 5;
  else passo = 10;

  passo *= magnitude;
  const topo = Math.ceil(maximo / passo) * passo;
  const ticks: number[] = [];
  for (let valor = 0; valor <= topo + passo / 1000; valor += passo) {
    ticks.push(Math.round(valor * 100) / 100);
  }
  return { max: topo, ticks };
}
