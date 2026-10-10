import { NextResponse } from "next/server";
import { loadIntegration, requireAppUser, shopifyGraphql } from "@/lib/shopify/server";

type MappingInput = {
  produtoId: string;
  variacaoId?: string | null;
  shopifyProductGid: string;
  shopifyVariantGid: string;
  inventoryItemGid: string;
  locationGid: string;
  title?: string;
  sku?: string | null;
};

export async function PUT(request: Request) {
  try {
    const user = await requireAppUser(request, ["owner"]);
    const body = (await request.json()) as { mappings?: MappingInput[] };
    const rows = body.mappings || [];
    if (!rows.length) throw new Error("Selecione pelo menos um vínculo.");
    const { db, integration, token } = await loadIntegration(user.organizationId);
    for (const row of rows) {
      const { data: product } = await db.from("produtos").select("id,estoque").eq("id", row.produtoId).eq("organization_id", user.organizationId).maybeSingle();
      if (!product) throw new Error("Um dos produtos não pertence à empresa ativa.");
      let estoqueNexo = Number(product.estoque || 0);
      if (row.variacaoId) {
        const { data: variant } = await db.from("produto_variacoes").select("id,estoque").eq("id", row.variacaoId).eq("produto_id", row.produtoId).eq("organization_id", user.organizationId).maybeSingle();
        if (!variant) throw new Error("Uma das variações não pertence ao produto selecionado.");
        estoqueNexo = Number(variant.estoque || 0);
      }
      const { error } = await db.from("shopify_produto_mapeamentos").upsert({
        organization_id: user.organizationId,
        produto_id: row.produtoId,
        variacao_id: row.variacaoId || null,
        shopify_product_gid: row.shopifyProductGid,
        shopify_variant_gid: row.shopifyVariantGid,
        inventory_item_gid: row.inventoryItemGid,
        location_gid: row.locationGid,
        shopify_title: row.title || null,
        sku: row.sku || null,
        status: "ativo",
        updated_at: new Date().toISOString(),
      }, { onConflict: "organization_id,shopify_variant_gid" });
      if (error) throw error;

      const result = await shopifyGraphql<{
        inventorySetQuantities: { userErrors: Array<{ field: string[]; message: string }> };
      }>(integration.shop_domain, token, `mutation InitialInventory($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
        inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) { userErrors { field message } }
      }`, {
        idempotencyKey: crypto.randomUUID(),
        input: {
          name: "available",
          reason: "correction",
          referenceDocumentUri: `gid://nexo/ProductMapping/${row.shopifyVariantGid.split("/").pop()}`,
          quantities: [{
            inventoryItemId: row.inventoryItemGid,
            locationId: row.locationGid,
            quantity: Math.max(0, Math.trunc(estoqueNexo)),
            changeFromQuantity: null,
          }],
        },
      });
      if (result.inventorySetQuantities.userErrors.length) {
        throw new Error(result.inventorySetQuantities.userErrors.map((item) => item.message).join("; "));
      }
    }
    return NextResponse.json({ ok: true, saved: rows.length });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao salvar vínculos." }, { status: 400 });
  }
}
