import { NextResponse } from "next/server";
import {
  SHOPIFY_API_VERSION,
  encryptToken,
  hashState,
  normalizeShopDomain,
  publicAppUrl,
  registerWebhooks,
  serviceClient,
  shopifyGraphql,
  verifyOAuthHmac,
} from "@/lib/shopify/server";

export async function GET(request: Request) {
  const appUrl = publicAppUrl();
  try {
    const url = new URL(request.url);
    if (!verifyOAuthHmac(url.searchParams)) throw new Error("Assinatura OAuth inválida.");
    const shop = normalizeShopDomain(url.searchParams.get("shop") || "");
    const state = url.searchParams.get("state") || "";
    const code = url.searchParams.get("code") || "";
    if (!state || !code) throw new Error("Autorização incompleta.");
    const db = serviceClient();
    const { data: oauth, error: oauthError } = await db
      .from("shopify_oauth_states")
      .select("organization_id,shop_domain,expires_at,consumed_at")
      .eq("state_hash", hashState(state))
      .maybeSingle();
    if (oauthError || !oauth || oauth.shop_domain !== shop || oauth.consumed_at || new Date(oauth.expires_at).getTime() < Date.now()) {
      throw new Error("A autorização expirou. Inicie a conexão novamente.");
    }
    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_CLIENT_ID,
        client_secret: process.env.SHOPIFY_CLIENT_SECRET,
        code,
      }),
      cache: "no-store",
    });
    const tokenPayload = (await tokenResponse.json()) as { access_token?: string; scope?: string; error_description?: string };
    if (!tokenResponse.ok || !tokenPayload.access_token) throw new Error(tokenPayload.error_description || "A Shopify não liberou o acesso.");
    const token = tokenPayload.access_token;
    const shopData = await shopifyGraphql<{
      shop: { name: string };
      locations: { nodes: Array<{ id: string; name: string; isActive: boolean }> };
    }>(shop, token, `query IntegrationLocation {
      shop { name }
      locations(first: 20) { nodes { id name isActive } }
    }`);
    const location = shopData.locations.nodes.find((item) => item.isActive) || shopData.locations.nodes[0];
    if (!location) throw new Error("Nenhum local de estoque ativo foi encontrado na Shopify.");
    await registerWebhooks(shop, token, appUrl);
    const { error: upsertError } = await db.from("shopify_integracoes").upsert({
      organization_id: oauth.organization_id,
      shop_domain: shop,
      access_token_enc: encryptToken(token),
      scopes: (tokenPayload.scope || "").split(",").filter(Boolean),
      location_gid: location.id,
      location_name: location.name,
      status: "ativa",
      connected_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    });
    if (upsertError) throw upsertError;
    await db.from("shopify_oauth_states").update({ consumed_at: new Date().toISOString() }).eq("state_hash", hashState(state));
    return NextResponse.redirect(`${appUrl}/dashboard/configuracoes?shopify=conectada&api=${SHOPIFY_API_VERSION}`);
  } catch (error) {
    const message = encodeURIComponent(error instanceof Error ? error.message : "Falha ao conectar a Shopify.");
    return NextResponse.redirect(`${appUrl}/dashboard/configuracoes?shopify=erro&mensagem=${message}`);
  }
}
