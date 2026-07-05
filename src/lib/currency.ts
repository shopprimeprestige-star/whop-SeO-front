// Live currency conversion. Cache rates 24h in localStorage.
// Base = EUR (tutti i prezzi DB sono in EUR).

export type Currency =
  | "EUR" | "GBP" | "CHF" | "DKK" | "SEK" | "NOK" | "ISK"
  | "PLN" | "CZK" | "HUF" | "BGN" | "RON" | "USD"
  | "CAD" | "AUD" | "NZD" | "JPY" | "KRW" | "TWD" | "HKD" | "SGD"
  | "AED" | "QAR" | "KWD" | "SAR" | "ILS";

const CACHE_KEY = "lp_fx_rates_v3";
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

interface RatesCache {
  ts: number;
  rates: Record<string, number>;
}

let inflight: Promise<Record<string, number>> | null = null;

export async function getRates(): Promise<Record<string, number>> {
  if (typeof window === "undefined") return { EUR: 1 };
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as RatesCache;
      if (Date.now() - parsed.ts < CACHE_TTL && parsed.rates?.EUR) return parsed.rates;
    }
  } catch {}

  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await fetch("https://open.er-api.com/v6/latest/EUR");
      const j = await r.json();
      const rates = j?.rates || { EUR: 1 };
      rates.EUR = 1;
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), rates }));
      return rates;
    } catch {
      return { EUR: 1 };
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

const SYMBOLS: Record<string, string> = {
  EUR: "€", GBP: "£", USD: "$", CHF: "CHF",
  DKK: "kr", SEK: "kr", NOK: "kr", ISK: "kr",
  PLN: "zł", CZK: "Kč", HUF: "Ft", BGN: "лв", RON: "lei",
  CAD: "C$", AUD: "A$", NZD: "NZ$",
  JPY: "¥", KRW: "₩", TWD: "NT$", HKD: "HK$", SGD: "S$",
  AED: "AED", QAR: "QAR", KWD: "KWD", SAR: "SAR", ILS: "₪",
};

const LOCALE_FOR_LANG: Record<string, string> = {
  it: "it-IT", en: "en-GB", de: "de-DE", fr: "fr-FR", es: "es-ES",
  pt: "pt-PT", nl: "nl-NL",
  bg: "bg-BG", cs: "cs-CZ", da: "da-DK", el: "el-GR", et: "et-EE",
  fi: "fi-FI", ga: "ga-IE", hr: "hr-HR", hu: "hu-HU", lt: "lt-LT",
  lv: "lv-LV", mt: "mt-MT", pl: "pl-PL", ro: "ro-RO", sk: "sk-SK",
  sl: "sl-SI", sv: "sv-SE",
  no: "nb-NO", is: "is-IS",
  ja: "ja-JP", ko: "ko-KR", zh: "zh-TW",
  ar: "ar-AE", he: "he-IL",
};

const ZERO_DECIMAL = new Set(["HUF", "ISK", "JPY", "KRW", "TWD"]);

export function formatPrice(
  eurAmount: number,
  currency: string,
  rates: Record<string, number>,
  lang: string = "it",
): string {
  const rate = rates[currency] ?? 1;
  const amount = eurAmount * rate;
  const locale = LOCALE_FOR_LANG[lang] || "it-IT";
  const fractionDigits = ZERO_DECIMAL.has(currency) ? 0 : 2;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: fractionDigits,
      minimumFractionDigits: fractionDigits,
    }).format(amount);
  } catch {
    const sym = SYMBOLS[currency] || currency;
    return `${sym} ${amount.toFixed(fractionDigits)}`;
  }
}
