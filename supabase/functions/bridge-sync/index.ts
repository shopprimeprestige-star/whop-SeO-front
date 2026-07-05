// bridge-sync — chiama POST {bridge_site_url}/api/sync e aggiorna store_stats + variant_cache.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { authenticateAdmin, corsHeaders, errorResponse, getEnv, jsonResponse } from "../_shared/http.ts";
import { decryptString } from "../_shared/crypto.ts";

function romeDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("POST only", 405);

  const auth = await authenticateAdmin(req);
  if (!auth.ok) return errorResponse(auth.error, auth.status);

  let body: { store_id?: string };
  try { body = await req.json(); } catch { return errorResponse("Invalid JSON", 400); }
  if (!body.store_id) return errorResponse("store_id required", 400);

  const sb: any = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"));
  const { data: store } = await sb.from("stores")
    .select("id, shop_domain, bridge_site_url, bridge_api_key_encrypted")
    .eq("id", body.store_id).maybeSingle();
  if (!store) return errorResponse("Store not found", 404);
  if (!store.bridge_site_url) return errorResponse("bridge_site_url not configured", 400);

  const apiKey = await decryptString(store.bridge_api_key_encrypted);
  if (!apiKey) return errorResponse("bridge_api_key not configured", 400);

  let base = String(store.bridge_site_url).trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  const url = `${base}/api/public/bridge/sync`;
  const startedAt = Date.now();

  let resp: any = null;
  let httpStatus: number | null = null;
  let errorMessage: string | null = null;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Bridge-Api-Key": apiKey },
      body: JSON.stringify({ store_id: store.id }),
    });
    httpStatus = r.status;
    const text = await r.text();
    try { resp = text ? JSON.parse(text) : null; } catch { resp = { raw: text.slice(0, 2000) }; }
    if (!r.ok) {
      const remoteMsg = resp?.error || resp?.message || resp?.raw || text.slice(0, 500);
      errorMessage = `Sito B HTTP ${r.status}: ${remoteMsg}`;
    }
  } catch (e: any) {
    errorMessage = `Network: ${e?.message || String(e)}`;
  }

  if (errorMessage) {
    await sb.from("stores").update({
      bridge_status: "error",
      bridge_last_error: errorMessage.slice(0, 1000),
    }).eq("id", store.id);
    return jsonResponse({ ok: false, error: errorMessage, http_status: httpStatus, url, response: resp }, 502);
  }

  // Aggiorna store_stats per oggi
  const today = romeDateKey();
  const dailyOrders = Number(resp?.daily_orders ?? resp?.data?.today?.orders_paid ?? 0);
  const dailyRevenue = Number(resp?.daily_revenue ?? resp?.data?.today?.paid ?? resp?.data?.today?.net ?? 0);
  const totalOrders = Number(resp?.total_orders ?? resp?.data?.lifetime?.orders_paid ?? 0);
  const totalRevenue = Number(resp?.total_revenue ?? resp?.data?.lifetime?.paid ?? resp?.data?.lifetime?.net ?? 0);

  const { data: existing } = await sb.from("store_stats")
    .select("id").eq("store_id", store.id).eq("date", today).maybeSingle();

  if (existing) {
    await sb.from("store_stats").update({
      shopify_daily_orders: dailyOrders,
      shopify_daily_revenue: dailyRevenue,
      shopify_total_orders: totalOrders,
      shopify_total_revenue: totalRevenue,
      last_sync: new Date().toISOString(),
    }).eq("id", existing.id);
  } else {
    await sb.from("store_stats").insert({
      store_id: store.id, date: today,
      shopify_daily_orders: dailyOrders,
      shopify_daily_revenue: dailyRevenue,
      shopify_total_orders: totalOrders,
      shopify_total_revenue: totalRevenue,
      last_sync: new Date().toISOString(),
    });
  }

  // cap_window_revenue = revenue di oggi (autoritativo da Sito B)
  await sb.from("stores").update({
    cap_window_revenue: dailyRevenue,
  }).eq("id", store.id);

  // Aggiorna online flag se presente
  if (typeof resp?.store_online === "boolean") {
    await sb.from("stores").update({
      is_online: resp.store_online,
      health_status: resp.store_online ? "online" : "offline",
      last_online: resp.store_online ? new Date().toISOString() : undefined,
    }).eq("id", store.id);
  }

  // Aggiorna variant cache
  const variants = Array.isArray(resp?.variants) ? resp.variants : [];
  let variantsCached = 0;
  for (const v of variants) {
    if (!v?.handle || !v?.id) continue;
    const label = v.label || v.title || "Default";
    const cacheKey = `variant_${store.id}_${v.handle}_${label}`;
    await sb.from("variant_cache").upsert({
      cache_key: cacheKey,
      store_id: store.id,
      product_slug: v.handle,
      variant_data: { id: v.id, title: v.title || label, price: v.price },
      last_used: new Date().toISOString(),
    }, { onConflict: "cache_key" });
    variantsCached++;
  }

  await sb.from("stores").update({
    bridge_status: "connected",
    bridge_last_sync: new Date().toISOString(),
    bridge_last_error: null,
  }).eq("id", store.id);

  return jsonResponse({
    ok: true,
    duration_ms: Date.now() - startedAt,
    daily_orders: dailyOrders,
    daily_revenue: dailyRevenue,
    total_orders: totalOrders,
    total_revenue: totalRevenue,
    variants_cached: variantsCached,
    store_online: resp?.store_online ?? null,
  });
});
