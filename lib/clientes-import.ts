import { normalizarDataEntrada } from "@/lib/datas";

export type ClienteImportavel = {
  nome: string;
  telefone: string | null;
  cpf: string | null;
  status: string;
  data_nascimento: string | null;
  email: string | null;
  endereco: string | null;
  observacoes: string | null;
};

export type ClientePreparado = ClienteImportavel & {
  linha: number;
};

export type ClienteExistente = Pick<
  ClienteImportavel,
  "nome" | "telefone" | "cpf" | "email" | "endereco" | "observacoes"
>;

export type ErroImportacaoCliente = {
  linha: number;
  motivo: string;
};

const STATUS_VALIDOS = new Set(["ativo", "inativo", "vip", "em atraso"]);

function primeiroValor(
  linha: Record<string, string>,
  ...chaves: string[]
): string {
  for (const chave of chaves) {
    const valor = (linha[chave] || "").trim();
    if (valor) return valor;
  }
  return "";
}

function juntar(partes: Array<string | null | undefined>, separador = " ") {
  return partes.map((parte) => (parte || "").trim()).filter(Boolean).join(separador);
}

function normalizarStatus(valor: string): string {
  const status = valor.trim().toLocaleLowerCase("pt-BR");
  if (status === "active") return "ativo";
  if (status === "inactive") return "inativo";
  return STATUS_VALIDOS.has(status) ? status : "ativo";
}

function formatarMoedaShopify(valor: string): string {
  const normalizado = valor.trim().replace(/\s/g, "").replace(",", ".");
  const numero = Number(normalizado);
  if (!Number.isFinite(numero)) return valor.trim();
  return numero.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function montarEnderecoShopify(linha: Record<string, string>): string {
  const logradouro = juntar(
    [
      linha["default address address1"],
      linha["default address address2"],
    ],
    ", "
  );
  const cidade = primeiroValor(linha, "default address city");
  const uf = primeiroValor(linha, "default address province code");
  const localidade = juntar([cidade, uf], " - ");
  const cep = primeiroValor(linha, "default address zip");

  return juntar(
    [logradouro, localidade, cep ? `CEP ${cep}` : ""],
    " · "
  );
}

function montarObservacoesShopify(linha: Record<string, string>): string {
  const idShopify = primeiroValor(linha, "customer id");
  const cidade = primeiroValor(linha, "default address city");
  const uf = primeiroValor(linha, "default address province code");
  const pedidos = primeiroValor(linha, "total orders");
  const total = primeiroValor(linha, "total spent");
  const empresa = primeiroValor(linha, "default address company");
  const nota = primeiroValor(linha, "note");
  const tags = primeiroValor(linha, "tags");

  return juntar(
    [
      "Origem: Shopify",
      idShopify ? `ID Shopify: ${idShopify}` : "",
      cidade || uf ? `Localidade: ${juntar([cidade, uf], " - ")}` : "",
      pedidos || total
        ? `Histórico anterior (não lançado como venda no Nexo): ${pedidos || "0"} pedido(s), ${
            total ? formatarMoedaShopify(total) : "valor não informado"
          }`
        : "",
      empresa ? `Empresa: ${empresa}` : "",
      nota ? `Nota Shopify: ${nota}` : "",
      tags ? `Tags Shopify: ${tags}` : "",
    ],
    " | "
  );
}

function eLinhaShopify(linha: Record<string, string>): boolean {
  return [
    "customer id",
    "first name",
    "last name",
    "default address address1",
    "total orders",
  ].some((chave) => Object.prototype.hasOwnProperty.call(linha, chave));
}

/**
 * Converte tanto o CSV padrão do Nexo quanto a exportação de clientes da
 * Shopify para o formato da tabela `clientes`. Dados históricos da Shopify são
 * preservados apenas em observações; esta função nunca cria vendas.
 */
export function prepararImportacaoClientes(
  linhas: Record<string, string>[]
): {
  clientes: ClientePreparado[];
  erros: ErroImportacaoCliente[];
  semNome: number;
} {
  const clientes: ClientePreparado[] = [];
  const erros: ErroImportacaoCliente[] = [];
  let semNome = 0;

  linhas.forEach((linha, indice) => {
    const numeroLinha = indice + 2;
    const shopify = eLinhaShopify(linha);
    const nome = shopify
      ? juntar([linha["first name"], linha["last name"]])
      : primeiroValor(linha, "nome", "name", "cliente");

    if (!nome) {
      semNome += 1;
      return;
    }

    const dataBruta = primeiroValor(
      linha,
      "data_nascimento",
      "data nascimento",
      "nascimento",
      "birthday"
    );
    const dataNascimento = normalizarDataEntrada(dataBruta);
    if (dataNascimento === null) {
      erros.push({
        linha: numeroLinha,
        motivo: "data de nascimento inválida",
      });
      return;
    }

    const telefone = shopify
      ? primeiroValor(linha, "phone", "default address phone")
      : primeiroValor(linha, "telefone", "phone", "celular");
    const email = primeiroValor(linha, "email", "e-mail").toLocaleLowerCase();
    const endereco = shopify
      ? montarEnderecoShopify(linha)
      : primeiroValor(linha, "endereco", "endereço", "address");
    const observacoes = shopify
      ? montarObservacoesShopify(linha)
      : primeiroValor(
          linha,
          "observacoes",
          "observações",
          "observacao",
          "observação",
          "notes"
        );

    clientes.push({
      linha: numeroLinha,
      nome,
      telefone: telefone || null,
      cpf: primeiroValor(linha, "cpf", "documento") || null,
      status: normalizarStatus(primeiroValor(linha, "status") || "ativo"),
      data_nascimento: dataNascimento || null,
      email: email || null,
      endereco: endereco || null,
      observacoes: observacoes || null,
    });
  });

  return { clientes, erros, semNome };
}

function normalizarIdentidade(valor: string | null | undefined): string {
  return (valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .trim();
}

function extrairIdShopify(observacoes: string | null | undefined): string {
  return /ID Shopify:\s*([0-9]+)/i.exec(observacoes || "")?.[1] || "";
}

function chavesDeIdentidade(cliente: ClienteExistente): string[] {
  const chaves: string[] = [];
  const nome = normalizarIdentidade(cliente.nome);
  const telefone = (cliente.telefone || "").replace(/\D/g, "");
  const cpf = (cliente.cpf || "").replace(/\D/g, "");
  const email = normalizarIdentidade(cliente.email);
  const endereco = normalizarIdentidade(cliente.endereco);
  const idShopify = extrairIdShopify(cliente.observacoes);

  if (idShopify) chaves.push(`shopify:${idShopify}`);
  if (email) chaves.push(`email:${email}`);
  if (cpf) chaves.push(`cpf:${cpf}`);
  if (nome && telefone) chaves.push(`nome-telefone:${nome}|${telefone}`);
  if (nome && endereco) chaves.push(`nome-endereco:${nome}|${endereco}`);
  return chaves;
}

/**
 * Planeja uma inserção idempotente. Considera ID Shopify, e-mail, CPF e as
 * combinações nome+telefone/nome+endereço. Telefone sozinho não é identidade:
 * pessoas diferentes podem compartilhar um número.
 */
export function planejarImportacaoClientes(
  preparados: ClientePreparado[],
  existentes: ClienteExistente[]
): {
  novos: ClienteImportavel[];
  duplicados: number;
  linhasDuplicadas: number[];
} {
  const chavesConhecidas = new Set(
    existentes.flatMap((cliente) => chavesDeIdentidade(cliente))
  );
  const novos: ClienteImportavel[] = [];
  const linhasDuplicadas: number[] = [];

  for (const preparado of preparados) {
    const chaves = chavesDeIdentidade(preparado);
    if (chaves.some((chave) => chavesConhecidas.has(chave))) {
      linhasDuplicadas.push(preparado.linha);
      continue;
    }

    novos.push({
      nome: preparado.nome,
      telefone: preparado.telefone,
      cpf: preparado.cpf,
      status: preparado.status,
      data_nascimento: preparado.data_nascimento,
      email: preparado.email,
      endereco: preparado.endereco,
      observacoes: preparado.observacoes,
    });
    chaves.forEach((chave) => chavesConhecidas.add(chave));
  }

  return {
    novos,
    duplicados: linhasDuplicadas.length,
    linhasDuplicadas,
  };
}
