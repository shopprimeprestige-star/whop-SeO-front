import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Cron-friendly endpoint per:
 * - "scaldare" la cache di /sitemap.xml (chiamata HEAD/GET)
 * - notificare Google e Bing (IndexNow) quando ci sono nuovi prodotti / pagine
 *
 * Pubblico (no auth) ma idempotente.
 * Da chiamare via pg_cron ogni 30 min.
 */
export const Route = createFileRoute("/api/public/hooks/sitemap-refresh")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const origin = `${url.protocol}//${url.host}`;
        const sitemapUrl = `${origin}/sitemap.xml`;

        const results: Record<string, unknown> = { sitemap: sitemapUrl };

        // 1. Warm sitemap cache
        try {
          const r = await fetch(sitemapUrl, { method: "GET" });
          results.warm = { status: r.status, cache: r.headers.get("X-Cache") };
        } catch (e) {
          results.warm_error = (e as Error).message;
        }

        // 2. Trova ultime modifiche (24h) per IndexNow
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const [{ data: products }, { data: legal }] = await Promise.all([
          supabaseAdmin
            .from("products")
            .select("slug, updated_at")
            .eq("status", "active")
            .gte("updated_at", since),
          supabaseAdmin
            .from("legal_pages")
            .select("slug, updated_at")
            .eq("is_published", true)
            .gte("updated_at", since),
        ]);

        const urls: string[] = [
          ...(products || []).map((p: any) => `${origin}/p/${p.slug}`),
          ...(legal || []).map((l: any) => `${origin}/legal/${l.slug}`),
        ];
        results.changed_urls = urls.length;

        // 3. Ping Google sitemap (legacy ma tollerato)
        try {
          await fetch(`https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`);
          results.google_ping = "ok";
        } catch (e) {
          results.google_ping_error = (e as Error).message;
        }

        // 4. IndexNow (Bing/Yandex/etc)
        if (urls.length > 0) {
          try {
            // Chiave IndexNow opzionale: usa hostname come fallback
            const key = url.hostname.replace(/[^a-z0-9]/gi, "").slice(0, 32) || "default";
            const body = {
              host: url.hostname,
              key,
              keyLocation: `${origin}/${key}.txt`,
              urlList: urls.slice(0, 100),
            };
            const r = await fetch("https://api.indexnow.org/indexnow", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            results.indexnow = { status: r.status };
          } catch (e) {
            results.indexnow_error = (e as Error).message;
          }
        }

        return Response.json({ ok: true, ...results });
      },
      GET: async () => Response.json({ message: "Use POST" }),
    },
  },
});
