import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";

// Webhook do provedor de checkout (Kiwify / Cacto / etc.).
// Recebe a notificação de compra/assinatura e atualiza public.subscriptions.
// Roda com service_role (bypassa RLS). Nunca importe isto no client.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Billing webhook is not configured");
  return createClient(
    url,
    key,
    { auth: { persistSession: false } }
  );
}

function tokenValido(recebido: string, esperado: string) {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Normaliza o status do provedor para o nosso vocabulário.
function mapStatus(raw: string): string {
  const s = (raw || "").toLowerCase();
  const bate = (lista: string[]) => lista.some((x) => s.includes(x));
  if (
    bate([
      "paid",
      "approved",
      "aprovada",
      "active",
      "ativa",
      "completed",
      "renewed",
      "renovada",
      "subscription_renewed",
    ])
  )
    return "ativa";
  if (
    bate([
      "cancel",
      "cancelada",
      "refund",
      "reembols",
      "chargeback",
      "expired",
      "expirada",
    ])
  )
    return "cancelada";
  if (bate(["past_due", "atrasad", "overdue", "late", "waiting", "pending", "pendente"]))
    return "atrasada";
  return "inativa";
}

// Busca tolerante de um campo em vários caminhos possíveis do payload.
function pick(obj: unknown, caminhos: string[]): string | null {
  for (const caminho of caminhos) {
    let cur: unknown = obj;
    for (const parte of caminho.split(".")) {
      if (cur && typeof cur === "object" && parte in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[parte];
      } else {
        cur = undefined;
        break;
      }
    }
    if (typeof cur === "string" && cur.trim()) return cur.trim();
    if (typeof cur === "number") return String(cur);
  }
  return null;
}

export async function POST(req: NextRequest) {
  // O segredo vai em header, nunca na URL (URLs aparecem em logs e histórico).
  const authorization = req.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : req.headers.get("x-webhook-token") || "";
  const esperado = process.env.BILLING_WEBHOOK_TOKEN;
  if (!esperado || !tokenValido(token, esperado)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limitePayload = 64 * 1024;
  const tamanhoDeclarado = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(tamanhoDeclarado) && tamanhoDeclarado > limitePayload) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  // Content-Length pode faltar (por exemplo, em transferências fragmentadas),
  // então o limite também precisa ser aplicado aos bytes realmente recebidos.
  let corpo: string;
  try {
    corpo = await req.text();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (Buffer.byteLength(corpo, "utf8") > limitePayload) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(corpo);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const email = pick(payload, [
    "customer.email",
    "buyer.email",
    "Customer.email",
    "data.customer.email",
    "data.buyer.email",
    "subscription.customer.email",
    "email",
  ]);
  const statusRaw =
    pick(payload, [
      "order_status",
      "status",
      "subscription_status",
      "data.status",
      "event",
      "type",
      "webhook_event_type",
    ]) || "";

  const emailNormalizado = email?.trim().toLowerCase() || "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado)) {
    return NextResponse.json({ ok: true, ignored: "sem email no payload" });
  }

  let db: ReturnType<typeof admin>;
  try {
    db = admin();
  } catch {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  // Correlaciona pelo e-mail do dono (membership).
  const { data: membro } = await db
    .from("organization_members")
    .select("organization_id")
    .eq("email", emailNormalizado)
    .limit(1)
    .maybeSingle();

  if (!membro?.organization_id) {
    return NextResponse.json({ ok: true, ignored: "empresa nao encontrada" });
  }

  const status = mapStatus(statusRaw);
  const externalId = pick(payload, [
    "order_id",
    "subscription_id",
    "id",
    "data.id",
    "transaction_id",
  ])?.slice(0, 200);
  const provider = (pick(payload, ["provider"]) || "checkout").slice(0, 80);

  const { error } = await db.from("subscriptions").upsert(
    {
      organization_id: membro.organization_id,
      provider,
      external_id: externalId,
      email: emailNormalizado,
      status,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" }
  );

  if (error) {
    console.error("Falha ao atualizar assinatura no webhook:", error.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status });
}
