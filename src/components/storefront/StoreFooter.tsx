import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Mail, Phone, MapPin, Truck, ShieldCheck, RotateCcw, ArrowRight } from "lucide-react";
import { useFooterConfig, useCompanyInfo, useSiteBranding } from "@/hooks/useSiteCMS";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CourierBanner } from "@/components/storefront/CourierBanner";
import { useI18n } from "@/lib/i18n";
import { useEntityTranslations, tField } from "@/hooks/useTranslations";
import { optimizeImg } from "@/lib/imgUrl";

/* ============== TRUST STRIP — 3 elementi premium minimal ============== */
function TrustStrip() {
  const { t } = useI18n();
  const items = [
    { Icon: Truck, title: t("trust.shipping"), text: t("trust.shipping.short") },
    { Icon: ShieldCheck, title: t("trust.warranty"), text: t("trust.warranty.short") },
    { Icon: RotateCcw, title: t("trust.return"), text: t("trust.return.short") },
  ];
  return (
    <div className="border-y border-border bg-card">
      <div className="mx-auto max-w-7xl px-5 sm:px-6 py-6 sm:py-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-8">
          {items.map(({ Icon, title, text }) => (
            <div key={title} className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground/[0.04]">
                <Icon className="h-[17px] w-[17px] text-foreground" strokeWidth={1.6} />
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-medium tracking-[-0.005em] text-foreground leading-tight">
                  {title}
                </div>
                <div className="mt-0.5 text-[12px] text-muted-foreground leading-snug">
                  {text}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============== PAYMENT BADGES — Shopify-style icons ============== */
const PAYMENT_BADGES = [
  { name: "Visa",             src: "https://cdn.shopify.com/shopifycloud/checkout-web/assets/c1.en/assets/visa.sxIq5Dot.svg" },
  { name: "Mastercard",       src: "https://cdn.shopify.com/shopifycloud/checkout-web/assets/c1.en/assets/master.CzeoQWmc.svg" },
  { name: "American Express", src: "https://cdn.shopify.com/shopifycloud/checkout-web/assets/c1.en/assets/amex.Csr7hRoy.svg" },
  { name: "Apple Pay",        src: "https://upload.wikimedia.org/wikipedia/commons/b/b0/Apple_Pay_logo.svg" },
  { name: "Google Pay",       src: "https://upload.wikimedia.org/wikipedia/commons/f/f2/Google_Pay_Logo.svg" },
];

function PaymentBadges() {
  const { t } = useI18n();
  return (
    <div>
      <h3 className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/50 mb-3">
        {t("footer.payments")}
      </h3>
      <div className="flex flex-wrap items-center gap-2.5">
        {PAYMENT_BADGES.map((p) => {
          const isWalletPay = p.name === "Apple Pay" || p.name === "Google Pay";
          if (isWalletPay) {
            // Same outer dims as Visa/Mastercard (h-6, ~38px wide). Inner logo reduced ~35%.
            return (
              <span
                key={p.name}
                title={p.name}
                className="inline-flex h-6 w-[38px] items-center justify-center rounded-[4px] border border-neutral-300 bg-white"
              >
                <img
                  src={p.src}
                  alt={p.name}
                  loading="lazy"
                  decoding="async"
                  width={26}
                  height={12}
                  className="h-[12px] w-auto object-contain"
                />
              </span>
            );
          }
          return (
            <img
              key={p.name}
              src={p.src}
              alt={p.name}
              title={p.name}
              loading="lazy"
              decoding="async"
              width={38}
              height={24}
              className="h-6 w-auto object-contain"
            />
          );
        })}
      </div>
    </div>
  );
}

/* ============== MAIN FOOTER ============== */

export function StoreFooter() {
  const footer = useFooterConfig();
  const company = useCompanyInfo();
  const branding = useSiteBranding();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const txFooter = useEntityTranslations("footer", footer?.id ? [footer.id] : []);
  const brandingId = (branding as any)?.id as string | undefined;
  const txBranding = useEntityTranslations("branding", brandingId ? [brandingId] : []);

  const onSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 350));
    toast.success(t("newsletter.success"));
    setEmail("");
    setSubmitting(false);
  };

  const year = new Date().getFullYear();
  const storeName = brandingId ? tField(txBranding, brandingId, "store_name", branding?.store_name || company?.company_name || "Store") : (branding?.store_name || company?.company_name || "Store");
  const footerDescription = (footer as any)?.footer_description as string | null | undefined;

  const shippedWith = ((footer as any)?.shipped_with_logos || (footer as any)?.couriers_custom || []) as { name: string; src?: string; url?: string }[];

  return (
    <footer className="mt-16 sm:mt-24">
      {/* Trust strip su sfondo card */}
      <TrustStrip />

      {/* "Spedito con" — ora su sfondo grigio chiaro premium, ben leggibile */}
      <CourierBanner
        couriers={
          shippedWith.length > 0
            ? shippedWith.map((l: any) => ({ name: l.name || "", src: l.src || l.url || "" }))
            : (footer as any)?.couriers_custom
        }
      />

      {/* Body con gradiente blu deep */}
      <div className="bg-footer-deep text-white relative overflow-hidden">
        <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[400px] w-[800px] rounded-full bg-accent/10 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-5 sm:px-6 py-10 sm:py-14">
          <div className="flex flex-col gap-10 lg:grid lg:grid-cols-12 lg:gap-10">
            {/* Newsletter + payments */}
            {footer?.newsletter_enabled !== false && (
              <div className="order-3 lg:order-none lg:col-span-4">
                <h3 className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/50 mb-3">
                  {footer?.id
                    ? tField(txFooter, footer.id, "newsletter_title", footer?.newsletter_title || t("newsletter.title"))
                    : (footer?.newsletter_title || t("newsletter.title"))}
                </h3>
                <p className="text-[12.5px] leading-relaxed text-white/65 mb-3.5">
                  {footer?.id
                    ? tField(txFooter, footer.id, "newsletter_subtitle", footer?.newsletter_subtitle || t("newsletter.subtitle"))
                    : (footer?.newsletter_subtitle || t("newsletter.subtitle"))}
                </p>
                <form onSubmit={onSubscribe} className="flex gap-2">
                  <Input
                    type="email"
                    required
                    placeholder="email@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-10 text-[13px] bg-white/10 border-white/15 text-white placeholder:text-white/40 focus-visible:ring-accent"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={submitting}
                    className="h-10 shrink-0 bg-cta-gradient text-primary-foreground border-0 shadow-cta-glow hover:opacity-95 px-4"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </form>
                <div className="mt-6">
                  <PaymentBadges />
                </div>
              </div>
            )}

            {/* Brand + contatti + link utili */}
            <div className="order-4 lg:order-none lg:col-span-4">
              <div className="flex items-center gap-2.5 mb-3">
                {branding?.logo_url ? (
                  <img src={optimizeImg(branding.logo_url, { h: 80, q: 80 })} alt={storeName} width={140} height={40} loading="lazy" decoding="async" className="h-10 w-auto object-contain brightness-0 invert" />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-medium text-[14px]">
                    {storeName.charAt(0)}
                  </div>
                )}
              </div>

              {footerDescription && (
                <p className="mb-5 text-[12.5px] leading-relaxed text-white/65 max-w-sm">
                  {footer?.id
                    ? tField(txFooter, footer.id, "footer_description", footerDescription)
                    : footerDescription}
                </p>
              )}

              {company?.address_line1 && (
                <ul className="space-y-2 text-[12.5px] text-white/65 mb-6">
                  <li className="flex items-start gap-2">
                    <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-accent" />
                    <span>
                      {company.address_line1}, {company.postal_code} {company.city}
                      {company.province && ` (${company.province})`}
                    </span>
                  </li>
                  {company.contact_email && (
                    <li className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 shrink-0 text-accent" />
                      <a href={`mailto:${company.contact_email}`} className="hover:text-white transition-colors">
                        {company.contact_email}
                      </a>
                    </li>
                  )}
                  {company.contact_phone && (
                    <li className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 shrink-0 text-accent" />
                      <span>{company.contact_phone}</span>
                    </li>
                  )}
                </ul>
              )}

              <h3 className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/50 mb-3">
                {t("footer.useful_links")}
              </h3>
              <ul className="space-y-2 text-[13px] text-white/80">
                <li>
                  <Link to="/{-$locale}/shop" params={{} as any} className="hover:text-white transition-colors">
                    {t("nav.shop")}
                  </Link>
                </li>
                {(footer?.links || []).map((l, i) => (
                  <li key={i}>
                    <a href={l.url} className="hover:text-white transition-colors">
                      {footer?.id ? tField(txFooter, footer.id, `link_${i}_label`, l.label) : l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legali */}
            <div className="order-5 lg:order-none lg:col-span-4">
              <h3 className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/50 mb-3">
                {t("footer.legal")}
              </h3>
              <ul className="space-y-2 text-[13px] text-white/80">
                <li><a href="/legal/privacy" className="hover:text-white transition-colors">{t("legal.privacy")}</a></li>
                <li><a href="/legal/terms" className="hover:text-white transition-colors">{t("legal.terms")}</a></li>
                <li><a href="/legal/shipping" className="hover:text-white transition-colors">{t("legal.shipping")}</a></li>
                <li><a href="/legal/returns" className="hover:text-white transition-colors">{t("legal.returns")}</a></li>
                <li><a href="/legal/cookies" className="hover:text-white transition-colors">{t("legal.cookies")}</a></li>
              </ul>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-white/10 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[11.5px] text-white/55">
              <span>
                {footer?.id
                  ? tField(txFooter, footer.id, "copyright_text", footer?.copyright_text || `© ${year} ${company?.legal_name || storeName}. ${t("footer.rights")}`)
                  : (footer?.copyright_text || `© ${year} ${company?.legal_name || storeName}. ${t("footer.rights")}`)}
              </span>
              <span>{t("footer.made_with")}</span>
            </div>
            {company && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-white/40">
                {company.legal_name && <span>{company.legal_name}</span>}
                {company.vat_number && <span>· P.IVA {company.vat_number}</span>}
                {company.tax_code && <span>· C.F. {company.tax_code}</span>}
                {company.rea_number && <span>· REA {company.rea_number}</span>}
              </div>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
