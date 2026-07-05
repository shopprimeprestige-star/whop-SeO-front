// bridge-callback — endpoint richiamato da Sito B (Sito Ponte) per notificare aggiornamenti.
// Autenticazione: HMAC-SHA256 del body raw, firmato con la bridge_api_key dello store.
// Header richiesti:
//   X-Store-Id        : UUID dello store
//   X-Bridge-Signature: hex digest = HMAC_SHA256(body_raw, bridge_api_key)
// Body JSON atteso:
//   {
//     type: "stats_update" | "order_paid" | "order_updated" | "order_cancelled" | "order_refunded" | "online_status",
//     data: { ... payload specifico ... }
//   }
// L'endpoint:
//   1. Aggiorna stats / cap_window_revenue / online flag
//   2. Aggiorna bridge_last_sync, bridge_status='connected', bridge_last_error=null
//   3. Se cap_window_revenue >= cap_amount, esegue rotazione automatica
//   4. Risponde { ok, applied, rotated, ... }
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders, errorResponse, getEnv, jsonResponse } from "../_shared/http.ts";
import { decryptString, hmacHex, safeEqual } from "../_shared/crypto.ts";
import {
  getAllStores,
  refreshCapWindows,
  setCurrent,
  logRotation,
} from "../_shared/cap-rotation.ts";
import { pickStore, WeightedStore, RotationAlgorithm } from "../_shared/weighted-rotation.ts";
import { logSystem } from "../_shared/logger.ts";

const BUSINESS_TIME_ZONE = "Europe/Rome";

function zonedParts(date: Date, timeZone = BUSINESS_TIME_ZONE): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
}

function businessDateKey(date = new Date()): string {
  const p = zonedParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function zoneOffsetMs(date: Date): number {
  const p = zonedParts(date);
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return asUtc - date.getTime();
}

function zonedMidnightUtcIso(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  let utcMs = Date.UTC(y, m - 1, d, 0, 0, 0);
  for (let i = 0; i < 3; i++) {
    utcMs = Date.UTC(y, m - 1, d, 0, 0, 0) - zoneOffsetMs(new Date(utcMs));
  }
  return new Date(utcMs).toISOString();
}

function pickHeaders(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  const allow = [
    "x-store-id",
    "x-bridge-signature",
    "x-shopify-topic",
    "x-shopify-shop-domain",
    "x-shopify-hmac-sha256",
    "x-shopify-webhook-id",
    "x-shopify-triggered-at",
    "user-agent",
    "content-type",
    "content-length",
  ];
  for (const k of allow) {
    const v = req.headers.get(k);
    if (v) out[k] = v;
  }
  return out;
}

function truncate(s: string, max = 8000): string {
  if (!s) return s;
  return s.length > max ? s.slice(0, max) + `…[+${s.length - max}b]` : s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("POST only", 405);

  const storeId = req.headers.get("X-Store-Id") || "";
  const signature = req.headers.get("X-Bridge-Signature") || "";
  if (!storeId) return errorResponse("X-Store-Id header missing", 400);
  if (!signature) return errorResponse("X-Bridge-Signature header missing", 401);

  const rawBody = await req.text();
  if (!rawBody) return errorResponse("Empty body", 400);

  const sb: any = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"));

  const headersSnapshot = pickHeaders(req);
  const bodyPreview = truncate(rawBody);

  const { data: store, error: storeErr } = await sb.from("stores")
    .select("id, shop_domain, bridge_api_key_encrypted, bridge_site_url, cap_amount, cap_window_revenue, cap_window_days, cap_window_start, country_rule, is_current, shop_currency")
    .eq("id", storeId).maybeSingle();
  if (storeErr || !store) {
    await logSystem(sb, {
      level: "error",
      category: "webhook",
      store_id: null,
      message: `Callback rifiutato: store ${storeId} non trovato`,
      metadata: { headers: headersSnapshot, body: bodyPreview },
    });
    return errorResponse("Store not found", 404);
  }

  const apiKey = await decryptString(store.bridge_api_key_encrypted);
  if (!apiKey) {
    await logSystem(sb, {
      level: "error",
      category: "webhook",
      store_id: store.id,
      message: `Callback rifiutato: bridge_api_key non configurata (${store.shop_domain})`,
      metadata: { headers: headersSnapshot, body: bodyPreview },
    });
    return errorResponse("bridge_api_key not configured", 400);
  }

  // Verifica HMAC
  const expected = await hmacHex(rawBody, apiKey);
  if (!safeEqual(signature.toLowerCase(), expected.toLowerCase())) {
    await sb.from("stores").update({
      bridge_last_error: "Invalid HMAC signature in callback",
    }).eq("id", store.id);
    await logSystem(sb, {
      level: "error",
      category: "webhook",
      store_id: store.id,
      message: `Firma HMAC non valida da ${store.shop_domain}`,
      metadata: {
        headers: headersSnapshot,
        body: bodyPreview,
        signature_received: signature.slice(0, 16) + "…",
        signature_expected: expected.slice(0, 16) + "…",
      },
    });
    return errorResponse("Invalid signature", 401);
  }

  let payload: any;
  try { payload = JSON.parse(rawBody); } catch { return errorResponse("Invalid JSON body", 400); }
  const type = String(payload?.type || "").toLowerCase();
  const data = payload?.data || {};

  const today = businessDateKey();
  const result: any = { ok: true, applied: type, rotated: false };

  const applyOrderRevenue = async (sourceType: string, status = "paid") => {
    const amount = Number(data.amount || data.total_price || data.current_total_price || 0);
    const orderId = String(data.shopify_order_id || data.order_id || data.id || "");
    if (!orderId || amount <= 0) {
      result.ignored = true;
      result.ignore_reason = !orderId ? "missing_order_id" : "missing_amount";
      return;
    }

    // Idempotency: se l'ordine è già processato (da order_created o order_paid precedente), skip.
    const { error: dupErr } = await sb.from("processed_orders").insert({
      store_id: store.id,
      shopify_order_id: orderId,
      amount,
      currency: data.currency || store.shop_currency || "EUR",
      status,
    });
    if (dupErr && (dupErr as any).code === "23505") {
      result.duplicate = true;
      result.order_id = orderId;
      // Anche se duplicato, ricalcolo cap_window_revenue dal totale autoritativo
      // (così la lettura iniziale di Sito A resta coerente).
    } else if (dupErr) {
      throw dupErr;
    }

    // === Ricalcolo AUTORITATIVO da processed_orders di oggi ===
    // Niente più somme incrementali su cap_window_revenue / store_stats:
    // sommo direttamente tutti gli ordini paid/created del giorno per evitare doppi conteggi
    // tra order_created e order_paid dello stesso shopify_order_id.
    const todayStartIso = zonedMidnightUtcIso(today);
    const tomorrowStartIso = zonedMidnightUtcIso(addDays(today, 1));
    const { data: todayOrders } = await sb.from("processed_orders")
      .select("amount, status, processed_at")
      .eq("store_id", store.id)
      .gte("processed_at", todayStartIso)
      .lt("processed_at", tomorrowStartIso);
    const validOrders = ((todayOrders as any[]) || []).filter(
      (o) => o.status !== "cancelled" && o.status !== "refunded",
    );
    const dailyRevenueAuth = validOrders.reduce((s, o) => s + Number(o.amount || 0), 0);
    const dailyOrdersAuth = validOrders.length;

    // Lifetime: somma tutti i processed_orders dello store (non solo oggi)
    const { data: allOrders } = await sb.from("processed_orders")
      .select("amount, status, processed_at").eq("store_id", store.id);
    const lifetimeValid = ((allOrders as any[]) || []).filter(
      (o) => o.status !== "cancelled" && o.status !== "refunded",
    );
    const lifetimeRevenueAuth = lifetimeValid.reduce((s, o) => s + Number(o.amount || 0), 0);
    const lifetimeOrdersAuth = lifetimeValid.length;

    const { data: ex } = await sb.from("store_stats").select("id")
      .eq("store_id", store.id).eq("date", today).maybeSingle();
    if (ex) {
      await sb.from("store_stats").update({
        shopify_daily_orders: dailyOrdersAuth,
        shopify_daily_revenue: dailyRevenueAuth,
        shopify_total_orders: lifetimeOrdersAuth,
        shopify_total_revenue: lifetimeRevenueAuth,
        last_order: new Date().toISOString(),
        last_sync: new Date().toISOString(),
      }).eq("id", ex.id);
    } else {
      await sb.from("store_stats").insert({
        store_id: store.id, date: today,
        shopify_daily_orders: dailyOrdersAuth,
        shopify_daily_revenue: dailyRevenueAuth,
        shopify_total_orders: lifetimeOrdersAuth,
        shopify_total_revenue: lifetimeRevenueAuth,
        last_order: new Date().toISOString(),
        last_sync: new Date().toISOString(),
      });
    }
    // cap_window_revenue = revenue di oggi (autoritativo, ricalcolato da processed_orders).
    await sb.from("stores").update({
      cap_window_revenue: dailyRevenueAuth,
      last_webhook_at: new Date().toISOString(),
    }).eq("id", store.id);
    result.applied_amount = amount;
    result.order_id = orderId;
    result.cap_window_revenue = dailyRevenueAuth;
    result.daily_revenue = dailyRevenueAuth;
    result.daily_orders = dailyOrdersAuth;
    result.lifetime_revenue = lifetimeRevenueAuth;
    result.source_type = sourceType;

    // === Fire server-side conversion (Meta CAPI + TikTok Events API) ===
    // Solo nuovi ordini (no duplicate). event_id = order_<id> per dedup col Pixel browser.
    if (!result.duplicate) {
      try {
        const convUrl = `${getEnv("SUPABASE_URL")}/functions/v1/send-conversion`;
        fetch(convUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "authorization": `Bearer ${getEnv("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            event_name: "Purchase",
            event_id: `order_${orderId}`,
            value: amount,
            currency: data.currency || store.shop_currency || "EUR",
            order_id: orderId,
            email: data.email || data.customer_email || undefined,
            phone: data.phone || data.customer_phone || undefined,
            ip: data.client_ip || undefined,
            user_agent: data.client_user_agent || undefined,
            fbp: data.fbp || undefined,
            fbc: data.fbc || undefined,
            ttp: data.ttp || undefined,
            event_source_url: data.checkout_url || data.event_source_url || undefined,
          }),
        }).catch(() => { /* swallow */ });
        result.conversion_dispatched = true;
      } catch { /* ignore */ }
    }
  };

  // === Apply update by type ===
  if (type === "stats_update") {
    // Full snapshot: daily/total orders + revenue
    const dailyOrders = Number(data.daily_orders || 0);
    const dailyRevenue = Number(data.daily_revenue || 0);
    const totalOrders = Number(data.total_orders || 0);
    const totalRevenue = Number(data.total_revenue || 0);

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

    // cap_window_revenue: usa il dailyRevenue come riferimento finestra (semplificazione 1 giorno)
    // Se cap_window_days > 1 il sync periodico ricostruisce la finestra. Qui aggiorniamo
    // a dailyRevenue per coerenza con la sorgente Sito B.
    await sb.from("stores").update({
      cap_window_revenue: dailyRevenue,
    }).eq("id", store.id);
    result.cap_window_revenue = dailyRevenue;

  } else if (type === "order_paid") {
    // Incremental: aggiungi un ordine pagato
    await applyOrderRevenue("order_paid", "paid");

  } else if (type === "order_updated") {
    // Aggiorna stato/importo di un ordine già processato (es. fulfilled, refunded parziale, ecc.)
    const orderId = String(data.shopify_order_id || "");
    const newAmount = data.amount != null ? Number(data.amount) : null;
    const newStatus = data.status ? String(data.status) : null;
    if (orderId) {
      const { data: existingOrder } = await sb.from("processed_orders")
        .select("id, amount, status").eq("store_id", store.id)
        .eq("shopify_order_id", orderId).maybeSingle();
      if (existingOrder) {
        const patch: any = {};
        if (newStatus) patch.status = newStatus;
        if (newAmount != null && newAmount !== Number(existingOrder.amount)) {
          patch.amount = newAmount;
          // riallinea cap_window_revenue con il delta
          const delta = newAmount - Number(existingOrder.amount || 0);
          if (delta !== 0) {
            await sb.from("stores").update({
              cap_window_revenue: Math.max(0, Number(store.cap_window_revenue || 0) + delta),
              last_webhook_at: new Date().toISOString(),
            }).eq("id", store.id);
            const { data: ex } = await sb.from("store_stats").select("*")
              .eq("store_id", store.id).eq("date", today).maybeSingle();
            if (ex) {
              await sb.from("store_stats").update({
                shopify_daily_revenue: Math.max(0, Number(ex.shopify_daily_revenue || 0) + delta),
                shopify_total_revenue: Math.max(0, Number(ex.shopify_total_revenue || 0) + delta),
              }).eq("id", ex.id);
            }
          }
        }
        if (Object.keys(patch).length > 0) {
          await sb.from("processed_orders").update(patch).eq("id", existingOrder.id);
        }
        result.updated_order = orderId;
      } else {
        // Ordine non visto prima → trattalo come paid
        const amount = newAmount || 0;
        await sb.from("processed_orders").insert({
          store_id: store.id, shopify_order_id: orderId, amount,
          currency: data.currency || store.shop_currency || "EUR",
          status: newStatus || "paid",
        });
        result.created_order = orderId;
      }
    }

  } else if (type === "order_cancelled" || type === "order_refunded") {
    const orderId = String(data.shopify_order_id || "");
    const refundAmount = Number(data.amount || 0);
    if (orderId) {
      const { data: existingOrder } = await sb.from("processed_orders")
        .select("id, amount").eq("store_id", store.id)
        .eq("shopify_order_id", orderId).maybeSingle();
      if (existingOrder) {
        const amountToReverse = refundAmount > 0 ? refundAmount : Number(existingOrder.amount || 0);
        await sb.from("processed_orders").update({
          status: type === "order_cancelled" ? "cancelled" : "refunded",
        }).eq("id", existingOrder.id);
        // Sottrai dal cap window e dalle stats
        await sb.from("stores").update({
          cap_window_revenue: Math.max(0, Number(store.cap_window_revenue || 0) - amountToReverse),
          last_webhook_at: new Date().toISOString(),
        }).eq("id", store.id);
        const { data: ex } = await sb.from("store_stats").select("*")
          .eq("store_id", store.id).eq("date", today).maybeSingle();
        if (ex) {
          await sb.from("store_stats").update({
            shopify_daily_revenue: Math.max(0, Number(ex.shopify_daily_revenue || 0) - amountToReverse),
            shopify_total_revenue: Math.max(0, Number(ex.shopify_total_revenue || 0) - amountToReverse),
          }).eq("id", ex.id);
        }
        result.reversed_amount = amountToReverse;
      }
    }

  } else if (type === "online_status") {
    const online = Boolean(data.online);
    await sb.from("stores").update({
      is_online: online,
      health_status: online ? "online" : "offline",
      last_online: online ? new Date().toISOString() : undefined,
      last_offline: online ? undefined : new Date().toISOString(),
      offline_reason: online ? null : (data.reason || "Bridge reported offline"),
    }).eq("id", store.id);

  } else if (type === "order_created") {
    // Sito B in questo flusso crea l'ordine Shopify dopo il checkout del cliente.
    // Se arriva con amount valido lo contiamo subito; l'idempotenza evita doppi conteggi
    // se in seguito arriva anche order_paid per lo stesso shopify_order_id.
    await applyOrderRevenue("order_created", "created");

  } else if (type === "revenue_update") {
    // Snapshot fatturato lifetime + today inviato dal Sito Ponte.
    // payload.data: { currency, lifetime:{paid,refunded,net,orders_paid}, today:{...} }
    const todayPaid = Number(data?.today?.paid || 0);
    const todayOrders = Number(data?.today?.orders_paid || 0);
    const totalPaid = Number(data?.lifetime?.paid || 0);
    const totalOrders = Number(data?.lifetime?.orders_paid || 0);

    const { data: existing } = await sb.from("store_stats")
      .select("id, shopify_daily_revenue, shopify_daily_orders, shopify_total_revenue, shopify_total_orders")
      .eq("store_id", store.id).eq("date", today).maybeSingle();
    const currentDailyRevenue = Number(existing?.shopify_daily_revenue || 0);
    const currentDailyOrders = Number(existing?.shopify_daily_orders || 0);
    const snapshotIsEmpty = todayPaid <= 0 && todayOrders <= 0;
    const snapshotLooksStale = snapshotIsEmpty && totalPaid <= currentDailyRevenue && totalOrders <= currentDailyOrders;

    if ((snapshotIsEmpty || snapshotLooksStale) && (currentDailyRevenue > 0 || currentDailyOrders > 0 || Number(store.cap_window_revenue || 0) > 0)) {
      result.ignored = true;
      result.ignore_reason = snapshotLooksStale ? "stale_revenue_snapshot_preserves_existing_revenue" : "empty_revenue_snapshot_preserves_existing_revenue";
      result.cap_window_revenue = Number(store.cap_window_revenue || currentDailyRevenue || 0);
      result.daily_revenue = currentDailyRevenue;
      result.daily_orders = currentDailyOrders;
    } else {
      // Snapshot autoritativo per il GIORNO (today) e per il LIFETIME (Sito B è la fonte di verità unica).
      // Per il totale lifetime usiamo SEMPRE lo snapshot di Sito B (lifetime.paid),
      // così rispecchia il vero fatturato Shopify anche se include ordini storici fatti fuori da Sito A.
      const finalLifetimeRevenue = totalPaid;
      const finalLifetimeOrders = totalOrders;

      if (existing) {
        await sb.from("store_stats").update({
          shopify_daily_orders: todayOrders,
          shopify_daily_revenue: todayPaid,
          shopify_total_orders: finalLifetimeOrders,
          shopify_total_revenue: finalLifetimeRevenue,
          last_sync: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        await sb.from("store_stats").insert({
          store_id: store.id, date: today,
          shopify_daily_orders: todayOrders,
          shopify_daily_revenue: todayPaid,
          shopify_total_orders: finalLifetimeOrders,
          shopify_total_revenue: finalLifetimeRevenue,
          last_sync: new Date().toISOString(),
        });
      }
      // cap_window_revenue = revenue di oggi (autoritativo da Sito B), sempre.
      await sb.from("stores").update({
        cap_window_revenue: todayPaid,
        last_webhook_at: new Date().toISOString(),
      }).eq("id", store.id);
      result.cap_window_revenue = todayPaid;
      result.daily_revenue = todayPaid;
      result.daily_orders = todayOrders;
      result.lifetime_revenue = finalLifetimeRevenue;
      result.lifetime_orders = finalLifetimeOrders;
    }

  } else {
    // Tipo sconosciuto: log + ack 200 per non bloccare Sito B
    await logSystem(sb, {
      level: "warning",
      category: "webhook",
      store_id: store.id,
      message: `Callback type non gestito (ack): ${type} (${store.shop_domain})`,
      metadata: { type, headers: headersSnapshot, body: bodyPreview },
    });
    result.ignored = true;
    result.unknown_type = type;
  }

  // === Mark bridge healthy ===
  await sb.from("stores").update({
    bridge_status: "connected",
    bridge_last_sync: new Date().toISOString(),
    bridge_last_error: null,
  }).eq("id", store.id);

  // === Pull autoritativo da Sito B (revenue daily + total) ===
  // Ad ogni webhook ricevuto, Sito A re-interroga Sito B per recuperare lo snapshot
  // ufficiale di daily_revenue e total_revenue, sovrascrivendo store_stats e cap_window_revenue.
  // SKIP per revenue_update: il payload stesso è già autoritativo (today + lifetime da Sito B).
  // SKIP se il webhook è stato ignorato (snapshot stale) per non azzerare valori validi.
  const skipBridgePull = type === "revenue_update" || result.ignored === true;
  try {
    if (!skipBridgePull && store.bridge_site_url && apiKey) {
      let base = String(store.bridge_site_url).trim().replace(/\/$/, "");
      if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
      const syncUrl = `${base}/api/public/bridge/sync`;
      const r = await fetch(syncUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Bridge-Api-Key": apiKey },
        body: JSON.stringify({ store_id: store.id }),
      });
      if (r.ok) {
        const snap: any = await r.json().catch(() => null);
        if (snap) {
          const dOrders = Number(snap.daily_orders || 0);
          const dRevenue = Number(snap.daily_revenue || 0);
          const tOrders = Number(snap.total_orders || 0);
          const tRevenue = Number(snap.total_revenue || 0);
          const { data: ex2 } = await sb.from("store_stats")
            .select("id, shopify_daily_revenue, shopify_daily_orders, shopify_total_revenue, shopify_total_orders").eq("store_id", store.id).eq("date", today).maybeSingle();
          // Non sovrascrivere se il pull restituisce valori inferiori a quelli appena scritti dal webhook
          const curDR = Number(ex2?.shopify_daily_revenue || 0);
          const curDO = Number(ex2?.shopify_daily_orders || 0);
          const curTR = Number(ex2?.shopify_total_revenue || 0);
          const curTO = Number(ex2?.shopify_total_orders || 0);
          const finalDR = Math.max(dRevenue, curDR);
          const finalDO = Math.max(dOrders, curDO);
          const finalTR = Math.max(tRevenue, curTR);
          const finalTO = Math.max(tOrders, curTO);
          if (ex2) {
            await sb.from("store_stats").update({
              shopify_daily_orders: finalDO,
              shopify_daily_revenue: finalDR,
              shopify_total_orders: finalTO,
              shopify_total_revenue: finalTR,
              last_sync: new Date().toISOString(),
            }).eq("id", ex2.id);
          } else {
            await sb.from("store_stats").insert({
              store_id: store.id, date: today,
              shopify_daily_orders: finalDO,
              shopify_daily_revenue: finalDR,
              shopify_total_orders: finalTO,
              shopify_total_revenue: finalTR,
              last_sync: new Date().toISOString(),
            });
          }
          await sb.from("stores").update({
            cap_window_revenue: finalDR,
            bridge_last_sync: new Date().toISOString(),
          }).eq("id", store.id);
          result.bridge_pull = {
            daily_orders: finalDO,
            daily_revenue: finalDR,
            total_orders: finalTO,
            total_revenue: finalTR,
          };
        }
      } else {
        result.bridge_pull_error = `HTTP ${r.status}`;
      }
    }
  } catch (e: any) {
    result.bridge_pull_error = e?.message || String(e);
  }

  // === Check rotation threshold ===
  // Rotazione immediata: appena UNO QUALSIASI store "corrente" (non riservato a un
  // prodotto) supera la propria soglia, ruota subito al prossimo eligible.
  // Non aspettiamo che il callback arrivi proprio sullo store current: usiamo
  // sempre la snapshot più fresca di tutti gli store.
  {
    const algorithm = ((await getSetting(sb, "rotation_algorithm", "weighted")) as RotationAlgorithm);
    const baseStores = await getAllStores(sb);
    await refreshCapWindows(sb, baseStores);

    // Store riservati: assegnati manualmente ad almeno un prodotto → esclusi
    // dalla rotazione generale, anche se tutti gli altri hanno superato il cap.
    const reservedStoreIds = new Set<string>();
    const { data: assignedRows } = await sb
      .from("products")
      .select("shopify_target_stores")
      .neq("shopify_target_stores", "[]");
    for (const r of (assignedRows as any[]) || []) {
      const arr = Array.isArray(r?.shopify_target_stores) ? r.shopify_target_stores : [];
      for (const id of arr) if (id) reservedStoreIds.add(String(id));
    }

    const currentStore = baseStores.find((s) => s.is_current) || null;
    const currentIsReserved = currentStore ? reservedStoreIds.has(currentStore.id) : false;
    const curCap = Number(currentStore?.cap_amount || 0);
    const curRev = Number(currentStore?.cap_window_revenue || 0);
    const needsRotation = !!currentStore && curCap > 0 && curRev >= curCap;

    if (!currentStore || needsRotation) try {
      const { data: extras } = await sb.from("stores")
        .select("id, consecutive_errors, avg_latency_ms, health_status, needs_reauth, bridge_status");
      const extraMap = new Map<string, any>(((extras as any[]) || []).map((e) => [e.id, e]));

      // Lifetime total revenue per store (max across all store_stats rows).
      const { data: statRows } = await sb.from("store_stats").select("store_id, shopify_total_revenue");
      const totalRevMap = new Map<string, number>();
      for (const r of (statRows as any[]) || []) {
        const id = String(r.store_id);
        const v = Number(r.shopify_total_revenue || 0);
        if (v > (totalRevMap.get(id) || 0)) totalRevMap.set(id, v);
      }

      const toWeightedStores = (rows: typeof baseStores): WeightedStore[] => rows.map((s) => {
          const e = extraMap.get(s.id) || {};
          const bridgeOk = e.bridge_status === "connected";
          return {
            ...s,
            consecutive_errors: e.consecutive_errors || 0,
            avg_latency_ms: e.avg_latency_ms || 0,
            health_status: bridgeOk ? (e.health_status || "online") : "offline",
            needs_reauth: e.needs_reauth || false,
            shopify_total_revenue: totalRevMap.get(s.id) || 0,
          };
        });

      const stores: WeightedStore[] = toWeightedStores(baseStores.filter((s) => !reservedStoreIds.has(s.id)));

      let next = pickStore(stores, algorithm, {
        excludeIds: currentStore ? [currentStore.id] : [],
        currentId: currentStore?.id,
      });
      let usedReservedFallback = false;

      // Se non esiste nessun altro store "libero" (caso reale: tutti gli altri
      // sono assegnati a prodotti), ruota comunque allo store attivo con meno
      // fatturato. Altrimenti il CAP resta bloccato sullo stesso negozio.
      if (!next && currentStore) {
        const emergencyStores = toWeightedStores(baseStores.filter((s) => s.id !== currentStore.id));
        next = pickStore(emergencyStores, algorithm, {
          excludeIds: [currentStore.id],
          currentId: null,
        });
        usedReservedFallback = !!next && reservedStoreIds.has(next.id);
      }
      if (next && next.id !== currentStore?.id) {
        await setCurrent(sb, next.id);
        // Bridge-pull immediato del nuovo store corrente: fetch del fatturato
        // REALE giornaliero da Sito B così cap_window_revenue parte dal valore
        // autoritativo Shopify del giorno e non da 0.
        try {
          const { data: nextFull } = await sb.from("stores")
            .select("id, bridge_site_url, bridge_api_key_encrypted")
            .eq("id", next.id).maybeSingle();
          if (nextFull?.bridge_site_url && nextFull?.bridge_api_key_encrypted) {
            const nextKey = await decryptString(nextFull.bridge_api_key_encrypted);
            if (nextKey) {
              let base = String(nextFull.bridge_site_url).trim().replace(/\/$/, "");
              if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
              const r2 = await fetch(`${base}/api/public/bridge/sync`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Bridge-Api-Key": nextKey },
                body: JSON.stringify({ store_id: next.id }),
              });
              if (r2.ok) {
                const snap2: any = await r2.json().catch(() => null);
                if (snap2) {
                  const dO = Number(snap2.daily_orders || 0);
                  const dR = Number(snap2.daily_revenue || 0);
                  const tO = Number(snap2.total_orders || 0);
                  const tR = Number(snap2.total_revenue || 0);
                  const { data: ex3 } = await sb.from("store_stats")
                    .select("id, shopify_daily_revenue, shopify_daily_orders, shopify_total_revenue, shopify_total_orders")
                    .eq("store_id", next.id).eq("date", today).maybeSingle();
                  const fDR = Math.max(dR, Number(ex3?.shopify_daily_revenue || 0));
                  const fDO = Math.max(dO, Number(ex3?.shopify_daily_orders || 0));
                  const fTR = Math.max(tR, Number(ex3?.shopify_total_revenue || 0));
                  const fTO = Math.max(tO, Number(ex3?.shopify_total_orders || 0));
                  if (ex3) {
                    await sb.from("store_stats").update({
                      shopify_daily_orders: fDO, shopify_daily_revenue: fDR,
                      shopify_total_orders: fTO, shopify_total_revenue: fTR,
                      last_sync: new Date().toISOString(),
                    }).eq("id", ex3.id);
                  } else {
                    await sb.from("store_stats").insert({
                      store_id: next.id, date: today,
                      shopify_daily_orders: fDO, shopify_daily_revenue: fDR,
                      shopify_total_orders: fTO, shopify_total_revenue: fTR,
                      last_sync: new Date().toISOString(),
                    });
                  }
                  await sb.from("stores").update({
                    cap_window_revenue: fDR,
                    bridge_last_sync: new Date().toISOString(),
                  }).eq("id", next.id);
                  result.next_store_pull = { daily_revenue: fDR, daily_orders: fDO };
                }
              }
            }
          }
        } catch (e: any) {
          result.next_store_pull_error = e?.message || String(e);
        }
        await logRotation(sb, {
          from_store_id: currentStore?.id ?? null,
          to_store_id: next.id,
          trigger_type: "bridge_callback",
          reason: currentStore
            ? `Cap raggiunto (${curRev.toFixed(2)} ≥ ${curCap}) — rotazione immediata${usedReservedFallback ? " (fallback: nessuno store libero disponibile)" : ""}`
            : "Nessuno store corrente valido nella rotazione generale — riallineamento automatico",
          from_revenue: curRev,
          from_threshold: curCap,
          metadata: { current_store_reserved: currentIsReserved, used_reserved_fallback: usedReservedFallback },
        });
        result.rotated = true;
        result.rotated_to = next.shop_domain;
        result.rotation_reserved_fallback = usedReservedFallback;
      } else {
        result.rotated = false;
        result.rotation_skipped = "no_eligible_store";
      }
    } catch (e: any) {
      result.rotation_error = e?.message || String(e);
    }
  }


  await logSystem(sb, {
    level: result.rotation_error ? "warning" : "webhook",
    category: "webhook",
    store_id: store.id,
    message: `Callback ${type} da ${store.shop_domain}${result.rotated ? ` → ruotato a ${result.rotated_to}` : ""}`,
    metadata: {
      type,
      headers: headersSnapshot,
      body: bodyPreview,
      result,
    },
  });

  return jsonResponse(result);
});

async function getSetting(sb: any, key: string, fallback: any) {
  const { data } = await sb.from("settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? fallback;
}
