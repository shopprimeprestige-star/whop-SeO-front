// bridge-update-config — invia a Sito B le modifiche di configurazione Shopify.
// Sito B le valida, le salva localmente e applica le azioni necessarie su Shopify
// (es. ri-registrare webhook con i nuovi topics, validare il nuovo Admin token, ecc.).
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { authenticateAdmin, corsHeaders, errorResponse, getEnv, jsonResponse } from "../_shared/http.ts";
import { decryptString } from "../_shared/crypto.ts";

interface UpdateBody {
  store_id?: string;
  // Tutti i campi sono opzionali: B aggiorna solo quelli inviati (sentinel "" = unchanged).
  access_token?: string;        // nuovo Admin token (in chiaro)
  client_id?: string;
  client_secret?: string;
  oauth_scopes?: string;        // csv
  webhook_secret?: string;
  webhook_topics?: string[];    // es. ["orders/paid","orders/create"]
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("POST only", 405);

  const auth = await authenticateAdmin(req);
  if (!auth.ok) return errorResponse(auth.error, auth.status);

  let body: UpdateBody;
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
  const url = `${base}/api/public/bridge/update-config`;

  // Costruisci payload solo con i campi presenti
  const payload: Record<string, unknown> = {
    store_id: store.id,
    shop_domain: store.shop_domain,
  };
  for (const k of ["access_token", "client_id", "client_secret", "oauth_scopes", "webhook_secret"] as const) {
    const v = body[k];
    if (typeof v === "string" && v.length > 0) payload[k] = v;
  }
  if (Array.isArray(body.webhook_topics)) payload.webhook_topics = body.webhook_topics;

  const startedAt = Date.now();
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Bridge-Api-Key": apiKey },
      body: JSON.stringify(payload),
    });
    const text = await r.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 2000) }; }
    if (!r.ok) {
      const remoteMsg = data?.error || data?.message || data?.raw || text.slice(0, 500);
      return jsonResponse({
        ok: false,
        error: `Sito B HTTP ${r.status}: ${remoteMsg}`,
        http_status: r.status,
        url,
        response: data,
      }, 502);
    }
    return jsonResponse({
      ok: true,
      duration_ms: Date.now() - startedAt,
      applied: data?.applied ?? null,
      config: data?.config ?? null,
      warnings: data?.warnings ?? [],
    });
  } catch (e: any) {
    return jsonResponse({ ok: false, error: `Network: ${e?.message || String(e)}`, url }, 502);
  }
});
