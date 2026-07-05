import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { StoreDetailDrawer } from "@/components/admin/StoreDetailDrawer";
import { Button } from "@/components/ui/button";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Euro,
  Package,
  RefreshCw,
  TrendingUp,
  Webhook,
  Zap,
  ArrowRight,
} from "lucide-react";
import { callEdge } from "@/lib/edge";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/")({
  component: DashboardPage,
});

interface StoreRow {
  id: string;
  shop_domain: string;
  display_name: string | null;
  is_active: boolean;
  is_online: boolean;
  is_current: boolean;
  health_status: string;
  consecutive_errors: number;
  avg_latency_ms: number;
  rotation_threshold: number;
  custom_threshold: number | null;
  cap_amount: number | null;
  cap_window_revenue: number;
  country_rule: string;
  sort_order: number;
  last_webhook_at: string | null;
  needs_reauth: boolean;
  integration_type: string | null;
  bridge_status: string | null;
}

// Stato effettivo: gli store nativi non hanno health-check Shopify → deriva dalla connessione bridge.
function effHealth(s: StoreRow): string {
  if (s.integration_type === "native_bridge") {
    if (s.bridge_status === "connected" || s.bridge_status === "ok") return "online";
    if (s.bridge_status === "error") return "offline";
    return "degraded";
  }
  return s.health_status || "online";
}

interface StatRow {
  store_id: string;
  shopify_daily_revenue: number;
  shopify_daily_orders: number;
  shopify_total_revenue: number;
  shopify_total_orders: number;
  cvr_percentage: number;
  checkout_launches_24h: number;
}

interface WebhookRow {
  id: string;
  store_id: string;
  topic: string;
  signature_valid: boolean;
  processed: boolean;
  received_at: string;
  error_message: string | null;
}

interface RotationRow {
  id: string;
  trigger_type: string;
  reason: string | null;
  from_store_id: string | null;
  to_store_id: string | null;
  created_at: string;
}

const HEALTH_DOT: Record<string, string> = {
  online: "bg-emerald-500",
  degraded: "bg-amber-500",
  offline: "bg-red-500",
  recovering: "bg-amber-500 animate-pulse",
};

function timeAgo(iso: string | null): string {
  if (!iso) return "mai";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "ora";
  if (m < 60) return `${m}m fa`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h fa`;
  return `${Math.floor(h / 24)}g fa`;
}

function romeDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function DashboardPage() {
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [stats, setStats] = useState<Record<string, StatRow>>({});
  const [events, setEvents] = useState<WebhookRow[]>([]);
  const [rotations, setRotations] = useState<RotationRow[]>([]);
  const [productCount, setProductCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [drawerStoreId, setDrawerStoreId] = useState<string | null>(null);

  async function load() {
    const today = romeDateKey();
    const [storesRes, statsRes, eventsRes, rotRes, prodRes] = await Promise.all([
      supabase.from("stores").select("id,shop_domain,display_name,is_active,is_online,is_current,health_status,consecutive_errors,avg_latency_ms,rotation_threshold,custom_threshold,cap_amount,cap_window_revenue,country_rule,sort_order,last_webhook_at,needs_reauth,integration_type,bridge_status").order("sort_order"),
      supabase.from("store_stats").select("store_id,shopify_daily_revenue,shopify_daily_orders,shopify_total_revenue,shopify_total_orders,cvr_percentage,checkout_launches_24h").eq("date", today),
      supabase.from("webhook_events").select("id,store_id,topic,signature_valid,processed,received_at,error_message").order("received_at", { ascending: false }).limit(6),
      supabase.from("rotation_log").select("id,trigger_type,reason,from_store_id,to_store_id,created_at").order("created_at", { ascending: false }).limit(5),
      supabase.from("products").select("id", { count: "exact", head: true }).eq("status", "active"),
    ]);

    setStores((storesRes.data as StoreRow[]) || []);
    const m: Record<string, StatRow> = {};
    for (const r of (statsRes.data as StatRow[]) || []) m[r.store_id] = r;
    setStats(m);
    setEvents((eventsRes.data as WebhookRow[]) || []);
    setRotations((rotRes.data as RotationRow[]) || []);
    setProductCount(prodRes.count || 0);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  useRealtimeRefresh({
    channel: "dashboard",
    tables: ["stores", "store_stats", "webhook_events", "rotation_log"],
    onChange: load,
    debounceMs: 600,
  });

  const storeMap = useMemo(() => Object.fromEntries(stores.map((s) => [s.id, s])), [stores]);

  const totalRevenueToday = Object.values(stats).reduce((a, s) => a + Number(s.shopify_daily_revenue || 0), 0);
  const totalRevenueAllTime = Object.values(stats).reduce((a, s) => a + Number(s.shopify_total_revenue || 0), 0);
  const totalOrders = Object.values(stats).reduce((a, s) => a + (s.shopify_daily_orders || 0), 0);
  const totalCheckouts = Object.values(stats).reduce((a, s) => a + (s.checkout_launches_24h || 0), 0);
  const globalCvr = totalCheckouts > 0 ? (totalOrders / totalCheckouts) * 100 : 0;

  const activeStores = stores.filter((s) => s.is_active);
  const eligibleStores = activeStores.filter(
    (s) => effHealth(s) !== "offline" && !s.needs_reauth && (!s.cap_amount || s.cap_window_revenue < Number(s.cap_amount)),
  );
  const capsHit = activeStores.filter((s) => s.cap_amount && s.cap_window_revenue >= Number(s.cap_amount)).length;

  const healthCounts = stores.reduce<Record<string, number>>((acc, s) => {
    const k = s.is_active ? effHealth(s) : "inactive";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  const reauthCount = stores.filter((s) => s.needs_reauth).length;
  const currentStore = stores.find((s) => s.is_current);

  const nextStore = useMemo(() => {
    if (eligibleStores.length === 0) return null;
    if (!currentStore) return eligibleStores[0];
    const sorted = [...eligibleStores].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex((s) => s.id === currentStore.id);
    return sorted[(idx + 1) % sorted.length] || sorted[0];
  }, [eligibleStores, currentStore]);

  async function rotateNow() {
    setRotating(true);
    try {
      const res = await callEdge<{ skipped?: boolean; reason?: string; to_store_domain?: string }>(
        "rotate-store",
        { reason: "Manual from dashboard" }
      );
      if (res.skipped) toast.info(res.reason || "Rotazione saltata");
      else toast.success(`Ruotato → ${res.to_store_domain}`);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRotating(false);
    }
  }

  const okCount = healthCounts.online || 0;
  const warnCount = (healthCounts.degraded || 0) + (healthCounts.recovering || 0);
  const badCount = healthCounts.offline || 0;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {currentStore
              ? <>Store corrente · <span className="font-medium text-foreground">{currentStore.display_name || currentStore.shop_domain}</span></>
              : "Panoramica rotazione, store e webhook."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="rounded-full">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Aggiorna
          </Button>
          <Button size="sm" onClick={rotateNow} disabled={rotating || activeStores.length < 2} className="rounded-full">
            <Zap className={`mr-2 h-4 w-4 ${rotating ? "animate-pulse" : ""}`} /> Ruota ora
          </Button>
        </div>
      </div>

      {/* Re-auth alert */}
      {reauthCount > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-5 py-3.5">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
          <div className="flex-1 text-sm">
            <span className="font-medium">{reauthCount} store da ri-autorizzare</span>
            <span className="ml-1 text-muted-foreground">— nuovi scope OAuth richiedono un re-OAuth.</span>
          </div>
          <Button asChild size="sm" variant="outline" className="rounded-full">
            <Link to="/admin/stores">Gestisci</Link>
          </Button>
        </div>
      )}

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Euro} label="Revenue oggi" value={`€ ${totalRevenueToday.toFixed(2)}`} sub={`${totalOrders} ordini`} />
        <Kpi icon={TrendingUp} label="Fatturato totale" value={`€ ${totalRevenueAllTime.toFixed(2)}`} sub="all-time" />
        <Kpi icon={Activity} label="In rotazione" value={`${eligibleStores.length}/${stores.length || 0}`} sub={`${activeStores.length} attivi`} />
        <Kpi icon={Zap} label="CAP" value={`${capsHit}/${activeStores.length || 0}`} sub={capsHit === 0 ? "tutti ok" : "raggiunti"} tone={capsHit === 0 ? "good" : capsHit === activeStores.length ? "bad" : "warn"} />
      </div>

      {/* Rotation + health strip */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-2xl border border-border/50 bg-card px-5 py-4 text-sm">
        <div className="flex items-center gap-2 font-medium">
          <RefreshCw className="h-4 w-4 text-primary" /> Rotazione
        </div>
        <Stat label="Corrente" value={currentStore ? (currentStore.display_name || currentStore.shop_domain) : "—"} />
        <ArrowRight className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" />
        <Stat label="Prossimo" value={nextStore ? (nextStore.display_name || nextStore.shop_domain) : "—"} />
        <Stat label="Idonei" value={`${eligibleStores.length} di ${activeStores.length}`} />
        <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
          <Dot tone="bg-emerald-500" n={okCount} label="online" />
          <Dot tone="bg-amber-500" n={warnCount} label="degr." />
          <Dot tone="bg-red-500" n={badCount} label="offline" />
        </div>
      </div>

      {/* Main grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Stores list */}
        <section className="overflow-hidden rounded-2xl border border-border/50 bg-card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border/50 px-5 py-3.5">
            <h2 className="text-sm font-semibold">Store</h2>
            <Link to="/admin/stores" className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
              Gestisci <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-border/40">
            {stores.length === 0 && (
              <div className="px-5 py-12 text-center text-sm text-muted-foreground">
                Nessuno store. <Link to="/admin/stores" className="font-medium text-foreground underline">Aggiungi il primo</Link>.
              </div>
            )}
            {stores.map((s) => {
              const st = stats[s.id];
              const rev = Number(st?.shopify_daily_revenue || 0);
              const totalRev = Number(st?.shopify_total_revenue || 0);
              const threshold = Number(s.custom_threshold ?? s.rotation_threshold);
              const pct = threshold > 0 ? Math.min(100, (rev / threshold) * 100) : 0;
              const barTone = pct >= 100 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
              const errs = s.consecutive_errors || 0;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setDrawerStoreId(s.id)}
                  className="block w-full px-5 py-3.5 text-left transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${HEALTH_DOT[effHealth(s)] || "bg-muted-foreground"}`} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{s.display_name || s.shop_domain}</span>
                          {s.is_current && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">Live</span>}
                        </div>
                        <div className="truncate font-mono text-[11px] text-muted-foreground">{s.shop_domain}</div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold">€ {rev.toFixed(2)}</div>
                      <div className="text-[11px] text-muted-foreground">tot € {totalRev.toFixed(0)}</div>
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className={`h-full rounded-full transition-all ${barTone}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">€{rev.toFixed(0)}/{threshold.toFixed(0)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {timeAgo(s.last_webhook_at)}</span>
                    {errs > 0 && <span className="text-amber-600">{errs} err</span>}
                    {s.needs_reauth && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); window.location.href = `/admin/stores?reauth=${s.id}`; }}
                        className="ml-auto rounded-full border border-amber-500/40 px-2 py-0.5 text-[10px] font-medium text-amber-600 hover:bg-amber-500/10"
                      >
                        Re-connetti
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Side column */}
        <div className="space-y-6">
          {/* Prodotti mini */}
          <div className="rounded-2xl border border-border/50 bg-card p-5">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Package className="h-4 w-4" /> Prodotti attivi
            </div>
            <div className="mt-2 text-3xl font-semibold">{productCount}</div>
            <div className="mt-1 text-xs text-muted-foreground">CVR globale {globalCvr.toFixed(1)}% · {totalOrders} ordini oggi</div>
          </div>

          {/* Webhook */}
          <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
            <div className="flex items-center justify-between border-b border-border/50 px-5 py-3.5">
              <h2 className="inline-flex items-center gap-2 text-sm font-semibold"><Webhook className="h-4 w-4" /> Webhook</h2>
              <Link to="/admin/logs" className="text-xs text-muted-foreground hover:text-foreground">Logs →</Link>
            </div>
            <div className="divide-y divide-border/40">
              {events.length === 0 ? (
                <div className="px-5 py-8 text-center text-xs text-muted-foreground">Nessun evento recente.</div>
              ) : events.map((e) => {
                const store = storeMap[e.store_id];
                return (
                  <div key={e.id} className="flex items-center justify-between gap-2 px-5 py-2.5 text-xs">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px]">{e.topic}</span>
                        {e.signature_valid ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <AlertTriangle className="h-3 w-3 text-red-500" />}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">{store?.shop_domain || e.store_id}</div>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(e.received_at)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rotazioni */}
          <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
            <div className="flex items-center justify-between border-b border-border/50 px-5 py-3.5">
              <h2 className="inline-flex items-center gap-2 text-sm font-semibold"><Zap className="h-4 w-4" /> Rotazioni</h2>
            </div>
            <div className="divide-y divide-border/40">
              {rotations.length === 0 ? (
                <div className="px-5 py-8 text-center text-xs text-muted-foreground">Nessuna rotazione recente.</div>
              ) : rotations.map((r) => {
                const from = r.from_store_id ? storeMap[r.from_store_id] : null;
                const to = r.to_store_id ? storeMap[r.to_store_id] : null;
                return (
                  <div key={r.id} className="px-5 py-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{r.trigger_type}</span>
                      <span className="text-[11px] text-muted-foreground">{timeAgo(r.created_at)}</span>
                    </div>
                    <div className="mt-1 truncate font-mono text-[11px]">{from?.shop_domain || "—"} → {to?.shop_domain || "—"}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <StoreDetailDrawer
        storeId={drawerStoreId}
        open={!!drawerStoreId}
        onOpenChange={(o) => !o && setDrawerStoreId(null)}
      />
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "warn" | "bad";
}) {
  const toneClass = tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : tone === "bad" ? "text-red-600" : "text-foreground";
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-muted/60 text-muted-foreground">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className={`mt-3 text-2xl font-semibold tracking-tight ${toneClass}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="max-w-[160px] truncate text-sm font-medium">{value}</span>
    </div>
  );
}

function Dot({ tone, n, label }: { tone: string; n: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${tone}`} />
      <span className="font-medium text-foreground">{n}</span>
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}
