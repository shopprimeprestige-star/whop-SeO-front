import { Link, useLocation } from "@tanstack/react-router";
import { ShoppingBag, Menu, X, Search, Sparkles, Truck, Flame, Clock, ShieldCheck, Lock, RotateCcw } from "lucide-react";
import { useState, useEffect } from "react";
import { useCart } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import { useSiteBranding } from "@/hooks/useSiteCMS";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useI18n } from "@/lib/i18n";
import { optimizeImg } from "@/lib/imgUrl";
import { useEntityTranslations, tField } from "@/hooks/useTranslations";

export function StoreHeader() {
  const { t } = useI18n();
  const count = useCart((s) => s.items.reduce((n, i) => n + i.quantity, 0));
  const open = useCart((s) => s.open);
  const branding = useSiteBranding();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const brandingId = (branding as any)?.id as string | undefined;
  const txBranding = useEntityTranslations("branding", brandingId ? [brandingId] : []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setMobileOpen(false), [location.pathname]);

  const storeName = brandingId ? tField(txBranding, brandingId, "store_name", branding?.store_name || "Store") : (branding?.store_name || "Store");
  const topBannerText = brandingId ? tField(txBranding, brandingId, "top_banner_text", branding?.top_banner_text) : branding?.top_banner_text;
  const headerTagline = brandingId ? tField(txBranding, brandingId, "header_tagline", branding?.header_tagline) : branding?.header_tagline;
  const isActive = (path: string) => location.pathname === path;

  return (
    <>
      {/* Top promo banner — slim & elegant */}
      {branding?.top_banner_enabled && topBannerText && (
        <div
          className="relative overflow-hidden text-center text-[11px] font-medium tracking-wide py-2 px-4"
          style={{
            background: branding.top_banner_bg || "linear-gradient(90deg, #0a0a0a, #1f1f1f, #0a0a0a)",
            color: branding.top_banner_fg || "#ffffff",
          }}
        >
          <div className="absolute inset-0 opacity-20 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent)] animate-[shimmer_4s_linear_infinite]" />
          <div className="relative flex items-center justify-center gap-2">
            <Sparkles className="h-3 w-3 opacity-70" />
            {branding.top_banner_link ? (
              <a href={branding.top_banner_link} className="hover:underline underline-offset-4">
                {topBannerText}
              </a>
            ) : (
              <span>{topBannerText}</span>
            )}
          </div>
          <style>{`@keyframes shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}`}</style>
        </div>
      )}

      <header
        className={`sticky top-0 z-40 transition-all duration-300 ${
          scrolled
            ? "border-b border-border bg-background/85 backdrop-blur-xl"
            : "border-b border-transparent bg-background/70 backdrop-blur-md"
        }`}
      >
        <div className="mx-auto flex h-[60px] max-w-7xl items-center justify-between px-4 sm:px-6">
          {/* Left: Logo */}
          <Link to="/{-$locale}" params={{} as any} className="flex items-center gap-2.5 shrink-0 group">
            {branding?.logo_url ? (
              <img
                src={optimizeImg(branding.logo_url, { h: 64, q: 80 })}
                alt={storeName}
                width={140}
                height={32}
                fetchPriority="high"
                decoding="async"
                className="h-8 w-auto object-contain"
              />
            ) : (
              <>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-medium text-[15px]">
                  {storeName.charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-[15px] font-medium tracking-[-0.01em]">{storeName}</span>
                  {headerTagline && (
                    <span className="hidden sm:inline text-[10px] text-muted-foreground font-normal">
                      {headerTagline}
                    </span>
                  )}
                </div>
              </>
            )}
          </Link>

          {/* Center: Nav */}
          <nav className="hidden md:flex items-center gap-1 text-[13.5px] font-normal absolute left-1/2 -translate-x-1/2">
            {[
              { to: "/", label: t("nav.home") },
              { to: "/shop", label: t("nav.shop") },
            ].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`relative px-4 py-2 rounded-full transition-colors ${
                  isActive(item.to)
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
                {isActive(item.to) && (
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-px w-4 bg-primary" />
                )}
              </Link>
            ))}
          </nav>

          {/* Right: actions */}
          <div className="flex items-center gap-1.5">
            <LanguageSwitcher />
            <Button variant="ghost" size="icon" className="hidden sm:inline-flex h-10 w-10 rounded-full">
              <Search className="h-4 w-4" />
            </Button>

            <button
              onClick={open}
              className="relative h-10 w-10 inline-flex items-center justify-center rounded-full hover:bg-foreground/5 transition-colors"
              aria-label="Apri carrello"
            >
              <ShoppingBag className="h-[18px] w-[18px]" strokeWidth={1.8} />
              {count > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground ring-2 ring-background animate-in zoom-in duration-200">
                  {count}
                </span>
              )}
            </button>

            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-10 w-10 rounded-full"
              onClick={() => setMobileOpen((o) => !o)}
              aria-label="Menu"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-border/60 bg-background/95 backdrop-blur-xl animate-in slide-in-from-top-2 duration-200">
            <nav className="flex flex-col p-3 gap-1">
              {[
                { to: "/", label: t("nav.home") },
                { to: "/shop", label: t("nav.shop") },
              ].map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                    isActive(item.to)
                      ? "bg-foreground/5 text-foreground"
                      : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </header>

      {/* Promo strip thicker — scorre orizzontalmente, data dinamica +3gg */}
      <PromoMarquee />
    </>
  );
}

function PromoMarquee() {
  const { t, lang } = useI18n();
  // Render completo solo dopo mount per evitare hydration mismatch (la data dipende da Date.now())
  const [mounted, setMounted] = useState(false);
  const [dateStr, setDateStr] = useState<string>("");
  useEffect(() => {
    setMounted(true);
    const expiry = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const localeMap: Record<string, string> = {
      it: "it-IT", en: "en-GB", de: "de-DE", fr: "fr-FR", es: "es-ES", pt: "pt-PT", nl: "nl-NL",
      bg: "bg-BG", cs: "cs-CZ", da: "da-DK", el: "el-GR", et: "et-EE", fi: "fi-FI", ga: "ga-IE",
      hr: "hr-HR", hu: "hu-HU", lt: "lt-LT", lv: "lv-LV", mt: "mt-MT", pl: "pl-PL", ro: "ro-RO",
      sk: "sk-SK", sl: "sl-SI", sv: "sv-SE",
    };
    setDateStr(expiry.toLocaleDateString(localeMap[lang] || "en-GB", { day: "2-digit", month: "long" }));
  }, [lang]);
  const items: { icon: typeof Truck; text: string }[] = [
    { icon: Truck, text: t("promo.shipping_free") },
    { icon: Flame, text: t("promo.discount_70") },
    { icon: Clock, text: mounted && dateStr ? t("promo.valid_until", { date: dateStr }) : t("promo.return_30d") },
    { icon: ShieldCheck, text: t("promo.warranty_24m") },
    { icon: Lock, text: t("promo.secure_payments") },
    { icon: RotateCcw, text: t("promo.return_30d") },
  ];
  const loop = [...items, ...items, ...items];
  return (
    <div className="relative overflow-hidden bg-foreground text-background">
      <div className="flex w-max animate-[promo-marquee_38s_linear_infinite] py-2">
        {loop.map((it, i) => {
          const Icon = it.icon;
          return (
            <span
              key={i}
              className="inline-flex items-center gap-2 px-6 text-[12px] font-normal tracking-[-0.005em] whitespace-nowrap"
            >
              <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
              {it.text}
              <span className="text-background/25 ml-2">·</span>
            </span>
          );
        })}
      </div>
      <style>{`@keyframes promo-marquee{0%{transform:translateX(0)}100%{transform:translateX(-33.333%)}}`}</style>
    </div>
  );
}

