// rotate-store v2 — rotazione manuale o forzata con algoritmo configurabile.
// Body: { force_to_store_id?: string, reason?: string, country?: string, algorithm?: string }
// Admin only.
// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { authenticateAdmin, corsHeaders, errorResponse, getEnv, jsonResponse } from "../_shared/http.ts";
import { getAllStores, refreshCapWindows, setCurrent, logRotation } from "../_shared/cap-rotation.ts";
import { pickStore, WeightedStore, RotationAlgorithm } from "../_shared/weighted-rotation.ts";
import { logSystem } from "../_shared/logger.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const auth = await authenticateAdmin(req);
  if (!auth.ok) return errorResponse(auth.error, auth.status);

  let body: any = {};
  try { body = await req.json(); } catch { /* allow empty */ }

  const supabase: any = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"));
  const groupId = crypto.randomUUID();

  const algorithm = (body.algorithm || (await getSetting(supabase, "rotation_algorithm", "weighted"))) as RotationAlgorithm;
  const country = body.country?.toUpperCase();

  const baseStores = await getAllStores(supabase);
  await refreshCapWindows(supabase, baseStores);
  const { data: extras } = await supabase
    .from("stores")
    .select("id, consecutive_errors, avg_latency_ms, health_status, needs_reauth");
  const extraMap = new Map<string, any>(((extras as any[]) || []).map((e) => [e.id, e]));

  // Store riservati: assegnati manualmente ad almeno un prodotto → esclusi dalla rotazione generale.
  const reservedStoreIds = new Set<string>();
  const { data: assignedRows } = await supabase
    .from("products")
    .select("shopify_target_stores")
    .neq("shopify_target_stores", "[]");
  for (const r of (assignedRows as any[]) || []) {
    const arr = Array.isArray(r?.shopify_target_stores) ? r.shopify_target_stores : [];
    for (const id of arr) if (id) reservedStoreIds.add(String(id));
  }

  const allStores: WeightedStore[] = baseStores.map((s) => {
    const e = extraMap.get(s.id) || {};
    return {
      ...s,
      consecutive_errors: e.consecutive_errors || 0,
      avg_latency_ms: e.avg_latency_ms || 0,
      health_status: e.health_status || "online",
      needs_reauth: e.needs_reauth || false,
    } as WeightedStore;
  });
  // Per la rotazione generale escludiamo gli store riservati (a meno di force_to_store_id esplicito).
  const stores: WeightedStore[] = allStores.filter((s) => !reservedStoreIds.has(s.id));

  const current = stores.find((s) => s.is_current) || null;

  let target: WeightedStore | null = null;
  if (body.force_to_store_id) {
    target = allStores.find((s) => s.id === body.force_to_store_id) || null;
    if (!target) return errorResponse("force_to_store_id not found", 404);
  } else {
    target = pickStore(stores, algorithm, { country, currentId: current?.id, excludeIds: current ? [current.id] : [] });
    if (!target) {
      // se non c'è altro candidato, ripeschiamo qualunque eligible (incluso current)
      target = pickStore(stores, algorithm, { country, currentId: current?.id });
    }
    if (!target) return errorResponse("No eligible stores", 503);
  }

  if (current?.id === target.id) {
    return jsonResponse({
      group_id: groupId, skipped: true,
      reason: "Target is already current store",
      to_store_domain: target.shop_domain, to_store_id: target.id,
    });
  }

  await setCurrent(supabase, target.id);
  const logId = await logRotation(supabase, {
    from_store_id: current?.id ?? null,
    to_store_id: target.id,
    trigger_type: "manual",
    reason: body.reason || "Admin manual rotation",
    group_id: groupId,
    from_revenue: current?.cap_window_revenue,
    from_threshold: current?.cap_amount ?? undefined,
    metadata: { country: country ?? null, algorithm },
  });
  await logSystem(supabase, {
    level: "rotate", category: "rotation",
    store_id: target.id,
    message: `Manual rotation → ${target.shop_domain}`,
    metadata: { from_store_id: current?.id ?? null, algorithm, reason: body.reason },
  });

  return jsonResponse({
    group_id: groupId,
    from_store: current ? slim(current) : null,
    to_store: slim(target),
    to_store_domain: target.shop_domain,
    to_store_id: target.id,
    algorithm,
    rotation_log_id: logId,
  });
});

function slim(s: any) {
  return {
    id: s.id, shop_domain: s.shop_domain, display_name: s.display_name,
    cap_window_revenue: Number(s.cap_window_revenue || 0),
    cap_amount: s.cap_amount ? Number(s.cap_amount) : null,
    country_rule: s.country_rule, health_status: s.health_status,
    consecutive_errors: s.consecutive_errors, avg_latency_ms: s.avg_latency_ms,
  };
}

async function getSetting(supabase: any, key: string, fallback: any) {
  const { data } = await supabase.from("settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? fallback;
}
