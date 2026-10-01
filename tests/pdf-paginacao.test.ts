import { expect, it } from "vitest";
import { paginarLinhas } from "@/lib/pdf-paginacao";

it("mantém ordem e todas as linhas mesmo com uma linha maior que a página", () => {
  const linhas = [10, 20, 100, 30, 20];
  const paginas = paginarLinhas(linhas, (n) => n, 50);
  expect(paginas).toEqual([[10, 20], [100], [30, 20]]);
  expect(paginas.flat()).toEqual(linhas);
  expect(paginarLinhas([], () => 1)).toEqual([]);
});
