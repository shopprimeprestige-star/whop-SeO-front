// check-offline-stores — DEPRECATO. Sito A non controlla più direttamente Shopify/worker.
// La verifica online/offline degli store viene fatta tramite il bridge handshake/sync verso Sito B.
import { corsHeaders, errorResponse, getEnv, jsonResponse } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = req.headers.get("Authorization") || "";
  if (auth !== `Bearer ${getEnv("SUPABASE_SERVICE_ROLE_KEY")}`) {
    return errorResponse("Unauthorized", 401);
  }
  return jsonResponse({
    success: true,
    deprecated: true,
    message: "check-offline-stores è no-op: il monitoraggio store passa dal Sito B (bridge).",
  });
});
