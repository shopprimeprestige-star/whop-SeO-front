// Rotazione pesata:
//   score = 0.5 * revenueScore + 0.3 * errorScore + 0.2 * latencyScore
//   revenueScore = 1 - (cap_window_revenue / cap_amount)   (più basso = più revenue → peggio)
//   errorScore   = 1 / (1 + consecutive_errors)
//   latencyScore = clamp(1 - avg_latency_ms / 5000, 0, 1)
// Jitter ±15% sulla soglia (configurabile via settings.rotation_jitter_pct).
// Algoritmi supportati: weighted | revenue_only | round_robin.
// deno-lint-ignore-file no-explicit-any

import { CapStore } from "./cap-rotation.ts";

export interface WeightedStore extends CapStore {
  consecutive_errors: number;
  avg_latency_ms: number;
  health_status: string;
  needs_reauth?: boolean;
  shopify_total_revenue?: number;
}

export type RotationAlgorithm = "weighted" | "revenue_only" | "round_robin";

export function scoreStore(s: WeightedStore): number {
  const cap = s.cap_amount ? Number(s.cap_amount) : 1000;
  const rev = Number(s.cap_window_revenue || 0);
  const revenueScore = cap > 0 ? Math.max(0, 1 - rev / cap) : 0.5;
  const errorScore = 1 / (1 + (s.consecutive_errors || 0));
  const latency = s.avg_latency_ms || 0;
  const latencyScore = Math.max(0, Math.min(1, 1 - latency / 5000));
  return 0.5 * revenueScore + 0.3 * errorScore + 0.2 * latencyScore;
}

export function applyJitter(cap: number, jitterPct: number): number {
  if (jitterPct <= 0) return cap;
  const j = jitterPct / 100;
  const rand = 1 - j + Math.random() * (2 * j);
  return Number((cap * rand).toFixed(2));
}

export function filterEligible(
  stores: WeightedStore[],
  opts: { country?: string; excludeIds?: string[]; ignoreCap?: boolean } = {},
): WeightedStore[] {
  const exclude = new Set(opts.excludeIds || []);
  return stores.filter((s) => {
    if (exclude.has(s.id)) return false;
    if (!s.is_active) return false;
    if (s.health_status === "offline") return false;
    if (s.needs_reauth) return false;
    if (!opts.ignoreCap && s.cap_amount && s.cap_window_revenue >= Number(s.cap_amount)) return false;
    if (s.country_rule && s.country_rule !== "ALL" && opts.country) {
      const list = s.country_rule.split(",").map((c) => c.trim().toUpperCase());
      if (!list.includes(opts.country.toUpperCase())) return false;
    }
    return true;
  });
}
export function pickStore(
  stores: WeightedStore[],
  algorithm: RotationAlgorithm,
  opts: { country?: string; excludeIds?: string[]; currentId?: string | null } = {},
): WeightedStore | null {
  let eligible = filterEligible(stores, opts);
  let capExceededFallback = false;
  if (eligible.length === 0) {
    eligible = filterEligible(stores, { ...opts, ignoreCap: true });
    if (eligible.length === 0) return null;
    capExceededFallback = true;
  }

  const current = opts.currentId ? eligible.find((s) => s.id === opts.currentId) : null;
  if (current && !capExceededFallback) {
    return current;
  }

  // Priorità SEMPRE: store con minor fatturato TOTALE (lifetime).
  // Tiebreaker: cap_window_revenue ASC, poi sort_order ASC.
  return [...eligible].sort((a, b) => {
    const ta = Number(a.shopify_total_revenue || 0);
    const tb = Number(b.shopify_total_revenue || 0);
    if (ta !== tb) return ta - tb;
    const wa = Number(a.cap_window_revenue || 0);
    const wb = Number(b.cap_window_revenue || 0);
    if (wa !== wb) return wa - wb;
    return (a.sort_order || 0) - (b.sort_order || 0);
  })[0];
}
