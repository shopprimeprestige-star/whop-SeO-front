// Lightweight auth guard for server functions.
// Avoids the generated requireSupabaseAuth middleware which depends on
// SUPABASE_PUBLISHABLE_KEY that may not be present in the Worker runtime;
// falls back to SUPABASE_ANON_KEY (always injected) and validates the
// caller's bearer token directly.
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export async function requireUserFromRequest(): Promise<{ userId: string; token: string }> {
  const FALLBACK_URL = "https://dcxsuyuvsmecaniakavr.supabase.co";
  const FALLBACK_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjeHN1eXV2c21lY2FuaWFrYXZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NjQwNDMsImV4cCI6MjA5NjQ0MDA0M30.7Rj2_3Ms8T7kXteMvN8TOlIhRJHQTgtMR371Q0wnjgQ";
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || FALLBACK_URL;
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    FALLBACK_KEY;

  const request = getRequest();
  const authHeader = request?.headers?.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Unauthorized: missing bearer token");
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) throw new Error("Unauthorized: empty bearer token");

  const sb = createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    throw new Error("Unauthorized: invalid token");
  }
  return { userId: data.claims.sub as string, token };
}
