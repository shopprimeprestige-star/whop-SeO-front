import { lazy, Suspense, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StoreHeader } from "@/components/storefront/StoreHeader";
import { StoreFooter } from "@/components/storefront/StoreFooter";
import { Skeleton } from "@/components/ui/skeleton";
import { SmartImage } from "@/components/storefront/SmartImage";
import { useI18n } from "@/lib/i18n";
import { useEntityTranslations, tField } from "@/hooks/useTranslations";
import { withLocale } from "@/lib/locale-utils";
const CartDrawer = lazy(() =>
  import("@/components/storefront/CartDrawer").then((m) => ({ default: m.CartDrawer })),
);

interface Product {
  id: string;
  slug: string;
  name: string;
  description_short: string | null;
  price: number;
  compare_price: number | null;
  images: any;
  category_id: string | null;
}
interface Category { id: string; name: string; slug: string; }

export function ShopPage() {
  const { t, lang, price: fmt } = useI18n();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [pRes, cRes] = await Promise.all([
        supabase
          .from("products")
          .select("id, slug, name, description_short, price, compare_price, images, category_id")
          .eq("status", "active")
          .order("sort_order", { ascending: true }),
        supabase.from("categories").select("id, name, slug").eq("is_active", true).order("sort_order"),
      ]);
      setProducts((pRes.data as Product[]) || []);
      setCategories((cRes.data as Category[]) || []);
      setLoading(false);
    })();
  }, []);

  const filtered = active ? products.filter((p) => p.category_id === active) : products;
  const localePrefix = lang === "it" ? null : lang;
  const productHref = (slug: string) => withLocale(`/p/${slug}`, localePrefix);
  // Hide categories that have no products
  const productCategoryIds = new Set(products.map((p) => p.category_id).filter(Boolean) as string[]);
  const visibleCategories = categories.filter((c) => productCategoryIds.has(c.id));
  const tx = useEntityTranslations("product", filtered.map((p) => p.id));
  const txCat = useEntityTranslations("category", visibleCategories.map((c) => c.id));

  return (
    <div className="min-h-screen bg-background">
      <StoreHeader />
      <Suspense fallback={null}><CartDrawer /></Suspense>

      <main className="mx-auto max-w-6xl px-6 py-10 md:py-14">
        <div className="mb-8 md:mb-10">
          <h1 className="text-[26px] sm:text-[30px] md:text-[34px] font-light tracking-[-0.025em] leading-tight">{t("nav.shop")}</h1>
          <p className="mt-2 text-[14px] text-muted-foreground font-normal">{t("featured.eyebrow")}</p>
        </div>

        {visibleCategories.length > 0 && (
          <div className="mb-8 flex flex-wrap gap-1.5">
            <button
              onClick={() => setActive(null)}
              className={`rounded-full border px-3.5 py-1 text-[12.5px] font-normal transition-colors ${
                active === null ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground/70 hover:text-foreground hover:border-primary/40"
              }`}
            >
              {t("cta.see_all")}
            </button>
            {visibleCategories.map((c) => (
              <button
                key={c.id}
                onClick={() => setActive(c.id)}
                className={`rounded-full border px-3.5 py-1 text-[12.5px] font-normal transition-colors ${
                  active === c.id ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground/70 hover:text-foreground hover:border-primary/40"
                }`}
              >
                {tField(txCat, c.id, "name", c.name)}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (<Skeleton key={i} className="aspect-[4/5] w-full rounded-md" />))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-md border border-dashed border-border py-20 text-center text-[13px] text-muted-foreground">—</div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p, idx) => {
              const img = Array.isArray(p.images) && p.images.length > 0 ? (p.images[0] as string) : null;
              const onSale = p.compare_price && Number(p.compare_price) > Number(p.price);
              const isAboveFold = idx < 3;
              return (
                <a
                  key={p.id}
                  href={productHref(p.slug)}
                  className="group block overflow-hidden rounded-md border border-border/70 bg-card transition-all hover:border-primary/30 [content-visibility:auto] [contain-intrinsic-size:auto_420px]"
                >
                  <div className="relative aspect-[4/5] overflow-hidden bg-muted/30 flex items-center justify-center">
                    {img ? (
                      <SmartImage
                        src={img}
                        alt={p.name}
                        width={400}
                        height={500}
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="h-full w-full object-contain p-3 transition-transform duration-700 group-hover:scale-[1.03]"
                        priority={isAboveFold && idx === 0}
                        eager={isAboveFold}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No image</div>
                    )}
                    {onSale && (
                      <span className="absolute left-3 top-3 inline-flex items-center rounded-sm bg-primary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary-foreground">
                        {t("common.sale")}
                      </span>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="text-[14.5px] font-medium leading-tight tracking-[-0.01em]">{tField(tx, p.id, "name", p.name)}</h3>
                    {(tField(tx, p.id, "description_short", p.description_short) || p.description_short) && (
                      <p className="mt-1 line-clamp-1 text-[12px] text-muted-foreground font-normal">{tField(tx, p.id, "description_short", p.description_short)}</p>
                    )}
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-[14.5px] font-medium tabular-nums">{fmt(Number(p.price))}</span>
                      {onSale && (<span className="text-[12.5px] text-muted-foreground line-through tabular-nums">{fmt(Number(p.compare_price))}</span>)}
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </main>
      <StoreFooter />
    </div>
  );
}
