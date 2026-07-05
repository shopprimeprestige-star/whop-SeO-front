import { corsHeaders, jsonResponse as json } from "../_shared/http.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Server-side tracking: Meta Conversions API + TikTok Events API
// - Server-side dedup via tracking_events UNIQUE(event_id, channel)
// - Exponential backoff retry (3 attempts) on 429 / 5xx

interface TrackPayload {
  event_name: string;
  event_id?: string;
  event_source_url?: string;
  user_data?: {
    email?: string;
    phone?: string;
    external_id?: string;
    client_ip?: string;
    client_user_agent?: string;
    fbc?: string;
    fbp?: string;
    ttclid?: string;
  };
  custom_data?: Record<string, unknown>;
  test_event_code?: string;
}

type Channel = "meta" | "tiktok";

async function sha256(value: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value.trim().toLowerCase()),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashUserData(u: TrackPayload["user_data"]) {
  if (!u) return {};
  const out: Record<string, string | string[] | undefined> = {};
  if (u.email) out.em = [await sha256(u.email)];
  if (u.phone) out.ph = [await sha256(u.phone.replace(/\D/g, ""))];
  if (u.external_id) out.external_id = [await sha256(u.external_id)];
  if (u.client_ip) out.client_ip_address = u.client_ip;
  if (u.client_user_agent) out.client_user_agent = u.client_user_agent;
  if (u.fbc) out.fbc = u.fbc;
  if (u.fbp) out.fbp = u.fbp;
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch wrapper with exponential backoff on 429 / 5xx.
 * Returns final response and total attempts used.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxAttempts = 3,
): Promise<{ res: Response; bodyText: string; attempts: number }> {
  let lastErr: unknown;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const res = await fetch(url, init);
      const text = await res.text();
      if (res.status < 500 && res.status !== 429) {
        return { res, bodyText: text, attempts: i };
      }
      lastErr = new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    } catch (e) {
      lastErr = e;
    }
    if (i < maxAttempts) {
      // exp backoff: 400ms, 1200ms, 3600ms (+ jitter)
      const base = 400 * Math.pow(3, i - 1);
      await sleep(base + Math.random() * 200);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("retry failed");
}

async function sendMeta(
  pixelId: string,
  token: string,
  payload: TrackPayload,
  testCode?: string,
) {
  const event = {
    event_name: payload.event_name,
    event_time: Math.floor(Date.now() / 1000),
    event_id: payload.event_id, // Meta uses this for browser+server dedup
    event_source_url: payload.event_source_url,
    action_source: "website",
    user_data: await hashUserData(payload.user_data),
    custom_data: payload.custom_data ?? {},
  };
  const body: Record<string, unknown> = { data: [event] };
  if (testCode) body.test_event_code = testCode;
  return fetchWithRetry(
    `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

async function sendTikTok(
  pixelId: string,
  token: string,
  payload: TrackPayload,
  testCode?: string,
) {
  const u = payload.user_data ?? {};
  const userBlock: Record<string, unknown> = {};
  if (u.email) userBlock.email = await sha256(u.email);
  if (u.phone) userBlock.phone = await sha256(u.phone.replace(/\D/g, ""));
  if (u.external_id) userBlock.external_id = await sha256(u.external_id);
  if (u.client_ip) userBlock.ip = u.client_ip;
  if (u.client_user_agent) userBlock.user_agent = u.client_user_agent;
  if (u.ttclid) userBlock.ttclid = u.ttclid;

  const body: Record<string, unknown> = {
    event_source: "web",
    event_source_id: pixelId,
    data: [
      {
        event: payload.event_name,
        event_time: Math.floor(Date.now() / 1000),
        event_id: payload.event_id, // TikTok dedup id
        user: userBlock,
        page: { url: payload.event_source_url },
        properties: payload.custom_data ?? {},
      },
    ],
  };
  if (testCode) body.test_event_code = testCode;
  return fetchWithRetry("https://business-api.tiktok.com/open_api/v1.3/event/track/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Access-Token": token,
    },
    body: JSON.stringify(body),
  });
}

interface DispatchResult {
  status: "sent" | "duplicate" | "error" | "skipped";
  attempts?: number;
  http?: number;
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let payload: TrackPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!payload.event_name) return json({ error: "event_name required" }, 400);

  // event_id is required for dedup — generate a fallback if missing
  if (!payload.event_id) payload.event_id = crypto.randomUUID();

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: rows } = await supabase
    .from("settings")
    .select("key,value")
    .in("key", [
      "meta_pixel_id",
      "meta_access_token",
      "meta_test_event_code",
      "tiktok_pixel_id",
      "tiktok_access_token",
      "tiktok_test_event_code",
    ]);

  const cfg: Record<string, string> = {};
  for (const r of rows ?? []) {
    cfg[r.key] = typeof r.value === "string" ? r.value : (r.value as string) ?? "";
  }

  // enrich with request headers
  payload.user_data = {
    ...(payload.user_data ?? {}),
    client_ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
    client_user_agent: req.headers.get("user-agent") || undefined,
  };

  async function dispatch(channel: Channel): Promise<DispatchResult> {
    // Try to claim this (event_id, channel) by inserting a pending row.
    // If unique constraint fires, it's a duplicate — skip.
    const insert = await supabase
      .from("tracking_events")
      .insert({
        event_id: payload.event_id!,
        channel,
        event_name: payload.event_name,
        status: "pending",
        attempts: 0,
        payload: { custom_data: payload.custom_data ?? {} },
      })
      .select("id")
      .maybeSingle();

    if (insert.error) {
      // 23505 = unique_violation
      if (insert.error.code === "23505") return { status: "duplicate" };
      return { status: "error", error: insert.error.message };
    }
    const rowId = insert.data?.id;

    try {
      const r =
        channel === "meta"
          ? await sendMeta(
              cfg.meta_pixel_id,
              cfg.meta_access_token,
              payload,
              cfg.meta_test_event_code || undefined,
            )
          : await sendTikTok(
              cfg.tiktok_pixel_id,
              cfg.tiktok_access_token,
              payload,
              cfg.tiktok_test_event_code || undefined,
            );

      const ok = r.res.ok;
      await supabase
        .from("tracking_events")
        .update({
          status: ok ? "sent" : "error",
          attempts: r.attempts,
          response_code: r.res.status,
          last_error: ok ? null : r.bodyText.slice(0, 1000),
        })
        .eq("id", rowId!);

      return {
        status: ok ? "sent" : "error",
        attempts: r.attempts,
        http: r.res.status,
        error: ok ? undefined : r.bodyText.slice(0, 200),
      };
    } catch (e) {
      const msg = (e as Error).message;
      await supabase
        .from("tracking_events")
        .update({
          status: "error",
          attempts: 3,
          last_error: msg.slice(0, 1000),
        })
        .eq("id", rowId!);
      return { status: "error", attempts: 3, error: msg };
    }
  }

  const results: Record<string, DispatchResult> = {};
  if (cfg.meta_pixel_id && cfg.meta_access_token) {
    results.meta = await dispatch("meta");
  } else {
    results.meta = { status: "skipped", error: "meta not configured" };
  }
  if (cfg.tiktok_pixel_id && cfg.tiktok_access_token) {
    results.tiktok = await dispatch("tiktok");
  } else {
    results.tiktok = { status: "skipped", error: "tiktok not configured" };
  }

  return json({ ok: true, event_id: payload.event_id, results });
});
