// Helper per il routing localizzato (/it, /fr, /de, ...)
import type { Lang } from "@/lib/i18n";

export const SUPPORTED_LANG_CODES: Lang[] = [
  "it", "en", "de", "fr", "es", "pt", "nl",
  "bg", "cs", "da", "el", "et", "fi", "ga", "hr", "hu",
  "lt", "lv", "mt", "pl", "ro", "sk", "sl", "sv",
  "no", "is", "ja", "ko", "zh", "ar", "he",
];

export function isSupportedLang(code: string | undefined): code is Lang {
  return !!code && (SUPPORTED_LANG_CODES as string[]).includes(code);
}

/** Estrae il locale dal pathname; ritorna null se la prima sezione non è una lingua supportata. */
export function localeFromPath(pathname: string): Lang | null {
  const seg = pathname.split("/").filter(Boolean)[0];
  return seg && isSupportedLang(seg) ? (seg as Lang) : null;
}

/** Rimuove il prefisso /{locale} dal pathname. */
export function stripLocale(pathname: string): string {
  const loc = localeFromPath(pathname);
  if (!loc) return pathname || "/";
  const stripped = pathname.replace(new RegExp(`^/${loc}`), "");
  return stripped || "/";
}

/** Costruisce path localizzato: locale "it" → /it/shop, null → /shop. */
export function withLocale(pathname: string, locale: Lang | null): string {
  const clean = stripLocale(pathname);
  if (!locale) return clean;
  return clean === "/" ? `/${locale}` : `/${locale}${clean}`;
}

/** Genera link rel=alternate hreflang per SEO multilingua. */
export function hreflangLinks(canonicalPath: string): Array<{ rel: string; hrefLang: string; href: string }> {
  const links: Array<{ rel: string; hrefLang: string; href: string }> = SUPPORTED_LANG_CODES.map((l) => ({
    rel: "alternate",
    hrefLang: l as string,
    href: l === "it" ? canonicalPath : `/${l}${canonicalPath === "/" ? "" : canonicalPath}`,
  }));
  links.push({ rel: "alternate", hrefLang: "x-default", href: canonicalPath });
  return links;
}

/** Titoli base per pagine, semplici (i contenuti rich vengono dal dizionario i18n in-component). */
const TITLES: Record<string, Record<string, string>> = {
  home: {
    it: "Northbyte — Tecnologia premium",
    en: "Northbyte — Premium technology",
    de: "Northbyte — Premium-Technologie",
    fr: "Northbyte — Technologie premium",
    es: "Northbyte — Tecnología premium",
    pt: "Northbyte — Tecnologia premium",
    nl: "Northbyte — Premium technologie",
  },
  home_desc: {
    it: "Drop esclusivi, checkout veloce, spedizione tracciata in tutta Europa.",
    en: "Exclusive drops, fast checkout, tracked shipping across Europe.",
    de: "Exklusive Drops, schneller Checkout, verfolgter Versand in ganz Europa.",
    fr: "Drops exclusifs, paiement rapide, livraison suivie en Europe.",
    es: "Drops exclusivos, pago rápido, envío rastreado por Europa.",
    pt: "Drops exclusivos, checkout rápido, envio rastreado pela Europa.",
    nl: "Exclusieve drops, snelle checkout, getrackte verzending door heel Europa.",
  },
  shop: {
    it: "Shop", en: "Shop", de: "Shop", fr: "Boutique", es: "Tienda", pt: "Loja", nl: "Winkel",
  },
  shop_desc: {
    it: "Esplora la collezione completa.",
    en: "Browse the full collection.",
    de: "Entdecken Sie die gesamte Kollektion.",
    fr: "Explorez la collection complète.",
    es: "Explora la colección completa.",
    pt: "Explore a coleção completa.",
    nl: "Bekijk de volledige collectie.",
  },
};

export function localizedTitle(key: keyof typeof TITLES, lang: string): string {
  return TITLES[key]?.[lang] || TITLES[key]?.it || "";
}
