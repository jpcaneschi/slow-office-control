import { NextResponse } from "next/server";
import { loadIntegration, requireAppUser, shopifyGraphql } from "@/lib/shopify/server";

type VariantNode = {
  id: string;
  title: string;
  sku: string | null;
  inventoryQuantity: number;
  product: { id: string; title: string };
  inventoryItem: { id: string };
};

export async function GET(request: Request) {
  try {
    const user = await requireAppUser(request);
    const { db, integration, token } = await loadIntegration(user.organizationId);
    const variants: VariantNode[] = [];
    let after: string | null = null;
    do {
      const data: {
        productVariants: { nodes: VariantNode[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
      } = await shopifyGraphql(integration.shop_domain, token, `query Catalog($after: String) {
        productVariants(first: 100, after: $after) {
          nodes { id title sku inventoryQuantity product { id title } inventoryItem { id } }
          pageInfo { hasNextPage endCursor }
        }
      }`, { after });
      variants.push(...data.productVariants.nodes);
      after = data.productVariants.pageInfo.hasNextPage ? data.productVariants.pageInfo.endCursor : null;
    } while (after && variants.length < 1000);
    const [{ data: products, error: productsError }, { data: productVariants, error: pvError }, { data: mappings, error: mappingsError }] = await Promise.all([
      db.from("produtos").select("id,nome,marca,preco,estoque,tem_variacoes,status").eq("organization_id", user.organizationId).eq("status", "ativo").order("nome"),
      db.from("produto_variacoes").select("id,produto_id,tamanho,cor,sku,codigo_barras,estoque,status").eq("organization_id", user.organizationId).eq("status", "ativo"),
      db.from("shopify_produto_mapeamentos").select("id,produto_id,variacao_id,shopify_product_gid,shopify_variant_gid,inventory_item_gid,location_gid,shopify_title,sku,status").eq("organization_id", user.organizationId),
    ]);
    if (productsError || pvError || mappingsError) throw productsError || pvError || mappingsError;
    return NextResponse.json({ variants, products, productVariants, mappings, locationGid: integration.location_gid });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao carregar catálogos." }, { status: 400 });
  }
}
