// Bridge (Sito A → Sito B) server functions.
// Replace supabase edge functions `bridge-handshake` / `bridge-checkout` with
// TanStack serverFns that talk to the Sito Ponte over HTTPS using the per-store
// API key.

import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const FALLBACK_BACKEND_URL = "https://dcxsuyuvsmecaniakavr.supabase.co";
const FALLBACK_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjeHN1eXV2c21lY2FuaWFrYXZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NjQwNDMsImV4cCI6MjA5NjQ0MDA0M30.7Rj2_3Ms8T7kXteMvN8TOlIhRJHQTgtMR371Q0wnjgQ";

function getBackendUrl() {
  return (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || FALLBACK_BACKEND_URL).replace(/\/+$/, "");
}

function getPublishableKey() {
  return (
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    FALLBACK_PUBLISHABLE_KEY
  );
}

function getBridgeCallbackUrl() {
  // Edge function (service role) che marca conversione + fatturato per-store su Sito A.
  return `${getBackendUrl()}/functions/v1/bridge-callback`;
}

type StoreRow = {
  id: string;
  shop_domain: string | null;
  bridge_site_url: string | null;
  product_push_url?: string | null;
  bridge_api_key_encrypted: string | null;
  hmac_secret_encrypted?: string | null;
  lovable_sync_enabled?: boolean | null;
  lovable_sync_url?: string | null;
  lovable_sync_api_key_encrypted?: string | null;
  lovable_sync_hmac_secret_encrypted?: string | null;
  lovable_sync_store_ref?: string | null;
  lovable_sync_default_currency?: string | null;
  lovable_sync_default_locale?: string | null;
  integration_type: string | null;
  is_active?: boolean | null;
  bridge_status?: string | null;
};

const STORE_SELECT = "id, shop_domain, bridge_site_url, product_push_url, bridge_api_key_encrypted, hmac_secret_encrypted, lovable_sync_enabled, lovable_sync_url, lovable_sync_api_key_encrypted, lovable_sync_hmac_secret_encrypted, lovable_sync_store_ref, lovable_sync_default_currency, lovable_sync_default_locale, integration_type, is_active, bridge_status";

// SUPABASE_SERVICE_ROLE_KEY is not available in the Lovable Cloud Worker runtime.
// Fall back to a client authenticated as the caller (admin), which has RLS access to `stores`.
async function getAdminClient() {
  const { requireUserFromRequest } = await import("@/lib/auth-guard.server");
  const { token } = await requireUserFromRequest();
  return createClient<Database>(getBackendUrl(), getPublishableKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

async function loadStore(storeId: string): Promise<StoreRow | null> {
  const supabaseAdmin = await getAdminClient();
  const { data, error } = await supabaseAdmin
    .from("stores")
    .select(STORE_SELECT)
    .eq("id", storeId)
    .maybeSingle();
  if (error) throw new Error(`load_store: ${error.message}`);
  return (data as StoreRow | null) ?? null;
}

async function pickCheckoutStore(): Promise<StoreRow | null> {
  // Seleziona uno store attivo, ponte connesso. Round-robin "semplice": ultimo connesso prima.
  const supabaseAdmin = await getAdminClient();
  const { data, error } = await supabaseAdmin
    .from("stores")
    .select(STORE_SELECT)
    .eq("is_active", true)
    .not("bridge_site_url", "is", null)
    .not("bridge_api_key_encrypted", "is", null)
    .in("bridge_status", ["connected", "ok"])
    .order("bridge_last_connected", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`pick_store: ${error.message}`);
  return (data as StoreRow | null) ?? null;
}

async function setBridgeStatus(
  storeId: string,
  status: string,
  fields: { error?: string | null; connected?: boolean } = {},
) {
  const supabaseAdmin = await getAdminClient();
  const patch: any = { bridge_status: status };
  if (fields.error !== undefined) patch.bridge_last_error = fields.error;
  if (fields.connected) patch.bridge_last_connected = new Date().toISOString();
  const { error } = await supabaseAdmin.from("stores").update(patch).eq("id", storeId);
  if (error) throw new Error(`set_bridge_status: ${error.message}`);
}

function cleanBridgeBase(raw: string): string {
  let base = String(raw || "").trim().replace(/\/+$/, "");
  if (base && !/^https?:\/\//i.test(base)) base = `https://${base}`;
  return base
    .replace(/\/api\/public\/bridge.*$/i, "")
    .replace(/\/api\/public.*$/i, "")
    .replace(/\/api\/.*$/i, "")
    .replace(/\/functions\/v1.*$/i, "")
    .replace(/\/+$/, "");
}

function parseBridgeBody(text: string): any {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function bridgeErrorMessage(status: number, statusText: string, bodyText: string, parsed: any, endpoint: string) {
  const remote = parsed?.error || parsed?.message || parsed?.detail || parsed?.details;
  const raw = typeof remote === "string" ? remote : bodyText;
  const compact = String(raw || statusText || "errore sconosciuto")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 700);
  if (status >= 500) {
    return `Sito B ${endpoint} risponde HTTP ${status}: errore interno sul Sito B. Dettaglio: ${compact || statusText || "nessun dettaglio"}`;
  }
  return `Sito B ${endpoint} HTTP ${status}: ${compact || statusText || "nessun dettaglio"}`;
}

/**
 * Sito A → Sito B handshake. Prova prima l'endpoint legacy stabile
 * /api/bridge/handshake, poi il nuovo /api/public/bridge/handshake se serve.
 */
export const bridgeHandshake = createServerFn({ method: "POST" })

  .inputValidator((data: { store_id: string }) => {
    if (!data?.store_id || typeof data.store_id !== "string") {
      throw new Error("store_id required");
    }
    return data;
  })
  .handler(async ({ data }): Promise<any> => {
    const { requireUserFromRequest } = await import("@/lib/auth-guard.server");
    await requireUserFromRequest();
    const t0 = Date.now();
    const store = await loadStore(data.store_id);
    if (!store) {
      return { ok: false, error: "Store non trovato", http_status: 404, duration_ms: Date.now() - t0, attempts: [] };
    }
    if (!store.bridge_site_url) {
      return { ok: false, error: "Sito Ponte non configurato", http_status: 0, duration_ms: Date.now() - t0, attempts: [] };
    }
    if (!store.bridge_api_key_encrypted) {
      return { ok: false, error: "Bridge API Key mancante", http_status: 0, duration_ms: Date.now() - t0, attempts: [] };
    }

    const base = cleanBridgeBase(store.bridge_site_url);
    const apiKey = store.bridge_api_key_encrypted;
    const attempts = [
      {
        endpoint: "/api/bridge/handshake",
        url: `${base}/api/bridge/handshake`,
        body: {
          store_id: store.id,
          shop_domain: store.shop_domain,
          integration_type: store.integration_type || "shopify",
          callback_url: getBridgeCallbackUrl(),
        },
      },
      {
        endpoint: "/api/public/bridge/handshake",
        url: `${base}/api/public/bridge/handshake`,
        body: {
          store_id: store.id,
          callback_url: getBridgeCallbackUrl(),
        },
      },
    ];

    let status = 0;
    let bodyText = "";
    const debugAttempts: Array<{ endpoint: string; url: string; http_status: number; response?: any }> = [];
    try {
      let lastError = "";
      for (const attempt of attempts) {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 10_000);
        let res: Response;
        try {
          res = await fetch(attempt.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
              "X-Bridge-Api-Key": apiKey,
            },
            body: JSON.stringify(attempt.body),
            signal: ctrl.signal,
          });
        } finally {
          clearTimeout(to);
        }
        status = res.status;
        bodyText = await res.text();
        const parsed = parseBridgeBody(bodyText);
        debugAttempts.push({ endpoint: attempt.endpoint, url: attempt.url, http_status: status, response: parsed ?? bodyText.slice(0, 700) });

        if (!res.ok || parsed?.ok === false) {
          lastError = bridgeErrorMessage(status, res.statusText, bodyText, parsed, attempt.endpoint);
          if (status === 404 || status >= 500) continue;
          await setBridgeStatus(store.id, "error", { error: lastError });
          return { ok: false, error: lastError, http_status: status, duration_ms: Date.now() - t0, attempts: debugAttempts };
        }

        await setBridgeStatus(store.id, "connected", { error: null, connected: true });
        return {
          ok: true,
          status: parsed?.status ?? "connected",
          http_status: status,
          duration_ms: Date.now() - t0,
          endpoint: attempt.endpoint,
          remote: parsed,
          attempts: debugAttempts,
        };
      }

      const msg = lastError || "Sito Ponte non ha risposto correttamente";
      await setBridgeStatus(store.id, "error", { error: msg });
      return { ok: false, error: msg, http_status: status, duration_ms: Date.now() - t0, attempts: debugAttempts };
    } catch (e: any) {
      const msg = e?.name === "AbortError" ? "Timeout (10s) raggiunto" : (e?.message || String(e));
      await setBridgeStatus(store.id, "error", { error: msg });
      return { ok: false, error: msg, http_status: status, duration_ms: Date.now() - t0, attempts: debugAttempts };
    }
  });

/**
 * Sito A → POST {bridge_site_url}/api/generate-checkout
 * Sito B genera un checkout (Shopify o nativo) e ritorna { redirect_url }.
 * Il browser viene rediretto lì.
 */
export const bridgeCheckoutFn = createServerFn({ method: "POST" })
  .inputValidator((data: any) => data ?? {})
  .handler(async ({ data }) => {
    const t0 = Date.now();
    const warmup = !!data?.warmup;

    const store = await pickCheckoutStore();
    if (!store) {
      return {
        ok: false,
        error: "Nessuno store con Sito Ponte connesso disponibile",
        attempts: 0,
        algorithm: "first-connected",
        duration_ms: Date.now() - t0,
      };
    }

    const base = (store.bridge_site_url || "").replace(/\/$/, "");
    const url = `${base}/api/generate-checkout`;
    const apiKey = store.bridge_api_key_encrypted!;

    // Normalizza payload per Sito B
    const items = Array.isArray(data?.items) && data.items.length
      ? data.items
      : data?.product_slug
        ? [{
            product_slug: data.product_slug,
            variant_label: data.variant_label,
            quantity: data.quantity || 1,
            unit_price: data.unit_price,
          }]
        : [];

    const payload = {
      store_id: store.id,
      shop_domain: store.shop_domain,
      integration_type: store.integration_type,
      items,
      currency: data?.currency,
      locale: data?.locale,
      language: data?.language,
      country: data?.country,
      accept_language: data?.accept_language,
      session_id: data?.session_id,
      warmup,
    };

    let status = 0;
    let bodyText = "";
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), warmup ? 5_000 : 15_000);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "X-Bridge-Api-Key": apiKey,
        },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      clearTimeout(to);
      status = res.status;
      bodyText = await res.text();

      let parsed: any = null;
      try { parsed = JSON.parse(bodyText); } catch { /* */ }

      if (!res.ok) {
        const msg = parsed?.error || `HTTP ${status}: ${bodyText.slice(0, 200) || res.statusText}`;
        return {
          ok: false,
          error: msg,
          http_status: status,
          store_id: store.id,
          attempts: 1,
          algorithm: "first-connected",
          duration_ms: Date.now() - t0,
        };
      }

      if (warmup) {
        return { ok: true, warmed: true, store_domain: store.shop_domain, attempts: 1, algorithm: "first-connected" };
      }

      const redirect_url = parsed?.redirect_url || parsed?.checkout_url;
      if (!redirect_url) {
        return {
          ok: false,
          error: "Sito Ponte non ha restituito redirect_url",
          http_status: status,
          attempts: 1,
          algorithm: "first-connected",
          duration_ms: Date.now() - t0,
          debug: parsed,
        };
      }

      return {
        ok: true,
        redirect_url,
        store_domain: store.shop_domain,
        attempts: 1,
        algorithm: "first-connected",
        debug: parsed,
      };
    } catch (e: any) {
      const msg = e?.name === "AbortError" ? "Timeout raggiunto" : (e?.message || String(e));
      return {
        ok: false,
        error: msg,
        http_status: status,
        attempts: 1,
        algorithm: "first-connected",
        duration_ms: Date.now() - t0,
      };
    }
  });

/**
 * Logica condivisa: Sito A → POST {bridge_site_url}/api/public/bridge/push-product
 *
 * Sincronizza un prodotto del Sito A nel catalogo nativo del Sito B
 * (shop_products + shop_variants), usando la STESSA bridge_api_key dello store
 * già impiegata per handshake e checkout. Nessun canale Shopify-shadow né Lovable.
 */
async function bridgePushProduct(data: { product_id: string; store_id?: string }, logTag = "syncProductToBridge") {
  const t0 = Date.now();
  const requestId = `sync_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const fail = (step: string, error: string, extra: Record<string, unknown> = {}) => {
    const result = { ok: false, error, step, request_id: requestId, duration_ms: Date.now() - t0, ...extra };
    console.error(`[${logTag}] failed`, result);
    return result;
  };

  try {
    const supabaseAdmin = await getAdminClient();
    const productResult = await supabaseAdmin
      .from("products")
      .select("id, name, slug, description_short, price, compare_price, images, variants")
      .eq("id", data.product_id)
      .maybeSingle() as any as { data: {
        id: string; name: string | null; slug: string | null; description_short: string | null;
        price: number | null; compare_price: number | null; images: any; variants: any;
      } | null; error: any };
    const product = productResult.data;
    if (productResult.error) return fail("load_product", productResult.error.message || String(productResult.error), { http_status: 500 });
    if (!product) return fail("load_product", "Prodotto non trovato", { http_status: 404 });

    const store = data.store_id ? await loadStore(data.store_id) : await pickCheckoutStore();
    if (!store) return fail("load_store", "Nessuno store connesso al Sito Ponte", { http_status: 404 });
    if (!store.bridge_site_url || !store.bridge_api_key_encrypted) {
      return fail("validate_store", "Sito Ponte non configurato (URL o Bridge API key mancante)", { store_id: store.id });
    }

    const apiKey = store.bridge_api_key_encrypted;
    const base = cleanBridgeBase(store.bridge_site_url);
    const url = `${base}/api/public/bridge/push-product`;

    // Prodotto ANONIMIZZATO verso Sito B: titolo + slug = codice PRD deterministico,
    // nessuna immagine inviata. Lo stesso codice è mostrato su Sito A nella colonna "Codice".
    const { prdCodeFor } = await import("@/lib/prd-code");
    const prd = prdCodeFor(product.id);
    const variantsIn = Array.isArray(product.variants) ? product.variants : [];
    const variants = (variantsIn.length ? variantsIn : [{ label: "Standard" }]).map((v: any) => ({
      label: String(v?.label || "Standard").slice(0, 200),
      price: v?.price != null ? Number(v.price) : null,
      sku: v?.sku ? String(v.sku).slice(0, 120) : null,
      color: v?.color ? String(v.color).slice(0, 80) : null,
      size: v?.size ? String(v.size).slice(0, 80) : null,
      stock: typeof v?.stock === "number" ? v.stock : null,
    }));

    const bodyObj = {
      store_id: store.id,
      product: {
        external_ref: product.id,
        prd_code: prd,
        title: prd,
        slug: prd,
        description: product.description_short ?? null,
        price: Number(product.price ?? 0) || 0,
        compare_price: product.compare_price != null ? Number(product.compare_price) : null,
        currency: "EUR",
        image_url: null,
        gallery: [],
        variants,
        published: true,
      },
    };
    const bodyText = JSON.stringify(bodyObj);

    const doFetch = async () => {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 25_000);
      try {
        return await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "X-Bridge-Api-Key": apiKey,
          },
          body: bodyText,
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(to);
      }
    };

    let res: Response;
    try {
      console.info(`[${logTag}] request`, { request_id: requestId, url, store_id: store.id, product_id: product.id });
      res = await doFetch();
      if (res.status >= 500) {
        await new Promise((r) => setTimeout(r, 1500));
        res = await doFetch();
      }
    } catch (e: any) {
      const msg = e?.name === "AbortError" ? "Timeout (25s) raggiunto" : (e?.message || String(e));
      return fail("fetch_site_b", msg, { http_status: 0, url, store_id: store.id });
    }

    const status = res.status;
    const respText = await res.text();
    let parsed: any = null;
    try { parsed = JSON.parse(respText); } catch { /* */ }

    if (status < 200 || status >= 300 || parsed?.ok === false) {
      const msg = parsed?.error || parsed?.message
        || bridgeErrorMessage(status, res.statusText, respText, parsed, "/api/public/bridge/push-product");
      return fail("site_b_response", msg, {
        http_status: status, url, store_id: store.id,
        response_text: respText.slice(0, 1500), debug: parsed,
      });
    }

    // Persisti l'esito sul prodotto: la pagina Sync mostra "inviato" + codice anche dopo refresh.
    let mappingSaved = false;
    try {
      const { data: cur } = await supabaseAdmin.from("products").select("bridge_shadow_map").eq("id", product.id).maybeSingle();
      const map = (((cur as { bridge_shadow_map?: Record<string, unknown> } | null)?.bridge_shadow_map) ?? {}) as Record<string, unknown>;
      map[store.id] = {
        shadow_handle: parsed?.slug ?? prd,
        slug: parsed?.slug ?? prd,
        prd_code: prd,
        updated_at: new Date().toISOString(),
      };
      const { error: mapErr } = await supabaseAdmin.from("products").update({ bridge_shadow_map: map } as never).eq("id", product.id);
      mappingSaved = !mapErr;
    } catch { /* colonna assente / RLS: non blocca il sync */ }

    return {
      ok: true,
      store_id: store.id,
      store_domain: store.shop_domain,
      product_id: parsed?.product_id ?? null,
      slug: parsed?.slug ?? null,
      prd_code: prd,
      mapping_saved: mappingSaved,
      variants: parsed?.variants ?? variants.length,
      remote: parsed,
      request_id: requestId,
      http_status: status,
      duration_ms: Date.now() - t0,
    };
  } catch (e: any) {
    return fail("unexpected", e?.message || String(e));
  }
}

export const syncProductToBridge = createServerFn({ method: "POST" })
  .inputValidator((data: { product_id: string; store_id?: string }) => {
    if (!data?.product_id) throw new Error("product_id required");
    return data;
  })
  .handler(async ({ data }) => {
    const { requireUserFromRequest } = await import("@/lib/auth-guard.server");
    await requireUserFromRequest();
    return bridgePushProduct(data, "syncProductToBridge");
  });
