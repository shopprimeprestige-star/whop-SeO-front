import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * Cron endpoint: allinea cap_window_revenue al fatturato reale di OGGI
 * (store_stats.shopify_daily_revenue per la data odierna in Europe/Rome).
 * Schedulato da pg_cron alle 00:00 Europe/Rome.
 */
function romeDateKey(d = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export const Route = createFileRoute("/api/public/hooks/cap-reset")({
  server: {
    handlers: {
      POST: async () => {
        const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        if (!url || !key) {
          return new Response(JSON.stringify({ error: "missing env" }), { status: 500 });
        }
        const sb = createClient(url, key, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        const now = new Date().toISOString();
        const today = romeDateKey();

        const [{ data: stores, error: sErr }, { data: todayStats, error: tErr }] = await Promise.all([
          sb.from("stores").select("id").neq("id", "00000000-0000-0000-0000-000000000000"),
          sb.from("store_stats").select("store_id, shopify_daily_revenue").eq("date", today),
        ]);

        if (sErr || tErr) {
          const msg = sErr?.message || tErr?.message || "unknown";
          await sb.from("system_logs").insert({
            level: "error", category: "cron",
            message: `cap-reset failed: ${msg}`,
          });
          return new Response(JSON.stringify({ error: msg }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }

        const revByStore: Record<string, number> = {};
        for (const r of todayStats || []) {
          revByStore[r.store_id] = Number(r.shopify_daily_revenue || 0);
        }

        let updated = 0;
        await Promise.all(
          (stores || []).map(async (s: { id: string }) => {
            const { error } = await sb
              .from("stores")
              .update({
                cap_window_revenue: revByStore[s.id] || 0,
                cap_window_start: now,
              })
              .eq("id", s.id);
            if (!error) updated++;
          }),
        );

        await sb.from("system_logs").insert({
          level: "info", category: "cron",
          message: `cap-reset: ${updated} stores aligned to today revenue (Europe/Rome 00:00)`,
        });

        return new Response(
          JSON.stringify({ success: true, updated, date: today, at: now }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
