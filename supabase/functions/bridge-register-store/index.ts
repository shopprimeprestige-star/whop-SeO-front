// bridge-register-store — Sito A chiede a Sito B di registrare un nuovo store.
// Sito B esegue tutto il flusso Shopify (OAuth, token, webhook). Sito A non
// parla mai con Shopify. La risposta di B può includere `authorize_url` che A
// aprirà al volo in una nuova tab per far completare l'OAuth all'admin.
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
  const { data: store } = await sb.from("stores")
    .select("id, shop_domain, display_name, bridge_site_url, bridge_api_key_encrypted")
    .eq("id", body.store_id).maybeSingle();
  if (!store) return errorResponse("Store not found", 404);
  if (!store.bridge_site_url) return errorResponse("bridge_site_url not configured", 400);

  const apiKey = await decryptString(store.bridge_api_key_encrypted);
  if (!apiKey) return errorResponse("bridge_api_key not configured", 400);

  const callbackUrl = `${getEnv("SUPABASE_URL")}/functions/v1/bridge-callback`;
  let base = String(store.bridge_site_url).trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  const url = `${base}/api/public/bridge/register-store`;

  const startedAt = Date.now();
  let httpStatus: number | null = null;
  let respJson: any = null;
  let errorMessage: string | null = null;
  let authorizeUrl: string | null = null;

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Bridge-Api-Key": apiKey },
      body: JSON.stringify({
        store_id: store.id,
        shop_domain: store.shop_domain,
        display_name: store.display_name,
        callback_url: callbackUrl,
      }),
    });
    httpStatus = r.status;
    const text = await r.text();
    try { respJson = text ? JSON.parse(text) : null; } catch { respJson = { raw: text.slice(0, 2000) }; }
    if (!r.ok) {
      const remoteMsg = respJson?.error || respJson?.message || respJson?.raw || text.slice(0, 500);
      errorMessage = `Sito B HTTP ${r.status}: ${remoteMsg}`;
    } else {
      authorizeUrl = respJson?.authorize_url || null;
    }
  } catch (e: any) {
    errorMessage = `Network: ${e?.message || String(e)}`;
  }

  const ok = !errorMessage;
  await sb.from("stores").update({
    bridge_status: ok ? "registered" : "error",
    bridge_last_error: errorMessage ? errorMessage.slice(0, 1000) : null,
    bridge_last_connected: ok ? new Date().toISOString() : null,
  }).eq("id", store.id);

  return jsonResponse({
    ok,
    http_status: httpStatus,
    duration_ms: Date.now() - startedAt,
    url,
    authorize_url: authorizeUrl,
    error: errorMessage,
    response: respJson,
  }, ok ? 200 : 502);
});
