/**
 * Locale detection — cattura la lingua dal browser e la combina con la lingua
 * selezionata su Sito A per produrre un BCP-47 affidabile da inoltrare a Sito B → Shopify.
 *
 * Output:
 *  - locale:  BCP-47, es. "en-US", "it-IT", "fr-FR", "de-DE"
 *  - language: ISO-639-1 lowercase (es. "en", "it")
 *  - country:  ISO-3166 alpha-2 uppercase (es. "US", "IT") oppure undefined
 *  - accept_language: stringa Accept-Language preferita dal browser (full)
 */
export interface DetectedLocale {
  locale: string;
  language: string;
  country?: string;
  accept_language?: string;
}

const DEFAULT_COUNTRY_BY_LANG: Record<string, string> = {
  it: "IT",
  en: "US",
  fr: "FR",
  de: "DE",
  es: "ES",
  pt: "PT",
  nl: "NL",
};

export function detectLocale(siteLang?: string): DetectedLocale {
  const lang = (siteLang || "").toLowerCase().split("-")[0] || "en";

  if (typeof navigator === "undefined") {
    const country = DEFAULT_COUNTRY_BY_LANG[lang];
    return {
      locale: country ? `${lang}-${country}` : lang,
      language: lang,
      country,
    };
  }

  const browserLangs = (navigator.languages && navigator.languages.length
    ? navigator.languages
    : [navigator.language || "en-US"]).filter(Boolean);

  // Prova a trovare un browser locale che combaci con la lingua del sito (es. it-CH se sito è "it")
  let match = browserLangs.find((l) => l.toLowerCase().startsWith(lang + "-"));
  if (!match) {
    // Altrimenti prendi il primo browser locale completo (con regione)
    match = browserLangs.find((l) => l.includes("-"));
  }

  let country: string | undefined;
  if (match && match.includes("-")) {
    country = match.split("-")[1].toUpperCase();
  } else {
    country = DEFAULT_COUNTRY_BY_LANG[lang];
  }

  const locale = country ? `${lang}-${country}` : (match || lang);

  return {
    locale,
    language: lang,
    country,
    accept_language: browserLangs.join(","),
  };
}
