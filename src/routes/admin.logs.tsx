import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, RefreshCw, Search, AlertOctagon, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/logs")({
  component: LogsPage,
  head: () => ({ meta: [{ title: "Logs · HappyScam" }] }),
});

interface SystemLog {
  id: string;
  level: string;
  category: string;
  message: string;
  store_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface StoreLite {
  id: string;
  shop_domain: string;
}

const PAGE_SIZE = 50;

const LEVEL_COLORS: Record<string, string> = {
  debug: "bg-muted text-muted-foreground border-muted-foreground/20",
  info: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
  success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  warn: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
  warning: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
  webhook: "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/30",
  rotate: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 border-cyan-500/30",
  error: "bg-destructive/15 text-destructive border-destructive/30",
};

function LogsPage() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [total, setTotal] = useState(0);
  const [stores, setStores] = useState<StoreLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [level, setLevel] = useState("all");
  const [category, setCategory] = useState("all");
  const [storeId, setStoreId] = useState("all");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [categoriesList, setCategoriesList] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState(""); // yyyy-mm-dd
  const [dateTo, setDateTo] = useState("");

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, level, category, storeId, errorsOnly, dateFrom, dateTo]);

  async function load() {
    setLoading(true);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let q = supabase
      .from("system_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (errorsOnly) q = q.eq("level", "error");
    else if (level !== "all") q = q.eq("level", level);
    if (category !== "all") q = q.eq("category", category);
    if (storeId !== "all") q = q.eq("store_id", storeId);
    if (debouncedSearch) q = q.ilike("message", `%${debouncedSearch}%`);
    if (dateFrom) q = q.gte("created_at", new Date(dateFrom + "T00:00:00").toISOString());
    if (dateTo) q = q.lte("created_at", new Date(dateTo + "T23:59:59.999").toISOString());

    const [logsRes, storesRes] = await Promise.all([
      q,
      stores.length === 0
        ? supabase.from("stores").select("id, shop_domain").order("sort_order")
        : Promise.resolve({ data: stores }),
    ]);
    setLogs((logsRes.data as SystemLog[]) || []);
    setTotal(logsRes.count ?? 0);
    if (stores.length === 0 && storesRes.data) {
      setStores(storesRes.data as StoreLite[]);
    }
    // Refresh categories list (cumulative)
    setCategoriesList((prev) => {
      const next = new Set(prev);
      for (const l of (logsRes.data as SystemLog[]) || []) next.add(l.category);
      return Array.from(next).sort();
    });
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, level, category, storeId, errorsOnly, page, dateFrom, dateTo]);

  // Auto-refresh
  const refRef = useRef(load);
  refRef.current = load;
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => refRef.current(), 10_000);
    return () => clearInterval(t);
  }, [autoRefresh]);

  // Realtime hint badge for new logs (only when on page 0)
  const [newCount, setNewCount] = useState(0);
  useEffect(() => {
    const ch = supabase
      .channel("system-logs-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "system_logs" },
        () => {
          if (page === 0 && autoRefresh) {
            refRef.current();
          } else {
            setNewCount((c) => c + 1);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [page, autoRefresh]);

  function loadFresh() {
    setNewCount(0);
    setPage(0);
    load();
  }

  const storeMap = useMemo(
    () => Object.fromEntries(stores.map((s) => [s.id, s.shop_domain])),
    [stores],
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Logs di sistema</h1>
          <p className="text-muted-foreground">
            Webhook, rotation, OAuth, sync, circuit breaker — tutto in un posto.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {newCount > 0 && (
            <Button variant="outline" size="sm" onClick={loadFresh}>
              <RefreshCw className="mr-2 h-3 w-3" />
              {newCount} nuovi
            </Button>
          )}
          <div className="flex items-center gap-2">
            <Switch
              id="autorefresh"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
            />
            <Label htmlFor="autorefresh" className="text-sm cursor-pointer">
              Auto-refresh 10s
            </Label>
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Aggiorna
          </Button>
          <Button
            variant="outline"
            className="text-destructive hover:bg-destructive/10"
            disabled={loading || logs.length === 0}
            onClick={async () => {
              if (!confirm(`Cancellare i ${total} log che corrispondono ai filtri attuali?`)) return;
              let q = supabase.from("system_logs").delete();
              if (errorsOnly) q = q.eq("level", "error");
              else if (level !== "all") q = q.eq("level", level);
              if (category !== "all") q = q.eq("category", category);
              if (storeId !== "all") q = q.eq("store_id", storeId);
              if (debouncedSearch) q = q.ilike("message", `%${debouncedSearch}%`);
              if (dateFrom) q = q.gte("created_at", new Date(dateFrom + "T00:00:00").toISOString());
              if (dateTo) q = q.lte("created_at", new Date(dateTo + "T23:59:59.999").toISOString());
              if (level === "all" && category === "all" && storeId === "all" && !debouncedSearch && !errorsOnly && !dateFrom && !dateTo) {
                q = q.gte("created_at", "1970-01-01");
              }
              const { error } = await q;
              if (error) toast.error(error.message);
              else { toast.success("Log cancellati"); load(); }
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Reset filtrati
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Filtri</CardTitle>
            <Button
              size="sm"
              variant={errorsOnly ? "destructive" : "outline"}
              onClick={() => setErrorsOnly((v) => !v)}
            >
              <AlertOctagon className="mr-2 h-3 w-3" />
              {errorsOnly ? "Mostra tutti" : "Solo errori"}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cerca nei messaggi…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                maxLength={200}
              />
            </div>
            <Select value={level} onValueChange={setLevel} disabled={errorsOnly}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i livelli</SelectItem>
                <SelectItem value="debug">debug</SelectItem>
                <SelectItem value="info">info</SelectItem>
                <SelectItem value="warn">warn</SelectItem>
                <SelectItem value="error">error</SelectItem>
              </SelectContent>
            </Select>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le categorie</SelectItem>
                {categoriesList.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Store" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti gli store</SelectItem>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.shop_domain}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Label htmlFor="dateFrom" className="text-xs text-muted-foreground">Dal</Label>
              <Input
                id="dateFrom"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-[150px]"
              />
            </div>
            <div className="flex items-center gap-1">
              <Label htmlFor="dateTo" className="text-xs text-muted-foreground">Al</Label>
              <Input
                id="dateTo"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-[150px]"
              />
            </div>
            {(dateFrom || dateTo) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setDateFrom(""); setDateTo(""); }}
              >
                Reset date
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 font-mono text-xs">
            {loading && logs.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">Caricamento…</div>
            ) : logs.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                Nessun log con questi filtri.
              </div>
            ) : (
              logs.map((l) => {
                const open = expanded === l.id;
                const hasMeta = l.metadata && Object.keys(l.metadata).length > 0;
                return (
                  <div
                    key={l.id}
                    className="rounded border border-border/50 hover:bg-muted/30 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : l.id)}
                      className="flex w-full items-start gap-3 p-2 text-left"
                    >
                      <span className="text-muted-foreground whitespace-nowrap shrink-0">
                        {new Date(l.created_at).toLocaleString("it-IT", {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                      <Badge
                        variant="outline"
                        className={`${LEVEL_COLORS[l.level] || ""} text-[10px] shrink-0`}
                      >
                        {l.level}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px] shrink-0">
                        {l.category}
                      </Badge>
                      {l.store_id && (
                        <span className="text-muted-foreground shrink-0">
                          {storeMap[l.store_id]?.replace(".myshopify.com", "") ||
                            l.store_id.slice(0, 8)}
                        </span>
                      )}
                      <span className="flex-1 break-all">
                        {highlight(l.message, debouncedSearch)}
                      </span>
                    </button>
                    {open && hasMeta && (
                      <pre className="border-t border-border/50 bg-muted/40 p-3 overflow-x-auto text-[11px]">
                        {JSON.stringify(l.metadata, null, 2)}
                      </pre>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination */}
          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {total > 0
                ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} di ${total}`
                : "0 risultati"}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs whitespace-nowrap">
                Pagina {page + 1} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => p + 1)}
                disabled={page + 1 >= totalPages || loading}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function highlight(text: string, term: string): React.ReactNode {
  if (!term) return text;
  try {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const parts = text.split(new RegExp(`(${escaped})`, "ig"));
    return parts.map((p, i) =>
      p.toLowerCase() === term.toLowerCase() ? (
        <mark key={i} className="bg-yellow-500/30 text-foreground px-0.5 rounded">
          {p}
        </mark>
      ) : (
        <span key={i}>{p}</span>
      ),
    );
  } catch {
    return text;
  }
}
