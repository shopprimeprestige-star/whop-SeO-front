// bridge-handshake — chiama POST {bridge_site_url}/api/handshake del Sito Ponte
// e aggiorna bridge_status / bridge_last_connected sulla riga store.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { authenticateAdmin, corsHeaders, errorResponse, getEnv, jsonResponse } from "../_shared/http.ts";
import { decryptString } from "../_shared/crypto.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("POST only", 405);

  const auth = await authenticateAdmin(req);
  if (!auth.ok) return errorResponse(auth.error, auth.status);

  let body: { store_id?: string };
  try { body = await req.json(); } catch { return errorResponse("Invalid JSON", 400); }
  if (!body.store_id) return errorResponse("store_id required", 400);

  const sb: any = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"));
  const { data: store, error } = await sb.from("stores")
    .select("id, shop_domain, bridge_site_url, bridge_api_key_encrypted")
    .eq("id", body.store_id).maybeSingle();
  if (error || !store) return errorResponse("Store not found", 404);
  if (!store.bridge_site_url) return errorResponse("bridge_site_url not configured", 400);

  const apiKey = await decryptString(store.bridge_api_key_encrypted);
  if (!apiKey) return errorResponse("bridge_api_key not configured", 400);

  const callbackUrl = `${getEnv("SUPABASE_URL")}/functions/v1/bridge-callback`;
  let base = String(store.bridge_site_url).trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  const url = `${base}/api/public/bridge/handshake`;

  const startedAt = Date.now();
  let status: string = "error";
  let httpStatus: number | null = null;
  let errorMessage: string | null = null;
  let respJson: any = null;

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Bridge-Api-Key": apiKey },
      body: JSON.stringify({
        store_id: store.id,
        shop_domain: store.shop_domain,
        callback_url: callbackUrl,
      }),
    });
    httpStatus = r.status;
    const text = await r.text();
    try { respJson = text ? JSON.parse(text) : null; } catch { respJson = { raw: text.slice(0, 2000) }; }
    if (r.ok) {
      status = "connected";
    } else {
      status = "error";
      const remoteMsg = respJson?.error || respJson?.message || respJson?.raw || text.slice(0, 500);
      errorMessage = `Sito B HTTP ${r.status}: ${remoteMsg}`;
    }
  } catch (e: any) {
    status = "error";
    errorMessage = `Network: ${e?.message || String(e)}`;
  }

  const update: Record<string, unknown> = {
    bridge_status: status === "connected" ? "connected" : "error",
    bridge_last_error: errorMessage ? errorMessage.slice(0, 1000) : null,
  };
  if (status === "connected") update.bridge_last_connected = new Date().toISOString();

  await sb.from("stores").update(update).eq("id", store.id);

  return jsonResponse({
    ok: status === "connected",
    status,
    http_status: httpStatus,
    duration_ms: Date.now() - startedAt,
    url,
    error: errorMessage,
    response: respJson,
  }, status === "connected" ? 200 : 502);
});
