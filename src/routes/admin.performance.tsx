import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Activity,
  MousePointerClick,
  Eye,
  TrendingDown,
  Smartphone,
  Monitor,
  Bot,
  Clock,
  Target,
  RotateCcw,
} from "lucide-react";

export const Route = createFileRoute("/admin/performance")({
  component: PerformancePage,
});

interface ScrollEvent {
  type?: string;
  pct?: number;
  ts?: string;
}

interface SessionRow {
  id: string;
  session_id: string;
  product_id: string | null;
  device_type: string | null;
  is_mobile: boolean;
  scroll_depth: number;
  time_on_page: number;
  clicks: number;
  bounce: boolean;
  converted: boolean;
  pages_path: string[] | null;
  events: ScrollEvent[] | null;
  created_at: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  referrer: string | null;
}

interface BotRow {
  id: string;
  bot_name: string | null;
  reason: string;
  ip: string | null;
  user_agent: string | null;
  path: string | null;
  created_at: string;
}

interface ProductRow {
  id: string;
  name: string;
  slug: string;
}

const RANGES = [
  { value: "1", label: "Ultime 24h" },
  { value: "7", label: "Ultimi 7 giorni" },
  { value: "30", label: "Ultimi 30 giorni" },
  { value: "90", label: "Ultimi 90 giorni" },
];

function formatDuration(s: number) {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
}

function PerformancePage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [bots, setBots] = useState<BotRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [productFilter, setProductFilter] = useState<string>("all");
  const [days, setDays] = useState<string>("7");
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const sinceISO = new Date(Date.now() - parseInt(days) * 86400000).toISOString();

      const [{ data: sess }, { data: botData }, { data: prods }] = await Promise.all([
        supabase
          .from("sessions")
          .select("id,session_id,product_id,device_type,is_mobile,scroll_depth,time_on_page,clicks,bounce,converted,pages_path,events,created_at,utm_source,utm_medium,utm_campaign,referrer")
          .gte("created_at", sinceISO)
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase
          .from("bot_blocks")
          .select("id,bot_name,reason,ip,user_agent,path,created_at")
          .gte("created_at", sinceISO)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.from("products").select("id,name,slug").order("name"),
      ]);

      if (!cancel) {
        setSessions((sess as SessionRow[]) ?? []);
        setBots((botData as BotRow[]) ?? []);
        setProducts((prods as ProductRow[]) ?? []);
        setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [days, reloadKey]);

  async function handleReset() {
    setResetting(true);
    try {
      const [{ error: e1 }, { error: e2 }] = await Promise.all([
        supabase.from("sessions").delete().not("id", "is", null),
        supabase.from("bot_blocks").delete().not("id", "is", null),
      ]);
      if (e1 || e2) throw e1 || e2;
      toast.success("Statistiche azzerate");
      setReloadKey((k) => k + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore reset";
      toast.error(msg);
    } finally {
      setResetting(false);
    }
  }

  const filtered = useMemo(() => {
    if (productFilter === "all") return sessions;
    return sessions.filter((s) => s.product_id === productFilter);
  }, [sessions, productFilter]);

  const stats = useMemo(() => {
    const total = filtered.length;
    if (!total) {
      return {
        total: 0, avgScroll: 0, avgTime: 0, bounceRate: 0, conversionRate: 0,
        mobileShare: 0, totalClicks: 0, cvr: 0, checkoutClicks: 0,
        m25: 0, m50: 0, m75: 0, m100: 0,
      };
    }
    const avgScroll = Math.round(filtered.reduce((a, s) => a + s.scroll_depth, 0) / total);
    const avgTime = Math.round(filtered.reduce((a, s) => a + s.time_on_page, 0) / total);
    const bounces = filtered.filter((s) => s.bounce).length;
    const conv = filtered.filter((s) => s.converted).length;
    const mobile = filtered.filter((s) => s.is_mobile).length;
    const clicks = filtered.reduce((a, s) => a + s.clicks, 0);
    let c25 = 0, c50 = 0, c75 = 0, c100 = 0;
    for (const s of filtered) {
      const sd = s.scroll_depth ?? 0;
      const evts = Array.isArray(s.events) ? s.events : [];
      const hit = (p: number) =>
        sd >= p || evts.some((e) => e?.type === "scroll_milestone" && (e.pct ?? 0) >= p);
      if (hit(25)) c25++;
      if (hit(50)) c50++;
      if (hit(75)) c75++;
      if (hit(95)) c100++;
    }
    return {
      total,
      avgScroll,
      avgTime,
      bounceRate: Math.round((bounces / total) * 100),
      conversionRate: Math.round((conv / total) * 1000) / 10,
      cvr: Math.round((conv / total) * 1000) / 10,
      checkoutClicks: conv,
      mobileShare: Math.round((mobile / total) * 100),
      totalClicks: clicks,
      m25: Math.round((c25 / total) * 100),
      m50: Math.round((c50 / total) * 100),
      m75: Math.round((c75 / total) * 100),
      m100: Math.round((c100 / total) * 100),
    };
  }, [filtered]);

  const perProduct = useMemo(() => {
    const map = new Map<string, { id: string; name: string; sessions: number; avgScroll: number; avgTime: number; bounces: number; conv: number; mobile: number }>();
    for (const s of sessions) {
      if (!s.product_id) continue;
      const p = products.find((x) => x.id === s.product_id);
      if (!p) continue;
      const cur = map.get(s.product_id) || { id: s.product_id, name: p.name, sessions: 0, avgScroll: 0, avgTime: 0, bounces: 0, conv: 0, mobile: 0 };
      cur.sessions += 1;
      cur.avgScroll += s.scroll_depth;
      cur.avgTime += s.time_on_page;
      if (s.bounce) cur.bounces += 1;
      if (s.converted) cur.conv += 1;
      if (s.is_mobile) cur.mobile += 1;
      map.set(s.product_id, cur);
    }
    return Array.from(map.values())
      .map((r) => ({
        ...r,
        avgScroll: Math.round(r.avgScroll / r.sessions),
        avgTime: Math.round(r.avgTime / r.sessions),
        bounceRate: Math.round((r.bounces / r.sessions) * 100),
        cvr: Math.round((r.conv / r.sessions) * 1000) / 10,
        mobileRate: Math.round((r.mobile / r.sessions) * 100),
      }))
      .sort((a, b) => b.sessions - a.sessions);
  }, [sessions, products]);

  const topPaths = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of filtered) {
      const path = (s.pages_path || []).join(" → ");
      if (!path) continue;
      counts.set(path, (counts.get(path) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [filtered]);

  const topSources = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of filtered) {
      const src = s.utm_source || (s.referrer ? new URL(s.referrer.startsWith("http") ? s.referrer : `https://${s.referrer}`).hostname : "Diretto");
      counts.set(src, (counts.get(src) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [filtered]);

  const botStats = useMemo(() => {
    const total = bots.length;
    const counts = new Map<string, number>();
    for (const b of bots) {
      const k = b.bot_name || "Unknown";
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    return { total, byName: Array.from(counts.entries()).sort((a, b) => b[1] - a[1]) };
  }, [bots]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">LP Performance</h1>
          <p className="text-muted-foreground">Monitora il comportamento dei visitatori per ogni landing page</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={productFilter} onValueChange={setProductFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Tutti i prodotti" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i prodotti</SelectItem>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="default" disabled={resetting}>
                <RotateCcw className="h-4 w-4 mr-2" />
                {resetting ? "Reset..." : "Reset stats"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Azzerare tutte le statistiche?</AlertDialogTitle>
                <AlertDialogDescription>
                  Tutte le sessioni tracciate e i log dei bot bloccati verranno cancellati definitivamente. Questa azione non è reversibile.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction onClick={handleReset} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Sì, azzera tutto
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <>
          {/* Hero KPI: CVR */}
          <Card className="overflow-hidden border-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
            <CardContent className="p-6 flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="rounded-2xl bg-primary/15 p-4">
                  <Target className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <div className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Conversion Rate</div>
                  <div className="text-5xl font-black tabular-nums leading-none mt-1">
                    {stats.cvr}<span className="text-2xl text-muted-foreground">%</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {stats.checkoutClicks} click checkout su {stats.total} sessioni
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <MiniKPI label="Click checkout" value={stats.checkoutClicks.toString()} accent="emerald" />
                <MiniKPI label="Bounce" value={`${stats.bounceRate}%`} accent={stats.bounceRate > 60 ? "rose" : "slate"} />
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <ModernStat icon={Eye} label="Sessioni" value={stats.total.toString()} />
            <ModernStat icon={Activity} label="Scroll" value={`${stats.avgScroll}%`} />
            <ModernStat icon={Clock} label="Tempo" value={formatDuration(stats.avgTime)} />
            <ModernStat icon={MousePointerClick} label="Click" value={stats.totalClicks.toString()} />
            <ModernStat icon={Smartphone} label="Mobile" value={`${stats.mobileShare}%`} />
            <ModernStat icon={Bot} label="Bot" value={botStats.total.toString()} tone="warn" />
          </div>

          {/* Scroll milestones */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Profondità di scroll · % sessioni che raggiungono la soglia
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "25%", value: stats.m25, color: "bg-emerald-500" },
                  { label: "50%", value: stats.m50, color: "bg-cyan-500" },
                  { label: "75%", value: stats.m75, color: "bg-amber-500" },
                  { label: "100%", value: stats.m100, color: "bg-rose-500" },
                ].map((m) => (
                  <div key={m.label} className="space-y-2">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {m.label}
                      </span>
                      <span className="text-2xl font-bold tabular-nums">{m.value}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full ${m.color} transition-all duration-500`}
                        style={{ width: `${m.value}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="products">
            <TabsList>
              <TabsTrigger value="products">Per prodotto</TabsTrigger>
              <TabsTrigger value="paths">Percorsi utente</TabsTrigger>
              <TabsTrigger value="sources">Sorgenti traffico</TabsTrigger>
              <TabsTrigger value="bots">Bot bloccati</TabsTrigger>
            </TabsList>

            <TabsContent value="products">
              <Card>
                <CardHeader><CardTitle>Performance per landing page</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-left text-muted-foreground">
                      <tr>
                        <th className="py-2">Prodotto</th>
                        <th>Sessioni</th>
                        <th>Scroll</th>
                        <th>Tempo</th>
                        <th>Bounce</th>
                        <th>CVR</th>
                        <th>Mobile</th>
                      </tr>
                    </thead>
                    <tbody>
                      {perProduct.map((r) => (
                        <tr key={r.id} className="border-b hover:bg-muted/50">
                          <td className="py-2 font-medium">{r.name}</td>
                          <td>{r.sessions}</td>
                          <td>{r.avgScroll}%</td>
                          <td>{formatDuration(r.avgTime)}</td>
                          <td><Badge variant={r.bounceRate > 60 ? "destructive" : "secondary"}>{r.bounceRate}%</Badge></td>
                          <td><Badge variant={r.cvr > 1 ? "default" : "outline"}>{r.cvr}%</Badge></td>
                          <td>{r.mobileRate}%</td>
                        </tr>
                      ))}
                      {!perProduct.length && (
                        <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">Nessuna sessione raccolta nel periodo selezionato.</td></tr>
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="paths">
              <Card>
                <CardHeader><CardTitle>Top percorsi utente</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {topPaths.map(([path, n]) => (
                      <div key={path} className="flex items-center justify-between text-sm border-b py-2">
                        <span className="font-mono text-xs truncate">{path}</span>
                        <Badge variant="secondary">{n}</Badge>
                      </div>
                    ))}
                    {!topPaths.length && <div className="text-muted-foreground text-center py-8">Nessun dato.</div>}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sources">
              <Card>
                <CardHeader><CardTitle>Sorgenti di traffico</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {topSources.map(([src, n]) => (
                      <div key={src} className="flex items-center justify-between text-sm border-b py-2">
                        <span>{src}</span>
                        <Badge variant="secondary">{n} sessioni</Badge>
                      </div>
                    ))}
                    {!topSources.length && <div className="text-muted-foreground text-center py-8">Nessun dato.</div>}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="bots">
              <div className="grid md:grid-cols-3 gap-4">
                <Card className="md:col-span-1">
                  <CardHeader><CardTitle className="flex items-center gap-2"><Bot className="h-4 w-4" />Per categoria</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {botStats.byName.map(([name, n]) => (
                        <div key={name} className="flex items-center justify-between text-sm">
                          <span>{name}</span>
                          <Badge variant="secondary">{n}</Badge>
                        </div>
                      ))}
                      {!botStats.byName.length && <div className="text-muted-foreground text-center py-4">Nessun bot bloccato.</div>}
                    </div>
                  </CardContent>
                </Card>
                <Card className="md:col-span-2">
                  <CardHeader><CardTitle>Ultimi blocchi</CardTitle></CardHeader>
                  <CardContent className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="border-b text-left text-muted-foreground">
                        <tr><th className="py-2">Quando</th><th>Bot</th><th>IP</th><th>Path</th><th>Motivo</th></tr>
                      </thead>
                      <tbody>
                        {bots.slice(0, 50).map((b) => (
                          <tr key={b.id} className="border-b">
                            <td className="py-1">{new Date(b.created_at).toLocaleString("it-IT")}</td>
                            <td><Badge variant="outline">{b.bot_name}</Badge></td>
                            <td className="font-mono">{b.ip || "—"}</td>
                            <td className="font-mono truncate max-w-[200px]">{b.path}</td>
                            <td>{b.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end">
            <Button asChild variant="outline" size="sm">
              <Link to="/admin">Torna alla dashboard</Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function ModernStat({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: string; tone?: "warn" | "danger" }) {
  const iconTone =
    tone === "danger" ? "text-rose-500 bg-rose-500/10"
    : tone === "warn" ? "text-amber-500 bg-amber-500/10"
    : "text-foreground bg-muted";
  return (
    <Card className="border-border/50 hover:border-border transition-colors">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className={`rounded-lg p-1.5 ${iconTone}`}><Icon className="h-3.5 w-3.5" /></div>
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        </div>
        <div className="text-2xl font-bold tabular-nums leading-none">{value}</div>
      </CardContent>
    </Card>
  );
}

function MiniKPI({ label, value, accent }: { label: string; value: string; accent: "emerald" | "rose" | "slate" }) {
  const ring =
    accent === "emerald" ? "ring-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
    : accent === "rose" ? "ring-rose-500/30 bg-rose-500/5 text-rose-600 dark:text-rose-400"
    : "ring-border bg-muted/40 text-foreground";
  return (
    <div className={`rounded-xl px-4 py-3 ring-1 ${ring} min-w-[120px]`}>
      <div className="text-[10px] uppercase tracking-widest opacity-80 font-semibold">{label}</div>
      <div className="text-2xl font-bold tabular-nums leading-tight mt-0.5">{value}</div>
    </div>
  );
}
