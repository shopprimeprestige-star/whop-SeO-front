import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";
import { StoreDetailDrawer } from "@/components/admin/StoreDetailDrawer";
import { supabase } from "@/integrations/supabase/client";
import { callEdge } from "@/lib/edge";
import { bridgeHandshake } from "@/lib/bridge.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Plus,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Bug,
  Database,
  Trash2,
  Power,
  Link2Off,
  RotateCcw,
  Activity,
  TrendingUp,
  Zap,
  Globe,
  ShieldCheck,
  Pencil,
  HelpCircle,
  ChevronDown,
  Webhook,
  Copy,
  Star,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/stores")({
  component: StoresPage,
});

interface Store {
  id: string;
  shop_domain: string;
  display_name: string | null;
  oauth_scopes?: string | null;
  rotation_threshold: number;
  custom_threshold: number | null;
  cap_amount: number | null;
  cap_window_revenue: number;
  cap_window_days: number;
  cap_window_start: string | null;
  country_rule: string;
  is_active: boolean;
  is_online: boolean;
  is_current: boolean;
  token_status: string;
  offline_reason: string | null;
  sort_order: number;
  last_webhook_at: string | null;
  recent_failures: number;
  access_token_encrypted: string | null;
  webhook_secret_encrypted: string | null;
  client_id: string | null;
  client_secret_encrypted: string | null;
  connected_at: string | null;
  health_status?: string;
  consecutive_errors?: number;
  avg_latency_ms?: number;
  needs_reauth?: boolean;
  shadow_checkout_enabled?: boolean;
  bridge_site_url?: string | null;
  bridge_api_key_encrypted?: string | null;
  hmac_secret_encrypted?: string | null;
  bridge_status?: string | null;
  bridge_last_connected?: string | null;
  bridge_last_sync?: string | null;
  bridge_last_error?: string | null;
  integration_type?: "shopify" | "native_bridge";
}

interface StatRow {
  revenue: number;
  orders: number;
  total_revenue: number;
  total_orders: number;
}

const HEALTH_DOT: Record<string, string> = {
  online: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]",
  degraded: "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]",
  offline: "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]",
  recovering: "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
}

function fmtRelative(iso?: string | null): string {
  if (!iso) return "mai";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "ora";
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s fa`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m fa`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h fa`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}g fa`;
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "2-digit" });
}

function fmtDateTime(iso?: string | null): string {
  if (!iso) return "mai";
  return new Date(iso).toLocaleString("it-IT", {
    day: "2-digit", month: "short", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtMoney(n: number) {
  return `€ ${n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

function StoresPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [stats, setStats] = useState<Record<string, StatRow>>({});
  const [loading, setLoading] = useState(true);
  const [rotating, setRotating] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Store | null>(null);
  const [drawerStoreId, setDrawerStoreId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const today = romeDateKey();
    const [storesRes, todayStatsRes, allStatsRes] = await Promise.all([
      supabase.from("stores").select("*").order("sort_order"),
      supabase
        .from("store_stats")
        .select("store_id, shopify_daily_revenue, shopify_daily_orders, shopify_total_revenue, shopify_total_orders")
        .eq("date", today),
      // Snapshot più recente per store (lifetime authoritative dal Sito B)
      supabase
        .from("store_stats")
        .select("store_id, shopify_total_revenue, shopify_total_orders, date")
        .order("date", { ascending: false })
        .limit(2000),
    ]);
    setStores((storesRes.data as Store[]) || []);
    const m: Record<string, StatRow> = {};
    // 1. Lifetime: prima riga (più recente) per ogni store
    const lifetimeByStore: Record<string, { rev: number; ord: number }> = {};
    for (const r of allStatsRes.data || []) {
      if (!lifetimeByStore[r.store_id]) {
        lifetimeByStore[r.store_id] = {
          rev: Number(r.shopify_total_revenue || 0),
          ord: Number(r.shopify_total_orders || 0),
        };
      }
    }
    // 2. Daily: solo righe di oggi
    for (const r of todayStatsRes.data || []) {
      m[r.store_id] = {
        revenue: Number(r.shopify_daily_revenue || 0),
        orders: r.shopify_daily_orders || 0,
        total_revenue: lifetimeByStore[r.store_id]?.rev || 0,
        total_orders: lifetimeByStore[r.store_id]?.ord || 0,
      };
    }
    // 3. Store senza riga oggi: solo lifetime
    for (const sid of Object.keys(lifetimeByStore)) {
      if (!m[sid]) {
        m[sid] = {
          revenue: 0,
          orders: 0,
          total_revenue: lifetimeByStore[sid].rev,
          total_orders: lifetimeByStore[sid].ord,
        };
      }
    }
    setStats(m);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  useRealtimeRefresh({
    channel: "stores-page",
    tables: ["stores", "store_stats", "webhook_events"],
    onChange: load,
    debounceMs: 800,
  });

  // Polling per aggiornare needs_reauth ogni 60s
  useEffect(() => {
    const t = setInterval(async () => {
      const { data } = await supabase
        .from("stores")
        .select("id, needs_reauth, health_status, consecutive_errors, avg_latency_ms")
        .order("sort_order");
      if (!data) return;
      setStores((prev) =>
        prev.map((s) => {
          const u = data.find((d: { id: string }) => d.id === s.id);
          return u ? { ...s, ...u } : s;
        }),
      );
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  async function toggleActive(s: Store) {
    await supabase.from("stores").update({ is_active: !s.is_active }).eq("id", s.id);
    toast.success(`Store ${!s.is_active ? "abilitato" : "disabilitato"}`);
    load();
  }

  async function rotateNow() {
    setRotating(true);
    try {
      const res = await callEdge<{ skipped?: boolean; reason?: string; to_store_domain?: string }>(
        "rotate-store",
        { reason: "Manual from CRM" },
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

  const [resettingCap, setResettingCap] = useState(false);
  async function resetCapNow() {
    if (!confirm("Allineare il CAP giornaliero al fatturato reale di oggi per tutti gli store?")) return;
    setResettingCap(true);
    try {
      const nowIso = new Date().toISOString();
      const today = romeDateKey();
      const { data: todayStats, error: statsErr } = await supabase
        .from("store_stats")
        .select("store_id, shopify_daily_revenue")
        .eq("date", today);
      if (statsErr) throw statsErr;
      const revByStore: Record<string, number> = {};
      for (const r of todayStats || []) {
        revByStore[r.store_id] = Number(r.shopify_daily_revenue || 0);
      }
      const targets = stores.filter((s) => s.id !== "00000000-0000-0000-0000-000000000000");
      await Promise.all(
        targets.map((s) =>
          supabase
            .from("stores")
            .update({
              cap_window_revenue: revByStore[s.id] || 0,
              cap_window_start: nowIso,
            } as never)
            .eq("id", s.id),
        ),
      );
      toast.success("CAP allineato al fatturato reale di oggi");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setResettingCap(false);
    }
  }

  const [syncingId, setSyncingId] = useState<string | null>(null);
  async function syncStoreStats(s: Store) {
    if (!s.bridge_site_url) { toast.error("Bridge non configurato per questo store"); return; }
    setSyncingId(s.id);
    try {
      const res = await callEdge<{ ok: boolean; daily_revenue?: number; error?: string }>("bridge-sync", { store_id: s.id });
      if (res.ok) {
        toast.success(`Sync ${s.shop_domain} completato — fatturato oggi €${Number(res.daily_revenue || 0).toFixed(2)}`);
        load();
      } else {
        toast.error(res.error || "Sync fallito");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSyncingId(null);
    }
  }


  async function disconnectStore(s: Store) {
    if (!confirm(`Disconnettere ${s.shop_domain}? Lo store verrà disattivato e marcato offline.`)) return;
    await supabase.from("stores").update({
      is_active: false,
      is_online: false,
      offline_reason: "Disconnesso manualmente",
      bridge_status: "disconnected",
    } as never).eq("id", s.id);
    toast.success("Store disconnesso");
    load();
  }

  async function deleteStore(s: Store) {
    if (!confirm(`Eliminare definitivamente ${s.shop_domain}? Azione irreversibile.`)) return;
    await supabase.from("stores").delete().eq("id", s.id);
    toast.success("Store eliminato");
    load();
  }

  async function setAsCurrent(s: Store) {
    if (s.is_current) { toast.info("Già store corrente"); return; }
    if (!s.is_active) { toast.error("Lo store non è attivo"); return; }
    try {
      const current = stores.find((x) => x.is_current) || null;
      const { error: resetErr } = await supabase.from("stores").update({ is_current: false } as never).neq("id", s.id);
      if (resetErr) throw resetErr;
      const { error: setErr } = await supabase
        .from("stores")
        .update({ is_current: true, last_online: new Date().toISOString() } as never)
        .eq("id", s.id);
      if (setErr) throw setErr;
      await supabase.from("rotation_log").insert({
        from_store_id: current?.id ?? null,
        to_store_id: s.id,
        trigger_type: "manual",
        reason: "Manual set-current from stores list",
        from_revenue: current?.cap_window_revenue ?? null,
        from_threshold: current?.cap_amount ?? null,
        metadata: { source: "admin.stores" },
      } as never);
      toast.success(`Store corrente → ${s.shop_domain}`);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // Header KPIs
  const kpis = useMemo(() => {
    const active = stores.filter((s) => s.is_active).length;
    const online = stores.filter((s) => {
      if (!s.is_active) return false;
      const bridgeOk = s.bridge_status === "connected" || s.bridge_status === "ok";
      return s.integration_type === "native_bridge" ? bridgeOk : s.health_status === "online";
    }).length;
    const todayRev = Object.values(stats).reduce((a, s) => a + s.revenue, 0);
    const totalRev = Object.values(stats).reduce((a, s) => a + s.total_revenue, 0);
    const bridgeErr = stores.filter((s) => s.bridge_status === "error").length;
    return { active, online, todayRev, totalRev, total: stores.length, bridgeErr };
  }, [stores, stats]);

  return (
    <div className="space-y-6">
      {/* === HERO HEADER === */}
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-background via-background to-primary/5 p-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,hsl(var(--primary)/0.15),transparent_50%)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              <Activity className="h-3 w-3" /> Configurazione · Stores & Bridge
            </div>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">Stores & Bridge</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Pannello di configurazione. Tutte le operazioni reali su Shopify avvengono sul Sito B.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={resetCapNow} disabled={resettingCap || stores.length === 0} size="sm" variant="outline">
              {resettingCap ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Reset CAP giornaliero
            </Button>
            <Button onClick={rotateNow} disabled={rotating || stores.length < 2} size="sm" variant="secondary">
              {rotating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
              Ruota ora
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => setEditing(null)} size="sm" className="shadow-lg shadow-primary/20">
                  <Plus className="mr-2 h-4 w-4" /> Nuovo store
                </Button>
              </DialogTrigger>
              <StoreDialog key={editing?.id ?? "new"} store={editing} onSaved={() => { setOpen(false); load(); }} />
            </Dialog>
          </div>
        </div>

        {/* KPI strip */}
        <div className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi icon={<ShieldCheck className="h-4 w-4" />} label="Attivi" value={`${kpis.active}/${kpis.total}`} sub={`${kpis.online} online`} />
          <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Oggi" value={fmtMoney(kpis.todayRev)} sub="Revenue 24h" />
          <Kpi icon={<Globe className="h-4 w-4" />} label="Totale" value={fmtMoney(kpis.totalRev)} sub="All-time" highlight />
          <Kpi icon={<AlertTriangle className="h-4 w-4" />} label="Bridge errori" value={`${kpis.bridgeErr}`} sub={kpis.bridgeErr ? "da verificare su Sito B" : "tutto ok"} warn={kpis.bridgeErr > 0} />
        </div>
      </div>

      {kpis.bridgeErr > 0 && (
        <Card className="border-orange-500/40 bg-gradient-to-r from-orange-500/10 to-transparent">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="h-5 w-5 text-orange-500 mt-0.5" />
            <div className="flex-1 text-sm">
              <span className="font-semibold">{kpis.bridgeErr} store con errore Bridge.</span>
              <span className="text-muted-foreground ml-1">Apri <strong>Modifica</strong> e usa <strong>Verifica Bridge</strong> per richiedere un handshake al Sito B.</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* === TABLE === */}
      <Card className="overflow-hidden border-border/60">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Store</th>
                <th className="px-3 py-3 text-left font-medium">Stato</th>
                <th className="px-3 py-3 text-right font-medium">Oggi</th>
                <th className="px-3 py-3 text-right font-medium">Totale</th>
                <th className="px-3 py-3 text-left font-medium">CAP window</th>
                <th className="px-3 py-3 text-left font-medium">Latenza</th>
                <th className="px-3 py-3 text-left font-medium">Last paid</th>
                <th className="px-3 py-3 text-right font-medium">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {stores.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-muted-foreground">
                    <div className="mx-auto max-w-sm space-y-2">
                      <div className="text-base font-medium text-foreground">Nessuno store collegato</div>
                      <p className="text-xs">Clicca su <strong>Nuovo store</strong> per collegare il tuo primo Shopify.</p>
                    </div>
                  </td>
                </tr>
              )}
              {stores.map((s) => {
                const st = stats[s.id] || { revenue: 0, orders: 0, total_revenue: 0, total_orders: 0 };
                const cap = Number(s.cap_amount || 0);
                const capUsed = Number(s.cap_window_revenue || 0);
                const capPct = cap > 0 ? Math.min(100, (capUsed / cap) * 100) : 0;
                const latency = s.avg_latency_ms || 0;
                return (
                  <tr
                    key={s.id}
                    className={`group transition-colors hover:bg-muted/40 ${s.is_current ? "bg-primary/5" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setDrawerStoreId(s.id)}
                        className="text-left"
                      >
                        <div className="flex items-center gap-2">
                          <div className="font-semibold leading-tight group-hover:text-primary transition-colors">
                            {s.display_name || s.shop_domain.split(".")[0]}
                          </div>
                          {s.is_current && (
                            <Badge variant="outline" className="h-5 border-primary/40 bg-primary/10 text-[10px] text-primary">
                              CURRENT
                            </Badge>
                          )}
                          <BridgeBadge status={s.bridge_status} url={s.bridge_site_url} lastSync={s.bridge_last_sync} lastConnected={s.bridge_last_connected} error={s.bridge_last_error} />
                          {s.integration_type === "native_bridge" ? (
                            <Badge variant="outline" className="h-5 border-indigo-500/40 bg-indigo-500/10 text-[10px] text-indigo-600">
                              NATIVE
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="h-5 border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-600">
                              SHOPIFY
                            </Badge>
                          )}
                        </div>
                        <div className="font-mono text-[11px] text-muted-foreground">{s.shop_domain}</div>
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      {(() => {
                        const bridgeOk = s.bridge_status === "connected" || s.bridge_status === "ok";
                        const nativeStore = s.integration_type === "native_bridge";
                        // Gli store nativi non hanno health-check Shopify: lo stato reale è la connessione bridge.
                        const eff = !s.is_active
                          ? "disabled"
                          : nativeStore
                            ? (bridgeOk ? "online" : s.bridge_status === "error" ? "offline" : "degraded")
                            : (s.health_status || "online");
                        return (
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${HEALTH_DOT[eff] || "bg-muted-foreground"}`} />
                        <span className="text-xs font-medium capitalize">{eff}</span>
                        {s.needs_reauth && (
                          <Badge variant="outline" className="h-5 border-orange-500/40 bg-orange-500/10 text-[10px] text-orange-600">
                            re-auth
                          </Badge>
                        )}
                      </div>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="font-mono text-sm font-medium">{fmtMoney(st.revenue)}</div>
                      <div className="text-[10px] text-muted-foreground">{st.orders} ord.</div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="font-mono text-sm font-bold">{fmtMoney(st.total_revenue)}</div>
                      <div className="text-[10px] text-muted-foreground">{st.total_orders} ord.</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="min-w-[160px] space-y-1">
                        <div className="flex items-baseline justify-between gap-2 text-[11px]">
                          <span className="font-mono text-muted-foreground">
                            {fmtMoney(capUsed)} / {fmtMoney(cap)}
                          </span>
                          <span className="text-[10px] text-muted-foreground">{s.cap_window_days}d</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full transition-all ${
                              capPct >= 100 ? "bg-red-500" : capPct >= 70 ? "bg-amber-500" : "bg-emerald-500"
                            }`}
                            style={{ width: `${capPct}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <div className={`font-mono ${latency > 2000 ? "text-amber-500" : "text-muted-foreground"}`}>
                        {latency}ms
                      </div>
                      {(s.consecutive_errors || 0) > 0 && (
                        <div className="text-[10px] text-red-500">{s.consecutive_errors} err</div>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-xs text-muted-foreground">
                      {fmtDate(s.last_webhook_at)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap justify-end gap-1">
                        {s.bridge_site_url && (
                          <ActionBtn
                            icon={syncingId === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                            onClick={() => syncStoreStats(s)}
                            title="Aggiorna stats da Sito B"
                            variant="primary"
                          />
                        )}
                        <ActionBtn
                          icon={<Star className={`h-3 w-3 ${s.is_current ? "fill-primary text-primary" : ""}`} />}
                          onClick={() => setAsCurrent(s)}
                          title={s.is_current ? "Store corrente" : "Imposta come corrente"}
                        />
                        <ActionBtn icon={<Pencil className="h-3 w-3" />} onClick={() => { setEditing(s); setOpen(true); }} title="Modifica" />
                        <ActionBtn icon={<Power className="h-3 w-3" />} onClick={() => toggleActive(s)} title={s.is_active ? "Disabilita" : "Abilita"} />
                        <ActionBtn icon={<Link2Off className="h-3 w-3" />} onClick={() => disconnectStore(s)} title="Disconnect" />
                        <ActionBtn icon={<Trash2 className="h-3 w-3" />} onClick={() => deleteStore(s)} title="Elimina" danger />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <StoreDetailDrawer
        storeId={drawerStoreId}
        open={!!drawerStoreId}
        onOpenChange={(o) => !o && setDrawerStoreId(null)}
      />
    </div>
  );
}

// ============= UI Atoms =============

function Kpi({
  icon, label, value, sub, highlight, warn,
}: { icon: React.ReactNode; label: string; value: string; sub?: string; highlight?: boolean; warn?: boolean }) {
  return (
    <div
      className={`rounded-xl border p-4 backdrop-blur-sm transition-all ${
        warn ? "border-orange-500/30 bg-orange-500/5"
          : highlight ? "border-primary/30 bg-primary/5"
          : "border-border/60 bg-card/40"
      }`}
    >
      <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className={`mt-2 font-bold tracking-tight ${value.length > 10 ? "text-lg" : "text-2xl"}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function ActionBtn({
  icon, onClick, title, danger, variant = "default",
}: { icon: React.ReactNode; onClick: () => void; title: string; danger?: boolean; variant?: "default" | "primary" }) {
  const base = "inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors";
  const cls = danger
    ? "border-border/60 bg-background hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
    : variant === "primary"
    ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
    : "border-border/60 bg-background hover:bg-muted hover:border-border";
  return (
    <button type="button" onClick={onClick} title={title} className={`${base} ${cls}`}>
      {icon}
    </button>
  );
}

// ============= Store Edit Dialog (snellito, NO Country) =============

const REQUIRED_SCOPES = ["read_products", "write_products", "read_orders", "write_orders"];

function isUsableUrl(value: string | undefined | null): value is string {
  const v = value?.trim();
  return !!v && v !== "undefined" && v !== "null";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v: string): boolean {
  return UUID_RE.test(v.trim());
}
function newUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getBridgeCallbackUrl() {
  const configured = (import.meta.env.VITE_SITE_A_PUBLIC_URL as string | undefined)?.trim().replace(/\/$/, "");
  const origin = isUsableUrl(configured)
    ? configured
    : typeof window !== "undefined" && isUsableUrl(window.location.origin)
      ? window.location.origin.replace(/\/$/, "")
      : "";
  const fns = getFunctionsBaseUrl();
  if (isUsableUrl(fns)) return `${fns}/bridge-callback`;
  return origin ? `${origin}/api/public/bridge/callback` : "/api/public/bridge/callback";
}

function getFunctionsBaseUrl() {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim().replace(/\/$/, "");
  return isUsableUrl(supabaseUrl) ? `${supabaseUrl}/functions/v1` : "";
}

function normalizeScopes(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[,\n\r\t ]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function StoreDialog({ store, onSaved }: { store: Store | null; onSaved: () => void }) {
  const isEdit = !!store;
  const bridgeHandshakeFn = useServerFn(bridgeHandshake);
  const hasSecret = !!store?.webhook_secret_encrypted;
  const hasClientSecret = !!store?.client_secret_encrypted;
  const functionsBaseUrl = getFunctionsBaseUrl();
  const redirectUrl = functionsBaseUrl ? `${functionsBaseUrl}/shopify-oauth-callback` : "URL funzioni non configurato";
  const webhookUrl = functionsBaseUrl ? `${functionsBaseUrl}/webhook-receiver` : "URL funzioni non configurato";
  const [bridgeCallbackUrl, setBridgeCallbackUrl] = useState("/api/public/bridge/callback");

  const [form, setForm] = useState({
    integration_type: (store?.integration_type || "shopify") as "shopify" | "native_bridge",
    site_a_store_id: store?.id || "",
    shop_domain: store?.shop_domain || "",
    display_name: store?.display_name || "",
    client_id: store?.client_id || "",
    client_secret: "",
    webhook_secret: "",
    oauth_scopes: store?.oauth_scopes || "read_products,write_products,read_orders,write_orders,read_customers,read_draft_orders,write_draft_orders",
    cap_amount: store?.cap_amount ?? 580,
    cap_window_days: store?.cap_window_days ?? 1,
    rotation_threshold: store?.rotation_threshold ?? 847,
    custom_threshold: store?.custom_threshold ?? null as number | null,
    shadow_checkout_enabled: store?.shadow_checkout_enabled ?? false,
    bridge_site_url: store?.bridge_site_url || "",
    product_push_url: (store as any)?.product_push_url || "",
    bridge_api_key: "",
    hmac_secret: "",
    lovable_sync_enabled: (store as any)?.lovable_sync_enabled ?? false,
    lovable_sync_url: (store as any)?.lovable_sync_url || "",
    lovable_sync_api_key: "",
    lovable_sync_hmac_secret: "",
    lovable_sync_store_ref: (store as any)?.lovable_sync_store_ref || "",
    lovable_sync_default_currency: (store as any)?.lovable_sync_default_currency || "EUR",
    lovable_sync_default_locale: (store as any)?.lovable_sync_default_locale || "it",
  });
  const [savingLovable, setSavingLovable] = useState(false);
  const [testingLovable, setTestingLovable] = useState(false);
  const [showLovableKey, setShowLovableKey] = useState(false);
  const [lovableTestResult, setLovableTestResult] = useState<{ ok: boolean; detail: string; raw?: unknown } | null>(null);
  const [replaceClientSecret, setReplaceClientSecret] = useState(false);
  const [replaceSecret, setReplaceSecret] = useState(false);
  
  const [saving, setSaving] = useState(false);
  const [savingBridge, setSavingBridge] = useState(false);
  const [connectingBridge, setConnectingBridge] = useState(false);
  const [lastError, setLastError] = useState<{ stage: string; message: string; raw?: unknown } | null>(null);

  useEffect(() => {
    setBridgeCallbackUrl(getBridgeCallbackUrl());
    // Per un nuovo store genera subito un UUID (modificabile / rigenerabile dall'utente)
    if (!store?.id) {
      setForm((f) => f.site_a_store_id ? f : { ...f, site_a_store_id: newUuid() });
    }
  }, []);

  function regenerateStoreId() {
    setForm((f) => ({ ...f, site_a_store_id: newUuid() }));
    toast.success("Nuovo UUID generato — verrà applicato al salvataggio");
  }

  // === Configurazione Shopify caricata LIVE da Sito B ===
  type RemoteShopifyConfig = {
    shop_domain?: string;
    access_token_masked?: string;
    has_access_token?: boolean;
    client_id?: string;
    client_secret_masked?: string;
    has_client_secret?: boolean;
    oauth_scopes?: string;
    webhook_secret_masked?: string;
    has_webhook_secret?: boolean;
    webhook_topics?: Array<{ topic: string; address?: string; format?: string }>;
    token_status?: string;
    last_validated_at?: string | null;
  };
  const [remoteConfig, setRemoteConfig] = useState<RemoteShopifyConfig | null>(null);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [savingRemote, setSavingRemote] = useState(false);
  const [shopifyForm, setShopifyForm] = useState({
    shop_domain: "",
    access_token: "",
    client_id: "",
    client_secret: "",
    oauth_scopes: "",
    webhook_secret: "",
    webhook_topics: "",
  });
  
  const [showBridgeKey, setShowBridgeKey] = useState(false);
  const [bridgeKeyLoading, setBridgeKeyLoading] = useState(false);
  const [bridgeKeyLoaded, setBridgeKeyLoaded] = useState(false);
  const [bridgeResult, setBridgeResult] = useState<{
    kind: "handshake" | "sync";
    ok: boolean;
    title: string;
    detail?: string;
    http_status?: number | null;
    duration_ms?: number;
    raw?: unknown;
  } | null>(null);

  async function loadBridgeKey() {
    if (!store?.id) return;
    try {
      const { data, error } = await supabase.functions.invoke<{ api_key: string }>("reveal-bridge-key", {
        body: { store_id: store.id },
      });
      if (error) throw error;
      if (data?.api_key) {
        setForm((f) => ({ ...f, bridge_api_key: data.api_key }));
        setBridgeKeyLoaded(true);
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function generateBridgeKey() {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    const key = "bk_" + Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
    setForm((f) => ({ ...f, bridge_api_key: key }));
    setBridgeKeyLoaded(true);
    setShowBridgeKey(true);
    toast.success("Nuova API Key generata — ricorda di salvare e incollarla nel Sito Ponte");
  }

  async function loadRemoteConfig() {
    if (!store?.id) return;
    setLoadingRemote(true);
    setRemoteError(null);
    try {
      const { data, error } = await supabase.functions.invoke<any>("bridge-get-config", {
        body: { store_id: store.id },
      });
      if (error) throw new Error(error.message || "Errore di rete");
      if (!data?.ok) throw new Error(data?.error || "Sito B non ha risposto");
      const cfg: RemoteShopifyConfig = data.config || {};
      setRemoteConfig(cfg);
      setShopifyForm({
        shop_domain: cfg.shop_domain || store.shop_domain || "",
        access_token: "",
        client_id: cfg.client_id || "",
        client_secret: "",
        oauth_scopes: cfg.oauth_scopes || "",
        webhook_secret: "",
        webhook_topics: (cfg.webhook_topics || []).map((t) => t.topic).join(", "),
      });
      toast.success("Configurazione Shopify caricata da Sito B");
    } catch (e) {
      const msg = (e as Error).message;
      setRemoteError(msg);
      toast.error(msg);
    } finally {
      setLoadingRemote(false);
    }
  }

  async function saveRemoteConfig() {
    if (!store?.id) { toast.error("Salva prima lo store"); return; }
    setSavingRemote(true);
    try {
      const newDomain = shopifyForm.shop_domain.trim().toLowerCase();
      const domainChanged = newDomain && newDomain !== (store.shop_domain || "").toLowerCase();
      if (newDomain && !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(newDomain)) {
        throw new Error("Shop domain deve essere xxx.myshopify.com");
      }

      const payload: Record<string, unknown> = { store_id: store.id };
      if (newDomain) payload.shop_domain = newDomain;
      if (shopifyForm.access_token.trim()) payload.access_token = shopifyForm.access_token.trim();
      if (shopifyForm.client_id.trim()) payload.client_id = shopifyForm.client_id.trim();
      if (shopifyForm.client_secret.trim()) payload.client_secret = shopifyForm.client_secret.trim();
      if (shopifyForm.oauth_scopes.trim()) payload.oauth_scopes = shopifyForm.oauth_scopes.trim();
      if (shopifyForm.webhook_secret.trim()) payload.webhook_secret = shopifyForm.webhook_secret.trim();
      const topics = shopifyForm.webhook_topics
        .split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
      if (topics.length > 0) payload.webhook_topics = topics;

      const { data, error } = await supabase.functions.invoke<any>("bridge-update-config", {
        body: payload,
      });
      if (error) throw new Error(error.message || "Errore di rete");
      if (!data?.ok) throw new Error(data?.error || "Sito B ha rifiutato l'update");

      // Se il domain è cambiato, propaga in Sito A (Identificazione + DB)
      if (domainChanged) {
        const { error: upErr } = await supabase
          .from("stores")
          .update({ shop_domain: newDomain })
          .eq("id", store.id);
        if (upErr) {
          toast.error(`Sito B aggiornato, ma update locale fallito: ${upErr.message}`);
        } else {
          setForm((f) => ({ ...f, shop_domain: newDomain }));
          toast.success(`Shop domain aggiornato → ${newDomain} (sincronizzato Identificazione + Sito B)`);
        }
      } else {
        toast.success("Modifiche inviate a Sito B e applicate su Shopify");
      }
      // ricarica per mostrare valori freschi (mascherati)
      await loadRemoteConfig();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingRemote(false);
    }
  }

  async function saveBridgeOnly() {
    if (!store?.id) {
      toast.error("Salva prima lo store");
      return;
    }
    setSavingBridge(true);
    try {
      let bridgeUrl = form.bridge_site_url.trim().replace(/\/$/, "");
      if (bridgeUrl && !/^https?:\/\//i.test(bridgeUrl)) bridgeUrl = `https://${bridgeUrl}`;
      let pushUrl = form.product_push_url.trim().replace(/\/$/, "");
      if (pushUrl && !/^https?:\/\//i.test(pushUrl)) pushUrl = `https://${pushUrl}`;
      const update: Record<string, unknown> = {
        bridge_site_url: bridgeUrl || null,
        product_push_url: pushUrl || null,
      };
      if (form.bridge_api_key.trim()) {
        update.bridge_api_key_encrypted = form.bridge_api_key.trim();
      }
      if (form.hmac_secret.trim()) {
        update.hmac_secret_encrypted = form.hmac_secret.trim();
      }
      if (!form.bridge_site_url.trim()) {
        update.bridge_status = "not_configured";
      }
      const { error } = await supabase.from("stores").update(update as never).eq("id", store.id);
      if (error) throw error;
      toast.success("Sito Ponte salvato");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingBridge(false);
    }
  }

  async function saveLovableSync() {
    if (!store?.id) { toast.error("Salva prima lo store"); return; }
    setSavingLovable(true);
    try {
      let url = form.lovable_sync_url.trim().replace(/\/$/, "");
      if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
      const update: Record<string, unknown> = {
        lovable_sync_enabled: form.lovable_sync_enabled,
        lovable_sync_url: url || null,
        lovable_sync_store_ref: form.lovable_sync_store_ref.trim() || null,
        lovable_sync_default_currency: form.lovable_sync_default_currency.trim() || "EUR",
        lovable_sync_default_locale: form.lovable_sync_default_locale.trim() || "it",
      };
      if (form.lovable_sync_api_key.trim()) update.lovable_sync_api_key_encrypted = form.lovable_sync_api_key.trim();
      if (form.lovable_sync_hmac_secret.trim()) update.lovable_sync_hmac_secret_encrypted = form.lovable_sync_hmac_secret.trim();
      const { error } = await supabase.from("stores").update(update as never).eq("id", store.id);
      if (error) throw error;
      toast.success("Configurazione Lovable Sync salvata");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingLovable(false);
    }
  }

  async function testLovableSync() {
    if (!store?.id) { toast.error("Salva prima lo store"); return; }
    let url = form.lovable_sync_url.trim().replace(/\/$/, "");
    if (!url) { toast.error("URL Lovable Sync richiesto"); return; }
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const key = form.lovable_sync_api_key.trim();
    if (!key) { toast.error("Incolla l'API key per testare"); return; }
    setTestingLovable(true);
    setLovableTestResult(null);
    const t0 = Date.now();
    try {
      const r = await fetch(`${url}/api/public/lovable-sync/ping`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Lovable-Sync-Key": key },
        body: JSON.stringify({ store_ref: form.lovable_sync_store_ref.trim() || null }),
      });
      const text = await r.text();
      let raw: any; try { raw = JSON.parse(text); } catch { raw = { raw: text.slice(0, 800) }; }
      const ok = r.ok && raw?.ok !== false;
      setLovableTestResult({ ok, detail: ok ? `OK in ${Date.now() - t0}ms` : `HTTP ${r.status}: ${raw?.error || text.slice(0, 200)}`, raw });
      if (ok) toast.success("Lovable Sync raggiungibile");
      else toast.error(raw?.error || `HTTP ${r.status}`);
    } catch (e) {
      const msg = (e as Error).message;
      setLovableTestResult({ ok: false, detail: msg });
      toast.error(msg);
    } finally {
      setTestingLovable(false);
    }
  }


  async function connectBridge() {
    if (!store?.id) { toast.error("Salva prima lo store"); return; }
    setConnectingBridge(true);
    setBridgeResult(null);
    const t0 = Date.now();
    try {
      const data = await bridgeHandshakeFn({ data: { store_id: store.id } });
      const elapsed = Date.now() - t0;
      const ok = !!data?.ok;
      setBridgeResult({
        kind: "handshake",
        ok,
        title: ok ? "Connessione riuscita" : "Handshake fallito",
        detail: ok
          ? `Sito Ponte ha risposto correttamente (${data?.status ?? "connected"})`
          : (data?.error || `HTTP ${data?.http_status ?? "?"}`),
        http_status: data?.http_status ?? null,
        duration_ms: data?.duration_ms ?? elapsed,
        raw: data,
      });
      if (ok) toast.success("Sito Ponte connesso");
      else toast.error(data?.error || "Handshake fallito");
      onSaved();
    } catch (e) {
      const elapsed = Date.now() - t0;
      const msg = (e as Error).message;
      setBridgeResult({ kind: "handshake", ok: false, title: "Handshake fallito", detail: msg, duration_ms: elapsed });
      toast.error(msg);
    } finally {
      setConnectingBridge(false);
    }
  }

  // Sync manuale rimosso: le stats vengono aggiornate solo via webhook Shopify.

  const isNative = form.integration_type === "native_bridge";
  const trimmedDomain = form.shop_domain.trim();
  const domainOk = isNative
    ? /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(trimmedDomain)
    : /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(trimmedDomain);
  const validationErrors: string[] = [];
  if (!domainOk)
    validationErrors.push(
      isNative
        ? "Domain non valido (es. mio-store.com)"
        : "Shop domain non valido (deve finire in .myshopify.com)",
    );
  if (!isUuid(form.site_a_store_id))
    validationErrors.push("site_a_store_id deve essere un UUID valido (usa Rigenera o incollane uno corretto)");
  // Per i nuovi store il Sito B è obbligatorio: A non parla con Shopify, B sì.
  if (!isEdit) {
    if (!form.bridge_site_url.trim()) validationErrors.push("URL Sito Ponte (Sito B) obbligatorio");
    if (!form.bridge_api_key.trim()) validationErrors.push("Bridge API Key obbligatoria (genera o incolla)");
  }
  const idChanged = isEdit && !!store?.id && form.site_a_store_id.trim() !== store.id;
  const canSave = !saving;

  async function save() {
    setLastError(null);
    console.groupCollapsed(`[StoreDialog] save() ${isEdit ? "EDIT" : "NEW"} ${form.shop_domain}`);
    console.log("form snapshot:", form);
    console.log("validationErrors:", validationErrors);
    if (validationErrors.length > 0) {
      const msg = `Compila i campi obbligatori:\n• ${validationErrors.join("\n• ")}`;
      toast.error(msg, { duration: 8000 });
      setLastError({ stage: "validation", message: msg });
      console.warn("Bloccato da validazione");
      console.groupEnd();
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        shop_domain: form.shop_domain.trim().toLowerCase(),
        display_name: form.display_name.trim() || null,
        country_rule: store?.country_rule || "ALL",
        integration_type: form.integration_type,
        cap_amount: Number(form.cap_amount),
        cap_window_days: Number(form.cap_window_days),
        rotation_threshold: Number(form.rotation_threshold) || 847,
        custom_threshold: form.custom_threshold == null || (form.custom_threshold as unknown as string) === ""
          ? null
          : Number(form.custom_threshold),
      };
      console.log("payload:", payload);

      let createdStoreId: string | null = store?.id ?? null;

      if (isEdit && store?.id) {
        // Cambio UUID store (rigenera o incollato a mano): aggiorna anche la PK.
        if (idChanged) payload.id = form.site_a_store_id.trim();
        const { error: updErr } = await supabase
          .from("stores")
          .update(payload as never)
          .eq("id", store.id);
        if (idChanged && !updErr) createdStoreId = form.site_a_store_id.trim();
        if (updErr) {
          console.error("UPDATE error:", updErr);
          const detail = `[${(updErr as any).code || "?"}] ${updErr.message}${(updErr as any).details ? ` — ${(updErr as any).details}` : ""}${(updErr as any).hint ? ` (hint: ${(updErr as any).hint})` : ""}`;
          setLastError({ stage: "update", message: detail, raw: updErr });
          throw new Error(`Aggiornamento fallito: ${detail}`);
        }
      } else {
        const domain = String(payload.shop_domain);
        // Pre-check: shop_domain è UNIQUE su stores. Diamo un errore parlante.
        const { data: existing } = await supabase
          .from("stores")
          .select("id, shop_domain, display_name, is_active, bridge_status")
          .eq("shop_domain", domain)
          .maybeSingle();
        if (existing) {
          const msg = `Esiste già uno store con domain "${domain}" (id ${(existing as any).id}, ${(existing as any).is_active ? "attivo" : "disattivato"}, bridge: ${(existing as any).bridge_status}). Usa "Modifica" su quello store, oppure cambia il domain.`;
          setLastError({ stage: "duplicate-domain", message: msg, raw: existing });
          throw new Error(msg);
        }

        let bridgeUrl = form.bridge_site_url.trim().replace(/\/$/, "");
        if (bridgeUrl && !/^https?:\/\//i.test(bridgeUrl)) bridgeUrl = `https://${bridgeUrl}`;
        let pushUrl = form.product_push_url.trim().replace(/\/$/, "");
        if (pushUrl && !/^https?:\/\//i.test(pushUrl)) pushUrl = `https://${pushUrl}`;
        const insertPayload = {
          ...payload,
          id: form.site_a_store_id.trim(),
          is_active: true,
          bridge_site_url: bridgeUrl,
          product_push_url: pushUrl || null,
          bridge_api_key_encrypted: form.bridge_api_key.trim(),
          hmac_secret_encrypted: form.hmac_secret.trim() || null,
          bridge_status: "registering",
        };
        console.log("insertPayload:", insertPayload);
        const { data: inserted, error: insErr } = await supabase
          .from("stores")
          .insert(insertPayload as never)
          .select("id")
          .single();
        if (insErr) {
          console.error("INSERT error full object:", insErr);
          const code = (insErr as any).code;
          let friendly = insErr.message;
          if (code === "23505" && /shop_domain/.test(insErr.message)) {
            friendly = `Domain "${domain}" già usato da un altro store. Cambia domain o modifica lo store esistente.`;
          }
          const detail = `[${code || "?"}] ${friendly}${(insErr as any).details ? ` — ${(insErr as any).details}` : ""}${(insErr as any).hint ? ` (hint: ${(insErr as any).hint})` : ""}`;
          setLastError({ stage: "insert", message: detail, raw: insErr });
          throw new Error(`Creazione fallita: ${detail}`);
        }
        console.log("inserted:", inserted);
        createdStoreId = (inserted as { id: string } | null)?.id ?? null;
        toast.success("Store creato — invio richiesta di registrazione a Sito B…");

        if (createdStoreId) {
          try {
            const { data: regData, error: regErr } = await supabase.functions.invoke<any>(
              "bridge-register-store",
              { body: { store_id: createdStoreId } },
            );
            if (regErr) throw new Error(regErr.message || "Errore di rete verso Sito B");
            if (!regData?.ok) {
              throw new Error(regData?.error || `Sito B HTTP ${regData?.http_status ?? "?"}`);
            }
            toast.success("Sito B ha registrato lo store");
            if (regData?.authorize_url) {
              toast.info("Apro Shopify OAuth in una nuova scheda…");
              window.open(regData.authorize_url, "_blank", "noopener,noreferrer");
            }
          } catch (e) {
            const msg = (e as Error).message;
            console.error("[bridge-register-store] error:", e);
            setLastError({ stage: "bridge-register", message: msg });
            toast.error(`Registrazione su Sito B fallita: ${msg}. Riprova da "Verifica Bridge".`, { duration: 10000 });
          }
        }
      }

      if (isEdit) toast.success("Store aggiornato");
      console.groupEnd();
      onSaved();
    } catch (e) {
      const msg = (e as Error).message || String(e);
      console.error("[save] error:", e);
      setLastError((prev) => prev ?? { stage: "exception", message: msg });
      toast.error(`Salvataggio fallito: ${msg}`, { duration: 12000 });
      console.groupEnd();
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{isEdit ? "Modifica store" : "Nuovo store"}</DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        <Section title="Tipo integrazione">
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              { value: "native_bridge", title: "Checkout nativo Sito B", desc: "Pagamento gestito dal Sito B (Whop). Nessun dominio .myshopify.com richiesto." },
              { value: "shopify", title: "Shopify", desc: "Integrazione Shopify classica via Sito Ponte. Richiede dominio .myshopify.com." },
            ] as const).map((opt) => {
              const selected = form.integration_type === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={isEdit}
                  onClick={() => !isEdit && setForm({ ...form, integration_type: opt.value })}
                  className={`rounded-lg border p-3 text-left transition ${
                    selected ? "border-primary ring-1 ring-primary bg-primary/5" : "border-border hover:border-primary/40"
                  } ${isEdit ? "cursor-not-allowed opacity-70" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`grid h-4 w-4 place-items-center rounded-full border ${selected ? "border-primary" : "border-muted-foreground/40"}`}>
                      {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
                    </span>
                    <span className="text-sm font-medium">{opt.title}</span>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{opt.desc}</p>
                </button>
              );
            })}
          </div>
          {isEdit && <p className="mt-2 text-[11px] text-muted-foreground">Il tipo di integrazione non è modificabile dopo la creazione.</p>}
        </Section>

        <Section title="Identificazione">
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={isNative ? "Domain store *" : "Shop domain *"}
              error={!domainOk && form.shop_domain ? (isNative ? "Domain non valido" : "Deve essere .myshopify.com") : undefined}
            >
              <Input
                placeholder={isNative ? "mio-store.com" : "store.myshopify.com"}
                value={form.shop_domain}
                onChange={(e) => setForm({ ...form, shop_domain: e.target.value })}
                readOnly={isEdit}
                className={isEdit ? "bg-muted/40 cursor-not-allowed" : ""}
              />
            </Field>
            <Field label="Display name">
              <Input
                placeholder="Nome visibile"
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              />
            </Field>
          </div>

          <Field
            label="site_a_store_id (UUID)"
            error={form.site_a_store_id && !isUuid(form.site_a_store_id) ? "UUID non valido" : undefined}
            action={
              <div className="flex items-center gap-2">
                <button type="button" onClick={regenerateStoreId} className="text-xs text-primary hover:underline">rigenera</button>
                <button
                  type="button"
                  onClick={() => { navigator.clipboard.writeText(form.site_a_store_id); toast.success("UUID copiato"); }}
                  className="text-xs text-primary hover:underline"
                >copia</button>
              </div>
            }
          >
            <Input
              placeholder="es. 123e4567-e89b-12d3-a456-426614174000"
              value={form.site_a_store_id}
              onChange={(e) => setForm({ ...form, site_a_store_id: e.target.value.trim() })}
              autoComplete="off"
              className="font-mono text-xs"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Identificativo dello store usato dal bridge. Incollane uno tuo o premi <strong>rigenera</strong>. È lo stesso valore da inserire nel Sito B.
              {idChanged && <span className="text-amber-600"> · Cambiandolo dovrai ri-registrare lo store sul Sito B (Verifica Bridge).</span>}
            </p>
          </Field>

          <Field
            label="Callback URL Sito A"
            action={
              <button
                type="button"
                onClick={() => { navigator.clipboard.writeText(bridgeCallbackUrl); toast.success("Callback URL copiato"); }}
                className="text-xs text-primary hover:underline"
              >copia</button>
            }
          >
            <Input
              readOnly
              value={bridgeCallbackUrl}
              className="font-mono text-xs bg-muted/40"
              onFocus={(e) => e.currentTarget.select()}
            />
            <p className="mt-1 text-[10px] text-muted-foreground">Da incollare nel Sito B come URL di callback per questo store.</p>
          </Field>
        </Section>

        {/* OAuth credentials Shopify rimosse: il Sito A non parla più con Shopify direttamente.
            Tutta la gestione token/webhook avviene sul Sito B (Sito Ponte). */}

        <Collapsible>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border border-border/60 bg-muted/30 p-3 text-sm font-medium hover:bg-muted/50">
            <span>Routing & CAP <span className="text-xs font-normal text-muted-foreground">— avanzate (opzionale)</span></span>
            <ChevronDown className="h-4 w-4" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-3 rounded-md border border-border/60 p-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="CAP amount (€)">
                <Input type="number" value={form.cap_amount} onChange={(e) => setForm({ ...form, cap_amount: Number(e.target.value) })} />
              </Field>
              <Field label="CAP window (giorni)">
                <Input type="number" min={1} max={90} value={form.cap_window_days} onChange={(e) => setForm({ ...form, cap_window_days: Number(e.target.value) })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Soglia rotazione base (€)">
                <Input type="number" value={form.rotation_threshold} onChange={(e) => setForm({ ...form, rotation_threshold: Number(e.target.value) })} />
              </Field>
              <Field label="Soglia custom (€)">
                <Input
                  type="number"
                  placeholder="usa base"
                  value={form.custom_threshold ?? ""}
                  onChange={(e) => setForm({ ...form, custom_threshold: e.target.value === "" ? null : Number(e.target.value) })}
                />
              </Field>
            </div>
          </CollapsibleContent>
        </Collapsible>


        <Section
          title="Sito Ponte (Sito B)"
          right={<BridgeBadge status={store?.bridge_status} url={store?.bridge_site_url} lastSync={store?.bridge_last_sync} lastConnected={store?.bridge_last_connected} error={store?.bridge_last_error} />}
        >
          <p className="text-xs text-muted-foreground">
            {isNative ? (
              <>
                Il <strong>checkout è gestito dal Sito B</strong> (Whop). Inserisci <strong>URL del Sito Ponte</strong> e
                <strong> Bridge API Key</strong> (obbligatori), poi usa <em>Verifica Bridge</em> per controllare la connessione.
                Nessun token Shopify, nessun dominio .myshopify.com.
              </>
            ) : (
              <>
                Sito B è l'unico sistema autorizzato a parlare con Shopify (API, webhook, OAuth, checkout).
                {!isEdit && <> <strong>URL e Bridge API Key del Sito B sono obbligatori</strong>: al <em>Salva</em> Sito A registra lo store su Sito B e, se serve, apre Shopify OAuth in una nuova scheda. Sito A non vede mai i token Shopify.</>}
                {isEdit && <> Qui salvi URL e API key del Sito B come configurazione: Sito A le invia a Sito B, che applica le modifiche su Shopify.</>}
              </>
            )}
          </p>

          {/* === CAMPI MODIFICABILI (sempre visibili) === */}
          <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">
              Parametri modificabili
            </div>

            <Field label="URL Sito Ponte (Sito B) *">
              <Input
                placeholder="https://comparatore1.lovable.app"
                value={form.bridge_site_url}
                onChange={(e) => setForm({ ...form, bridge_site_url: e.target.value })}
                autoComplete="off"
                className="font-mono text-xs"
              />
            </Field>

            <Field
              label="Bridge API Key *"
              action={
                <div className="flex items-center gap-2">
                  <button type="button" onClick={generateBridgeKey} className="text-xs text-primary hover:underline">genera nuova</button>
                  {form.bridge_api_key && (
                    <button
                      type="button"
                      onClick={() => { navigator.clipboard.writeText(form.bridge_api_key); toast.success("Key copiata"); }}
                      className="text-xs text-primary hover:underline"
                    >copia</button>
                  )}
                </div>
              }
            >
              <div className="flex gap-2">
                <Input
                  type={showBridgeKey ? "text" : "password"}
                  placeholder={store?.bridge_api_key_encrypted ? "••••••••• salvata — premi Mostra per rivelarla" : "bk_…"}
                  value={form.bridge_api_key}
                  onChange={(e) => setForm({ ...form, bridge_api_key: e.target.value })}
                  autoComplete="off"
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={bridgeKeyLoading}
                  onClick={async () => {
                    // Se nascosta e vuota ma esiste una key salvata: caricala prima di mostrare (fix bug "mostra e non mostra")
                    if (!showBridgeKey && !form.bridge_api_key && store?.id && store?.bridge_api_key_encrypted && !bridgeKeyLoaded) {
                      setBridgeKeyLoading(true);
                      try { await loadBridgeKey(); } finally { setBridgeKeyLoading(false); }
                      setShowBridgeKey(true);
                      return;
                    }
                    setShowBridgeKey((v) => !v);
                  }}
                >
                  {bridgeKeyLoading ? "…" : showBridgeKey ? "Nascondi" : "Mostra"}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Stessa key da incollare anche nel Sito B come <code className="font-mono">X-Bridge-Api-Key</code>.
              </p>
            </Field>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                onClick={saveBridgeOnly}
                disabled={savingBridge || !store?.id}
                title={!store?.id ? "Crea/salva prima lo store" : "Salva URL e API Key"}
              >
                {savingBridge && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                Salva configurazione Sito B
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={connectBridge}
                disabled={connectingBridge || !store?.id || !form.bridge_site_url.trim()}
              >
                {connectingBridge && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                Verifica Bridge
              </Button>
            </div>
          </div>

          {/* === CONFIGURAZIONE SHOPIFY + VALORI DA INCOLLARE: spostati in fondo (sotto STATO) === */}
          {store?.bridge_last_error && (
            <div className="rounded-md border border-red-500/40 bg-red-500/5 p-2 text-[11px] text-red-600 dark:text-red-400">
              <strong>Ultimo errore:</strong> {store.bridge_last_error}
            </div>
          )}

          {/* === STATO (read-only) === */}
          {store?.id && (
            <div className="grid grid-cols-3 gap-2 rounded-md border border-border/60 bg-background/40 p-2 text-[11px]">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">URL salvato</div>
                <div className="truncate font-mono" title={store?.bridge_site_url || ""}>
                  {store?.bridge_site_url || "—"}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Ultima conn.</div>
                <div className="font-mono" title={fmtDateTime(store?.bridge_last_connected)}>
                  {fmtRelative(store?.bridge_last_connected)}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Ultimo sync</div>
                <div className="font-mono" title={fmtDateTime(store?.bridge_last_sync)}>
                  {fmtRelative(store?.bridge_last_sync)}
                </div>
              </div>
            </div>
          )}

          {/* === SITO PONTE (SITO B): entrambi i pannelli in fondo === */}
          {store?.id && (
            <div className="space-y-2">
              {/* Configurazione Shopify (live da Sito B) — solo per store Shopify */}
              {!isNative && (
              <Collapsible>
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 hover:bg-amber-500/10">
                  <span>⚙️ Configurazione Shopify (gestita da Sito B)</span>
                  <ChevronDown className="h-4 w-4" />
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-muted-foreground flex-1 pr-3">
                      Questi valori vivono <strong>solo sul Sito B</strong>. Sito A li mostra a video e li reinvia
                      a B su <em>Salva</em>: B applicherà le modifiche reali su Shopify (validazione token,
                      ri-registrazione webhook, ecc.). I campi vuoti vengono ignorati.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={loadRemoteConfig}
                      disabled={loadingRemote || !store?.bridge_site_url}
                      title={!store?.bridge_site_url ? "Configura prima il Sito B" : "Ricarica da Sito B"}
                    >
                      {loadingRemote ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-2 h-3 w-3" />}
                      {remoteConfig ? "Ricarica" : "Carica da Sito B"}
                    </Button>
                  </div>

                  {remoteError && (
                    <div className="rounded border border-red-500/40 bg-red-500/5 p-2 text-[11px] text-red-600 dark:text-red-400">
                      {remoteError}
                    </div>
                  )}

                  {!remoteConfig && !loadingRemote && (
                    <div className="text-[11px] text-muted-foreground italic">
                      Clicca <strong>Carica da Sito B</strong> per leggere la configurazione Shopify attuale.
                    </div>
                  )}

                  {remoteConfig && (
                    <>
                      <div className="grid grid-cols-3 gap-2 rounded border border-border/60 bg-background/40 p-2 text-[11px]">
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Shop attuale</div>
                          <div className="font-mono truncate">{remoteConfig.shop_domain || store.shop_domain}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Token</div>
                          <div className="font-mono">{remoteConfig.token_status || (remoteConfig.has_access_token ? "presente" : "—")}</div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Validato</div>
                          <div className="font-mono">{fmtRelative(remoteConfig.last_validated_at)}</div>
                        </div>
                      </div>

                      <Field
                        label="Shop domain Shopify (modifica → si propaga a Identificazione + Sito B)"
                        error={
                          shopifyForm.shop_domain &&
                          !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shopifyForm.shop_domain.trim())
                            ? "Deve essere xxx.myshopify.com"
                            : undefined
                        }
                      >
                        <Input
                          placeholder="store.myshopify.com"
                          value={shopifyForm.shop_domain}
                          onChange={(e) => setShopifyForm({ ...shopifyForm, shop_domain: e.target.value.toLowerCase() })}
                          autoComplete="off"
                          className="font-mono text-xs"
                        />
                      </Field>

                      <Field label="Shopify Admin Access Token">
                        <Input
                          type="password"
                          placeholder={remoteConfig.has_access_token
                            ? `${remoteConfig.access_token_masked || "••••••••"} — vuoto = non modificare`
                            : "shpat_… (nessun token su Sito B)"}
                          value={shopifyForm.access_token}
                          onChange={(e) => setShopifyForm({ ...shopifyForm, access_token: e.target.value })}
                          autoComplete="off"
                          className="font-mono text-xs"
                        />
                      </Field>

                      <div className="grid grid-cols-2 gap-3">
                        <Field label="OAuth Client ID">
                          <Input
                            placeholder="es. 1a2b3c…"
                            value={shopifyForm.client_id}
                            onChange={(e) => setShopifyForm({ ...shopifyForm, client_id: e.target.value })}
                            autoComplete="off"
                            className="font-mono text-xs"
                          />
                        </Field>
                        <Field label="OAuth Client Secret">
                          <Input
                            type="password"
                            placeholder={remoteConfig.has_client_secret
                              ? `${remoteConfig.client_secret_masked || "••••••••"} — vuoto = non modificare`
                              : "shpss_…"}
                            value={shopifyForm.client_secret}
                            onChange={(e) => setShopifyForm({ ...shopifyForm, client_secret: e.target.value })}
                            autoComplete="off"
                            className="font-mono text-xs"
                          />
                        </Field>
                      </div>

                      <Field label="OAuth Scopes (CSV)">
                        <Input
                          placeholder="read_products,write_products,read_orders,write_orders"
                          value={shopifyForm.oauth_scopes}
                          onChange={(e) => setShopifyForm({ ...shopifyForm, oauth_scopes: e.target.value })}
                          autoComplete="off"
                          className="font-mono text-xs"
                        />
                      </Field>

                      <Field label="Webhook HMAC Secret">
                        <Input
                          type="password"
                          placeholder={remoteConfig.has_webhook_secret
                            ? `${remoteConfig.webhook_secret_masked || "••••••••"} — vuoto = non modificare`
                            : "shpss_…"}
                          value={shopifyForm.webhook_secret}
                          onChange={(e) => setShopifyForm({ ...shopifyForm, webhook_secret: e.target.value })}
                          autoComplete="off"
                          className="font-mono text-xs"
                        />
                      </Field>

                      <Field label="Webhook Topics (CSV) — Sito B li registrerà su Shopify">
                        <Input
                          placeholder="orders/paid, orders/create, orders/updated, orders/cancelled, app/uninstalled"
                          value={shopifyForm.webhook_topics}
                          onChange={(e) => setShopifyForm({ ...shopifyForm, webhook_topics: e.target.value })}
                          autoComplete="off"
                          className="font-mono text-xs"
                        />
                        {remoteConfig.webhook_topics && remoteConfig.webhook_topics.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {remoteConfig.webhook_topics.map((t) => (
                              <Badge key={t.topic} variant="outline" className="h-5 text-[10px] font-mono">
                                {t.topic}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </Field>

                      <div className="flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          onClick={saveRemoteConfig}
                          disabled={savingRemote}
                        >
                          {savingRemote && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                          Salva e applica su Shopify (via Sito B)
                        </Button>
                      </div>
                    </>
                  )}
                </CollapsibleContent>
              </Collapsible>
              )}

            </div>
          )}

          {bridgeResult && (
            <div
              className={`mt-2 rounded-md border p-3 text-xs ${
                bridgeResult.ok
                  ? "border-green-500/40 bg-green-500/5 text-green-700 dark:text-green-400"
                  : "border-red-500/40 bg-red-500/5 text-red-700 dark:text-red-400"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <strong>
                  {bridgeResult.ok ? "✓" : "✗"} {bridgeResult.title}
                  <span className="ml-2 font-normal opacity-70">
                    [{bridgeResult.kind === "handshake" ? "Verifica Bridge" : "Sync"}]
                  </span>
                </strong>
                <button
                  type="button"
                  className="text-[10px] opacity-60 hover:opacity-100 underline"
                  onClick={() => setBridgeResult(null)}
                >
                  chiudi
                </button>
              </div>
              {bridgeResult.detail && <div className="mt-1">{bridgeResult.detail}</div>}
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] opacity-70">
                {bridgeResult.http_status != null && <span>HTTP {bridgeResult.http_status}</span>}
                {bridgeResult.duration_ms != null && <span>{bridgeResult.duration_ms} ms</span>}
              </div>
              {Array.isArray((bridgeResult.raw as any)?.attempts) && (bridgeResult.raw as any).attempts.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="text-[10px] uppercase tracking-wider opacity-70">Tentativi endpoint</div>
                  {(bridgeResult.raw as any).attempts.map((a: any, i: number) => (
                    <div key={i} className="rounded border border-current/20 bg-background/40 p-1.5 text-[10px]">
                      <div className="flex items-center justify-between gap-2">
                        <code className="font-mono opacity-80 truncate">{a.endpoint}</code>
                        <span className={`shrink-0 font-semibold ${a.http_status >= 200 && a.http_status < 300 ? "text-green-600" : "text-red-600"}`}>HTTP {a.http_status}</span>
                      </div>
                      <div className="opacity-60 truncate font-mono">{a.url}</div>
                      {a.response != null && (
                        <pre className="mt-1 max-h-32 overflow-auto rounded bg-black/5 p-1 text-[9.5px] dark:bg-white/5">{typeof a.response === "string" ? a.response : JSON.stringify(a.response, null, 2)}</pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {bridgeResult.raw != null && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[10px] opacity-70 hover:opacity-100">
                    Dettagli risposta completa (JSON)
                  </summary>
                  <pre className="mt-1 max-h-48 overflow-auto rounded bg-black/5 p-2 text-[10px] dark:bg-white/5">
{JSON.stringify(bridgeResult.raw, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}
        </Section>

      </div>

      <DialogFooter className="gap-2 sticky bottom-0 bg-background pt-3 border-t flex-col items-stretch sm:flex-col">
        {lastError && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive space-y-1">
            <div className="font-semibold uppercase tracking-wider">Errore [{lastError.stage}]</div>
            <div className="whitespace-pre-wrap break-words">{lastError.message}</div>
            {lastError.raw ? (
              <details className="opacity-80">
                <summary className="cursor-pointer">Dettagli tecnici</summary>
                <pre className="mt-1 max-h-40 overflow-auto text-[10px]">{JSON.stringify(lastError.raw, null, 2)}</pre>
              </details>
            ) : null}
          </div>
        )}
        <div className="flex items-center gap-2 justify-end">
          {validationErrors.length > 0 && (
            <div className="mr-auto text-xs text-destructive max-w-[60%]">
              {validationErrors.join(" • ")}
            </div>
          )}
          <Button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.preventDefault(); void save(); }}
            disabled={!canSave}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? "Salva" : "Crea store"}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  );
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Field({ label, error, action, children }: { label: string; error?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">{label}</Label>
        {action}
      </div>
      {children}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

function UrlRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground shrink-0 w-32 text-[11px]">{label}:</span>
      <code className="flex-1 truncate rounded bg-background border border-border px-2 py-1 font-mono text-[11px]">{value}</code>
      <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => navigator.clipboard.writeText(value)}>
        copia
      </Button>
    </div>
  );
}

// ============= Webhook Tester =============

function WebhookTester({ storeId }: { storeId: string }) {
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; signature_verified: boolean; http_status: number; topic?: string; error?: string } | null>(null);

  const run = async () => {
    setTesting(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("test-webhook-endpoint", {
        body: { store_id: storeId, topic: "orders/paid" },
      });
      if (error) {
        setResult({ ok: false, signature_verified: false, http_status: 0, error: error.message });
      } else {
        setResult(data);
      }
    } catch (e) {
      setResult({ ok: false, signature_verified: false, http_status: 0, error: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center justify-between w-full text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span>🧪 Test webhook</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Invia un webhook firmato con il tuo HMAC secret al receiver. Verifica firma + risposta in un colpo solo.
          </p>
          <Button type="button" size="sm" variant="outline" onClick={run} disabled={testing}>
            {testing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
            Esegui test
          </Button>
          {result && (
            <div className={`rounded-md border p-2 text-xs ${result.ok && result.signature_verified ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400"}`}>
              <div className="font-semibold">
                {result.ok && result.signature_verified
                  ? "✅ Tutto OK — webhook ricevuto e firma valida"
                  : `❌ Problema (HTTP ${result.http_status})`}
              </div>
              {result.error && <div className="mt-1 font-mono text-[10px]">{result.error}</div>}
              {!result.signature_verified && result.ok && (
                <div className="mt-1">⚠ La firma non è stata verificata. Controlla che il webhook secret corrisponda a quello configurato in Shopify.</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}



// RotateDebugDialog rimosso (debug UI nascosto).

// ============= Shopify Webhook Helper =============

const SHOPIFY_WEBHOOK_TOPICS: { topic: string; description: string }[] = [
  { topic: "orders/create", description: "Nuovo ordine ricevuto" },
  { topic: "orders/paid", description: "Ordine pagato con successo" },
  { topic: "orders/cancelled", description: "Ordine annullato" },
  { topic: "orders/fulfilled", description: "Ordine evaso / spedito" },
  { topic: "refunds/create", description: "Rimborso creato" },
  { topic: "app/uninstalled", description: "App disinstallata dallo store" },
];

function ShopifyWebhookHelper({ webhookUrl, redirectUrl }: { webhookUrl: string; redirectUrl: string }) {
  const [open, setOpen] = useState(false);

  const copy = (v: string, label: string) => {
    navigator.clipboard.writeText(v).then(() => toast.success(`${label} copiato`));
  };

  return (
    <TooltipProvider delayDuration={200}>
      <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border border-border bg-muted/20">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium hover:bg-muted/40 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Webhook className="h-3.5 w-3.5 text-primary" />
              Webhook Shopify da configurare
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex" onClick={(e) => e.stopPropagation()}>
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-sm text-xs leading-relaxed">
                  <p className="font-semibold mb-1">Come aggiungere i webhook</p>
                  <ol className="list-decimal pl-4 space-y-1">
                    <li>Apri il tuo store Shopify → <span className="font-medium">Settings → Notifications → Webhooks</span>.</li>
                    <li>Clicca <span className="font-medium">"Create webhook"</span>.</li>
                    <li>Seleziona il <span className="font-medium">topic</span> dalla lista qui sotto.</li>
                    <li>Formato: <span className="font-mono">JSON</span>.</li>
                    <li>URL: incolla l'endpoint webhook mostrato sotto.</li>
                    <li>Versione API: <span className="font-mono">2024-10</span> o superiore.</li>
                    <li>Salva e ripeti per ogni topic.</li>
                  </ol>
                </TooltipContent>
              </Tooltip>
            </span>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t border-border">
          <div className="space-y-3 p-3">
            {/* URL di setup */}
            <div className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">URL di setup</div>
              <UrlRow label="Redirect URL (OAuth)" value={redirectUrl} />
              <UrlRow label="Endpoint webhook (URL unico per tutti)" value={webhookUrl} />
            </div>

            {/* Lista webhook */}
            <div className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Topic da creare su Shopify</div>
              <div className="divide-y divide-border rounded-md border border-border bg-background">
                {SHOPIFY_WEBHOOK_TOPICS.map((w) => (
                  <div key={w.topic} className="flex items-center gap-2 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="text-[11px] font-mono font-semibold text-primary">{w.topic}</code>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-3 w-3 text-muted-foreground hover:text-foreground transition-colors" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs text-xs">
                            <p className="font-semibold mb-1">{w.topic}</p>
                            <p className="text-muted-foreground">{w.description}</p>
                            <p className="mt-2 pt-2 border-t border-border/40 text-[11px]">
                              In Shopify: <span className="font-medium">Settings → Notifications → Webhooks → Create webhook</span>.
                              Seleziona questo topic, formato JSON, e incolla l'URL webhook qui sopra.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">{w.description}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => copy(w.topic, "Topic")}
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      title="Copia topic"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Tutti i webhook puntano allo <span className="font-medium text-foreground">stesso endpoint</span>. L'Webhook Secret (HMAC) qui sopra viene usato per verificare l'autenticità delle richieste in entrata.
              </p>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </TooltipProvider>
  );
}


// ============= Bridge status badge =============
function BridgeBadge({
  status,
  url,
  lastSync,
  lastConnected,
  error,
}: {
  status?: string | null;
  url?: string | null;
  lastSync?: string | null;
  lastConnected?: string | null;
  error?: string | null;
}) {
  // Stato coerente: se non c'è URL → not_configured indipendentemente da status DB
  const s = !url ? "not_configured" : (status && status !== "not_configured" ? status : "disconnected");
  const map: Record<string, { label: string; cls: string }> = {
    connected:     { label: "Ponte OK",     cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
    disconnected:  { label: "Ponte off",    cls: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400" },
    error:         { label: "Ponte errore", cls: "border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-400" },
    not_configured:{ label: "Ponte n/d",    cls: "border-muted-foreground/30 bg-muted/40 text-muted-foreground" },
  };
  const v = map[s] || map.not_configured;

  let host = "";
  try { if (url) host = new URL(url).host; } catch { host = url || ""; }

  const tooltip = !url
    ? "Sito Ponte non configurato"
    : [
        `URL: ${host}`,
        `Ultima connessione: ${fmtRelative(lastConnected)}`,
        `Ultimo sync: ${fmtRelative(lastSync)}`,
        error ? `Errore: ${error}` : null,
      ].filter(Boolean).join("\n");

  return (
    <Badge variant="outline" className={`h-5 text-[10px] ${v.cls}`} title={tooltip}>
      {v.label}
      {host && s === "connected" && (
        <span className="ml-1 hidden md:inline opacity-70">· {fmtRelative(lastSync)}</span>
      )}
    </Badge>
  );
}
