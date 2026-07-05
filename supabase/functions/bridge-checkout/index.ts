// bridge-checkout — chiamato dal frontend al click "Acquista".
// Seleziona store via rotazione esistente, chiama gli endpoint checkout del Sito Ponte
// e ritorna { redirect_url } al browser.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders, errorResponse, getEnv, jsonResponse } from "../_shared/http.ts";
import { decryptString } from "../_shared/crypto.ts";
import {
  getAllStores,
  refreshCapWindows,
  setCurrent,
  logRotation,
} from "../_shared/cap-rotation.ts";
import { pickStore, WeightedStore, RotationAlgorithm } from "../_shared/weighted-rotation.ts";
import { logSystem } from "../_shared/logger.ts";

interface CheckoutItemInput {
  product_slug: string;
  variant_label?: string;
  quantity?: number;
  unit_price?: number;
}

interface CheckoutInput {
  product_slug?: string;
  variant_label?: string;
  quantity?: number;
  unit_price?: number;
  items?: CheckoutItemInput[];
  currency?: string;
  locale?: string;
  language?: string;
  country?: string;
  accept_language?: string;
  session_id?: string;
  warmup?: boolean;
}

const CHECKOUT_PATHS = [
  "/api/public/bridge/checkout",
  "/api/public/bridge/generate-checkout",
  "/api/generate-checkout",
];

const PRODUCT_CODE_POOL = [
  "PRD-01484",
  "PRD-02195",
  "PRD-03726",
  "PRD-04318",
  "PRD-05902",
  "PRD-06547",
];

const PLACEHOLDER_IMG = "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&q=80";
const REMOTE_CHECKOUT_TIMEOUT_MS = 11_000;

function pickProductCode(usedCodes: Set<string>): string {
  const free = PRODUCT_CODE_POOL.filter((c) => !usedCodes.has(c));
  const pool = free.length > 0 ? free : PRODUCT_CODE_POOL;
  const code = pool[Math.floor(Math.random() * pool.length)];
  usedCodes.add(code);
  return code;
}

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

function waitUntil(promise: Promise<unknown>) {
  try {
    // @ts-ignore EdgeRuntime exists in Supabase Edge Functions.
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(promise);
    }
  } catch {
    // noop
  }
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = REMOTE_CHECKOUT_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("checkout_timeout"), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function warmBridgeEndpoint(base: string, apiKey: string) {
  const url = `${base}${CHECKOUT_PATHS[0]}`;
  try {
    await fetchWithTimeout(
      url,
      {
        method: "OPTIONS",
        headers: { "X-Bridge-Api-Key": apiKey },
      },
      4_000,
    );
  } catch {
    // Warm-up best effort: non deve mai bloccare o sporcare il checkout reale.
  }
}

function cleanBridgeBase(raw: string): string {
  let base = String(raw || "")
    .trim()
    .replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  return base
    .replace(/\/api\/public\/bridge.*$/i, "")
    .replace(/\/api\/public.*$/i, "")
    .replace(/\/api\/.*$/i, "")
    .replace(/\/functions\/v1.*$/i, "")
    .replace(/\/+$/, "");
}

function compactValue(value: unknown, max = 900): string {
  if (value == null) return "";
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  return raw.length > max ? `${raw.slice(0, max)}…` : raw;
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.map((v) => String(v || "").trim()).filter(Boolean))];
}

function buildRemoteDiagnosis(args: {
  status: number;
  text: string;
  data: any;
  summary: string;
  shopDomain: string;
  bridgeSiteUrl: string;
  url: string;
}) {
  const payload = `${args.text} ${compactValue(args.data, 4000)}`;
  const lower = payload.toLowerCase();
  const step = args.data?.step || args.data?.stage || null;
  const reason = args.data?.reason || args.data?.details?.reason || null;
  const requestId =
    args.data?.request_id || args.data?.requestId || args.data?.details?.request_id || null;
  const detailsMessage = args.data?.details?.message || args.data?.message || "";
  const missingFnMatch = payload.match(/function\s+public\.([a-zA-Z0-9_]+)\s*\(/i);

  let category = "remote_checkout_failed";
  let realError = args.summary;
  let suggestedFix =
    "Apri i log del Sito B per questo request_id e verifica la configurazione dell'handler checkout.";

  if (/missing_service_role_key|service[_ -]?role[_ -]?key/.test(lower)) {
    category = "sito_b_missing_service_role_key";
    realError = `${args.shopDomain}: Sito B non trova la service role key richiesta dal checkout${step ? ` nello step ${step}` : ""}.`;
    suggestedFix =
      "Sul Sito B imposta la secret del backend esterno usata dal checkout (EXTERNAL_SUPABASE_SERVICE_ROLE_KEY). Se il codice del Sito B cerca ancora SUPABASE_SERVICE_ROLE_KEY, aggiornalo per usare EXTERNAL_SUPABASE_* per checkout/handshake e lascia Lovable Cloud solo per sync prodotti.";
  } else if (
    args.data?.details?.code === "PGRST202" ||
    /could not find the function public\./i.test(payload)
  ) {
    const fn = missingFnMatch?.[1] || "bridge_create_native_checkout_session";
    category = "sito_b_missing_database_function";
    realError = `${args.shopDomain}: nel database esterno del Sito B manca la funzione public.${fn}.`;
    suggestedFix = `Esegui/riapplica sul database esterno del Sito B la migration che crea public.${fn}, poi ricarica la schema cache o riavvia il backend del Sito B.`;
  } else if (/whop/i.test(payload)) {
    category = "whop_checkout_failed";
    realError = `${args.shopDomain}: Whop ha rifiutato la creazione checkout${reason ? ` (${reason})` : ""}.`;
    suggestedFix =
      "Verifica su Sito B WHOP_API_KEY, Company ID, mapping product_code/source_product_code → plan_id e che il plan Whop sia attivo. Fai restituire anche whop_status e whop_body dall'handler checkout del Sito B.";
  } else if (args.status === 401) {
    category = "bridge_api_key_rejected";
    realError = `${args.shopDomain}: Bridge API Key rifiutata dal Sito B.`;
    suggestedFix =
      "Copia la stessa Bridge API Key su Sito A e nel pannello Ponte del Sito B per questo store_id, oppure rigenerala e salvala su entrambi.";
  } else if (args.status === 404) {
    category = "bridge_checkout_route_missing";
    realError = `${args.shopDomain}: endpoint checkout non trovato su Sito B (${args.url}).`;
    suggestedFix =
      "Pubblica sul Sito B la route /api/public/bridge/checkout oppure correggi l'URL Sito Ponte salvato nello store.";
  } else if (args.status >= 500) {
    category = "sito_b_server_error";
    realError = `${args.shopDomain}: Sito B risponde HTTP ${args.status} durante il checkout.`;
    suggestedFix =
      "Controlla le secret e i log runtime del Sito B usando request_id/step qui sotto.";
  }

  return {
    category,
    real_error: realError,
    suggested_fix: suggestedFix,
    remote_status: args.status,
    remote_step: step,
    remote_reason: reason,
    remote_request_id: requestId,
    remote_details_message: detailsMessage || null,
    response_excerpt: compactValue(args.text || args.data, 1200),
    bridge_site_url: args.bridgeSiteUrl,
  };
}

function buildFinalDiagnosis(tried: any[]) {
  const diagnostics = tried.map((t) => t.diagnosis).filter(Boolean);
  const realErrors = uniqueStrings(diagnostics.map((d) => d.real_error));
  const suggestedFixes = uniqueStrings(diagnostics.map((d) => d.suggested_fix));
  const categories = uniqueStrings(diagnostics.map((d) => d.category));
  const summary = realErrors.length
    ? `Checkout bridge fallito: ${realErrors.slice(0, 2).join(" | ")}`
    : "Tutti gli store con Sito Ponte hanno fallito";
  return {
    summary,
    categories,
    real_errors: realErrors,
    suggested_fixes: suggestedFixes,
    failed_stores: tried.map((t) => ({
      store_id: t.store_id,
      shop_domain: t.shop_domain,
      bridge_site_url: t.bridge_site_url,
      http_status: t.http_status,
      real_error: t.diagnosis?.real_error || t.error,
      category: t.diagnosis?.category,
      remote_step: t.diagnosis?.remote_step,
      remote_reason: t.diagnosis?.remote_reason,
      remote_request_id: t.diagnosis?.remote_request_id,
    })),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("POST only", 405);

  const startedAt = Date.now();
  let input: CheckoutInput;
  try {
    input = await req.json();
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  const rawItems: CheckoutItemInput[] =
    Array.isArray(input.items) && input.items.length > 0
      ? input.items
      : input.product_slug
        ? [
            {
              product_slug: input.product_slug,
              variant_label: input.variant_label,
              quantity: input.quantity,
              unit_price: input.unit_price,
            },
          ]
        : [];
  if (rawItems.length === 0) return errorResponse("items[] o product_slug richiesto", 400);

  const checkoutCurrency = String(input.currency || "EUR").toUpperCase();
  const checkoutLanguage =
    String(input.language || "")
      .toLowerCase()
      .split("-")[0] || undefined;
  const checkoutCountry =
    String(input.country || req.headers.get("CF-IPCountry") || "").toUpperCase() || undefined;
  let checkoutLocale = String(input.locale || "").trim();
  if (!checkoutLocale && checkoutLanguage)
    checkoutLocale = checkoutCountry ? `${checkoutLanguage}-${checkoutCountry}` : checkoutLanguage;
  const acceptLanguage = String(input.accept_language || "").trim() || undefined;
  const country = checkoutCountry;

  const supabase: any = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"));
  const slugs = Array.from(new Set(rawItems.map((i) => i.product_slug).filter(Boolean)));

  const [settingsRes, prodRowsRes, reservedRowsRes, baseStoresRes, extrasRes, statRowsRes] =
    await Promise.all([
      supabase
        .from("settings")
        .select("key, value")
        .in("key", ["rotation_algorithm", "max_retry_attempts", "checkout_fallback_image"]),
      supabase
        .from("products")
        .select(
          "id, slug, price, compare_price, variants, checkout_image_url, quantity_breaks, images, shopify_target_stores, product_code",
        )
        .in("slug", slugs),
      supabase.from("products").select("shopify_target_stores").neq("shopify_target_stores", "[]"),
      getAllStores(supabase),
      supabase
        .from("stores")
        .select(
          "id, consecutive_errors, avg_latency_ms, health_status, needs_reauth, bridge_site_url, bridge_api_key_encrypted, bridge_status",
        ),
      supabase
        .from("store_stats")
        .select("store_id, date, shopify_total_revenue")
        .order("date", { ascending: false })
        .limit(500),
    ]);

  const settingsMap = new Map<string, any>(
    ((settingsRes?.data as any[]) || []).map((r) => [r.key, r.value]),
  );
  const algorithm = (settingsMap.get("rotation_algorithm") ?? "weighted") as RotationAlgorithm;
  const maxAttempts = Math.max(1, Math.min(3, Number(settingsMap.get("max_retry_attempts") ?? 2)));
  const fallbackImage = (settingsMap.get("checkout_fallback_image") || "") as string;
  const prodMap = new Map<string, any>(
    ((prodRowsRes?.data as any[]) || []).map((p) => [p.slug, p]),
  );

  let allowedStoreIds: Set<string> | null = null;
  for (const slug of slugs) {
    const p = prodMap.get(slug);
    const list = Array.isArray(p?.shopify_target_stores)
      ? (p.shopify_target_stores as any[]).map(String).filter(Boolean)
      : [];
    if (list.length === 0) continue;
    const set = new Set(list);
    allowedStoreIds =
      allowedStoreIds === null ? set : new Set([...allowedStoreIds].filter((id) => set.has(id)));
  }
  if (allowedStoreIds && allowedStoreIds.size === 0) allowedStoreIds = null;

  const reservedStoreIds = new Set<string>();
  if (allowedStoreIds === null) {
    for (const r of (reservedRowsRes?.data as any[]) || []) {
      const arr = Array.isArray(r?.shopify_target_stores) ? r.shopify_target_stores : [];
      for (const id of arr) if (id) reservedStoreIds.add(String(id));
    }
  }

  const usedCodes = new Set<string>();
  const lineItems = rawItems.map((it) => {
    const qty = Math.max(1, Math.min(99, Math.floor(it.quantity || 1)));
    const prod = prodMap.get(it.product_slug);
    let price: number | null = prod?.price != null ? Number(prod.price) : null;
    let comparePrice: number | null =
      prod?.compare_price != null ? Number(prod.compare_price) : null;
    let variantLabel: string | null = it.variant_label || null;

    if (it.variant_label && Array.isArray(prod?.variants)) {
      const v = (prod.variants as any[]).find(
        (x) => String(x?.label || x?.title || x?.name || "").trim() === it.variant_label!.trim(),
      );
      if (v) {
        if (v.price != null) price = Number(v.price);
        if (v.compare_price != null) comparePrice = Number(v.compare_price);
        variantLabel = String(v.label || v.title || v.name || it.variant_label);
      }
    }

    if (price != null && Array.isArray(prod?.quantity_breaks) && prod.quantity_breaks.length > 0) {
      const breaks = (prod.quantity_breaks as any[])
        .map((b) => ({
          qty: Number(b?.qty ?? b?.quantity ?? 0),
          discount_percent: Number(b?.discount_percent ?? b?.discount ?? 0),
        }))
        .filter((b) => b.qty > 0 && b.discount_percent > 0)
        .sort((a, b) => a.qty - b.qty);
      const matched = breaks.filter((b) => qty >= b.qty).slice(-1)[0];
      if (matched) price = Math.round(price * (1 - matched.discount_percent / 100) * 100) / 100;
    }

    const firstProdImg =
      Array.isArray(prod?.images) && prod.images.length > 0
        ? String(prod.images[0] || "").trim()
        : "";
    let img = (prod?.checkout_image_url || fallbackImage || firstProdImg || "").toString().trim();
    if (!/^https?:\/\//i.test(img)) img = PLACEHOLDER_IMG;

    const stableCode =
      typeof prod?.product_code === "string" && /^PRD-\d+$/i.test(prod.product_code.trim())
        ? prod.product_code.trim().toUpperCase()
        : null;
    const code = stableCode || pickProductCode(usedCodes);
    if (stableCode) usedCodes.add(stableCode);
    const handle = code.toLowerCase();

    // Persist auto-generated code so future checkouts reuse the same disguise
    // and Sito B can match the shadow product via a stable identifier.
    if (!stableCode && prod?.id) {
      waitUntil(
        supabase
          .from("products")
          .update({ product_code: code })
          .eq("id", prod.id)
          .then(() => undefined),
      );
    }

    let finalPrice: number | null = price;
    let finalCompare: number | null = comparePrice;
    if (typeof it.unit_price === "number" && it.unit_price > 0) {
      finalPrice = Math.round(it.unit_price * 100) / 100;
      finalCompare = null;
    }

    return {
      // Stable internal identifiers — Sito B uses these as the join key
      // to match its shadow product regardless of slug/title changes.
      source_product_id: prod?.id || null,
      source_product_slug: it.product_slug,
      source_product_code: code,
      product_slug: handle,
      product_handle: handle,
      product_title: code,
      product_name: code,
      sku: code,
      display_title: code,
      display_handle: handle,
      display_sku: code,
      title_override: code,
      handle_override: handle,
      sku_override: code,
      price: finalPrice,
      compare_at_price: finalCompare,
      variant_label: variantLabel,
      display_image_url: img,
      image_url: img,
      product_image: img,
      quantity: qty,
    };
  });

  const primary = lineItems[0];
  const totalQuantity = lineItems.reduce((sum, item) => sum + Number(item.quantity || 1), 0);
  const baseStores = (baseStoresRes || []) as WeightedStore[];

  // Non bloccare il primo checkout della giornata su reset/stats: aggiorna in background.
  waitUntil(refreshCapWindows(supabase, baseStores).catch(() => undefined));

  const extraMap = new Map<string, any>(((extrasRes?.data as any[]) || []).map((e) => [e.id, e]));
  const totalRevMap = new Map<string, number>();
  for (const r of (statRowsRes?.data as any[]) || []) {
    const id = String(r.store_id);
    if (!totalRevMap.has(id)) totalRevMap.set(id, Number(r.shopify_total_revenue || 0));
  }

  const allBridgeStores: WeightedStore[] = baseStores
    .map(
      (s) =>
        ({
          ...s,
          ...(extraMap.get(s.id) || {}),
          shopify_total_revenue: totalRevMap.get(s.id) || 0,
        }) as WeightedStore,
    )
    .filter(
      (s) =>
        !!(extraMap.get(s.id) || {}).bridge_site_url &&
        !!(extraMap.get(s.id) || {}).bridge_api_key_encrypted,
    );

  const stores = allBridgeStores.filter((s) => {
    if (allowedStoreIds) return allowedStoreIds.has(s.id);
    return !reservedStoreIds.has(s.id);
  });

  if (!stores.length) {
    return errorResponse("Nessuno store con Sito Ponte configurato", 503, {
      debug: {
        total_stores: baseStores.length,
        stores_with_bridge_config: allBridgeStores.length,
        product_restricted_to: allowedStoreIds ? [...allowedStoreIds] : null,
      },
    });
  }

  const tried: any[] = [];
  const triedIds: string[] = [];
  const currentStore = stores.find((s) => s.is_current) || null;
  let attempts = 0;

  while (attempts < maxAttempts) {
    const currentOverCap =
      !!currentStore?.cap_amount &&
      Number(currentStore.cap_window_revenue || 0) >= Number(currentStore.cap_amount);
    let pick = pickStore(stores, algorithm, {
      country,
      excludeIds: currentOverCap && currentStore ? [...triedIds, currentStore.id] : triedIds,
      currentId: currentStore?.id,
    });

    if (!pick) {
      const candidates = stores.filter((s) => !triedIds.includes(s.id) && s.is_active);
      if (candidates.length > 0) {
        pick = [...candidates].sort(
          (a, b) => Number(a.shopify_total_revenue || 0) - Number(b.shopify_total_revenue || 0),
        )[0];
        waitUntil(
          logSystem(supabase, {
            level: "warning",
            category: "checkout",
            store_id: pick.id,
            message: `Checkout fallback: nessuno store eligible. Uso ${pick.shop_domain}.`,
            metadata: { cap_amount: pick.cap_amount, cap_window_revenue: pick.cap_window_revenue },
          }),
        );
      }
    }

    const pickOverCap =
      !!pick?.cap_amount && Number(pick.cap_window_revenue || 0) >= Number(pick.cap_amount);
    if (!allowedStoreIds && pickOverCap) {
      const emergencyPick = allBridgeStores
        .filter((s) => !triedIds.includes(s.id) && s.id !== pick!.id && s.is_active)
        .sort(
          (a, b) => Number(a.shopify_total_revenue || 0) - Number(b.shopify_total_revenue || 0),
        )[0];
      if (emergencyPick) pick = emergencyPick;
    }

    if (!pick) break;
    triedIds.push(pick.id);
    attempts++;

    const e = extraMap.get(pick.id) || {};
    const apiKey = await decryptString(e.bridge_api_key_encrypted);
    const base = cleanBridgeBase(e.bridge_site_url || "");

    if (input.warmup) {
      waitUntil(warmBridgeEndpoint(base, apiKey));
      return jsonResponse({ ok: true, warmed: true, store_domain: pick.shop_domain });
    }

    try {
      let lastError = "unknown_checkout_error";
      const buildBody = (forceNativeCurrency: boolean) => ({
        store_id: pick.id,
        shop_domain: pick.shop_domain,
        items: lineItems,
        line_items: lineItems,
        ...(forceNativeCurrency
          ? {}
          : { currency: checkoutCurrency, presentment_currency: checkoutCurrency }),
        locale: checkoutLocale || undefined,
        language: checkoutLanguage,
        country: checkoutCountry,
        customer_locale: checkoutLocale || undefined,
        buyer_locale: checkoutLocale || undefined,
        accept_language: acceptLanguage,
        source_product_id: primary.source_product_id,
        source_product_slug: primary.source_product_slug,
        source_product_code: primary.source_product_code,
        product_slug: primary.product_slug,
        product_handle: primary.product_handle,
        product_title: primary.product_title,
        product_name: primary.product_name,
        sku: primary.sku,
        display_title: primary.display_title,
        display_handle: primary.display_handle,
        display_sku: primary.display_sku,
        title_override: primary.title_override,
        handle_override: primary.handle_override,
        sku_override: primary.sku_override,
        price: primary.price,
        compare_at_price: primary.compare_at_price,
        variant_label: primary.variant_label,
        display_image_url: primary.display_image_url,
        image_url: primary.image_url,
        product_image: primary.product_image,
        quantity: totalQuantity,
        session_id: input.session_id,
      });

      for (const path of CHECKOUT_PATHS) {
        const url = `${base}${path}`;
        const endpointStartedAt = Date.now();
        let r = await fetchWithTimeout(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Bridge-Api-Key": apiKey,
            ...(acceptLanguage ? { "Accept-Language": acceptLanguage } : {}),
          },
          body: JSON.stringify(buildBody(false)),
        });
        let text = await r.text();
        let data: any = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = null;
        }

        const looksLikeCurrencyError =
          (r.status === 422 || r.status === 502) &&
          /valuta|currency|presentment|not enabled|non.{1,5}abilitat/i.test(text);
        if (!r.ok && looksLikeCurrencyError) {
          r = await fetchWithTimeout(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Bridge-Api-Key": apiKey,
              ...(acceptLanguage ? { "Accept-Language": acceptLanguage } : {}),
            },
            body: JSON.stringify(buildBody(true)),
          });
          text = await r.text();
          try {
            data = text ? JSON.parse(text) : null;
          } catch {
            data = null;
          }
        }

        const isHtml = !data && /^\s*<(!doctype|html)/i.test(text);
        const remotePath = data?.path ? ` path_received="${data.path}"` : "";
        const remoteCode = data?.error || data?.code;
        const remoteDetail = data?.message ? `: ${String(data.message).slice(0, 900)}` : "";
        const summary = isHtml
          ? "non-JSON HTML response"
          : remoteCode
            ? `${remoteCode}${remotePath}${remoteDetail}`
            : text.slice(0, 900) || `HTTP ${r.status}`;
        const isInvalidBridgeKey =
          r.status === 401 &&
          /invalid_api_key|invalid api key|hash_mismatch|missing bridge api key/i.test(summary);
        const friendlySummary = isInvalidBridgeKey
          ? "Bridge API Key rifiutata da Sito B: la key salvata qui non coincide con quella registrata nel Ponte per questo store_id. Rivela/copia la Bridge API Key in Sito A e salvala uguale in Sito B Ponte Admin, oppure genera una nuova key e salvala su entrambi."
          : summary;
        // Raccogli TUTTO ciò che il Sito B ci dice, così l'utente può debuggare
        // senza dover entrare nei log del Sito B (utile per errori upstream Whop).
        const responseHeaders: Record<string, string> = {};
        try {
          r.headers.forEach((v, k) => {
            const lk = k.toLowerCase();
            if (
              lk === "content-type" ||
              lk === "x-request-id" ||
              lk === "x-whop-error" ||
              lk === "x-whop-request-id" ||
              lk.startsWith("x-bridge-") ||
              lk.startsWith("x-debug-") ||
              lk === "cf-ray"
            ) {
              responseHeaders[k] = v;
            }
          });
        } catch {
          // ignore
        }

        const sentPayloadPreview = {
          source_product_id: primary.source_product_id,
          source_product_slug: primary.source_product_slug,
          source_product_code: primary.source_product_code,
          product_slug: primary.product_slug,
          product_title: primary.product_title,
          quantity: totalQuantity,
          line_items_count: lineItems.length,
          line_items: lineItems.map((li) => ({
            source_product_id: li.source_product_id,
            source_product_slug: li.source_product_slug,
            source_product_code: li.source_product_code,
            product_slug: li.product_slug,
            quantity: li.quantity,
            price: li.price,
            variant_label: li.variant_label,
          })),
          currency: checkoutCurrency,
          locale: checkoutLocale || undefined,
          country: checkoutCountry,
        };

        const upstreamHint =
          r.status === 502 && /whop/i.test(text + JSON.stringify(data || ""))
            ? "Sito B ha contattato Whop e Whop ha rifiutato, ma il Sito B sta scartando il messaggio originale e restituisce solo 'whop_checkout_unavailable'. Aggiorna l'handler /api/public/bridge/checkout su Sito B per inoltrare anche whop_status e whop_body nel JSON di risposta. Cause tipiche: (1) WHOP_API_KEY non valida/scaduta su Sito B, (2) il product_slug/source_product_code non corrisponde a nessun plan_id su Whop, (3) plan archiviato/disabilitato, (4) Company ID non corrisponde alla key."
            : r.status === 401
              ? friendlySummary
              : undefined;
        const diagnosis = buildRemoteDiagnosis({
          status: r.status,
          text,
          data,
          summary: friendlySummary,
          shopDomain: pick.shop_domain,
          bridgeSiteUrl: base,
          url,
        });

        const attemptInfo = {
          store_id: pick.id,
          shop_domain: pick.shop_domain,
          bridge_site_url: base,
          url,
          http_status: r.status,
          ok: r.ok,
          duration_ms: Date.now() - endpointStartedAt,
          response: friendlySummary,
          error: r.ok ? undefined : friendlySummary,
          // Dettaglio grezzo: cruciale quando Sito B inghiotte l'errore upstream.
          raw_response_body: text ? text.slice(0, 4000) : null,
          parsed_response: data ?? null,
          response_headers: responseHeaders,
          api_key_hint: apiKey
            ? `${apiKey.slice(0, 6)}…${apiKey.slice(-4)} (len=${apiKey.length})`
            : null,
          diagnosis,
          sent_payload: sentPayloadPreview,
          upstream_hint: upstreamHint,
        };
        tried.push(attemptInfo);

        if (r.ok && data?.redirect_url) {
          waitUntil(
            (async () => {
              try {
                if (!allowedStoreIds && !pick.is_current) {
                  await setCurrent(supabase, pick.id);
                  await logRotation(supabase, {
                    from_store_id: currentStore?.id ?? null,
                    to_store_id: pick.id,
                    trigger_type: "checkout",
                    reason: "bridge checkout pick",
                  });
                }
                const today = romeDateKey();
                const { data: ex } = await supabase
                  .from("store_stats")
                  .select("id, checkout_launches_24h")
                  .eq("store_id", pick.id)
                  .eq("date", today)
                  .maybeSingle();
                if (ex) {
                  await supabase
                    .from("store_stats")
                    .update({ checkout_launches_24h: (ex.checkout_launches_24h || 0) + 1 })
                    .eq("id", ex.id);
                } else {
                  await supabase
                    .from("store_stats")
                    .insert({ store_id: pick.id, date: today, checkout_launches_24h: 1 });
                }
              } catch {
                // background only
              }
            })(),
          );

          return jsonResponse({
            redirect_url: data.redirect_url,
            store_domain: pick.shop_domain,
            attempts,
            algorithm,
            debug: {
              total_ms: Date.now() - startedAt,
              selected_url: url,
              attempted_urls: tried.map((t) => ({
                url: t.url,
                http_status: t.http_status,
                ok: t.ok,
                duration_ms: t.duration_ms,
              })),
            },
          });
        }

        lastError = attemptInfo.error || lastError;
        const isMissingRoute = r.status === 404 && (isHtml || data?.error === "route_not_found");
        if (!isMissingRoute) throw new Error(lastError);
      }
      throw new Error(lastError);
    } catch (err: any) {
      const msg = err?.name === "AbortError" ? "checkout_timeout" : err?.message || String(err);
      if (!tried.some((t) => t.store_id === pick.id && t.error === msg)) {
        tried.push({
          store_id: pick.id,
          shop_domain: pick.shop_domain,
          bridge_site_url: base,
          error: msg,
          diagnosis: {
            category:
              msg === "checkout_timeout" ? "bridge_timeout" : "bridge_network_or_runtime_error",
            real_error:
              msg === "checkout_timeout"
                ? `${pick.shop_domain}: timeout chiamando il Sito B (${base}).`
                : `${pick.shop_domain}: errore chiamando il Sito B: ${msg}`,
            suggested_fix:
              msg === "checkout_timeout"
                ? "Verifica che il Sito B sia online e che /api/public/bridge/checkout risponda entro 11 secondi."
                : "Controlla DNS/SSL del dominio Sito Ponte e i log runtime del Sito B.",
          },
        });
      }
      waitUntil(
        (async () => {
          try {
            await supabase
              .from("stores")
              .update({ bridge_status: "error", bridge_last_error: msg.slice(0, 1000) })
              .eq("id", pick.id);
            await logSystem(supabase, {
              level: "warning",
              category: "checkout",
              store_id: pick.id,
              message: `bridge checkout attempt ${attempts} failed: ${msg}`,
              metadata: {
                items: rawItems.map((i) => i.product_slug),
                base_url: base,
                attempted_paths: CHECKOUT_PATHS,
                tried_responses: tried
                  .filter((t) => t.store_id === pick.id)
                  .map((t) => ({
                    url: t.url,
                    http_status: t.http_status,
                    response: t.response,
                    duration_ms: t.duration_ms,
                  })),
              },
            });
          } catch {
            // background only
          }
        })(),
      );
    }
  }

  const finalDiagnosis = buildFinalDiagnosis(tried);
  return errorResponse(finalDiagnosis.summary, 503, {
    diagnosis: finalDiagnosis,
    attempts: tried,
  });
});
