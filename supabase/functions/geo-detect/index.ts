// geo-detect — restituisce country + lingua suggerita basandosi su IP.
// Strategia: header CDN (CF/Vercel/X-Country) → fallback lookup via ipapi.co.
import { corsHeaders, jsonResponse } from "../_shared/http.ts";

const COUNTRY_TO_LANG: Record<string, string> = {
  // Eurozona / paesi con traduzione dedicata
  IT: "it", SM: "it", VA: "it",
  GB: "en", IE: "en", US: "en", CA: "en", AU: "en", NZ: "en",
  DE: "de", AT: "de", LI: "de", CH: "de",
  FR: "fr", BE: "fr", LU: "fr", MC: "fr",
  ES: "es", AD: "es", MX: "es", AR: "es",
  PT: "pt", BR: "pt",
  NL: "nl",
  // 17 nuove lingue UE
  BG: "bg", CZ: "cs", DK: "da", GR: "el", CY: "el",
  EE: "et", FI: "fi", HR: "hr", HU: "hu",
  LT: "lt", LV: "lv", MT: "mt", PL: "pl",
  RO: "ro", SK: "sk", SI: "sl", SE: "sv",
  // Senza lingua dedicata → EN
  NO: "en", IS: "en",
};

const SUPPORTED = [
  "it","en","de","fr","es","pt","nl",
  "bg","cs","da","el","et","fi","ga","hr","hu",
  "lt","lv","mt","pl","ro","sk","sl","sv",
];

function pickCurrency(country: string): string {
  // Eurozona (20 UE + micro-stati)
  if (["IT","DE","FR","ES","PT","NL","AT","BE","IE","FI","GR","SK","SI","EE","LV","LT","LU","MT","CY","HR","AD","MC","SM","VA"].includes(country)) return "EUR";
  if (country === "GB") return "GBP";
  if (country === "CH" || country === "LI") return "CHF";
  if (country === "DK") return "DKK";
  if (country === "SE") return "SEK";
  if (country === "NO") return "NOK";
  if (country === "IS") return "ISK";
  if (country === "PL") return "PLN";
  if (country === "CZ") return "CZK";
  if (country === "HU") return "HUF";
  if (country === "BG") return "BGN";
  if (country === "RO") return "RON";
  if (country === "US") return "USD";
  if (country === "CA") return "CAD";
  if (country === "AU") return "AUD";
  if (country === "JP") return "JPY";
  return "EUR";
}

function getClientIp(req: Request): string | null {
  const candidates = [
    req.headers.get("cf-connecting-ip"),
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    req.headers.get("x-real-ip"),
  ];
  for (const c of candidates) {
    if (c && c !== "127.0.0.1" && !c.startsWith("::")) return c;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // 1) Header diretti dal CDN (più veloci)
  let country = (
    req.headers.get("cf-ipcountry") ||
    req.headers.get("x-vercel-ip-country") ||
    req.headers.get("x-country") ||
    ""
  ).toUpperCase();

  // 2) Fallback: lookup IP via ipapi.co (gratis, no key, ~1k/day per IP)
  if (!country || country === "XX" || country === "T1") {
    const ip = getClientIp(req);
    if (ip) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 2500);
        const r = await fetch(`https://ipapi.co/${ip}/json/`, { signal: ctrl.signal });
        clearTimeout(t);
        if (r.ok) {
          const j = await r.json();
          if (j?.country_code && typeof j.country_code === "string") {
            country = j.country_code.toUpperCase();
          }
        }
      } catch {
        // ignora — useremo accept-language come ultima risorsa
      }
    }
  }

  const acceptLang = (req.headers.get("accept-language") || "").toLowerCase();
  let lang = COUNTRY_TO_LANG[country] || "";
  if (!lang) {
    for (const code of SUPPORTED) {
      if (acceptLang.startsWith(code) || acceptLang.includes(`,${code}`) || acceptLang.includes(`;${code}`)) {
        lang = code;
        break;
      }
    }
  }
  if (!lang) lang = "en";

  return jsonResponse({
    country: country || null,
    lang,
    currency: pickCurrency(country),
    supported: SUPPORTED,
  });
});
