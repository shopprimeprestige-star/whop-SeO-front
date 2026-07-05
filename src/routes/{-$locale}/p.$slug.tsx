import { createFileRoute, redirect } from "@tanstack/react-router";
import { ProductPageView } from "@/pages/ProductPageView";
import { isSupportedLang, hreflangLinks } from "@/lib/locale-utils";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/{-$locale}/p/$slug")({
  beforeLoad: ({ params }) => {
    if (params.locale && !isSupportedLang(params.locale)) throw redirect({ to: "/{-$locale}", params: {} as any });
  },
  loader: async ({ params }) => {
    const lang = params.locale || "it";
    // Branding (titolo, og)
    const { data: branding } = await supabase
      .from("site_branding")
      .select("id, store_name, og_title, og_description, default_product_tagline")
      .maybeSingle();

    // Prodotto completo (per render istantaneo + og:image)
    const { data: product } = await supabase
      .from("products")
      .select("id, slug, name, subtitle, description_short, description_long, description_html, trust_badge_text, shipping_returns_html, image_fit, bullets, price, compare_price, images, variants, quantity_breaks, ab_test_id, seo_title, seo_description, status")
      .eq("slug", params.slug)
      .eq("status", "active")
      .maybeSingle();

    // Traduzioni branding + prodotto se non IT
    const tx: Record<string, string> = {};
    if (lang !== "it") {
      const ids: string[] = [];
      if (branding && (branding as any).id) ids.push((branding as any).id);
      const entityIds = [params.slug, product?.id].filter(Boolean) as string[];
      const { data: rows } = await supabase
        .from("translations")
        .select("entity_type, entity_id, field, value")
        .eq("lang", lang)
        .in("entity_type", ["branding", "product"])
        .in("entity_id", [...ids, ...entityIds]);
      for (const r of rows || []) tx[`${r.entity_type}|${r.entity_id}|${r.field}`] = r.value;
    }

    return { branding, product, tx, lang };
  },
  head: ({ loaderData, params }) => {
    const lang = params.locale || "it";
    const branding = (loaderData as any)?.branding;
    const product = (loaderData as any)?.product;
    const tx = (loaderData as any)?.tx || {};
    const storeName = branding?.store_name || "Store";
    const ogTitle = branding?.og_title || storeName;
    const productName =
      (product?.id && tx[`product|${product.id}|name`]) || product?.name || "";
    const seoTitle = (product?.id && tx[`product|${product.id}|seo_title`]) || product?.seo_title;
    const seoDesc =
      (product?.id && tx[`product|${product.id}|seo_description`]) || product?.seo_description;
    const shortDesc =
      (product?.id && tx[`product|${product.id}|description_short`]) || product?.description_short;

    const title = seoTitle || (productName ? `${productName} — ${storeName}` : ogTitle);
    const description = seoDesc || shortDesc || branding?.og_description || "";
    const ogImage = Array.isArray(product?.images) ? product?.images?.[0] : undefined;

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "product" },
        { property: "og:locale", content: lang },
        { property: "og:site_name", content: storeName },
        ...(ogImage ? [{ property: "og:image", content: ogImage }] : []),
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        ...(ogImage ? [{ name: "twitter:image", content: ogImage }] : []),
      ],
      links: hreflangLinks(`/p/${params.slug}`),
    };
  },
  component: ProductRouteComponent,
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center text-center">
      <div><h1 className="text-2xl font-bold">404</h1></div>
    </div>
  ),
});

function ProductRouteComponent() {
  const { slug } = Route.useParams();
  const { product } = Route.useLoaderData() as any;
  return <ProductPageView slug={slug} initialProduct={product} />;
}
