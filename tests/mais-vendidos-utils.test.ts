import { describe, expect, it } from "vitest";
import { rankearProdutosMaisVendidos } from "@/lib/mais-vendidos-utils";

describe("ranking de produtos mais vendidos", () => {
  it("considera quantidade, período e apenas vendas concluídas", () => {
    const ranking = rankearProdutosMaisVendidos(
      [
        { id: "ok", status: "concluida", created_at: "2026-08-10T12:00:00Z" },
        { id: "cancelada", status: "cancelada", created_at: "2026-08-10T12:00:00Z" },
        { id: "fora", status: "concluida", created_at: "2026-07-10T12:00:00Z" },
      ],
      [
        { venda_id: "ok", produto_id: "a", quantidade: 3, total_item: 300 },
        { venda_id: "ok", produto_id: "b", quantidade: 1, total_item: 500 },
        { venda_id: "cancelada", produto_id: "b", quantidade: 10, total_item: 5000 },
        { venda_id: "fora", produto_id: "b", quantidade: 10, total_item: 5000 },
      ],
      [
        { id: "a", nome: "Camiseta" },
        { id: "b", nome: "Tênis" },
      ],
      new Date("2026-08-01T00:00:00Z").getTime(),
      new Date("2026-09-01T00:00:00Z").getTime()
    );
    expect(ranking.map((item) => item.nome)).toEqual(["Camiseta", "Tênis"]);
    expect(ranking[0]).toMatchObject({ quantidade: 3, faturamento: 300 });
  });
});
