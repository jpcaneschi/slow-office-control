import { NextResponse } from "next/server";
import { requireAppUser, serviceClient } from "@/lib/shopify/server";

export async function GET(request: Request) {
  try {
    const user = await requireAppUser(request);
    const configured = Boolean(
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      process.env.SHOPIFY_CLIENT_ID &&
      process.env.SHOPIFY_CLIENT_SECRET &&
      process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY
    );
    if (!configured) {
      return NextResponse.json({ configured: false, integration: null, mapped: 0, pending: 0 });
    }
    const db = serviceClient();
    const [{ data: integration, error }, { count: mapped }, { count: pending }] = await Promise.all([
      db.from("shopify_integracoes")
        .select("shop_domain,location_name,status,sync_vendas,sync_estoque,last_sync_at,last_error")
        .eq("organization_id", user.organizationId).maybeSingle(),
      db.from("shopify_produto_mapeamentos").select("id", { count: "exact", head: true })
        .eq("organization_id", user.organizationId).eq("status", "ativo"),
      db.from("shopify_sync_outbox").select("id", { count: "exact", head: true })
        .eq("organization_id", user.organizationId).in("status", ["pendente", "erro"]),
    ]);
    if (error) throw error;
    return NextResponse.json({ configured: true, integration, mapped: mapped || 0, pending: pending || 0 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar a integração." }, { status: 400 });
  }
}
