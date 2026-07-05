import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowDown, ArrowUp, ArrowUpDown, Save, Loader2, RotateCcw, Calendar } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/product-stats")({
  component: ProductStatsPage,
  head: () => ({ meta: [{ title: "Statistiche prodotti" }] }),
});

interface Product { id: string; name: string; slug: string; price: number; }
interface SessionRow { product_id: string | null; converted: boolean; clicks: number; created_at: string; }

const RANGES = [
  { value: "1", label: "Oggi" },
  { value: "7", label: "Ultimi 7 giorni" },
  { value: "30", label: "Ultimi 30 giorni" },
  { value: "90", label: "Ultimi 90 giorni" },
];

type SortKey = "name" | "sessions" | "conversions" | "cvr" | "revenue" | "budget" | "cpa" | "roas";
type SortDir = "asc" | "desc" | null;

// Daily budgets: { [productId]: { [YYYY-MM-DD]: number } }
type DailyBudgets = Record<string, Record<string, number>>;

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ProductStatsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [budgets, setBudgets] = useState<DailyBudgets>({});
  const [days, setDays] = useState("7");
  const [budgetDate, setBudgetDate] = useState<string>(todayISO());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const sinceISO = new Date(Date.now() - parseInt(days) * 86400000).toISOString();
      const [{ data: prods }, { data: sess }, { data: setRow }] = await Promise.all([
        supabase.from("products").select("id,name,slug,price").order("name"),
        supabase.from("sessions").select("product_id,converted,clicks,created_at").gte("created_at", sinceISO).limit(20000),
        supabase.from("settings").select("value").eq("key", "product_ad_spend_daily").maybeSingle(),
      ]);
      setProducts((prods as Product[]) || []);
      setSessions((sess as SessionRow[]) || []);
      // Migrate legacy flat budgets if present
      let v = (setRow?.value as DailyBudgets) || {};
      if (!setRow) {
        const { data: legacy } = await supabase.from("settings").select("value").eq("key", "product_ad_spend").maybeSingle();
        const flat = (legacy?.value as Record<string, number>) || {};
        if (Object.keys(flat).length) {
          const today = todayISO();
          v = Object.fromEntries(Object.entries(flat).map(([pid, amt]) => [pid, { [today]: Number(amt) || 0 }]));
        }
      }
      setBudgets(v);
      setLoading(false);
    })();
  }, [days, reloadKey]);

  // List of YYYY-MM-DD inside the selected range (today inclusive)
  const rangeDays = useMemo(() => {
    const n = parseInt(days);
    const out: string[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < n; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      out.push(dayKey(d));
    }
    return out;
  }, [days]);

  const rows = useMemo(() => {
    const map = new Map<string, { sessions: number; conversions: number }>();
    for (const s of sessions) {
      if (!s.product_id) continue;
      const cur = map.get(s.product_id) || { sessions: 0, conversions: 0 };
      cur.sessions += 1;
      if (s.converted) cur.conversions += 1;
      map.set(s.product_id, cur);
    }
    return products.map((p) => {
      const m = map.get(p.id) || { sessions: 0, conversions: 0 };
      const dailyMap = budgets[p.id] || {};
      // sum budgets for days in range
      const budget = rangeDays.reduce((sum, d) => sum + (Number(dailyMap[d]) || 0), 0);
      const todayBudget = Number(dailyMap[budgetDate] || 0);
      const revenue = m.conversions * Number(p.price || 0);
      const cvr = m.sessions ? (m.conversions / m.sessions) * 100 : 0;
      const cpa = m.conversions ? budget / m.conversions : 0;
      const roas = budget ? revenue / budget : 0;
      return {
        id: p.id, name: p.name, slug: p.slug, price: p.price,
        sessions: m.sessions, conversions: m.conversions,
        revenue, budget, todayBudget, cvr, cpa, roas,
      };
    });
  }, [products, sessions, budgets, rangeDays, budgetDate]);

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return rows;
    const arr = [...rows];
    arr.sort((a: any, b: any) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey !== k) { setSortKey(k); setSortDir("desc"); return; }
    if (sortDir === "desc") { setSortDir("asc"); return; }
    if (sortDir === "asc") { setSortKey(null); setSortDir(null); return; }
    setSortDir("desc");
  }

  function setBudgetForDate(productId: string, date: string, amount: number) {
    setBudgets((prev) => {
      const next = { ...prev };
      const cur = { ...(next[productId] || {}) };
      if (!amount) delete cur[date];
      else cur[date] = amount;
      next[productId] = cur;
      return next;
    });
  }

  async function saveBudgets() {
    setSaving(true);
    try {
      const { error } = await supabase.from("settings").upsert(
        [{ key: "product_ad_spend_daily", value: budgets as never, is_public: false }],
        { onConflict: "key" }
      );
      if (error) throw error;
      toast.success("Budget salvati");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function resetAll() {
    setResetting(true);
    try {
      const [{ error: e1 }, { error: e2 }, { error: e3 }] = await Promise.all([
        supabase.from("sessions").delete().not("id", "is", null),
        supabase.from("bot_blocks").delete().not("id", "is", null),
        supabase.from("settings").delete().in("key", ["product_ad_spend_daily", "product_ad_spend"]),
      ]);
      if (e1 || e2 || e3) throw e1 || e2 || e3;
      toast.success("Statistiche e budget azzerati");
      setBudgets({});
      setReloadKey((k) => k + 1);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setResetting(false);
    }
  }

  function SortHeader({ k, children, align }: { k: SortKey; children: React.ReactNode; align?: "right" }) {
    const Icon = sortKey !== k ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <th className={`py-2 ${align === "right" ? "text-right" : "text-left"}`}>
        <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
          {children} <Icon className="h-3 w-3 opacity-60" />
        </button>
      </th>
    );
  }

  const totals = useMemo(() => {
    const t = sorted.reduce(
      (a, r) => ({
        sessions: a.sessions + r.sessions,
        conversions: a.conversions + r.conversions,
        revenue: a.revenue + r.revenue,
        budget: a.budget + r.budget,
      }),
      { sessions: 0, conversions: 0, revenue: 0, budget: 0 }
    );
    return {
      ...t,
      cvr: t.sessions ? (t.conversions / t.sessions) * 100 : 0,
      cpa: t.conversions ? t.budget / t.conversions : 0,
      roas: t.budget ? t.revenue / t.budget : 0,
    };
  }, [sorted]);

  const isEditingPast = budgetDate < todayISO();
  const isEditingFuture = budgetDate > todayISO();

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Statistiche prodotti</h1>
          <p className="text-muted-foreground">Vendite, budget pubblicitario giornaliero, CVR, CPA e ROAS in tempo reale</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={saveBudgets} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salva budget
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={resetting}>
                <RotateCcw className="h-4 w-4 mr-2" />
                {resetting ? "Reset..." : "Reset stats"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Azzerare tutte le statistiche?</AlertDialogTitle>
                <AlertDialogDescription>
                  Saranno cancellati: tutte le sessioni, i bot bloccati e i budget pubblicitari. Operazione non reversibile.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction onClick={resetAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Sì, azzera tutto
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Imposta budget per giorno
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">Giorno:</label>
            <Input
              type="date"
              value={budgetDate}
              max={todayISO()}
              onChange={(e) => setBudgetDate(e.target.value || todayISO())}
              className="w-[180px] h-9"
            />
            <Button size="sm" variant="ghost" onClick={() => setBudgetDate(todayISO())}>Oggi</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {isEditingFuture ? "⚠️ Stai impostando un budget futuro" :
              isEditingPast ? "Stai modificando un giorno passato" :
                "Ogni giorno il campo torna vuoto: inserisci il budget speso oggi."}
          </p>
        </CardContent>
      </Card>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI label="Revenue tot." value={`€${totals.revenue.toFixed(2)}`} />
            <KPI label="Spend tot." value={`€${totals.budget.toFixed(2)}`} />
            <KPI label="CVR medio" value={`${totals.cvr.toFixed(2)}%`} />
            <KPI label="ROAS medio" value={`${totals.roas.toFixed(2)}x`} accent={totals.roas >= 1 ? "ok" : "warn"} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Performance per prodotto</CardTitle>
              <p className="text-xs text-muted-foreground">
                Budget mostra l'importo del giorno selezionato ({budgetDate}). I totali e ROAS/CPA sommano i budget di tutti i giorni nel range selezionato.
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-muted-foreground">
                  <tr>
                    <SortHeader k="name">Prodotto</SortHeader>
                    <SortHeader k="sessions" align="right">Sessioni</SortHeader>
                    <SortHeader k="conversions" align="right">Conv.</SortHeader>
                    <SortHeader k="cvr" align="right">CVR</SortHeader>
                    <SortHeader k="revenue" align="right">Revenue</SortHeader>
                    <th className="text-right py-2">Budget {budgetDate} €</th>
                    <SortHeader k="budget" align="right">Spend totale</SortHeader>
                    <SortHeader k="cpa" align="right">CPA</SortHeader>
                    <SortHeader k="roas" align="right">ROAS</SortHeader>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.id} className="border-b hover:bg-muted/30">
                      <td className="py-2 font-medium">{r.name}</td>
                      <td className="text-right tabular-nums">{r.sessions}</td>
                      <td className="text-right tabular-nums">{r.conversions}</td>
                      <td className="text-right tabular-nums">{r.cvr.toFixed(2)}%</td>
                      <td className="text-right tabular-nums">€{r.revenue.toFixed(2)}</td>
                      <td className="text-right">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0"
                          value={budgets[r.id]?.[budgetDate] ?? ""}
                          onChange={(e) => setBudgetForDate(r.id, budgetDate, Number(e.target.value) || 0)}
                          className="w-24 ml-auto h-8 text-right"
                        />
                      </td>
                      <td className="text-right tabular-nums">€{r.budget.toFixed(2)}</td>
                      <td className="text-right tabular-nums">{r.conversions ? `€${r.cpa.toFixed(2)}` : "—"}</td>
                      <td className="text-right">
                        {r.budget ? (
                          <Badge variant={r.roas >= 1 ? "default" : "destructive"}>{r.roas.toFixed(2)}x</Badge>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                  {!sorted.length && (
                    <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">Nessun prodotto.</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Revenue = conversioni × prezzo · CPA = spend / conversioni · ROAS = revenue / spend · CVR = conversioni / sessioni.
          </p>

          <div className="flex justify-end">
            <Button asChild variant="outline" size="sm"><Link to="/admin">Torna alla dashboard</Link></Button>
          </div>
        </>
      )}
    </div>
  );
}

function KPI({ label, value, accent }: { label: string; value: string; accent?: "ok" | "warn" }) {
  const cls = accent === "ok" ? "text-emerald-600 dark:text-emerald-400"
    : accent === "warn" ? "text-rose-600 dark:text-rose-400" : "";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
        <div className={`text-2xl font-bold tabular-nums mt-1 ${cls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
