// reveal-bridge-key — restituisce la API key del Sito Ponte in chiaro per la UI admin.
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
  const { data } = await sb.from("stores")
    .select("bridge_api_key_encrypted").eq("id", body.store_id).maybeSingle();
  if (!data) return errorResponse("Store not found", 404);

  const key = await decryptString(data.bridge_api_key_encrypted);
  return jsonResponse({ api_key: key || "" });
});
