import { supabase } from "@/integrations/supabase/client";

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export class EdgeRequestError extends Error {
  status: number;
  payload: any;

  constructor(message: string, status: number, payload: any) {
    super(message);
    this.name = "EdgeRequestError";
    this.status = status;
    this.payload = payload;
  }
}

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return {
    Authorization: `Bearer ${token}`,
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    "Content-Type": "application/json",
  };
}

export async function callEdge<T = any>(
  fn: string,
  body: Record<string, unknown> = {},
  options: { timeoutMs?: number } = {},
): Promise<T> {
  const headers = await authHeader();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  let res: Response;
  try {
    res = await fetch(`${FUNCTIONS_BASE}/${fn}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
  const txt = await res.text();
  let json: any;
  try { json = JSON.parse(txt); } catch { json = { raw: txt }; }
  if (!res.ok) throw new EdgeRequestError(json?.error || `Edge ${fn} failed: ${res.status}`, res.status, json);
  return json as T;
}

// ============================================================
// Shopify-direct API surface — DISABLED on Sito A.
// Sito A non parla più direttamente con Shopify. Tutte le operazioni
// Shopify (OAuth, sync ordini/prodotti, webhook, push) avvengono sul Sito B (Sito Ponte).
// Sito A invia solo store_id + shop_domain al bridge; Sito B sa quale myshopify aprire.
// Questi tipi/funzioni restano come stub per non rompere import esistenti.
// ============================================================

const BRIDGE_ONLY_MSG =
  "Funzione Shopify diretta disabilitata. Usa il Sito B (Sito Ponte) tramite il bridge.";

function bridgeOnly(): never {
  throw new EdgeRequestError(BRIDGE_ONLY_MSG, 410, { error: BRIDGE_ONLY_MSG });
}

export interface ShopifyOrder {
  id: number;
  name: string;
  email?: string;
  total_price: string;
  currency: string;
  created_at: string;
  financial_status?: string;
  fulfillment_status?: string | null;
  customer?: { first_name?: string; last_name?: string; email?: string };
  line_items?: Array<{ name: string; quantity: number }>;
}

export async function fetchTodayOrders(_storeId: string): Promise<ShopifyOrder[]> {
  bridgeOnly();
}

export interface ShopifyTestResult {
  ok: boolean;
  error?: string;
  shop_name?: string;
  currency?: string;
  plan?: string;
  country?: string | null;
  email?: string | null;
}

export async function testShopifyConnection(
  _shop_domain: string,
  _access_token: string,
): Promise<ShopifyTestResult> {
  bridgeOnly();
}

export interface SaveStorePayload {
  store_id?: string;
  shop_domain: string;
  display_name?: string | null;
  access_token?: string;
  webhook_secret?: string;
  client_id?: string | null;
  client_secret?: string;
  oauth_scopes?: string | null;
  country_rule?: string;
  cap_amount?: number;
  cap_window_days?: number;
  is_active?: boolean;
  proxy_enabled?: boolean;
  proxy_type?: string;
  proxy_host?: string | null;
  proxy_port?: number | null;
  proxy_username?: string | null;
  proxy_password?: string | null;
  correlation_id?: string;
  attempt?: number;
}

export async function saveStoreCredentials(_payload: SaveStorePayload): Promise<{ ok: true; store: { id: string; shop_domain: string } }> {
  bridgeOnly();
}

export interface WebhookEndpointTestResult {
  ok: boolean;
  http_status: number;
  signature_verified: boolean;
  topic: string;
  response?: unknown;
  correlation_id?: string;
}

export async function testWebhookEndpoint(_store_id: string, _topic = "orders/paid", _correlation_id?: string): Promise<WebhookEndpointTestResult> {
  bridgeOnly();
}

export interface ShopifyOAuthInstallPayload {
  shop_domain: string;
  display_name?: string | null;
  client_id: string;
  client_secret: string;
  scopes?: string;
  redirect_uri: string;
  app_url: string;
}

export async function shopifyOAuthInstall(_payload: ShopifyOAuthInstallPayload): Promise<{ ok: true; authorize_url: string; state: string }> {
  bridgeOnly();
}

export function shopifyCallbackUrl(): string {
  return "";
}
