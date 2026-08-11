import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Webhook do provedor de checkout (Kiwify / Cacto / etc.).
// Recebe a notificação de compra/assinatura e atualiza public.subscriptions.
// Roda com service_role (bypassa RLS). Nunca importe isto no client.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    { auth: { persistSession: false } }
  );
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
  // Verificação por token compartilhado (configure o mesmo token no provedor).
  const token = req.nextUrl.searchParams.get("token");
  const esperado = process.env.BILLING_WEBHOOK_TOKEN;
  if (!esperado || token !== esperado) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: unknown = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
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

  if (!email) {
    return NextResponse.json({ ok: true, ignored: "sem email no payload" });
  }

  const db = admin();

  // Correlaciona pelo e-mail do dono (membership).
  const { data: membro } = await db
    .from("organization_members")
    .select("organization_id")
    .ilike("email", email)
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
  ]);

  const { error } = await db.from("subscriptions").upsert(
    {
      organization_id: membro.organization_id,
      provider: pick(payload, ["provider"]) || "checkout",
      external_id: externalId,
      email,
      status,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status });
}
