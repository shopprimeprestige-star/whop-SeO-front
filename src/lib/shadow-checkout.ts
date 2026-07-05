/**
 * Bridge Checkout Client
 * ---------------------
 * Chiama l'edge function `bridge-checkout` che seleziona uno store con Sito Ponte
 * connesso, invoca POST {bridge_site_url}/api/generate-checkout e ritorna un
 * redirect_url. Il browser viene reindirizzato lì: Shopify vedrà come Referer il
 * dominio del Sito Ponte, non il nostro dominio.
 */
import { supabase } from "@/integrations/supabase/client";
import { detectLocale } from "@/lib/locale-detect";

export interface BridgeCheckoutItem {
  product_slug: string;
  variant_label?: string;
  quantity: number;
  /** Per-unit price in the user-selected display currency (already converted from EUR). */
  unit_price?: number;
}

export interface BridgeCheckoutInput {
  // Modalità singola
  product_slug?: string;
  variant_label?: string;
  quantity?: number;
  unit_price?: number;
  // Modalità multi-item (carrello completo)
  items?: BridgeCheckoutItem[];
  /** ISO 4217 currency code selected by the user on Sito A (EUR, USD, GBP, ...). */
  currency?: string;
  /** BCP-47 locale to forward to Sito B → Shopify (es. "en-US"). Auto-rilevato se assente. */
  locale?: string;
  /** ISO-639-1 language (es. "it"). Auto-rilevato se assente. */
  language?: string;
  /** ISO-3166 country (es. "IT"). Auto-rilevato se assente. */
  country?: string;
  /** Accept-Language preferito dal browser, full string. */
  accept_language?: string;
  session_id?: string;
  warmup?: boolean;
}

export interface BridgeCheckoutResult {
  redirect_url: string;
  store_domain: string;
  attempts: number;
  algorithm: string;
  ok?: boolean;
  warmed?: boolean;
  debug?: unknown;
}

export class BridgeCheckoutError extends Error {
  detail?: unknown;
  httpStatus?: number;
  constructor(message: string, opts: { detail?: unknown; httpStatus?: number } = {}) {
    super(message);
    this.detail = opts.detail;
    this.httpStatus = opts.httpStatus;
  }
}

export async function bridgeCheckout(input: BridgeCheckoutInput): Promise<BridgeCheckoutResult> {
  // Auto-detect locale dal browser se non già fornito dal chiamante.
  const detected = detectLocale(input.language);
  const enriched: BridgeCheckoutInput = {
    ...input,
    locale: input.locale || detected.locale,
    language: input.language || detected.language,
    country: input.country || detected.country,
    accept_language: input.accept_language || detected.accept_language,
  };

  const { data, error } = await supabase.functions.invoke<
    BridgeCheckoutResult & { error?: string }
  >("bridge-checkout", { body: enriched });

  if (error) {
    const detail = await readFunctionError(error);
    const message = detail?.error || detail?.message || error.message || "bridge-checkout failed";
    throw new BridgeCheckoutError(message, {
      detail: detail || error,
      httpStatus: detail?.status || detail?.http_status,
    });
  }
  if (!input.warmup && !data?.redirect_url) {
    throw new BridgeCheckoutError("Sito Ponte non ha restituito redirect_url", {
      detail: data,
    });
  }
  return data as BridgeCheckoutResult;
}

const warmedKeys = new Set<string>();

export function warmBridgeCheckout(input: BridgeCheckoutInput) {
  if (typeof window === "undefined") return;
  const key = JSON.stringify({
    product_slug: input.product_slug,
    items: input.items?.map((item) => item.product_slug).sort(),
    language: input.language,
    currency: input.currency,
  });
  if (warmedKeys.has(key)) return;
  warmedKeys.add(key);
  const run = () => {
    void bridgeCheckout({ ...input, quantity: input.quantity || 1, warmup: true }).catch(
      () => undefined,
    );
  };
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 1500 });
  } else {
    globalThis.setTimeout(run, 300);
  }
}

async function readFunctionError(error: unknown): Promise<any | null> {
  const context = (error as any)?.context;
  if (!context) return null;
  try {
    if (typeof context.json === "function") return await context.json();
    if (typeof context.text === "function") {
      const text = await context.text();
      try {
        return JSON.parse(text);
      } catch {
        return { raw: text };
      }
    }
  } catch {
    return null;
  }
  return null;
}
