export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...extra,
    },
  });
}

export function errorResponse(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return jsonResponse({ error: message, ...extra }, status);
}

export function getEnv(name: string, required = true): string {
  const v = Deno.env.get(name);
  if (!v && required) throw new Error(`Missing env: ${name}`);
  return v || "";
}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

export async function authenticateAdmin(
  req: Request,
): Promise<{ ok: true; userId: string } | { ok: false; error: string; status: number }> {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { ok: false, error: "Missing Authorization", status: 401 };

  // deno-lint-ignore no-explicit-any
  const sb: any = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: u } = await sb.auth.getUser();
  const userId = u?.user?.id;
  if (!userId) return { ok: false, error: "Invalid token", status: 401 };

  // deno-lint-ignore no-explicit-any
  const admin: any = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"));
  const { data: role } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!role) return { ok: false, error: "Admin only", status: 403 };
  return { ok: true, userId };
}
