import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Callback chiamato dal Sito B quando un checkout viene PAGATO.
// Marca la conversione sulla sessione di tracking del Sito A (tabella sessions),
// così le Statistiche prodotti contano conversioni/CVR/revenue reali.
// Auth leggera: la conversione si marca per session_id (UUID della sessione).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Bridge-Api-Key",
  "Access-Control-Max-Age": "86400",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export const Route = createFileRoute("/api/public/bridge/callback")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let body: any;
        try {
          body = await request.json();
        } catch {
          return json(400, { ok: false, error: "invalid_body" });
        }

        // Accetta sia { session_id } sia il formato notifyCallback { type, data: { session_id } }
        const type = body?.type as string | undefined;
        const payload = body?.data && typeof body.data === "object" ? body.data : body;
        // Solo eventi di conversione marcano la sessione
        if (type && !["order_paid", "order_created", "conversion"].includes(type)) {
          return json(200, { ok: true, ignored: type });
        }
        const sessionId = String(payload?.session_id || "").trim();
        if (!sessionId) return json(400, { ok: false, error: "missing_session_id" });

        const supabase = createClient(
          import.meta.env.VITE_SUPABASE_URL!,
          import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        // Marca la sessione come convertita (stesso permesso usato dal browser).
        const { data, error } = await supabase
          .from("sessions")
          .update({ converted: true, bounce: false })
          .eq("session_id", sessionId)
          .select("id")
          .maybeSingle();

        if (error) {
          console.error("[bridge/callback] update error", error.message);
          return json(500, { ok: false, error: error.message });
        }

        // Aggiorna il fatturato per-store (store_stats) via RPC SECURITY DEFINER.
        const storeId = String(payload?.store_id || "").trim();
        const amount = Number(payload?.amount ?? 0);
        let revenueOk = false;
        if (storeId && amount > 0) {
          try {
            const { error: rpcErr } = await supabase.rpc("bridge_record_revenue" as never, { p_store_id: storeId, p_amount: amount } as never);
            revenueOk = !rpcErr;
            if (rpcErr) console.error("[bridge/callback] revenue rpc error", rpcErr.message);
          } catch (e) {
            console.error("[bridge/callback] revenue rpc threw", e);
          }
        }

        if (!data) {
          return json(200, { ok: true, matched: false, revenue: revenueOk, note: "session_id non trovato" });
        }
        return json(200, { ok: true, matched: true, revenue: revenueOk });
      },
    },
  },
});
