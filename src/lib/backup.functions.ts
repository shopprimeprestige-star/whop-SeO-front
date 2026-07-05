import { createServerFn } from "@tanstack/react-start";

const BACKUP_TABLES = [
  "products", "categories", "stores", "store_stats", "processed_orders",
  "webhook_events", "webhook_log", "sessions", "bot_blocks", "ab_tests", "ab_test_events",
  "utm_campaigns", "customers", "site_branding", "footer_config", "company_info",
  "home_sections", "legal_pages", "settings", "translations", "translation_failures",
  "integrations", "tracking_events", "shadow_checkout_log", "shopify_oauth_logs",
  "shopify_variant_map", "rotation_log", "sync_log", "system_logs", "team_members",
  "user_roles", "variant_cache", "store_operation_logs",
];

// Whitelist secrets/env to dump. Includes API keys, Lovable, gemini, Supabase keys, ecc.
const SECRET_KEYS = [
  "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_JWT_SECRET", "SUPABASE_JWKS",
  "SUPABASE_DB_URL", "SUPABASE_SECRET_KEYS", "SUPABASE_PUBLISHABLE_KEYS",
  "LOVABLE_API_KEY", "gemini", "GEMINI_API_KEY",
  "HAPPYSCAM_ENCRYPTION_KEY",
  "VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PROJECT_ID",
];

export const exportFullBackup = createServerFn({ method: "POST" })
  .handler(async (): Promise<any> => {
    const { requireUserFromRequest } = await import("@/lib/auth-guard.server");
    const { userId } = await requireUserFromRequest();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Verifica admin
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Forbidden: admin only");

    const tables: Record<string, unknown[]> = {};
    for (const t of BACKUP_TABLES) {
      const PAGE = 1000;
      let from = 0;
      const rows: unknown[] = [];
      while (true) {
        const { data, error } = await supabaseAdmin.from(t as never).select("*").range(from, from + PAGE - 1);
        if (error) { console.warn(`[backup] skip ${t}:`, error.message); break; }
        if (!data || data.length === 0) break;
        rows.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      tables[t] = rows;
    }

    // Auth users
    let auth_users: unknown[] = [];
    try {
      const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      auth_users = data?.users || [];
    } catch (e) {
      console.warn("[backup] auth users failed:", (e as Error).message);
    }

    // Secrets / env
    const secrets: Record<string, string> = {};
    for (const k of SECRET_KEYS) {
      const v = process.env[k];
      if (v != null && v !== "") secrets[k] = v;
    }
    // Add anything else starting with common prefixes
    for (const k of Object.keys(process.env)) {
      if (secrets[k]) continue;
      if (/^(SUPABASE_|LOVABLE_|SHOPIFY_|STRIPE_|RESEND_|SENDGRID_|GEMINI|OPENAI_|ANTHROPIC_|VITE_)/i.test(k)) {
        const v = process.env[k];
        if (v) secrets[k] = v;
      }
    }

    return {
      version: 2,
      exported_at: new Date().toISOString(),
      tables,
      auth_users,
      secrets,
    };
  });
