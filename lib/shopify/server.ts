import "server-only";

import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-10";
export const SHOPIFY_SCOPES = [
  "read_orders",
  "read_customers",
  "read_products",
  "read_inventory",
  "write_inventory",
  "read_locations",
].join(",");

type AppUser = { id: string; organizationId: string; papel: string };

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Configuração ausente: ${name}`);
  return value;
}

export function serviceClient(): SupabaseClient {
  return createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export async function requireAppUser(request: Request, papeis = ["owner", "gerente"]): Promise<AppUser> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Sessão não informada.");
  const userClient = createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    }
  );
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) throw new Error("Sessão inválida ou expirada.");
  const [{ data: org, error: orgError }, { data: papel, error: papelError }] = await Promise.all([
    userClient.rpc("current_org_id"),
    userClient.rpc("current_papel"),
  ]);
  if (orgError || papelError || !org || !papel) throw new Error("Empresa ativa não encontrada.");
  if (!papeis.includes(String(papel))) throw new Error("Seu perfil não pode administrar a Shopify.");
  return { id: authData.user.id, organizationId: String(org), papel: String(papel) };
}

export function normalizeShopDomain(input: string) {
  const value = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const domain = value.includes(".") ? value : `${value}.myshopify.com`;
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) {
    throw new Error("Informe o endereço permanente da loja, como sua-loja.myshopify.com.");
  }
  return domain;
}

export function encryptToken(token: string) {
  const key = Buffer.from(required("SHOPIFY_TOKEN_ENCRYPTION_KEY"), "base64");
  if (key.length !== 32) throw new Error("SHOPIFY_TOKEN_ENCRYPTION_KEY precisa ter 32 bytes em base64.");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptToken(value: string) {
  const [version, ivEncoded, tagEncoded, encryptedEncoded] = value.split(".");
  if (version !== "v1" || !ivEncoded || !tagEncoded || !encryptedEncoded) throw new Error("Token Shopify inválido.");
  const key = Buffer.from(required("SHOPIFY_TOKEN_ENCRYPTION_KEY"), "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivEncoded, "base64url"));
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedEncoded, "base64url")), decipher.final()]).toString("utf8");
}

export function hashState(state: string) {
  return crypto.createHash("sha256").update(state).digest("hex");
}

export function verifyOAuthHmac(params: URLSearchParams) {
  const hmac = params.get("hmac") || "";
  const message = [...params.entries()]
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const expected = crypto.createHmac("sha256", required("SHOPIFY_CLIENT_SECRET")).update(message).digest("hex");
  return safeEqual(expected, hmac);
}

export function verifyWebhookHmac(rawBody: string, hmac: string | null) {
  if (!hmac) return false;
  const expected = crypto.createHmac("sha256", required("SHOPIFY_CLIENT_SECRET")).update(rawBody).digest("base64");
  return safeEqual(expected, hmac);
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function shopifyGraphql<T>(shop: string, token: string, query: string, variables: Record<string, unknown> = {}) {
  const response = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-shopify-access-token": token },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const json = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (!response.ok || json.errors?.length) {
    throw new Error(json.errors?.map((item) => item.message).join("; ") || `Shopify respondeu ${response.status}.`);
  }
  if (!json.data) throw new Error("A Shopify não retornou os dados esperados.");
  return json.data;
}

export async function loadIntegration(organizationId: string) {
  const db = serviceClient();
  const { data, error } = await db.from("shopify_integracoes").select("*").eq("organization_id", organizationId).maybeSingle();
  if (error) throw error;
  if (!data || data.status !== "ativa") throw new Error("A Shopify ainda não está conectada nesta empresa.");
  return { db, integration: data, token: decryptToken(data.access_token_enc) };
}

export async function registerWebhooks(shop: string, token: string, appUrl: string) {
  const topics = ["ORDERS_PAID", "ORDERS_CANCELLED", "REFUNDS_CREATE", "INVENTORY_LEVELS_UPDATE", "APP_UNINSTALLED"];
  const uri = `${appUrl}/api/shopify/webhooks`;
  const existing = await shopifyGraphql<{
    webhookSubscriptions: { nodes: Array<{ topic: string; uri: string }> };
  }>(shop, token, `query ExistingWebhooks {
    webhookSubscriptions(first: 100) { nodes { topic uri } }
  }`);
  const mutation = `mutation CreateWebhook($topic: WebhookSubscriptionTopic!, $uri: URL!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: { uri: $uri, format: JSON }) {
      webhookSubscription { id topic uri }
      userErrors { field message }
    }
  }`;
  for (const topic of topics) {
    if (existing.webhookSubscriptions.nodes.some((item) => item.topic === topic && item.uri === uri)) continue;
    const data = await shopifyGraphql<{
      webhookSubscriptionCreate: { userErrors: Array<{ message: string }> };
    }>(shop, token, mutation, { topic, uri });
    const errors = data.webhookSubscriptionCreate.userErrors;
    if (errors.length) throw new Error(`Webhook ${topic}: ${errors.map((item) => item.message).join("; ")}`);
  }
}

export function publicAppUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://usenexogestao.com.br").replace(/\/$/, "");
}
