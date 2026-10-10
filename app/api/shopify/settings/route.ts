import { NextResponse } from "next/server";
import { requireAppUser, serviceClient } from "@/lib/shopify/server";

export async function PATCH(request: Request) {
  try {
    const user = await requireAppUser(request, ["owner"]);
    const body = (await request.json()) as { syncVendas?: boolean; syncEstoque?: boolean };
    const { error } = await serviceClient().from("shopify_integracoes").update({
      sync_vendas: body.syncVendas !== false,
      sync_estoque: body.syncEstoque !== false,
      updated_at: new Date().toISOString(),
    }).eq("organization_id", user.organizationId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao salvar." }, { status: 400 });
  }
}
