export type FrequenciaPagamento = "mensal" | "quinzenal" | "semanal";

export type ConfigAgendaPagamento = {
  frequencia_pagamento: FrequenciaPagamento | null | undefined;
  dia_pagamento: number | null | undefined;
  dia_pagamento_2?: number | null | undefined;
  dia_semana_pagamento?: number | null | undefined;
};

export type ParcelaAgenda = {
  competencia: string;
  data_pagamento: string;
  parcela_numero: number;
  total_parcelas: number;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function partesData(iso: string) {
  const [ano, mes, dia] = iso.slice(0, 10).split("-").map(Number);
  return { ano, mes, dia };
}

function ultimoDiaMes(ano: number, mes: number) {
  return new Date(ano, mes, 0).getDate();
}

function isoData(ano: number, mes: number, dia: number) {
  return `${ano}-${pad2(mes)}-${pad2(dia)}`;
}

export function competenciaDeData(iso: string) {
  const { ano, mes } = partesData(iso);
  return isoData(ano, mes, 1);
}

export function proximaCompetencia(competencia: string, incremento = 1) {
  const { ano, mes } = partesData(competencia);
  const d = new Date(ano, mes - 1 + incremento, 1);
  return isoData(d.getFullYear(), d.getMonth() + 1, 1);
}

export function gerarDatasPagamentoMes(
  config: ConfigAgendaPagamento,
  competenciaISO: string
): ParcelaAgenda[] {
  const { ano, mes } = partesData(competenciaISO);
  const ultimo = ultimoDiaMes(ano, mes);
  const competencia = isoData(ano, mes, 1);
  const frequencia = config.frequencia_pagamento || "mensal";
  const datas: string[] = [];

  if (frequencia === "quinzenal") {
    const primeiroDia = Math.min(
      Math.max(Number(config.dia_pagamento || 15), 1),
      Math.max(ultimo - 1, 1)
    );
    const segundoDia = Math.min(
      Math.max(Number(config.dia_pagamento_2 || 30), primeiroDia + 1),
      ultimo
    );
    datas.push(isoData(ano, mes, primeiroDia), isoData(ano, mes, segundoDia));
  } else if (frequencia === "semanal") {
    const diaSemana = Math.min(Math.max(Number(config.dia_semana_pagamento ?? 5), 0), 6);
    for (let dia = 1; dia <= ultimo; dia += 1) {
      const d = new Date(ano, mes - 1, dia);
      if (d.getDay() === diaSemana) datas.push(isoData(ano, mes, dia));
    }
  } else {
    const dia = Math.min(Math.max(Number(config.dia_pagamento || 5), 1), ultimo);
    datas.push(isoData(ano, mes, dia));
  }

  return datas.map((data_pagamento, indice) => ({
    competencia,
    data_pagamento,
    parcela_numero: indice + 1,
    total_parcelas: datas.length,
  }));
}

export function gerarProximosPagamentos(
  config: ConfigAgendaPagamento,
  aPartirISO: string,
  quantidade = 12
): ParcelaAgenda[] {
  const inicio = aPartirISO.slice(0, 10);
  const encontrados: ParcelaAgenda[] = [];
  let competencia = competenciaDeData(inicio);

  for (let i = 0; i < 18 && encontrados.length < quantidade; i += 1) {
    const agenda = gerarDatasPagamentoMes(config, competencia);
    for (const item of agenda) {
      if (item.data_pagamento >= inicio) encontrados.push(item);
      if (encontrados.length >= quantidade) break;
    }
    competencia = proximaCompetencia(competencia);
  }

  return encontrados;
}

export function distribuirValor(valor: number, parcelas: number) {
  const qtd = Math.max(1, Math.trunc(parcelas || 1));
  const centavos = Math.round((Number(valor) || 0) * 100);
  const base = Math.floor(centavos / qtd);
  const resto = centavos - base * qtd;
  return Array.from({ length: qtd }, (_, i) => (base + (i === qtd - 1 ? resto : 0)) / 100);
}

export function formatarDataCurta(iso: string) {
  const { dia, mes } = partesData(iso);
  return `${pad2(dia)}/${pad2(mes)}`;
}

export function nomeDiaSemana(valor: number) {
  return ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"][
    Math.min(Math.max(valor, 0), 6)
  ];
}
