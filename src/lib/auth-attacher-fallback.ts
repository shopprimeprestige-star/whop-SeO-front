import { createMiddleware } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const FALLBACK_SUPABASE_URL = "https://dcxsuyuvsmecaniakavr.supabase.co";
const FALLBACK_SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjeHN1eXV2c21lY2FuaWFrYXZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NjQwNDMsImV4cCI6MjA5NjQ0MDA0M30.7Rj2_3Ms8T7kXteMvN8TOlIhRJHQTgtMR371Q0wnjgQ";

let browserClient: ReturnType<typeof createClient<Database>> | undefined;

function getBrowserClient() {
  if (browserClient) return browserClient;
  const url = import.meta.env.VITE_SUPABASE_URL || FALLBACK_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || FALLBACK_SUPABASE_PUBLISHABLE_KEY;
  browserClient = createClient<Database>(url, key, {
    auth: {
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return browserClient;
}

export const attachSupabaseAuthFallback = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const { data } = await getBrowserClient().auth.getSession();
  const token = data.session?.access_token;
  return next({
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
});