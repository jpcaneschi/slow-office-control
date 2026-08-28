import { describe, expect, it } from "vitest";
import { parseCSV } from "@/lib/csv";
import {
  planejarImportacaoClientes,
  prepararImportacaoClientes,
} from "@/lib/clientes-import";

describe("prepararImportacaoClientes", () => {
  it("importa o formato padrão do Nexo com os dados completos", () => {
    const linhas = parseCSV(
      "nome,email,telefone,cpf,endereco,observacoes,status,data_nascimento\n" +
        'Ana Silva,ANA@EXAMPLE.COM,(32) 99999-0000,123.456.789-00,"Rua A, 10",Cliente VIP,vip,28/08/1990'
    );

    const resultado = prepararImportacaoClientes(linhas);

    expect(resultado.erros).toEqual([]);
    expect(resultado.semNome).toBe(0);
    expect(resultado.clientes[0]).toMatchObject({
      linha: 2,
      nome: "Ana Silva",
      email: "ana@example.com",
      telefone: "(32) 99999-0000",
      endereco: "Rua A, 10",
      observacoes: "Cliente VIP",
      status: "vip",
      data_nascimento: "1990-08-28",
    });
  });

  it("reconhece a exportação Shopify sem transformar histórico em venda", () => {
    const linhas = parseCSV(
      "Customer ID,First Name,Last Name,Email,Default Address Address1,Default Address Address2,Default Address City,Default Address Province Code,Default Address Zip,Default Address Phone,Phone,Total Spent,Total Orders,Note,Tags\n" +
        '987,Ana,Silva,ANA@EXAMPLE.COM,Rua A,10,Ubá,MG,36500-000,(32) 3333-0000,,129.90,2,"Prefere contato à tarde",varejo'
    );

    const resultado = prepararImportacaoClientes(linhas);
    const cliente = resultado.clientes[0];

    expect(cliente).toMatchObject({
      nome: "Ana Silva",
      email: "ana@example.com",
      telefone: "(32) 3333-0000",
      endereco: "Rua A, 10 · Ubá - MG · CEP 36500-000",
    });
    expect(cliente.observacoes).toContain("Origem: Shopify");
    expect(cliente.observacoes).toContain("ID Shopify: 987");
    expect(cliente.observacoes).toContain(
      "Histórico anterior (não lançado como venda no Nexo)"
    );
  });

  it("informa linhas sem nome e bloqueia datas inválidas", () => {
    const linhas = parseCSV(
      "nome,email,data_nascimento\n,semnome@example.com,\nJoão,joao@example.com,31/02/2020"
    );

    const resultado = prepararImportacaoClientes(linhas);

    expect(resultado.clientes).toEqual([]);
    expect(resultado.semNome).toBe(1);
    expect(resultado.erros).toEqual([
      { linha: 3, motivo: "data de nascimento inválida" },
    ]);
  });
});

describe("planejarImportacaoClientes", () => {
  it("ignora reimportação pelo ID Shopify ou pelo e-mail", () => {
    const preparados = prepararImportacaoClientes(
      parseCSV(
        "Customer ID,First Name,Last Name,Email,Phone\n987,Ana,Silva,ana@example.com,32999990000\n654,Bia,Souza,bia@example.com,32888880000"
      )
    ).clientes;
    const plano = planejarImportacaoClientes(preparados, [
      {
        nome: "Ana Silva",
        telefone: null,
        cpf: null,
        email: null,
        endereco: null,
        observacoes: "Origem: Shopify Slow Office | ID Shopify: 987",
      },
      {
        nome: "Beatriz Souza",
        telefone: null,
        cpf: null,
        email: "BIA@EXAMPLE.COM",
        endereco: null,
        observacoes: null,
      },
    ]);

    expect(plano.novos).toEqual([]);
    expect(plano.duplicados).toBe(2);
    expect(plano.linhasDuplicadas).toEqual([2, 3]);
  });

  it("não confunde pessoas diferentes que compartilham o telefone", () => {
    const preparados = prepararImportacaoClientes(
      parseCSV(
        "nome,email,telefone\nAna Silva,ana@example.com,32999990000\nBia Souza,bia@example.com,32999990000"
      )
    ).clientes;

    const plano = planejarImportacaoClientes(preparados, []);

    expect(plano.novos).toHaveLength(2);
    expect(plano.duplicados).toBe(0);
  });

  it("remove duplicados dentro do próprio arquivo", () => {
    const preparados = prepararImportacaoClientes(
      parseCSV(
        "nome,email,telefone\nAna Silva,ana@example.com,32999990000\nAna Silva,ANA@example.com,32999990000"
      )
    ).clientes;

    const plano = planejarImportacaoClientes(preparados, []);

    expect(plano.novos).toHaveLength(1);
    expect(plano.duplicados).toBe(1);
  });
});
