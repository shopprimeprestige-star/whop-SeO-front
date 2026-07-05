import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  ArrowRight, ShieldCheck, Truck, RotateCcw, Plus,
  Sparkles, Headphones, Award, Star, Flame, Crown, Timer, ShoppingBag,
} from "lucide-react";

import { useCart } from "@/lib/cart";
import { VariantPickerDialog } from "./VariantPickerDialog";
import { TrustpilotBadge, TrustpilotCarousel } from "./Trustpilot";
import { useI18n } from "@/lib/i18n";
import { useEntityTranslations, tField } from "@/hooks/useTranslations";
import { toast } from "sonner";

interface Product {
  id: string;
  slug: string;
  name: string;
  description_short: string | null;
  price: number;
  compare_price: number | null;
  images: any;
  variants: any;
  quantity_breaks: any;
  show_discount_badge?: boolean;
  show_trending_badge?: boolean;
  trending_badge_label?: string | null;
}

export function HomeSections() {
  return (
    <>
      <Hero />
      <FeaturedGrid />
      <TrustpilotCarousel />
      <BrandStory />
      <FAQ />
      <FinalCTABanner />
      <StickyShopBar />
    </>
  );
}

/* ============== HERO — premium tech, mobile-first ============== */

function Hero() {
  const { t } = useI18n();

  return (
    <section className="relative w-screen left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] overflow-hidden bg-hero-premium">
      {/* Subtle navy halo */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80vw] h-[40vh] rounded-full bg-primary/[0.04] blur-3xl pointer-events-none" />

      <div className="relative mx-auto max-w-5xl px-6 pt-16 pb-16 sm:pt-24 sm:pb-24 lg:pt-32 lg:pb-32 text-center">
        {/* Eyebrow micro-label — 11px */}
        <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
          <span className="h-1 w-1 rounded-full bg-primary animate-pulse-soft" />
          {t("hero.eyebrow")}
        </div>

        {/* H1 — scale: 36px mobile / 56px tablet / 72px desktop */}
        <h1 className="mt-6 text-balance text-[36px] leading-[1.05] sm:text-[56px] md:text-[64px] lg:text-[72px] font-light tracking-[-0.03em] text-foreground">
          {t("hero.title_main")}
          <span className="block font-light text-foreground/45">{t("hero.title_sub")}</span>
          <span className="block font-medium text-primary">
            {t("hero.title_accent")}
          </span>
        </h1>

        {/* Subtitle — 15px mobile / 16px desktop */}
        <p className="mt-6 sm:mt-7 text-[15px] sm:text-[16px] text-muted-foreground leading-relaxed max-w-xl mx-auto">
          {t("hero.subtitle")}
        </p>

        <div className="mt-8 sm:mt-9 flex justify-center">
          <Link to="/{-$locale}/shop" params={{} as any} className="w-full sm:w-auto">
            <Button
              size="lg"
              className="w-full sm:w-auto rounded-full px-8 h-11 gap-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-all text-[13.5px] font-medium shadow-none"
            >
              {t("cta.go_to_shop")} <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
            </Button>
          </Link>
        </div>

        <div className="mt-8 flex justify-center">
          <TrustpilotBadge variant="inline" align="center" desktopBoost />
        </div>
      </div>
    </section>
  );
}

/* ============== FEATURED / BESTSELLER GRID ============== */

const BADGE_POOL = [
  { key: "bestseller", Icon: Crown, cls: "bg-foreground text-background" },
  { key: "trending",   Icon: Sparkles, cls: "bg-accent text-white" },
  { key: "limited",    Icon: Flame, cls: "bg-primary text-primary-foreground" },
];

function FeaturedGrid() {
  const { t, price: fmt } = useI18n();
  const [products, setProducts] = useState<Product[]>([]);
  const [picker, setPicker] = useState<Product | null>(null);
  const [pickerPieces, setPickerPieces] = useState(1);
  const add = useCart((s) => s.add);
  const tx = useEntityTranslations("product", products.map((p) => p.id));

  useEffect(() => {
    supabase
      .from("products")
      .select("id, slug, name, description_short, price, compare_price, images, variants, quantity_breaks, show_discount_badge, show_trending_badge, trending_badge_label")
      .eq("status", "active")
      .order("sort_order")
      .limit(8)
      .then(({ data }) => setProducts((data as Product[]) || []));
  }, []);

  function handleAdd(p: Product) {
    const variants = Array.isArray(p.variants) ? p.variants : [];
    const breaks = Array.isArray(p.quantity_breaks) ? p.quantity_breaks : [];
    const bestBundle = breaks.length > 0 ? Math.max(...breaks.map((b: any) => Number(b.qty || 1))) : 1;
    if (variants.length > 0) {
      setPicker(p);
      setPickerPieces(bestBundle > 1 ? bestBundle : 1);
    } else {
      add({
        product_slug: p.slug,
        product_name: p.name,
        price: Number(p.price),
        quantity: 1,
        image: Array.isArray(p.images) ? p.images[0] : undefined,
      });
      toast.success(t("cta.add_to_cart"));
    }
  }

  if (products.length === 0) return null;

  return (
    <section className="py-14 sm:py-20 md:py-24">
      <div className="flex items-end justify-between mb-7 sm:mb-10 gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-primary mb-2">
            {t("featured.eyebrow")}
          </p>
          {/* H2 scale: 24 / 30 / 36 */}
          <h2 className="text-[24px] sm:text-[30px] md:text-[36px] font-light tracking-[-0.025em] text-foreground leading-[1.1]">
            {t("featured.title")}
          </h2>
        </div>
        <Link
          to="/{-$locale}/shop"
          params={{} as any}
          className="hidden sm:inline-flex items-center gap-1.5 text-[13.5px] font-medium text-foreground hover:text-primary transition-colors shrink-0"
        >
          {t("cta.see_all")} <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
        </Link>
      </div>

      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        {products.map((p, i) => {
          const img = Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null;
          const onSale = p.compare_price && Number(p.compare_price) > Number(p.price);
          const discountPct = onSale
            ? Math.round((1 - Number(p.price) / Number(p.compare_price)) * 100)
            : 0;
          const showDiscount = (p.show_discount_badge ?? true) && onSale;
          const showTrending = p.show_trending_badge === true;
          const trendingFallback = BADGE_POOL[i % BADGE_POOL.length];
          const trendingLabel = p.trending_badge_label?.trim() || `badge.${trendingFallback.key}`;
          const isTKey = trendingLabel.startsWith("badge.");
          const TrendingIcon = trendingFallback.Icon;

          return (
            <div
              key={p.id}
              className="group relative overflow-hidden rounded-xl sm:rounded-2xl border border-border bg-card transition-all duration-500 hover:shadow-card-premium hover:-translate-y-0.5 hover:border-primary/30"
            >
              <Link to="/{-$locale}/p/$slug" params={{ slug: p.slug } as any} className="block">
                <div className="relative aspect-square overflow-hidden bg-muted/40">
                  {img ? (
                    <img
                      src={img}
                      alt={p.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No image</div>
                  )}

                  {showTrending && (
                    <div className="absolute top-2.5 left-2.5">
                      <span className="inline-flex items-center gap-1 rounded-full bg-foreground text-background text-[9px] sm:text-[10px] font-medium px-2 sm:px-2.5 py-0.5 sm:py-1 uppercase tracking-wider">
                        <TrendingIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3" strokeWidth={1.8} />
                        {isTKey ? t(trendingLabel) : trendingLabel}
                      </span>
                    </div>
                  )}
                </div>

                <div className="p-3 sm:p-4">
                  <div className="flex items-center gap-1.5 text-[10.5px] sm:text-[11px] text-muted-foreground mb-1.5">
                    <span className="inline-flex items-center" style={{ gap: 1.5 }}>
                      {[0,1,2,3,4].map((s) => (
                        <span
                          key={s}
                          className="relative inline-flex items-center justify-center shrink-0"
                          style={{ width: 11, height: 11, background: "#00B67A" }}
                          aria-hidden
                        >
                          <svg viewBox="0 0 24 24" width={8} height={8} fill="white">
                            <path d="M12 2.5l2.95 6.36 6.55.6-4.95 4.55 1.5 6.49L12 17.27 5.95 20.5l1.5-6.49L2.5 9.46l6.55-.6L12 2.5z" />
                          </svg>
                        </span>
                      ))}
                    </span>
                    <span className="tabular-nums font-medium text-foreground">4,9</span>
                  </div>
                  <h3 className="font-medium text-[13.5px] sm:text-[14.5px] leading-snug line-clamp-2 text-foreground min-h-[2.4em] tracking-[-0.01em]">
                    {tField(tx, p.id, "name", p.name)}
                  </h3>
                  <div className="mt-2.5 flex items-baseline flex-wrap gap-x-2 gap-y-1">
                    <span className="text-[15px] sm:text-base font-medium text-foreground tabular-nums">{fmt(Number(p.price))}</span>
                    {onSale && (
                      <span className="text-[11px] sm:text-xs text-muted-foreground line-through tabular-nums">
                        {fmt(Number(p.compare_price))}
                      </span>
                    )}
                    {showDiscount && (
                      <span className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] sm:text-[10.5px] font-medium text-primary tabular-nums">
                        −{discountPct}%
                      </span>
                    )}
                  </div>
                </div>
              </Link>
              <button
                onClick={() => handleAdd(p)}
                className="absolute top-2.5 right-2.5 h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-background/95 backdrop-blur shadow-soft border border-border flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-300 hover:bg-cta-gradient hover:text-primary-foreground hover:border-transparent hover:scale-110"
                aria-label={t("cta.add_to_cart")}
              >
                <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>
            </div>
          );
        })}
      </div>

      {/* CTA "vedi tutti" mobile */}
      <div className="mt-8 sm:hidden text-center">
        <Link to="/{-$locale}/shop" params={{} as any}>
          <Button variant="outline" size="lg" className="rounded-full px-7">
            {t("cta.see_all")} <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </Link>
      </div>

      {picker && (
        <VariantPickerDialog
          open={!!picker}
          onOpenChange={(v) => !v && setPicker(null)}
          product={{
            slug: picker.slug,
            name: picker.name,
            price: Number(picker.price),
            images: Array.isArray(picker.images) ? picker.images : [],
          }}
          variants={Array.isArray(picker.variants) ? picker.variants : []}
          pieces={pickerPieces}
          onConfirm={(selections) => {
            const img = Array.isArray(picker.images) ? picker.images[0] : undefined;
            selections.forEach((sel) => {
              add({
                product_slug: picker.slug,
                product_name: picker.name,
                variant_label: sel.label,
                price: Number(picker.price),
                quantity: 1,
                image: img,
                shopify_variant_id: sel.shopify_variant_id,
              });
            });
            toast.success(t("cta.add_to_cart"));
          }}
        />
      )}
    </section>
  );
}

/* ============== BRAND STORY — metrics + benefits ============== */

function BrandStory() {
  const { t } = useI18n();
  const metrics = [
    { k: "12k+",  v: t("metric.customers") },
    { k: "4.9★",  v: t("metric.rating") },
    { k: "24h",   v: t("metric.shipping") },
    { k: "30gg",  v: t("metric.returns") },
  ];
  const benefits = [
    { Icon: Award, title: t("benefit.curated.title"), text: t("benefit.curated.text") },
    { Icon: ShieldCheck, title: t("benefit.original.title"), text: t("benefit.original.text") },
    { Icon: Sparkles, title: t("benefit.premium.title"), text: t("benefit.premium.text") },
    { Icon: Headphones, title: t("benefit.human.title"), text: t("benefit.human.text") },
  ];
  return (
    <section className="py-14 sm:py-20 md:py-24">
      <div className="text-center max-w-3xl mx-auto">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-primary mb-3">
          {t("story.eyebrow")}
        </p>
        {/* H2 scale: 26 / 32 / 40 */}
        <h2 className="text-[26px] sm:text-[32px] md:text-[40px] font-light tracking-[-0.025em] leading-[1.1] text-foreground">
          {t("story.title_1")}<br />
          <span className="text-foreground/45">{t("story.title_2")}</span>
        </h2>
        <p className="mt-5 sm:mt-6 text-[15px] sm:text-[16px] text-muted-foreground leading-relaxed px-2">
          {t("story.body_1")}
        </p>
      </div>

      <div className="mt-10 sm:mt-12 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl mx-auto">
        {metrics.map((m) => (
          <div key={m.v} className="rounded-lg sm:rounded-xl border border-border bg-card p-4 sm:p-5 text-center">
            {/* Metric number: 22 / 28 */}
            <div className="text-[22px] sm:text-[26px] md:text-[28px] font-light tracking-[-0.02em] text-foreground">{m.k}</div>
            <div className="mt-1.5 text-[10.5px] sm:text-[11px] text-muted-foreground uppercase tracking-wider font-normal">{m.v}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 sm:mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3 max-w-5xl mx-auto">
        {benefits.map((b) => (
          <div key={b.title} className="rounded-lg sm:rounded-xl border border-border bg-card p-4 sm:p-5 hover:border-primary/30 transition-colors">
            <b.Icon className="h-5 w-5 text-primary" strokeWidth={1.6} />
            <h3 className="mt-3 text-[13.5px] sm:text-[14px] font-medium tracking-[-0.01em]">{b.title}</h3>
            <p className="mt-1.5 text-[12px] text-muted-foreground leading-relaxed">{b.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============== FAQ ============== */

function FAQ() {
  const { t } = useI18n();
  const faqs = [
    { q: t("faq.q1"), a: t("faq.a1") },
    { q: t("faq.q2"), a: t("faq.a2") },
    { q: t("faq.q3"), a: t("faq.a3") },
    { q: t("faq.q4"), a: t("faq.a4") },
  ];
  return (
    <section className="py-14 sm:py-20 md:py-24 -mx-5 sm:-mx-6 px-5 sm:px-6 border-y border-border bg-muted/40">
      <div className="max-w-3xl mx-auto">
        {/* H2 FAQ: 24 / 30 / 36 — coerente con Featured */}
        <h2 className="text-[24px] sm:text-[30px] md:text-[36px] font-light tracking-[-0.025em] mb-8 sm:mb-10 text-center text-foreground">
          {t("faq.title")}
        </h2>
        <div className="divide-y divide-border">
          {faqs.map((f) => (
            <details key={f.q} className="group py-4 sm:py-5 cursor-pointer">
              <summary className="flex items-center justify-between gap-4 font-normal list-none text-foreground text-[14.5px] sm:text-[15px] tracking-[-0.005em]">
                {f.q}
                <span className="text-muted-foreground group-open:rotate-45 transition-transform text-xl leading-none shrink-0">+</span>
              </summary>
              <p className="mt-2.5 text-[13px] sm:text-[13.5px] text-muted-foreground leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============== FINAL CTA BANNER — deep red elegant ============== */

function FinalCTABanner() {
  const { t } = useI18n();
  return (
    <section className="py-14 sm:py-20 md:py-24">
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-banner-deep px-8 py-10 sm:px-12 sm:py-12 md:px-16 md:py-14 text-center text-primary-foreground">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.10),transparent_70%)]" />

        <div className="relative max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 backdrop-blur px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em]">
            <Timer className="h-3 w-3" strokeWidth={1.8} /> {t("banner.eyebrow")}
          </div>
          {/* H2 banner: 26 / 32 / 40 — coerente */}
          <h2 className="mt-5 text-[26px] sm:text-[32px] md:text-[40px] font-light tracking-[-0.025em] leading-[1.1]">
            {t("banner.title")}
          </h2>
          <p className="mt-3.5 text-[14.5px] sm:text-[15.5px] opacity-75 leading-relaxed font-normal">
            {t("banner.subtitle")}
          </p>
          <Link to="/{-$locale}/shop" params={{} as any} className="inline-block mt-7 sm:mt-8">
            <Button
              size="lg"
              className="rounded-full px-8 h-11 gap-2 bg-background text-foreground hover:bg-background/90 font-medium text-[13.5px] shadow-none"
            >
              {t("cta.go_to_shop")} <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ============== STICKY SHOP BAR — mobile, drives to /shop ============== */

function StickyShopBar() {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > window.innerHeight * 0.8);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 px-3 pb-3 pointer-events-none lg:hidden transition-all duration-300 ${
        visible ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
      }`}
      aria-hidden={!visible}
    >
      <Link
        to="/{-$locale}/shop"
        params={{} as any}
        className="pointer-events-auto mx-auto flex max-w-md items-center justify-between gap-3 rounded-full bg-cta-gradient text-primary-foreground shadow-cta-glow px-5 py-3.5 active:scale-[0.98] transition-transform"
      >
        <span className="inline-flex items-center gap-2 text-[14px] font-semibold">
          <ShoppingBag className="h-4 w-4" />
          {t("cta.go_to_shop")}
        </span>
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
