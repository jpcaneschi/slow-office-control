import { NextResponse } from "next/server";
import { serviceClient, verifyWebhookHmac } from "@/lib/shopify/server";

type ShopifyLine = {
  admin_graphql_api_id?: string;
  variant_id?: number | string | null;
  title?: string;
  variant_title?: string | null;
  quantity?: number;
  price?: string;
};

function orderGid(payload: Record<string, unknown>) {
  return String(payload.admin_graphql_api_id || (payload.id ? `gid://shopify/Order/${payload.id}` : ""));
}

function variantGid(line: ShopifyLine) {
  return line.variant_id ? `gid://shopify/ProductVariant/${line.variant_id}` : line.admin_graphql_api_id || "";
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyWebhookHmac(raw, request.headers.get("x-shopify-hmac-sha256"))) {
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  }
  const deliveryId = request.headers.get("x-shopify-webhook-id") || crypto.randomUUID();
  const topic = request.headers.get("x-shopify-topic") || "unknown";
  const shop = (request.headers.get("x-shopify-shop-domain") || "").toLowerCase();
  const db = serviceClient();
  const { data: integration } = await db.from("shopify_integracoes")
    .select("organization_id,sync_vendas,sync_estoque")
    .eq("shop_domain", shop).eq("status", "ativa").maybeSingle();
  if (!integration && topic !== "app/uninstalled") return NextResponse.json({ ok: true, ignored: true });
  const { data: inserted, error: eventError } = await db.from("shopify_eventos").insert({
    delivery_id: deliveryId,
    organization_id: integration?.organization_id || null,
    shop_domain: shop,
    topic,
    status: "processando",
    tentativas: 1,
  }).select("delivery_id").maybeSingle();
  if (eventError?.code === "23505") return NextResponse.json({ ok: true, duplicate: true });
  if (eventError || !inserted) return NextResponse.json({ error: "Falha ao registrar webhook." }, { status: 500 });
  try {
    const payload = JSON.parse(raw) as Record<string, unknown>;
    const org = String(integration?.organization_id || "");
    const externalId = orderGid(payload) || String(payload.id || "");
    if (topic === "app/uninstalled") {
      await db.from("shopify_integracoes").update({ status: "desconectada", access_token_enc: "revogado", updated_at: new Date().toISOString() }).eq("shop_domain", shop);
    } else if (topic === "orders/paid" && integration?.sync_vendas) {
      const lines = (payload.line_items || []) as ShopifyLine[];
      const customer = (payload.customer || {}) as Record<string, unknown>;
      const address = (payload.billing_address || payload.shipping_address || {}) as Record<string, unknown>;
      const { error } = await db.rpc("shopify_importar_pedido", {
        p_org: org,
        p_order_gid: externalId,
        p_order_number: String(payload.name || payload.order_number || ""),
        p_processed_at: String(payload.processed_at || payload.created_at || new Date().toISOString()),
        p_currency: String(payload.currency || "BRL"),
        p_customer: {
          first_name: customer.first_name || address.first_name,
          last_name: customer.last_name || address.last_name,
          email: customer.email || payload.email,
          phone: customer.phone || address.phone || payload.phone,
        },
        p_items: lines.map((line) => ({
          variant_gid: variantGid(line),
          quantity: line.quantity || 1,
          unit_price: Number(line.price || 0),
          title: [line.title, line.variant_title].filter(Boolean).join(" · "),
        })),
        p_subtotal: Number(payload.current_subtotal_price || payload.subtotal_price || 0),
        p_total: Number(payload.current_total_price || payload.total_price || 0),
        p_discount: Number(payload.current_total_discounts || payload.total_discounts || 0),
        p_gateway: Array.isArray(payload.payment_gateway_names) ? payload.payment_gateway_names.join(", ") : String(payload.gateway || ""),
      });
      if (error) throw error;
    } else if (topic === "orders/cancelled" && integration?.sync_vendas) {
      const { error } = await db.rpc("shopify_importar_cancelamento", {
        p_org: org, p_order_gid: externalId, p_motivo: String(payload.cancel_reason || "Cancelamento na Shopify"),
      });
      if (error) throw error;
    } else if (topic === "refunds/create" && integration?.sync_vendas) {
      const orderId = String(payload.order_id ? `gid://shopify/Order/${payload.order_id}` : "");
      const refundLines = (payload.refund_line_items || []) as Array<{ quantity?: number; line_item?: ShopifyLine }>;
      const { error } = await db.rpc("shopify_importar_reembolso", {
        p_org: org,
        p_order_gid: orderId,
        p_refund_gid: String(payload.admin_graphql_api_id || `gid://shopify/Refund/${payload.id}`),
        p_items: refundLines.map((item) => ({ variant_gid: variantGid(item.line_item || {}), quantity: item.quantity || 0 })),
      });
      if (error) throw error;
    } else if (topic === "inventory_levels/update" && integration?.sync_estoque) {
      const inventoryGid = `gid://shopify/InventoryItem/${payload.inventory_item_id}`;
      const { data: mapping } = await db.from("shopify_produto_mapeamentos")
        .select("shopify_variant_gid").eq("organization_id", org).eq("inventory_item_gid", inventoryGid).eq("status", "ativo").maybeSingle();
      if (mapping) {
        const { error } = await db.rpc("shopify_definir_estoque", {
          p_org: org,
          p_variant_gid: mapping.shopify_variant_gid,
          p_available: Number(payload.available || 0),
          p_reference: deliveryId,
        });
        if (error) throw error;
      }
    }
    await db.from("shopify_eventos").update({ status: "concluido", external_id: externalId, processed_at: new Date().toISOString(), erro: null }).eq("delivery_id", deliveryId);
    await db.from("shopify_integracoes").update({ last_sync_at: new Date().toISOString(), last_error: null }).eq("organization_id", integration?.organization_id || "");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    await db.from("shopify_eventos").update({ status: "erro", erro: message.slice(0, 1000), processed_at: new Date().toISOString() }).eq("delivery_id", deliveryId);
    if (integration) await db.from("shopify_integracoes").update({ last_error: message.slice(0, 1000) }).eq("organization_id", integration.organization_id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
