import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  SHOPIFY_SCOPES,
  hashState,
  normalizeShopDomain,
  publicAppUrl,
  requireAppUser,
  serviceClient,
} from "@/lib/shopify/server";

export async function POST(request: Request) {
  try {
    const user = await requireAppUser(request, ["owner"]);
    const body = (await request.json()) as { shop?: string };
    const shop = normalizeShopDomain(body.shop || "");
    const state = crypto.randomBytes(32).toString("base64url");
    const db = serviceClient();
    const { error } = await db.from("shopify_oauth_states").insert({
      state_hash: hashState(state),
      organization_id: user.organizationId,
      user_id: user.id,
      shop_domain: shop,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    if (error) throw error;
    const params = new URLSearchParams({
      client_id: process.env.SHOPIFY_CLIENT_ID || "",
      scope: SHOPIFY_SCOPES,
      redirect_uri: `${publicAppUrl()}/api/shopify/callback`,
      state,
    });
    if (!params.get("client_id")) throw new Error("O aplicativo Shopify ainda não foi configurado.");
    return NextResponse.json({ authorizationUrl: `https://${shop}/admin/oauth/authorize?${params}` });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao iniciar a conexão." }, { status: 400 });
  }
}
