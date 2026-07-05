// Shared CAP-window rotation logic.
// Picks an eligible store based on:
//   1. is_active && is_online
//   2. country_rule matches visitor (ALL or specific code)
//   3. cap_window_revenue < cap_amount (or cap_amount NULL = no cap)
// Resets window when cap_window_start older than cap_window_days.
// Round-robin via sort_order, last-used tie-break by cap_window_revenue ASC.

// deno-lint-ignore-file no-explicit-any

export interface CapStore {
  id: string;
  shop_domain: string;
  display_name: string | null;
  display_id: string | null;
  is_active: boolean;
  is_online: boolean;
  is_current: boolean;
  country_rule: string;
  cap_amount: number | null;
  cap_window_days: number;
  cap_window_start: string | null;
  cap_window_revenue: number;
  shop_currency: string;
  sort_order: number;
  access_token_encrypted: string | null;
  client_id: string | null;
  client_secret_encrypted: string | null;
  webhook_secret_encrypted: string | null;
}

// Returns today's Rome-midnight as a UTC Date (handles DST automatically).
function romeMidnightUTC(): Date {
  // "yyyy-mm-dd" in Europe/Rome
  const romeDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date()); // e.g. 2026-04-26

  // Compute UTC offset of Europe/Rome at this instant
  const tzName = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome", timeZoneName: "shortOffset",
  }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value || "GMT+1";
  const m = tzName.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/);
  const offH = m ? parseInt(m[1], 10) : 1;
  const offM = m && m[2] ? parseInt(m[2], 10) : 0;
  const sign = offH >= 0 ? 1 : -1;
  const offsetMinutes = offH * 60 + sign * offM;
  // Rome midnight in UTC = 00:00 Rome - offset
  return new Date(new Date(`${romeDay}T00:00:00Z`).valueOf() - offsetMinutes * 60_000);
}

// Reset giornaliero (Europe/Rome): se cap_window_start è precedente alla
// mezzanotte di Roma di OGGI (o è nullo), azzera cap_window_revenue.
// In questo modo all'inizio di ogni giornata la finestra riparte da zero,
// indipendentemente dall'orario dell'ultima rotazione.
export async function refreshCapWindows(supabase: any, stores: CapStore[]) {
  const todayMidnightDate = romeMidnightUTC();
  const todayMidnight = todayMidnightDate.valueOf();
  const toReset: string[] = [];
  for (const s of stores) {
    const started = s.cap_window_start ? new Date(s.cap_window_start).valueOf() : 0;
    if (!started || started < todayMidnight) toReset.push(s.id);
  }
  if (toReset.length === 0) return;
  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const { data: todayStats } = await supabase
    .from("store_stats")
    .select("store_id, shopify_daily_revenue")
    .eq("date", todayKey)
    .in("store_id", toReset);
  const revenueByStore = new Map<string, number>();
  for (const r of (todayStats as any[]) || []) {
    revenueByStore.set(String(r.store_id), Number(r.shopify_daily_revenue || 0));
  }
  const iso = todayMidnightDate.toISOString();
  await Promise.all(toReset.map((id) => supabase
    .from("stores")
    .update({ cap_window_revenue: revenueByStore.get(id) || 0, cap_window_start: iso })
    .eq("id", id)));
  for (const s of stores) {
    if (toReset.includes(s.id)) {
      s.cap_window_revenue = revenueByStore.get(s.id) || 0;
      s.cap_window_start = iso;
    }
  }
}

export function isEligible(s: CapStore, country?: string): boolean {
  if (!s.is_active || !s.is_online) return false;
  if (s.cap_amount && s.cap_window_revenue >= s.cap_amount) return false;
  if (s.country_rule && s.country_rule !== "ALL") {
    if (!country) return true; // unknown country, accept
    const allowed = s.country_rule.split(",").map((c) => c.trim().toUpperCase());
    if (!allowed.includes(country.toUpperCase())) return false;
  }
  return true;
}

export async function getAllStores(supabase: any): Promise<CapStore[]> {
  const { data, error } = await supabase
    .from("stores")
    .select(
      "id, shop_domain, display_name, is_active, is_online, is_current, country_rule, cap_amount, cap_window_days, cap_window_start, cap_window_revenue, sort_order, access_token_encrypted, client_id, client_secret_encrypted, webhook_secret_encrypted",
    )
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return ((data || []) as any[]).map((store) => ({
    ...store,
    display_id: store.display_id ?? null,
    shop_currency: store.shop_currency ?? "EUR",
  })) as CapStore[];
}

export async function pickEligibleStore(
  supabase: any,
  country?: string,
): Promise<{ store: CapStore | null; eligible: CapStore[] }> {
  const all = await getAllStores(supabase);
  await refreshCapWindows(supabase, all);
  const eligible = all.filter((s) => isEligible(s, country));
  if (eligible.length === 0) return { store: null, eligible: [] };

  // Prefer current if still eligible, else pick lowest cap_window_revenue
  const current = eligible.find((s) => s.is_current);
  if (current && current.cap_amount && current.cap_window_revenue < current.cap_amount) {
    return { store: current, eligible };
  }
  eligible.sort((a, b) => a.cap_window_revenue - b.cap_window_revenue);
  return { store: eligible[0], eligible };
}

export async function setCurrent(supabase: any, storeId: string) {
  await supabase.from("stores").update({ is_current: false }).neq("id", storeId);
  await supabase
    .from("stores")
    .update({ is_current: true, last_online: new Date().toISOString() })
    .eq("id", storeId);
}

export async function logRotation(
  supabase: any,
  args: {
    from_store_id?: string | null;
    to_store_id: string;
    trigger_type: string;
    reason?: string;
    group_id?: string;
    from_revenue?: number;
    from_threshold?: number;
    metadata?: Record<string, unknown>;
  },
): Promise<string | null> {
  const { data } = await supabase
    .from("rotation_log")
    .insert({
      from_store_id: args.from_store_id ?? null,
      to_store_id: args.to_store_id,
      trigger_type: args.trigger_type,
      reason: args.reason ?? null,
      group_id: args.group_id ?? null,
      from_revenue: args.from_revenue ?? null,
      from_threshold: args.from_threshold ?? null,
      metadata: args.metadata ?? {},
    })
    .select("id")
    .single();
  return data?.id ?? null;
}
