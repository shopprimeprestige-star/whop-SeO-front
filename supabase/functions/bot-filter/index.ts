// Endpoint: detects bots and logs them.
// Frontend calls this (POST) on page load — if bot, returns { bot: true, name } and frontend skips tracking/pixels.
import { corsHeaders, jsonResponse as json } from "../_shared/http.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { detectBot, clientIP } from "../_shared/bot-detection.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const ua = req.headers.get("user-agent");
  const ip = clientIP(req);
  let path = "/";
  try {
    const body = await req.json();
    if (typeof body?.path === "string") path = body.path.slice(0, 512);
  } catch {
    // ignore
  }

  const result = detectBot(ua, ip);

  if (result.isBot) {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await supabase.from("bot_blocks").insert({
      ip: ip?.slice(0, 64) || null,
      user_agent: ua?.slice(0, 1024) || null,
      reason: result.reason || "unknown",
      bot_name: result.bot_name || "Unknown",
      path,
    });
    return json({ bot: true, name: result.bot_name, reason: result.reason });
  }

  return json({ bot: false });
});
