"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Link2, LoaderCircle, RefreshCw, ShoppingBag, Unplug } from "lucide-react";
import { shopifyApi } from "@/lib/shopify/client";

type Status = {
  configured: boolean;
  integration: null | {
    shop_domain: string;
    location_name: string | null;
    status: string;
    sync_vendas: boolean;
    sync_estoque: boolean;
    last_sync_at: string | null;
    last_error: string | null;
  };
  mapped: number;
  pending: number;
};
type ShopifyVariant = { id: string; title: string; sku: string | null; inventoryQuantity: number; product: { id: string; title: string }; inventoryItem: { id: string } };
type Product = { id: string; nome: string; marca: string | null; estoque: number; tem_variacoes: boolean };
type ProductVariant = { id: string; produto_id: string; tamanho: string | null; cor: string | null; sku: string | null; codigo_barras: string | null; estoque: number };
type Mapping = { produto_id: string; variacao_id: string | null; shopify_variant_gid: string };
type Catalog = { variants: ShopifyVariant[]; products: Product[]; productVariants: ProductVariant[]; mappings: Mapping[]; locationGid: string };
export function ShopifySection() {
  const [status, setStatus] = useState<Status | null>(null);
  const [shop, setShop] = useState("");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadStatus = useCallback(async () => {
    try {
      const result = await shopifyApi<Status>("/api/shopify/status");
      setStatus(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar a integração.");
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    const params = new URLSearchParams(window.location.search);
    if (params.get("shopify") === "conectada") setSuccess("Shopify conectada. Agora confira os vínculos dos produtos.");
    if (params.get("shopify") === "erro") setError(params.get("mensagem") || "A conexão com a Shopify não foi concluída.");
  }, [loadStatus]);

  const nexoOptions = useMemo(() => {
    if (!catalog) return [] as Array<{ value: string; label: string; sku: string | null }>;
    const variantsByProduct = new Map<string, ProductVariant[]>();
    for (const variant of catalog.productVariants) {
      const list = variantsByProduct.get(variant.produto_id) || [];
      list.push(variant);
      variantsByProduct.set(variant.produto_id, list);
    }
    return catalog.products.flatMap((product) => {
      const variants = variantsByProduct.get(product.id) || [];
      if (product.tem_variacoes) {
        return variants.map((variant) => ({
          value: `${product.id}:${variant.id}`,
          label: `${product.nome} · ${[variant.tamanho, variant.cor].filter(Boolean).join(" / ") || "Variação"} · estoque ${variant.estoque}`,
          sku: variant.sku || variant.codigo_barras,
        }));
      }
      return [{ value: `${product.id}:`, label: `${product.nome} · estoque ${product.estoque}`, sku: null }];
    });
  }, [catalog]);

  async function connect() {
    setBusy("connect"); setError(""); setSuccess("");
    try {
      const result = await shopifyApi<{ authorizationUrl: string }>("/api/shopify/connect", { method: "POST", body: JSON.stringify({ shop }) });
      window.location.assign(result.authorizationUrl);
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Não foi possível conectar.");
      setBusy("");
    }
  }

  async function loadCatalog() {
    setBusy("catalog"); setError(""); setSuccess("");
    try {
      const result = await shopifyApi<Catalog>("/api/shopify/catalog");
      const initial: Record<string, string> = {};
      const optionBySku = new Map<string, string>();
      for (const variant of result.productVariants) {
        const sku = (variant.sku || variant.codigo_barras)?.trim().toLowerCase();
        if (sku) optionBySku.set(sku, `${variant.produto_id}:${variant.id}`);
      }
      for (const variant of result.variants) {
        const existing = result.mappings.find((mapping) => mapping.shopify_variant_gid === variant.id);
        if (existing) initial[variant.id] = `${existing.produto_id}:${existing.variacao_id || ""}`;
        else if (variant.sku) initial[variant.id] = optionBySku.get(variant.sku.trim().toLowerCase()) || "";
      }
      setCatalog(result);
      setChoices(initial);
    } catch (catalogError) {
      setError(catalogError instanceof Error ? catalogError.message : "Falha ao carregar produtos.");
    } finally {
      setBusy("");
    }
  }

  async function saveMappings() {
    if (!catalog) return;
    const mappings = catalog.variants.flatMap((variant) => {
      const choice = choices[variant.id];
      if (!choice) return [];
      const [produtoId, variacaoId] = choice.split(":");
      return [{
        produtoId,
        variacaoId: variacaoId || null,
        shopifyProductGid: variant.product.id,
        shopifyVariantGid: variant.id,
        inventoryItemGid: variant.inventoryItem.id,
        locationGid: catalog.locationGid,
        title: `${variant.product.title} · ${variant.title}`,
        sku: variant.sku,
      }];
    });
    setBusy("save"); setError(""); setSuccess("");
    try {
      const result = await shopifyApi<{ saved: number }>("/api/shopify/mappings", { method: "PUT", body: JSON.stringify({ mappings }) });
      setSuccess(`${result.saved} variante(s) vinculada(s) com segurança.`);
      await loadStatus();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Falha ao salvar vínculos.");
    } finally {
      setBusy("");
    }
  }

  async function syncNow() {
    setBusy("sync"); setError(""); setSuccess("");
    try {
      const result = await shopifyApi<{ processed: number; errors: number }>("/api/shopify/sync", { method: "POST" });
      setSuccess(`${result.processed} atualização(ões) enviada(s).${result.errors ? ` ${result.errors} aguardam nova tentativa.` : ""}`);
      await loadStatus();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Falha ao sincronizar.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="rounded-[30px] border border-[#e8ecf4] bg-white p-6" aria-labelledby="shopify-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#ecfdf5] text-[#047857]"><ShoppingBag className="h-5 w-5" aria-hidden="true" /></div>
          <div>
            <h2 id="shopify-title" className="text-xl font-black tracking-tight text-[#0f172a]">Shopify</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[#64748b]">Importe vendas e clientes e mantenha o estoque das duas plataformas alinhado por variante.</p>
          </div>
        </div>
        {status?.integration ? (
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#ecfdf5] px-3 py-1.5 text-xs font-bold text-[#047857]"><CheckCircle2 className="h-4 w-4" />Conectada</span>
        ) : null}
      </div>

      {error ? <div className="mt-4 rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-4 text-sm text-[#b91c1c]" role="alert">{error}</div> : null}
      {success ? <div className="mt-4 rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] p-4 text-sm text-[#15803d]" role="status">{success}</div> : null}

      {status && !status.configured ? (
        <div className="mt-5 rounded-2xl border border-[#fde68a] bg-[#fffbeb] p-4 text-sm leading-6 text-[#92400e]">
          A estrutura da integração está pronta. Falta somente concluir a autorização segura da Shopify para liberar a conexão desta empresa.
        </div>
      ) : !status?.integration ? (
        <div className="mt-5 rounded-2xl border border-[#e8ecf4] bg-[#f8fafc] p-4">
          <label htmlFor="shopify-domain" className="text-sm font-bold text-[#334155]">Endereço permanente da loja</label>
          <p className="mt-1 text-xs text-[#64748b]">Use o domínio <b>minha-loja.myshopify.com</b>, mesmo que o site tenha domínio próprio.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input id="shopify-domain" value={shop} onChange={(event) => setShop(event.target.value)} placeholder="minha-loja.myshopify.com" autoCapitalize="none" autoCorrect="off" className="min-w-0 flex-1 rounded-2xl border border-[#dbe3ef] bg-white px-4 py-3 text-sm outline-none focus:border-[#2563eb]" />
            <button type="button" onClick={connect} disabled={busy === "connect" || !shop.trim()} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#2563eb] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#1d4ed8] disabled:opacity-50">
              {busy === "connect" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}Conectar Shopify
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Info label="Loja" value={status.integration.shop_domain} />
            <Info label="Local de estoque" value={status.integration.location_name || "Principal"} />
            <Info label="Variantes vinculadas" value={String(status.mapped)} />
            <Info label="Fila de estoque" value={status.pending ? `${status.pending} pendente(s)` : "Em dia"} alert={status.pending > 0} />
          </div>
          {status.integration.last_error ? <p className="mt-3 rounded-2xl bg-[#fff7ed] px-4 py-3 text-sm text-[#c2410c]">Atenção: {status.integration.last_error}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={loadCatalog} disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-2xl border border-[#dbe3ef] bg-white px-4 py-2.5 text-sm font-bold text-[#334155] hover:bg-[#f8fafc] disabled:opacity-50">
              {busy === "catalog" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}Vincular produtos
            </button>
            <button type="button" onClick={syncNow} disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-2xl border border-[#dbe3ef] bg-white px-4 py-2.5 text-sm font-bold text-[#334155] hover:bg-[#f8fafc] disabled:opacity-50">
              {busy === "sync" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Sincronizar agora
            </button>
          </div>
        </>
      )}

      {catalog ? (
        <div className="mt-6 border-t border-[#e8ecf4] pt-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div><h3 className="font-black text-[#0f172a]">Pareamento de variantes</h3><p className="mt-1 text-xs leading-5 text-[#64748b]">Cada linha da Shopify deve apontar para exatamente um produto ou tamanho no Nexo. SKUs iguais são sugeridos automaticamente. Ao salvar, o estoque atual do Nexo será usado como quantidade inicial na Shopify.</p></div>
            <span className="text-xs font-bold text-[#64748b]">{catalog.variants.length} variante(s) na Shopify</span>
          </div>
          <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-1 [content-visibility:auto]">
            {catalog.variants.map((variant) => (
              <div key={variant.id} className="grid gap-3 rounded-2xl border border-[#e8ecf4] p-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,1.3fr)] lg:items-center">
                <div className="min-w-0"><p className="truncate text-sm font-bold text-[#0f172a]">{variant.product.title}{variant.title !== "Default Title" ? ` · ${variant.title}` : ""}</p><p className="mt-1 text-xs text-[#64748b]">SKU {variant.sku || "não informado"} · Shopify {variant.inventoryQuantity} un.</p></div>
                <label className="sr-only" htmlFor={`map-${variant.id}`}>Produto Nexo para {variant.product.title}</label>
                <select id={`map-${variant.id}`} value={choices[variant.id] || ""} onChange={(event) => setChoices((current) => ({ ...current, [variant.id]: event.target.value }))} className="min-w-0 rounded-xl border border-[#dbe3ef] bg-[#f8fafc] px-3 py-2.5 text-sm text-[#334155] outline-none focus:border-[#2563eb]">
                  <option value="">Não vinculado</option>
                  {nexoOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            ))}
          </div>
          <button type="button" onClick={saveMappings} disabled={busy === "save" || !Object.values(choices).some(Boolean)} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-[#0f172a] px-5 py-3 text-sm font-bold text-white hover:bg-[#1e293b] disabled:opacity-50">
            {busy === "save" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Salvar vínculos
          </button>
        </div>
      ) : null}

      <div className="mt-5 flex items-start gap-2 rounded-2xl bg-[#f8fafc] px-4 py-3 text-xs leading-5 text-[#64748b]"><Unplug className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>Produtos sem vínculo não são baixados automaticamente; o evento fica sinalizado para correção, sem adivinhar pelo nome.</span></div>
    </section>
  );
}

function Info({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) {
  return <div className="rounded-2xl bg-[#f8fafc] p-4"><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#94a3b8]">{label}</p><p className={`mt-1 truncate text-sm font-black ${alert ? "text-[#c2410c]" : "text-[#0f172a]"}`} title={value}>{value}</p></div>;
}
