import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Called by pg_cron every hour to verify offline stores and reset daily stats at midnight.
export const Route = createFileRoute("/api/public/hooks/cron")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const action = url.searchParams.get("action") ?? "check-offline";

        const supabase = createClient(
          import.meta.env.VITE_SUPABASE_URL!,
          import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
        );

        const fn = action === "daily-reset" ? "daily-reset" : "check-offline-stores";

        try {
          const { data, error } = await supabase.functions.invoke(fn, { body: {} });
          if (error) {
            return new Response(
              JSON.stringify({ ok: false, action, error: error.message }),
              { status: 500, headers: { "Content-Type": "application/json" } },
            );
          }
          return new Response(
            JSON.stringify({ ok: true, action, data }),
            { headers: { "Content-Type": "application/json" } },
          );
        } catch (e) {
          return new Response(
            JSON.stringify({ ok: false, action, error: (e as Error).message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
