import { describe, it, expect } from "vitest";
import { gerarCSV, parseCSV } from "@/lib/csv";

describe("gerarCSV", () => {
  it("monta cabeçalho + linhas", () => {
    const csv = gerarCSV(["nome", "preco"], [["Camisa", 100]]);
    expect(csv).toBe("nome,preco\r\nCamisa,100");
  });
  it("escapa vírgulas com aspas", () => {
    const csv = gerarCSV(["nome"], [["Calça, jeans"]]);
    expect(csv).toBe('nome\r\n"Calça, jeans"');
  });
  it("escapa aspas duplicando-as", () => {
    const csv = gerarCSV(["nome"], [['Boné "top"']]);
    expect(csv).toBe('nome\r\n"Boné ""top"""');
  });
});

describe("parseCSV", () => {
  it("lê cabeçalho e linhas (separador vírgula)", () => {
    const rows = parseCSV("nome,preco\r\nCamisa,100\r\nCalça,200");
    expect(rows).toEqual([
      { nome: "Camisa", preco: "100" },
      { nome: "Calça", preco: "200" },
    ]);
  });
  it("detecta separador ponto-e-vírgula (Excel PT-BR)", () => {
    const rows = parseCSV("nome;preco\nCamisa;100");
    expect(rows).toEqual([{ nome: "Camisa", preco: "100" }]);
  });
  it("respeita campos com vírgula dentro de aspas", () => {
    const rows = parseCSV('nome,categoria\r\n"Calça, jeans",Roupas');
    expect(rows).toEqual([{ nome: "Calça, jeans", categoria: "Roupas" }]);
  });
  it("ignora BOM e linhas vazias", () => {
    const rows = parseCSV("﻿nome\r\nAna\r\n\r\n");
    expect(rows).toEqual([{ nome: "Ana" }]);
  });
  it("faz round-trip com gerarCSV", () => {
    const csv = gerarCSV(["nome", "obs"], [["Ana", "compra, à vista"]]);
    expect(parseCSV(csv)).toEqual([{ nome: "Ana", obs: "compra, à vista" }]);
  });
});
