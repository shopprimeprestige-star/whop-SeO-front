import { Link, notFound } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StoreHeader } from "@/components/storefront/StoreHeader";
import { StoreFooter } from "@/components/storefront/StoreFooter";
import { TrustpilotBadge } from "@/components/storefront/Trustpilot";
const TrustpilotCarousel = lazy(() =>
  import("@/components/storefront/Trustpilot").then((m) => ({ default: m.TrustpilotCarousel })),
);
const CartDrawer = lazy(() =>
  import("@/components/storefront/CartDrawer").then((m) => ({ default: m.CartDrawer })),
);
const VariantPickerDialog = lazy(() =>
  import("@/components/storefront/VariantPickerDialog").then((m) => ({
    default: m.VariantPickerDialog,
  })),
);
const AdminProductEditDrawer = lazy(() =>
  import("@/components/storefront/AdminProductEditDrawer").then((m) => ({
    default: m.AdminProductEditDrawer,
  })),
);
import { SmartImage } from "@/components/storefront/SmartImage";
import { useAuth } from "@/hooks/useAuth";
import { useLPTracking } from "@/hooks/useLPTracking";
import { useBotCheck } from "@/hooks/useBotCheck";
import { useI18n } from "@/lib/i18n";
import { useEntityTranslations, tField } from "@/hooks/useTranslations";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useCart } from "@/lib/cart";
import { track } from "@/lib/track";
import { bridgeCheckout, warmBridgeCheckout } from "@/lib/shadow-checkout";
import {
  Loader2,
  Minus,
  Plus,
  ShoppingBag,
  ChevronLeft,
  Truck,
  ShieldCheck,
  RotateCcw,
  Lock,
  Eye,
  Flame,
  Zap,
  Check,
  Package,
  Phone,
  BadgeCheck,
  CreditCard,
  Star,
  Sparkles,
  Award,
  Heart,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

const BULLET_ICONS: Record<string, LucideIcon> = {
  check: Check,
  star: Star,
  sparkles: Sparkles,
  award: Award,
  heart: Heart,
  shield: ShieldCheck,
  truck: Truck,
  zap: Zap,
  lock: Lock,
  badge: BadgeCheck,
};

interface Variant {
  label: string;
  displayLabel?: string;
  type?: "text" | "color" | "image";
  color?: string;
  image?: string;
  shopify_variant_id?: string | number;
  price?: number;
  compare_price?: number;
  available?: boolean;
}
interface QuantityBreak {
  qty: number;
  discount_percent: number;
  label?: string;
  badge?: string;
  __txIndex?: number;
}
interface AbVariantConfig {
  name?: string;
  cta_label?: string;
  hero_image?: string;
  short?: string;
  badge?: string;
}
interface AbTest {
  id: string;
  variant_a: AbVariantConfig | null;
  variant_b: AbVariantConfig | null;
  traffic_split: number;
  is_active: boolean;
}
interface Product {
  id: string;
  slug: string;
  name: string;
  subtitle: string | null;
  description_short: string | null;
  description_long: string | null;
  description_html: string | null;
  trust_badge_text: string | null;
  price: number;
  compare_price: number | null;
  images: any;
  variants: any;
  quantity_breaks: any;
  bullets: any;
  image_fit?: string | null;
  ab_test_id: string | null;
}

type Bullet = { icon?: string; text: string };

function getVisitorId(): string {
  try {
    let v = localStorage.getItem("hs_visitor_id");
    if (!v) {
      v = crypto.randomUUID();
      localStorage.setItem("hs_visitor_id", v);
    }
    return v;
  } catch {
    return "anon";
  }
}

function pickAbVariant(test: AbTest): "A" | "B" {
  try {
    const key = `ab_${test.id}`;
    const cached = localStorage.getItem(key);
    if (cached === "A" || cached === "B") return cached;
    const split = Math.max(0, Math.min(100, test.traffic_split ?? 50));
    const v = Math.random() * 100 < split ? "A" : "B";
    localStorage.setItem(key, v);
    return v;
  } catch {
    return "A";
  }
}

// Pseudo-random but stable per session for urgency counter
function fakeViewers(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return 8 + (Math.abs(h) % 22); // 8..29
}

export function ProductPageView({
  slug,
  initialProduct,
}: {
  slug: string;
  initialProduct?: Product | null;
}) {
  const { price: fmt, t, lang, currency, convert } = useI18n();
  const [product, setProduct] = useState<Product | null>(initialProduct || null);
  const [loading, setLoading] = useState(!initialProduct);
  const [variant, setVariant] = useState<string | undefined>(() => {
    const vs = Array.isArray(initialProduct?.variants)
      ? (initialProduct!.variants as Variant[])
      : [];
    return vs.length > 0 ? vs[0].label : undefined;
  });
  const [imgIdx, setImgIdx] = useState(0);
  const [qty, setQty] = useState(1);
  const [buying, setBuying] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<"add" | "buy">("add");
  const [abTest, setAbTest] = useState<AbTest | null>(null);
  const [abVariant, setAbVariant] = useState<"A" | "B" | null>(null);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const add = useCart((s) => s.add);
  const isBot = useBotCheck();
  const { isAdmin } = useAuth();
  useLPTracking({ productId: product?.id ?? null, enabled: isBot === false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Skip refetch if we already have the product from the loader
      if (!initialProduct) {
        const { data, error } = await supabase
          .from("products")
          .select(
            "id, slug, name, subtitle, description_short, description_long, description_html, trust_badge_text, shipping_returns_html, image_fit, bullets, price, compare_price, images, variants, quantity_breaks, ab_test_id",
          )
          .eq("slug", slug)
          .eq("status", "active")
          .maybeSingle();
        if (cancelled) return;
        if (error || !data) {
          setLoading(false);
          throw notFound();
        }
        setProduct(data as Product);
        const vs = Array.isArray(data.variants) ? (data.variants as unknown as Variant[]) : [];
        if (vs.length > 0) setVariant(vs[0].label);
        if (data.ab_test_id) {
          const { data: test } = await supabase
            .from("ab_tests")
            .select("id,variant_a,variant_b,traffic_split,is_active")
            .eq("id", data.ab_test_id)
            .maybeSingle();
          if (test && test.is_active && !cancelled) {
            const tt = test as unknown as AbTest;
            setAbTest(tt);
            const chosen = pickAbVariant(tt);
            setAbVariant(chosen);
            void supabase.from("ab_test_events").insert({
              ab_test_id: tt.id,
              variant: chosen,
              event_type: "impression",
              visitor_id: getVisitorId(),
            });
          }
        }
        setLoading(false);
      } else if (initialProduct.ab_test_id) {
        // Just fetch AB test if present
        const { data: test } = await supabase
          .from("ab_tests")
          .select("id,variant_a,variant_b,traffic_split,is_active")
          .eq("id", initialProduct.ab_test_id)
          .maybeSingle();
        if (test && test.is_active && !cancelled) {
          const tt = test as unknown as AbTest;
          setAbTest(tt);
          const chosen = pickAbVariant(tt);
          setAbVariant(chosen);
          void supabase.from("ab_test_events").insert({
            ab_test_id: tt.id,
            variant: chosen,
            event_type: "impression",
            visitor_id: getVisitorId(),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, initialProduct]);

  useEffect(() => {
    if (product) {
      track("ViewContent", {
        content_ids: [product.slug],
        content_name: product.name,
        content_type: "product",
        value: Number(product.price),
        currency: "EUR",
      });
      warmBridgeCheckout({
        product_slug: product.slug,
        variant_label: variant,
        quantity: qty,
        currency,
        language: lang,
        unit_price: convert(Number(product.price)),
      });
    }
  }, [product, variant, qty, currency, lang, convert]);

  // Sticky buy bar trigger
  useEffect(() => {
    const onScroll = () => setShowStickyBar(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Reset CTA "buying" quando l'utente torna indietro (bfcache / history back)
  useEffect(() => {
    const reset = () => setBuying(false);
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) reset();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") reset();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const variants: Variant[] = useMemo(
    () => (Array.isArray(product?.variants) ? (product!.variants as Variant[]) : []),
    [product],
  );
  const breaks: QuantityBreak[] = useMemo(
    () =>
      Array.isArray(product?.quantity_breaks)
        ? (product!.quantity_breaks as QuantityBreak[])
            .map((b, i) => ({ ...b, __txIndex: i }))
            .sort((a, b) => a.qty - b.qty)
        : [],
    [product],
  );
  const images: string[] = useMemo(
    () => (Array.isArray(product?.images) ? (product!.images as string[]) : []),
    [product],
  );

  const tx = useEntityTranslations("product", product ? [product.id] : []);
  const tName = product ? tField(tx, product.id, "name", product.name) : "";
  const tShort = product
    ? tField(tx, product.id, "description_short", product.description_short)
    : "";
  const tLong = product ? tField(tx, product.id, "description_long", product.description_long) : "";
  const tHtml = product ? tField(tx, product.id, "description_html", product.description_html) : "";
  const tSubtitle = product ? tField(tx, product.id, "subtitle", product.subtitle) : "";
  const tTrustBadge = product
    ? tField(tx, product.id, "trust_badge_text", (product as any).trust_badge_text)
    : "";
  const tShippingReturns = product
    ? tField(tx, product.id, "shipping_returns_html", (product as any).shipping_returns_html)
    : "";

  // Mappa traduzioni indicizzate per chiave campo (per varianti/bullets/breaks)
  const productTx: Record<string, string> = product ? tx[product.id] || {} : {};
  const trBullets: Bullet[] = useMemo(() => {
    const arr = Array.isArray(product?.bullets) ? (product!.bullets as Bullet[]) : [];
    return arr.map((b, i) => ({ ...b, text: productTx[`bullet_${i}_text`] || b.text }));
  }, [product, productTx]);
  const trVariants: Variant[] = useMemo(
    () =>
      variants.map((v, i) => ({ ...v, displayLabel: productTx[`variant_${i}_label`] || v.label })),
    [variants, productTx],
  );
  const trBreaks: QuantityBreak[] = useMemo(
    () =>
      breaks.map((b, i) => ({
        ...b,
        label: productTx[`break_${b.__txIndex ?? i}_label`] || b.label,
        badge: productTx[`break_${b.__txIndex ?? i}_badge`] || b.badge,
      })),
    [breaks, productTx],
  );

  const abOverride = abTest && abVariant === "B" ? abTest.variant_b : (abTest?.variant_a ?? null);
  const displayName = abOverride?.name || tName || product?.name || "";
  const displayShort = abOverride?.short ?? (tShort || product?.description_short) ?? null;
  const ctaLabel = abOverride?.cta_label || t("cta.buy_now");
  const heroOverride = abOverride?.hero_image;
  const galleryImages = heroOverride ? [heroOverride, ...images] : images;

  if (loading || !product) {
    return (
      <div className="min-h-screen bg-background">
        <StoreHeader />
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 md:gap-12 md:px-6 md:py-12 md:grid-cols-2">
          <Skeleton className="aspect-square rounded-2xl" />
          <div className="space-y-4">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-6 w-1/4" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </div>
    );
  }

  const selectedVariant = variants.find((v) => v.label === variant);
  const selectedTranslatedVariant = trVariants.find((v) => v.label === variant);
  const price = selectedVariant?.price ?? Number(product.price);
  const comparePrice =
    selectedVariant?.compare_price ??
    (product.compare_price ? Number(product.compare_price) : undefined);
  const onSale = Boolean(comparePrice && comparePrice > price);
  // Active quantity_breaks = configured breaks with qty > 1 and discount > 0
  const activeBreaks = trBreaks.filter((b) => b.qty > 1 && (b.discount_percent || 0) > 0);
  const hasBundleSavings = activeBreaks.length >= 2;
  const bundleBreaks = hasBundleSavings
    ? [
        ...trBreaks
          .filter((b) => b.qty === 1)
          .map((b) => ({ ...b, discount_percent: 0, badge: undefined, label: undefined })),
        ...(!trBreaks.some((b) => b.qty === 1)
          ? [{ qty: 1, discount_percent: 0 } as QuantityBreak]
          : []),
        ...activeBreaks,
      ].sort((a, b) => a.qty - b.qty)
    : [];
  const matchedBreak = bundleBreaks.filter((b) => qty >= b.qty).slice(-1)[0];
  const effectivePrice = matchedBreak
    ? price * (1 - Math.max(0, matchedBreak.discount_percent || 0) / 100)
    : price;
  const totalSaving = (price - effectivePrice) * qty + (onSale ? (comparePrice! - price) * qty : 0);
  const viewers = fakeViewers(product.slug);

  function logCheckoutEvent() {
    track("InitiateCheckout", {
      content_ids: [product!.slug],
      content_name: product!.name,
      value: effectivePrice * qty,
      currency: "EUR",
      num_items: qty,
    });
    if (abTest && abVariant) {
      void supabase.from("ab_test_events").insert({
        ab_test_id: abTest.id,
        variant: abVariant,
        event_type: "checkout",
        visitor_id: getVisitorId(),
        value: effectivePrice * qty,
      });
    }
  }

  function addToCart() {
    if (variants.length > 0) {
      setPickerMode("add");
      setPickerOpen(true);
      return;
    }
    add({
      product_slug: product!.slug,
      product_name: displayName,
      variant_label: variant,
      price: effectivePrice,
      quantity: qty,
      image: galleryImages[0],
      shopify_variant_id: selectedVariant?.shopify_variant_id,
    });
    track("AddToCart", {
      content_ids: [product!.slug],
      content_name: displayName,
      value: effectivePrice * qty,
      currency: "EUR",
    });
    toast.success(t("cta.add_to_cart"));
  }

  async function buyNow() {
    if (buying || !product) return;
    if (variants.length > 0) {
      setPickerMode("buy");
      setPickerOpen(true);
      return;
    }
    setBuying(true);
    logCheckoutEvent();
    void import("@/hooks/useLPTracking").then((m) => m.markSessionConverted());
    try {
      const r = await bridgeCheckout({
        product_slug: product.slug,
        variant_label: variant,
        quantity: qty,
        currency,
        language: lang,
        unit_price: convert(effectivePrice),
      });
      window.location.href = r.redirect_url;
    } catch (e) {
      const err = e as { message?: string };
      toast.error(err?.message || "Checkout error");
      setBuying(false);
    }
  }

  async function handlePickerConfirm(
    selections: { label: string; shopify_variant_id?: string | number }[],
  ) {
    if (!product) return;
    if (pickerMode === "add") {
      selections.forEach((sel) => {
        add({
          product_slug: product.slug,
          product_name: displayName,
          variant_label: sel.label,
          price: effectivePrice,
          quantity: 1,
          image: galleryImages[0],
          shopify_variant_id: sel.shopify_variant_id,
        });
      });
      track("AddToCart", {
        content_ids: [product.slug],
        content_name: displayName,
        value: effectivePrice * selections.length,
        currency: "EUR",
      });
      toast.success(`${t("cta.add_to_cart")} (${selections.length})`);
      return;
    }
    setBuying(true);
    logCheckoutEvent();
    void import("@/hooks/useLPTracking").then((m) => m.markSessionConverted());
    try {
      const r = await bridgeCheckout({
        product_slug: product.slug,
        variant_label: selections[0]?.label,
        quantity: qty,
        currency,
        language: lang,
        unit_price: convert(effectivePrice),
      });
      window.location.href = r.redirect_url;
    } catch (e) {
      const err = e as { message?: string };
      toast.error(err?.message || "Checkout error");
      setBuying(false);
    }
  }

  const shopHref = lang === "it" ? "/shop" : `/${lang}/shop`;
  const discountPct = onSale ? Math.round(((comparePrice! - price) / comparePrice!) * 100) : 0;

  return (
    <div className="min-h-screen bg-background">
      <StoreHeader />
      <Suspense fallback={null}>
        <CartDrawer />
      </Suspense>

      {isAdmin && product && (
        <div className="sticky top-14 z-30 border-b border-primary/20 bg-primary/5 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2 md:px-6">
            <span className="text-[12px] font-medium text-primary">
              Admin · stai visualizzando questa scheda prodotto
            </span>
            <Button
              size="sm"
              onClick={() => setEditOpen(true)}
              className="h-8 rounded-md text-[12.5px]"
            >
              Modifica prodotto
            </Button>
          </div>
        </div>
      )}
      {isAdmin && product && editOpen && (
        <Suspense fallback={null}>
          <AdminProductEditDrawer
            open={editOpen}
            onOpenChange={setEditOpen}
            productId={product.id}
            onSaved={async () => {
              const { data } = await supabase
                .from("products")
                .select(
                  "id, slug, name, subtitle, description_short, description_long, description_html, trust_badge_text, shipping_returns_html, image_fit, bullets, price, compare_price, images, variants, quantity_breaks, ab_test_id",
                )
                .eq("id", product.id)
                .maybeSingle();
              if (data) {
                setProduct(data as Product);
                const vs = Array.isArray((data as any).variants)
                  ? ((data as any).variants as Variant[])
                  : [];
                if (vs.length > 0) setVariant(vs[0].label);
              }
            }}
          />
        </Suspense>
      )}

      <main className="mx-auto max-w-6xl px-4 py-4 pb-28 md:px-6 md:py-8 md:pb-8">
        <a
          href={shopHref}
          className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground md:mb-6 md:text-sm"
        >
          <ChevronLeft className="h-4 w-4" />
          {t("nav.shop")}
        </a>

        <div className="grid gap-5 md:gap-12 md:grid-cols-2">
          {/* ============ Gallery ============ */}
          <div className="space-y-3 md:sticky md:top-24 md:self-start">
            <div className="relative aspect-square overflow-hidden rounded-md border border-border/70 bg-card">
              {galleryImages[imgIdx] ? (
                <SmartImage
                  src={galleryImages[imgIdx]}
                  alt={displayName}
                  width={800}
                  height={800}
                  priority
                  sizes="(max-width: 768px) 100vw, 50vw"
                  fit="contain"
                  className={`relative h-full w-full object-contain ${product.image_fit === "contain" ? "p-1 sm:p-1.5" : ""}`}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  No image
                </div>
              )}

              {/* Top-left badges stack */}
              <div className="absolute left-3 top-3 flex flex-col gap-1.5 z-10">
                <span className="inline-flex items-center gap-1 rounded-sm bg-foreground/90 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-background">
                  <Flame className="h-3 w-3" strokeWidth={1.8} />
                  {t("pdp.bestseller")}
                </span>
                {abOverride?.badge && (
                  <span className="inline-flex items-center rounded-sm bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
                    {abOverride.badge}
                  </span>
                )}
              </div>

              {/* Discount badge top-right */}
              {onSale && (
                <div className="absolute right-3 top-3 z-10">
                  <span className="inline-flex items-center rounded-sm bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">
                    −{discountPct}%
                  </span>
                </div>
              )}

              {galleryImages.length > 1 && (
                <>
                  <button
                    onClick={() =>
                      setImgIdx((i) => (i - 1 + galleryImages.length) % galleryImages.length)
                    }
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/85 p-1.5 backdrop-blur transition hover:bg-background"
                    aria-label="Prev"
                  >
                    <ChevronLeft className="h-4 w-4" strokeWidth={1.6} />
                  </button>
                  <button
                    onClick={() => setImgIdx((i) => (i + 1) % galleryImages.length)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/85 p-1.5 backdrop-blur transition hover:bg-background"
                    aria-label="Next"
                  >
                    <ChevronLeft className="h-4 w-4 rotate-180" strokeWidth={1.6} />
                  </button>
                </>
              )}
            </div>

            {galleryImages.length > 1 && (
              <div className="grid grid-cols-5 gap-2">
                {galleryImages.map((src, i) => (
                  <button
                    key={i}
                    onClick={() => setImgIdx(i)}
                    className={`aspect-square overflow-hidden rounded-md border bg-card transition-all ${
                      i === imgIdx
                        ? "border-primary"
                        : "border-border/60 hover:border-foreground/30"
                    }`}
                  >
                    <SmartImage
                      src={src}
                      alt=""
                      width={120}
                      height={120}
                      widths={[120, 200]}
                      sizes="120px"
                      className="h-full w-full object-contain p-0.5"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ============ Info ============ */}
          <div>
            {/* Urgency micro-bar — minimal */}
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-emerald-500/8 px-3 py-1 text-[11.5px] font-normal text-foreground/85 ring-1 ring-emerald-500/15">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/60 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              <Eye className="h-3 w-3 text-emerald-700" strokeWidth={1.8} />
              <span>
                <span className="font-medium text-foreground tabular-nums">{viewers}</span>{" "}
                {t("pdp.urgency_now")}
              </span>
            </div>

            {/* H1 PDP — 24 / 30 / 36 — coerente con scala */}
            <h1 className="text-[24px] sm:text-[30px] md:text-[34px] font-medium tracking-[-0.02em] leading-[1.15] text-foreground">
              {displayName}
            </h1>

            {(tSubtitle || product.subtitle) && (
              <p className="mt-2 text-[14px] sm:text-[15px] font-normal text-foreground/65 leading-snug">
                {tSubtitle || product.subtitle}
              </p>
            )}

            {/* Bullet points (sostituisce short description) */}
            {(() => {
              const bullets: Bullet[] =
                trBullets.length > 0
                  ? trBullets
                  : Array.isArray(product.bullets)
                    ? (product.bullets as Bullet[])
                    : [];
              if (bullets.length > 0) {
                return (
                  <ul className="mt-5 space-y-2.5">
                    {bullets.map((b, i) => {
                      const Icon = (b.icon && BULLET_ICONS[b.icon]) || Check;
                      return (
                        <li key={i} className="flex items-start gap-2.5">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ring-1 ring-foreground/15 bg-card">
                            <Icon className="h-3 w-3 text-foreground" strokeWidth={2.4} />
                          </span>
                          <span className="text-[14px] sm:text-[14.5px] text-foreground/85 leading-snug">
                            {b.text}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                );
              }
              if (displayShort) {
                return (
                  <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-[15px]">
                    {displayShort}
                  </p>
                );
              }
              return null;
            })()}

            {/* Trustpilot badge — sopra il prezzo */}
            <div className="mt-6">
              <TrustpilotBadge />
              {tTrustBadge && (
                <p className="mt-1.5 text-[12px] font-medium leading-snug text-foreground/70">
                  {tTrustBadge}
                </p>
              )}
            </div>

            {/* Price block — hidden when bundle savings are active (price shown inside bundle card) */}
            {!hasBundleSavings && (
              <div className="mt-4 relative">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-[34px] sm:text-[42px] md:text-[46px] font-medium tracking-[-0.035em] tabular-nums leading-[0.95] text-foreground">
                    {fmt(price)}
                  </span>
                  {onSale && (
                    <span className="text-[15px] sm:text-[17px] text-foreground/40 line-through tabular-nums leading-none font-normal">
                      {fmt(comparePrice!)}
                    </span>
                  )}
                  {onSale && discountPct > 0 && (
                    <span className="inline-flex items-center rounded-[3px] bg-foreground px-1.5 py-[3px] text-[10.5px] font-medium tracking-wider uppercase text-background">
                      −{discountPct}%
                    </span>
                  )}
                </div>
              </div>
            )}
            {variants.length > 0 && (
              <div className="mt-6">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  {t("pdp.choose_variant")}
                  {variant && (
                    <span className="ml-2 normal-case tracking-normal text-foreground font-medium">
                      {selectedTranslatedVariant?.displayLabel || variant}
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  {trVariants.map((v) => {
                    const active = variant === v.label;
                    const disabled = v.available === false;
                    if (v.type === "color" && v.color) {
                      return (
                        <button
                          key={v.label}
                          onClick={() => setVariant(v.label)}
                          disabled={disabled}
                          title={v.displayLabel || v.label}
                          className={`relative h-9 w-9 rounded-full ring-1 ring-offset-2 ring-offset-background transition-all duration-200 ${
                            active
                              ? "ring-foreground ring-2"
                              : "ring-border hover:ring-foreground/40"
                          } ${disabled ? "opacity-30 cursor-not-allowed" : ""}`}
                          style={{ backgroundColor: v.color }}
                        >
                          {active && (
                            <Check
                              className="absolute inset-0 m-auto h-3.5 w-3.5 text-white drop-shadow"
                              strokeWidth={2.4}
                            />
                          )}
                        </button>
                      );
                    }
                    if (v.type === "image" && v.image) {
                      return (
                        <button
                          key={v.label}
                          onClick={() => setVariant(v.label)}
                          disabled={disabled}
                          title={v.displayLabel || v.label}
                          className={`relative h-12 w-12 overflow-hidden rounded-md ring-1 ring-offset-2 ring-offset-background transition-all duration-200 ${
                            active
                              ? "ring-foreground ring-2"
                              : "ring-border hover:ring-foreground/40"
                          } ${disabled ? "opacity-30 cursor-not-allowed" : ""}`}
                        >
                          <img
                            src={v.image}
                            alt={v.displayLabel || v.label}
                            className="h-full w-full object-cover"
                          />
                          {active && (
                            <span className="absolute inset-0 flex items-center justify-center bg-foreground/30">
                              <Check className="h-4 w-4 text-white drop-shadow" strokeWidth={2.4} />
                            </span>
                          )}
                        </button>
                      );
                    }
                    return (
                      <button
                        key={v.label}
                        onClick={() => setVariant(v.label)}
                        disabled={disabled}
                        className={`rounded-full border px-3.5 py-1.5 text-[13px] font-normal transition-all ${
                          active
                            ? "border-foreground bg-foreground text-background"
                            : "border-border bg-card text-foreground/80 hover:border-foreground/40 hover:text-foreground"
                        } disabled:cursor-not-allowed disabled:opacity-40`}
                      >
                        {v.displayLabel || v.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quantity breaks — high CVR: scannable in <300ms, primary-colored */}
            {bundleBreaks.length > 0 && (
              <div className="mt-6">
                <div className="mb-2.5 flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/75">
                    {t("product.bundle_save")}
                  </p>
                </div>
                <div className="grid gap-2.5 lg:grid-cols-3">
                  {bundleBreaks.map((b, idx) => {
                    const active = matchedBreak?.qty === b.qty;
                    const discount = Math.max(0, b.discount_percent || 0);
                    const breakUnitPrice = price * (1 - discount / 100);
                    const breakTotal = breakUnitPrice * b.qty;
                    // Prezzo barrato = compare_price × qty (fallback: price × qty se manca compare_price o non c'è sconto reale)
                    const baseUnit = comparePrice && comparePrice > price ? comparePrice : price;
                    const strikeTotal = baseUnit * b.qty;
                    // Sconto totale rispetto al compare_price
                    const totalDiscountPct =
                      strikeTotal > 0
                        ? Math.round(((strikeTotal - breakTotal) / strikeTotal) * 100)
                        : discount;
                    const isMiddle =
                      idx === Math.floor(bundleBreaks.length / 2) && bundleBreaks.length >= 2;
                    const isBest =
                      b.qty === Math.max(...bundleBreaks.map((x) => x.qty)) &&
                      bundleBreaks.length >= 2;
                    const showStar = isMiddle && !b.badge && discount > 0;
                    const badgeText =
                      b.badge ||
                      (isBest && discount > 0
                        ? t("qty.best_offer")
                        : showStar
                          ? t("qty.top")
                          : null);
                    const pieceLabel =
                      b.qty === 1 ? t("qty.one_piece") : t("qty.n_pieces", { n: b.qty });
                    return (
                      <button
                        key={b.qty}
                        onClick={() => setQty(b.qty)}
                        aria-pressed={active}
                        className={`group relative rounded-xl border-2 p-3.5 pt-4 text-left transition-all duration-200 ${
                          active
                            ? "border-primary bg-primary text-primary-foreground shadow-[0_10px_30px_-8px_color-mix(in_oklab,var(--primary)_55%,transparent)] -translate-y-0.5"
                            : "border-border bg-card hover:border-primary/60 hover:-translate-y-0.5 hover:shadow-md"
                        }`}
                      >
                        {/* Checkmark next-gen quando selezionato */}
                        {active && (
                          <span
                            aria-hidden
                            className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary-foreground text-primary shadow-md ring-2 ring-primary"
                          >
                            <svg
                              viewBox="0 0 20 20"
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="4 10.5 8.5 15 16 6" />
                            </svg>
                          </span>
                        )}

                        {/* Badge promozionale (centrato in alto) */}
                        {badgeText && !active && (
                          <span className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-primary px-2 py-[2px] text-[9px] font-bold uppercase tracking-wider text-primary-foreground shadow-sm">
                            {badgeText}
                          </span>
                        )}

                        {/* Titolo: X Pezzi */}
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className={`text-[15px] font-bold tracking-tight leading-none ${active ? "text-primary-foreground" : "text-foreground"}`}
                          >
                            {pieceLabel}
                          </span>
                        </div>

                        {/* Prezzo: barrato + bundle */}
                        <div className="mt-2.5 flex items-baseline gap-1.5 flex-wrap">
                          {strikeTotal > breakTotal + 0.01 && (
                            <span
                              className={`text-[12px] line-through tabular-nums ${active ? "text-primary-foreground/55" : "text-muted-foreground/70"}`}
                            >
                              {fmt(strikeTotal)}
                            </span>
                          )}
                          <span
                            className={`text-[18px] font-bold tabular-nums leading-none ${active ? "text-primary-foreground" : "text-foreground"}`}
                          >
                            {fmt(breakTotal)}
                          </span>
                        </div>

                        {/* Prezzo unitario (solo se qty > 1) — evidenziato */}
                        {b.qty > 1 && (
                          <div
                            className={`mt-2 inline-flex items-baseline gap-1 rounded-md px-2 py-1 text-[12px] font-semibold tabular-nums ${
                              active
                                ? "bg-primary-foreground/15 text-primary-foreground"
                                : "bg-primary/10 text-primary"
                            }`}
                          >
                            <span className="text-[13px] font-bold">{fmt(breakUnitPrice)}</span>
                            <span
                              className={`text-[10.5px] font-medium ${active ? "text-primary-foreground/75" : "text-primary/75"}`}
                            >
                              / {t("pdp.unit") || "pezzo"}
                            </span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Totale LIVE — sempre visibile, si aggiorna in tempo reale con la qty selezionata */}
                <div className="mt-3 rounded-lg border-2 border-primary/25 bg-primary/[0.05] px-3.5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {t("pdp.total")} · {qty}×
                    </span>
                    {totalSaving > 0 && (
                      <span className="rounded-md bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground tabular-nums shadow-sm">
                        {t("pdp.you_save")} {fmt(totalSaving)}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-end justify-between gap-3">
                    <span className="text-[12px] text-muted-foreground tabular-nums">
                      {fmt(effectivePrice)} · {t("pdp.unit")}
                    </span>
                    <div className="flex items-baseline gap-2">
                      {totalSaving > 0 && (
                        <span className="text-[13px] text-foreground/40 line-through tabular-nums leading-none">
                          {fmt((onSale ? comparePrice! : price) * qty)}
                        </span>
                      )}
                      <span className="text-[26px] sm:text-[30px] font-semibold tracking-tight tabular-nums leading-none text-foreground">
                        {fmt(effectivePrice * qty)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Quantity + Add to cart */}
            <div className="mt-6 flex items-center gap-2.5">
              <div className="flex items-center gap-0.5 rounded-md border border-border bg-card">
                <Button
                  size="icon"
                  variant="ghost"
                  className="rounded-md h-10 w-10"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                >
                  <Minus className="h-3.5 w-3.5" strokeWidth={1.6} />
                </Button>
                <span className="w-9 text-center text-[14px] font-medium tabular-nums">{qty}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="rounded-md h-10 w-10"
                  onClick={() => setQty((q) => Math.min(99, q + 1))}
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={1.6} />
                </Button>
              </div>
              <Button
                onClick={addToCart}
                variant="outline"
                className="flex-1 rounded-md border h-10 text-[13.5px] font-medium"
              >
                <ShoppingBag className="mr-2 h-4 w-4" strokeWidth={1.6} />
                {t("cta.add_to_cart")}
              </Button>
            </div>

            {/* Buy now CTA */}
            <Button
              onClick={buyNow}
              disabled={buying}
              size="lg"
              className="mt-2.5 h-12 w-full rounded-md bg-primary text-[14.5px] font-medium text-primary-foreground hover:bg-primary/90"
            >
              {buying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {ctaLabel} — <span className="tabular-nums">{fmt(effectivePrice * qty)}</span>
            </Button>

            {/* Sezioni multiple a comparsa indipendenti */}
            <div className="mt-6">
              <ShippingReturnsSection
                customHtml={
                  tShippingReturns || ((product as any)?.shipping_returns_html as string | null)
                }
              />
            </div>
          </div>
        </div>
      </main>

      {/* ============ Trustpilot carousel — prima della descrizione ============ */}
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <Suspense fallback={null}>
          <TrustpilotCarousel />
        </Suspense>
      </div>

      {/* ============ Descrizione completa — senza titolo ============ */}
      {(tLong || product.description_long) && (
        <section className="mx-auto max-w-6xl px-4 md:px-6 pt-2 pb-3 md:pt-2 md:pb-4">
          <div
            className="text-[15px] leading-relaxed text-foreground/85 [&_h1]:mb-3 [&_h1]:mt-6 [&_h1]:text-3xl [&_h1]:font-semibold [&_h2]:mb-2.5 [&_h2]:mt-5 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-xl [&_h3]:font-semibold [&_p]:mb-3 [&_ul]:mb-4 [&_ul]:ml-5 [&_ul]:list-disc [&_ol]:mb-4 [&_ol]:ml-5 [&_ol]:list-decimal [&_li]:my-1 [&_strong]:font-semibold [&_strong]:text-foreground"
            dangerouslySetInnerHTML={{ __html: tLong || product.description_long || "" }}
          />
        </section>
      )}

      {/* ============ Descrizione HTML custom — full width ============ */}
      {tHtml && (
        <section className="w-full bg-background border-t border-border/60">
          <ProductHtmlContent html={tHtml} />
        </section>
      )}
      <StoreFooter />

      {/* ============ Sticky Buy Bar (mobile + desktop) ============ */}
      <div
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 backdrop-blur-xl transition-transform duration-300 ${
          showStickyBar ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 md:px-6">
          <img
            src={galleryImages[0]}
            alt=""
            className="hidden h-11 w-11 rounded-md border border-border/70 object-contain p-1 sm:block"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-medium">{displayName}</p>
            <div className="flex items-baseline gap-2">
              <span className="text-[14px] font-medium tabular-nums">{fmt(effectivePrice)}</span>
              {onSale && (
                <span className="text-[11.5px] text-muted-foreground line-through tabular-nums">
                  {fmt(comparePrice!)}
                </span>
              )}
              {discountPct > 0 && (
                <span className="text-[10.5px] font-medium text-primary">−{discountPct}%</span>
              )}
            </div>
          </div>
          <Button
            onClick={buyNow}
            disabled={buying}
            className="h-10 shrink-0 rounded-md bg-primary px-5 text-[13.5px] font-medium text-primary-foreground hover:bg-primary/90"
          >
            {buying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <ShoppingBag className="mr-2 h-4 w-4" strokeWidth={1.6} />
                <span className="hidden sm:inline">{ctaLabel}</span>
                <span className="sm:hidden">{t("cta.buy_now")}</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {variants.length > 0 && pickerOpen && (
        <Suspense fallback={null}>
          <VariantPickerDialog
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            product={{
              slug: product.slug,
              name: displayName,
              price: effectivePrice,
              images: galleryImages,
            }}
            variants={trVariants as any}
            pieces={qty}
            onConfirm={handlePickerConfirm}
          />
        </Suspense>
      )}
    </div>
  );
}

/* ============== Renderer HTML custom: iframe sandboxed con auto-resize ==============
   L'HTML inserito dall'admin viene isolato in un iframe: i suoi stili (CSS, <style>,
   classi globali, reset) e i suoi script NON possono influenzare il resto della pagina
   prodotto. Il contenuto resta full-width e l'altezza si adatta automaticamente. */
function ProductHtmlContent({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState<number>(0);

  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;

    const doc = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<base target="_parent">
<style>
  html,body{margin:0;padding:0;background:transparent;color:inherit;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    font-size:15px;line-height:1.6;}
  img,video,iframe{max-width:100%;height:auto;display:block;}
  *{box-sizing:border-box;}
</style>
</head><body>${html}</body></html>`;

    iframe.srcdoc = doc;

    const onLoad = () => {
      const w = iframe.contentWindow;
      const d = iframe.contentDocument;
      if (!w || !d) return;

      const measure = () => {
        const h = Math.max(d.body?.scrollHeight || 0, d.documentElement?.scrollHeight || 0);
        if (h > 0) setHeight(h);
      };
      measure();

      // Adatta quando immagini/script cambiano il layout
      let ro: ResizeObserver | null = null;
      if ("ResizeObserver" in w) {
        ro = new (w as any).ResizeObserver(measure);
        ro!.observe(d.documentElement);
        if (d.body) ro!.observe(d.body);
      }
      d.querySelectorAll("img").forEach((img) => {
        if (!(img as HTMLImageElement).complete) {
          img.addEventListener("load", measure);
          img.addEventListener("error", measure);
        }
      });
      const interval = w.setInterval(measure, 800);
      w.setTimeout(() => w.clearInterval(interval), 6000);
    };

    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, [html]);

  return (
    <iframe
      ref={ref}
      title="product-custom-html"
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
      className="block w-full border-0"
      style={{ height: height ? `${height}px` : "300px" }}
    />
  );
}

/* ============== Shipping & returns — sezioni indipendenti, icone Lucide premium, i18n dinamico ============== */
const SHIPPING_SECTIONS: { id: string; icon: LucideIcon; titleKey: string; bodyKey: string }[] = [
  {
    id: "ship",
    icon: Package,
    titleKey: "pdp.ship.shipping.title",
    bodyKey: "pdp.ship.shipping.body",
  },
  {
    id: "warranty",
    icon: ShieldCheck,
    titleKey: "pdp.ship.warranty.title",
    bodyKey: "pdp.ship.warranty.body",
  },
  {
    id: "payment",
    icon: Lock,
    titleKey: "pdp.ship.payment.title",
    bodyKey: "pdp.ship.payment.body",
  },
  {
    id: "support",
    icon: Phone,
    titleKey: "pdp.ship.support.title",
    bodyKey: "pdp.ship.support.body",
  },
  {
    id: "originals",
    icon: BadgeCheck,
    titleKey: "pdp.ship.originals.title",
    bodyKey: "pdp.ship.originals.body",
  },
];

function ShippingReturnsSection({ customHtml }: { customHtml: string | null | undefined }) {
  const { t } = useI18n();
  // Se è presente HTML personalizzato lo mostriamo come unica sezione (retro-compat)
  if (customHtml && customHtml.trim().length > 0) {
    return (
      <Accordion type="multiple" className="w-full">
        <AccordionItem value="custom" className="border-border/60">
          <AccordionTrigger className="text-[14px] font-medium hover:no-underline text-left">
            {t("pdp.ship.shipping.title")}
          </AccordionTrigger>
          <AccordionContent className="pb-2">
            <div
              className="text-[13.5px] leading-relaxed text-foreground/85"
              dangerouslySetInnerHTML={{ __html: customHtml }}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    );
  }
  return (
    <Accordion type="multiple" className="w-full">
      {SHIPPING_SECTIONS.map((s) => (
        <AccordionItem key={s.id} value={s.id} className="border-border/60">
          <AccordionTrigger className="text-[14px] font-medium hover:no-underline text-left">
            <span className="inline-flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted/70 ring-1 ring-border/60">
                <s.icon className="h-3.5 w-3.5 text-foreground" strokeWidth={1.8} />
              </span>
              {t(s.titleKey)}
            </span>
          </AccordionTrigger>
          <AccordionContent className="pb-2">
            <div
              className="text-[13.5px] sm:text-sm leading-relaxed text-foreground/85"
              dangerouslySetInnerHTML={{ __html: t(s.bodyKey) }}
            />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
