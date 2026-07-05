import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Cache in-memory (per worker instance). Invalidata quando cambia il MAX(updated_at)
// di prodotti attivi o pagine legali pubblicate.
let cache: { key: string; body: string; builtAt: number } | null = null;

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = `${url.protocol}//${url.host}`;

        // Step 1 — calcola "freshness key" leggera (solo MAX updated_at)
        const [{ data: pMax }, { data: lMax }] = await Promise.all([
          supabaseAdmin
            .from("products")
            .select("updated_at")
            .eq("status", "active")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabaseAdmin
            .from("legal_pages")
            .select("updated_at")
            .eq("is_published", true)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        const freshKey = `${origin}|${pMax?.updated_at || "-"}|${lMax?.updated_at || "-"}`;

        // Step 2 — se la cache è valida, usala
        if (cache && cache.key === freshKey) {
          return new Response(cache.body, {
            headers: {
              "Content-Type": "application/xml; charset=utf-8",
              "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
              "X-Cache": "HIT",
            },
          });
        }

        // Step 3 — rebuild
        const [{ data: products }, { data: legal }] = await Promise.all([
          supabaseAdmin.from("products").select("slug, updated_at").eq("status", "active"),
          supabaseAdmin.from("legal_pages").select("slug, updated_at").eq("is_published", true),
        ]);

        const staticUrls = ["", "shop"].map(
          (p) => `<url><loc>${origin}/${p}</loc><changefreq>daily</changefreq></url>`
        );
        const productUrls = ((products || []) as Array<{ slug: string; updated_at: string }>).map(
          (p) =>
            `<url><loc>${origin}/p/${p.slug}</loc><lastmod>${new Date(p.updated_at).toISOString()}</lastmod><changefreq>weekly</changefreq></url>`
        );
        const legalUrls = ((legal || []) as Array<{ slug: string; updated_at: string }>).map(
          (l) =>
            `<url><loc>${origin}/legal/${l.slug}</loc><lastmod>${new Date(l.updated_at).toISOString()}</lastmod><changefreq>monthly</changefreq></url>`
        );

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticUrls, ...productUrls, ...legalUrls].join("\n")}
</urlset>`;

        cache = { key: freshKey, body: xml, builtAt: Date.now() };

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
            "X-Cache": "MISS",
          },
        });
      },
    },
  },
});
