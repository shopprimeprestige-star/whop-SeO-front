// send-conversion — invia Purchase server-side a Meta CAPI + TikTok Events API
// con dedup tramite event_id. iOS 14.5 friendly.
// Body JSON: { event_name, event_id, value, currency, order_id, email?, phone?, ip?, user_agent?, fbp?, fbc?, ttp? }
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders, errorResponse, getEnv, jsonResponse } from "../_shared/http.ts";

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s.trim().toLowerCase()));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getSetting(sb: any, key: string): Promise<string> {
  const { data } = await sb.from("settings").select("value").eq("key", key).maybeSingle();
  const v = data?.value;
  if (v == null) return "";
  return typeof v === "string" ? v : String(v);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("POST only", 405);

  const sb: any = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"));
  const body = await req.json().catch(() => ({}));

  const event_name = String(body.event_name || "Purchase");
  const event_id = String(body.event_id || crypto.randomUUID());
  const value = Number(body.value || 0);
  const currency = String(body.currency || "EUR");
  const order_id = String(body.order_id || "");
  const email = body.email ? String(body.email) : "";
  const phone = body.phone ? String(body.phone).replace(/\D/g, "") : "";
  const client_ip = body.ip ? String(body.ip) : "";
  const user_agent = body.user_agent ? String(body.user_agent) : "";
  const fbp = body.fbp ? String(body.fbp) : "";
  const fbc = body.fbc ? String(body.fbc) : "";
  const ttp = body.ttp ? String(body.ttp) : "";
  const event_source_url = body.event_source_url ? String(body.event_source_url) : "";

  // Hash PII
  const em = email ? await sha256(email) : "";
  const ph = phone ? await sha256(phone) : "";

  const out: any = { ok: true, event_id, channels: {} };

  // === Meta CAPI ===
  const metaPixel = await getSetting(sb, "meta_pixel_id");
  const metaToken = await getSetting(sb, "meta_access_token");
  const metaTest = await getSetting(sb, "meta_test_event_code");
  if (metaPixel && metaToken) {
    // Dedup check
    const dedupKey = `${event_id}:meta`;
    const { error: dupErr } = await sb.from("tracking_events").insert({
      event_id, channel: "meta", event_name, status: "sending",
      payload: { value, currency, order_id, has_em: !!em, has_ph: !!ph },
    });
    if (dupErr && (dupErr as any).code === "23505") {
      out.channels.meta = { skipped: "duplicate" };
    } else {
      try {
        const userData: any = {};
        if (em) userData.em = [em];
        if (ph) userData.ph = [ph];
        if (client_ip) userData.client_ip_address = client_ip;
        if (user_agent) userData.client_user_agent = user_agent;
        if (fbp) userData.fbp = fbp;
        if (fbc) userData.fbc = fbc;

        const payload: any = {
          data: [{
            event_name,
            event_time: Math.floor(Date.now() / 1000),
            event_id,
            action_source: "website",
            event_source_url: event_source_url || undefined,
            user_data: userData,
            custom_data: {
              currency, value,
              order_id: order_id || undefined,
            },
          }],
        };
        if (metaTest) payload.test_event_code = metaTest;

        const url = `https://graph.facebook.com/v18.0/${metaPixel}/events?access_token=${encodeURIComponent(metaToken)}`;
        const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
        const j = await r.json().catch(() => ({}));
        await sb.from("tracking_events").update({
          status: r.ok ? "sent" : "failed",
          response_code: r.status,
          last_error: r.ok ? null : JSON.stringify(j).slice(0, 500),
          attempts: 1,
        }).eq("event_id", event_id).eq("channel", "meta");
        out.channels.meta = { ok: r.ok, status: r.status, response: j };
      } catch (e: any) {
        await sb.from("tracking_events").update({
          status: "failed", last_error: String(e?.message || e), attempts: 1,
        }).eq("event_id", event_id).eq("channel", "meta");
        out.channels.meta = { ok: false, error: String(e?.message || e) };
      }
    }
  } else {
    out.channels.meta = { skipped: "not_configured" };
  }

  // === TikTok Events API ===
  const ttPixel = await getSetting(sb, "tiktok_pixel_id");
  const ttToken = await getSetting(sb, "tiktok_access_token");
  const ttTest = await getSetting(sb, "tiktok_test_event_code");
  if (ttPixel && ttToken) {
    const { error: dupErr } = await sb.from("tracking_events").insert({
      event_id, channel: "tiktok", event_name, status: "sending",
      payload: { value, currency, order_id },
    });
    if (dupErr && (dupErr as any).code === "23505") {
      out.channels.tiktok = { skipped: "duplicate" };
    } else {
      try {
        const userData: any = {};
        if (em) userData.email = em;
        if (ph) userData.phone = ph;
        if (client_ip) userData.ip = client_ip;
        if (user_agent) userData.user_agent = user_agent;
        if (ttp) userData.ttp = ttp;

        const payload: any = {
          event_source: "web",
          event_source_id: ttPixel,
          data: [{
            event: event_name === "Purchase" ? "CompletePayment" : event_name,
            event_time: Math.floor(Date.now() / 1000),
            event_id,
            user: userData,
            properties: {
              currency, value,
              contents: order_id ? [{ content_id: order_id, content_type: "product" }] : undefined,
            },
            page: event_source_url ? { url: event_source_url } : undefined,
          }],
        };
        if (ttTest) payload.test_event_code = ttTest;

        const r = await fetch("https://business-api.tiktok.com/open_api/v1.3/event/track/", {
          method: "POST",
          headers: { "content-type": "application/json", "Access-Token": ttToken },
          body: JSON.stringify(payload),
        });
        const j = await r.json().catch(() => ({}));
        await sb.from("tracking_events").update({
          status: r.ok && j.code === 0 ? "sent" : "failed",
          response_code: r.status,
          last_error: r.ok && j.code === 0 ? null : JSON.stringify(j).slice(0, 500),
          attempts: 1,
        }).eq("event_id", event_id).eq("channel", "tiktok");
        out.channels.tiktok = { ok: r.ok, status: r.status, response: j };
      } catch (e: any) {
        await sb.from("tracking_events").update({
          status: "failed", last_error: String(e?.message || e), attempts: 1,
        }).eq("event_id", event_id).eq("channel", "tiktok");
        out.channels.tiktok = { ok: false, error: String(e?.message || e) };
      }
    }
  } else {
    out.channels.tiktok = { skipped: "not_configured" };
  }

  return jsonResponse(out);
});
