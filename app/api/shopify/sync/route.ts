import { NextResponse } from "next/server";
import { loadIntegration, requireAppUser, shopifyGraphql } from "@/lib/shopify/server";

type OutboxRow = {
  id: string;
  movimentacao_id: string;
  quantidade_comparada: number;
  quantidade_alvo: number;
  tentativas: number;
  shopify_produto_mapeamentos: {
    inventory_item_gid: string;
    location_gid: string;
  } | null;
};

export async function POST(request: Request) {
  try {
    const user = await requireAppUser(request, ["owner", "gerente", "caixa"]);
    const { db, integration, token } = await loadIntegration(user.organizationId);
    if (!integration.sync_estoque) return NextResponse.json({ processed: 0, errors: 0 });
    const { data, error } = await db.from("shopify_sync_outbox")
      .select("id,movimentacao_id,quantidade_comparada,quantidade_alvo,tentativas,shopify_produto_mapeamentos(inventory_item_gid,location_gid)")
      .eq("organization_id", user.organizationId)
      .in("status", ["pendente", "erro"])
      .lte("proxima_tentativa_em", new Date().toISOString())
      .order("created_at").limit(20);
    if (error) throw error;
    let processed = 0;
    let errors = 0;
    for (const row of (data || []) as unknown as OutboxRow[]) {
      const mapping = row.shopify_produto_mapeamentos;
      if (!mapping) continue;
      await db.from("shopify_sync_outbox").update({ status: "processando", tentativas: row.tentativas + 1 }).eq("id", row.id);
      try {
        const result = await shopifyGraphql<{
          inventorySetQuantities: { userErrors: Array<{ field: string[]; message: string }> };
        }>(integration.shop_domain, token, `mutation SetInventory($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
          inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) { userErrors { field message } }
        }`, {
          idempotencyKey: row.id,
          input: {
            name: "available",
            reason: "correction",
            referenceDocumentUri: `gid://nexo/StockMovement/${row.movimentacao_id}`,
            quantities: [{
              inventoryItemId: mapping.inventory_item_gid,
              locationId: mapping.location_gid,
              quantity: Math.trunc(Number(row.quantidade_alvo)),
              // O Nexo é a fonte de verdade do estoque. Na API 2026-10, null
              // substitui o antigo ignoreCompareQuantity.
              changeFromQuantity: null,
            }],
          },
        });
        const userErrors = result.inventorySetQuantities.userErrors;
        if (userErrors.length) throw new Error(userErrors.map((item) => item.message).join("; "));
        await db.from("shopify_sync_outbox").update({ status: "concluido", erro: null, processed_at: new Date().toISOString() }).eq("id", row.id);
        processed += 1;
      } catch (itemError) {
        const attempts = row.tentativas + 1;
        const retryMinutes = Math.min(60, 2 ** Math.min(attempts, 5));
        const message = itemError instanceof Error ? itemError.message : "Falha ao atualizar estoque";
        await db.from("shopify_sync_outbox").update({
          status: "erro",
          erro: message.slice(0, 1000),
          proxima_tentativa_em: new Date(Date.now() + retryMinutes * 60_000).toISOString(),
        }).eq("id", row.id);
        errors += 1;
      }
    }
    await db.from("shopify_integracoes").update({
      last_sync_at: new Date().toISOString(),
      last_error: errors ? `${errors} atualização(ões) de estoque aguardando nova tentativa.` : null,
      updated_at: new Date().toISOString(),
    }).eq("organization_id", user.organizationId);
    return NextResponse.json({ processed, errors });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao sincronizar." }, { status: 400 });
  }
}
