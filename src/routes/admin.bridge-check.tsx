import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { bridgeHandshake, bridgeCheckoutFn } from "@/lib/bridge.functions";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle, RefreshCw, ShieldCheck, ShieldX, CreditCard } from "lucide-react";

export const Route = createFileRoute("/admin/bridge-check")({
  component: BridgeCheckPage,
});

type StoreRow = {
  id: string;
  shop_domain: string | null;
  display_name: string | null;
  bridge_site_url: string | null;
  bridge_status: string | null;
  is_active: boolean | null;
  integration_type: string | null;
};

type AttemptRow = { endpoint: string; url: string; http_status: number; response?: any };
type HandshakeResult = {
  ok: boolean;
  error?: string;
  status?: string;
  http_status?: number | null;
  duration_ms?: number;
  endpoint?: string;
  attempts?: AttemptRow[];
  remote?: any;
};

type Entry = {
  store: StoreRow;
  loading: boolean;
  ranAt?: number;
  result?: HandshakeResult;
};

function BridgeCheckPage() {
  const { session, user, isAdmin, loading: authLoading } = useAuth();
  const handshakeFn = useServerFn(bridgeHandshake);
  const checkoutFn = useServerFn(bridgeCheckoutFn);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loadingStores, setLoadingStores] = useState(true);
  const [history, setHistory] = useState<Array<{ ts: number; store: string; ok: boolean; detail: string }>>([]);
  const [coLoading, setCoLoading] = useState(false);
  const [coResult, setCoResult] = useState<{ ok: boolean; detail: string; ms?: number; store?: string } | null>(null);

  async function runCheckoutTest() {
    setCoLoading(true);
    setCoResult(null);
    const t0 = Date.now();
    try {
      const res = (await checkoutFn({ data: { warmup: true } })) as any;
      const ms = Date.now() - t0;
      const ok = !!res?.ok;
      setCoResult({
        ok,
        ms,
        store: res?.store_domain,
        detail: ok
          ? `Checkout raggiungibile sul Sito B${res?.store_domain ? ` (${res.store_domain})` : ""}`
          : (res?.error || "Generazione checkout fallita"),
      });
      setHistory((h) => [{ ts: Date.now(), store: res?.store_domain || "checkout", ok, detail: ok ? "Checkout OK" : (res?.error || "checkout fallito") }, ...h].slice(0, 20));
    } catch (e) {
      setCoResult({ ok: false, detail: (e as Error).message, ms: Date.now() - t0 });
    } finally {
      setCoLoading(false);
    }
  }

  useEffect(() => {
    if (!session) return;
    (async () => {
      setLoadingStores(true);
      const { data, error } = await supabase
        .from("stores")
        .select("id, shop_domain, display_name, bridge_site_url, bridge_status, is_active, integration_type")
        .order("created_at", { ascending: true });
      if (!error && data) {
        setEntries(data.map((s) => ({ store: s as StoreRow, loading: false })));
      }
      setLoadingStores(false);
    })();
  }, [session]);

  async function runHandshake(idx: number) {
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, loading: true } : e)));
    try {
      const res = (await handshakeFn({ data: { store_id: entries[idx].store.id } })) as HandshakeResult;
      setEntries((prev) =>
        prev.map((e, i) => (i === idx ? { ...e, loading: false, ranAt: Date.now(), result: res } : e)),
      );
      setHistory((h) =>
        [{ ts: Date.now(), store: entries[idx].store.shop_domain || entries[idx].store.id, ok: !!res.ok, detail: res.ok ? `OK ${res.endpoint ?? ""}` : res.error || "errore" }, ...h].slice(0, 20),
      );
    } catch (e) {
      const msg = (e as Error).message;
      const res: HandshakeResult = { ok: false, error: msg };
      setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, loading: false, ranAt: Date.now(), result: res } : e)));
      setHistory((h) =>
        [{ ts: Date.now(), store: entries[idx].store.shop_domain || entries[idx].store.id, ok: false, detail: msg }, ...h].slice(0, 20),
      );
    }
  }

  async function runAll() {
    for (let i = 0; i < entries.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      await runHandshake(i);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Verifica Bridge</h1>
          <p className="text-sm text-muted-foreground">Controlla la connessione (handshake) e la generazione del checkout sul Sito B.</p>
        </div>
        <Button onClick={runAll} disabled={!entries.length || entries.some((e) => e.loading)}>
          <RefreshCw className="mr-2 h-4 w-4" /> Verifica tutti
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            {session ? <ShieldCheck className="h-4 w-4 text-green-600" /> : <ShieldX className="h-4 w-4 text-destructive" />}
            Stato sessione
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs space-y-1">
          {authLoading ? (
            <span className="text-muted-foreground">Caricamento…</span>
          ) : session ? (
            <>
              <div><span className="text-muted-foreground">Loggato come:</span> <code className="font-mono">{user?.email}</code></div>
              <div><span className="text-muted-foreground">User ID:</span> <code className="font-mono">{user?.id}</code></div>
              <div><span className="text-muted-foreground">Ruolo admin:</span> {isAdmin ? <Badge variant="outline" className="border-green-500/50 text-green-700">sì</Badge> : <Badge variant="destructive">no</Badge>}</div>
              <div><span className="text-muted-foreground">Bearer token:</span> {session.access_token ? "presente" : "mancante"}</div>
            </>
          ) : (
            <div className="text-destructive">Non sei loggato. L'handshake richiede una sessione attiva.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" /> Test checkout (bridge)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-muted-foreground max-w-[70%]">
              Verifica che il Sito B riesca a <strong>generare un checkout</strong> sullo store attivo (test non distruttivo, nessun ordine creato).
            </p>
            <Button size="sm" onClick={runCheckoutTest} disabled={coLoading || !session}>
              {coLoading ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <CreditCard className="mr-2 h-3 w-3" />}
              Testa checkout
            </Button>
          </div>
          {coResult && (
            <div className="flex items-center gap-2">
              {coResult.ok ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-destructive" />}
              <span className={coResult.ok ? "text-green-700 dark:text-green-400 font-medium" : "text-destructive font-medium"}>{coResult.detail}</span>
              {coResult.ms != null && <span className="ml-auto text-[10px] text-muted-foreground">{coResult.ms} ms</span>}
            </div>
          )}
        </CardContent>
      </Card>

      {loadingStores ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : entries.length === 0 ? (
        <div className="text-sm text-muted-foreground">Nessuno store configurato.</div>
      ) : (
        <div className="space-y-3">
          {entries.map((e, i) => (
            <Card key={e.store.id} className={e.result ? (e.result.ok ? "border-green-500/40" : "border-red-500/40") : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <CardTitle className="text-sm">{e.store.display_name || e.store.shop_domain || e.store.id}</CardTitle>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {e.store.bridge_site_url || <em>nessun bridge URL</em>}
                      {e.store.bridge_status && <Badge variant="outline" className="ml-2 text-[10px]">{e.store.bridge_status}</Badge>}
                      {e.store.is_active === false && <Badge variant="destructive" className="ml-1 text-[10px]">inattivo</Badge>}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" disabled={e.loading || !session} onClick={() => runHandshake(i)}>
                    {e.loading ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-2 h-3 w-3" />}
                    Verifica
                  </Button>
                </div>
              </CardHeader>
              {e.result && (
                <CardContent className="pt-0 text-xs space-y-2">
                  <div className="flex items-center gap-2">
                    {e.result.ok ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-destructive" />}
                    <span className={e.result.ok ? "text-green-700 dark:text-green-400 font-medium" : "text-destructive font-medium"}>
                      {e.result.ok ? `Handshake riuscito (${e.result.status ?? "connected"})` : (e.result.error || "Handshake fallito")}
                    </span>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {e.result.http_status != null && `HTTP ${e.result.http_status} · `}
                      {e.result.duration_ms != null && `${e.result.duration_ms} ms`}
                    </span>
                  </div>
                  {Array.isArray(e.result.attempts) && e.result.attempts.length > 0 && (
                    <div className="space-y-1">
                      {e.result.attempts.map((a, j) => (
                        <div key={j} className="rounded border border-border bg-muted/30 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <code className="font-mono text-[11px]">{a.endpoint}</code>
                            <span className={`font-semibold text-[11px] ${a.http_status >= 200 && a.http_status < 300 ? "text-green-600" : "text-red-600"}`}>HTTP {a.http_status}</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate font-mono">{a.url}</div>
                          {a.response != null && (
                            <pre className="mt-1 max-h-40 overflow-auto rounded bg-background p-1.5 text-[10px]">{typeof a.response === "string" ? a.response : JSON.stringify(a.response, null, 2)}</pre>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Log tentativi (sessione)</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-xs">
            {history.map((h, i) => (
              <div key={i} className="flex items-center gap-2 border-b border-border/40 py-1 last:border-0">
                {h.ok ? <CheckCircle2 className="h-3 w-3 text-green-600" /> : <XCircle className="h-3 w-3 text-destructive" />}
                <code className="font-mono text-[11px]">{h.store}</code>
                <span className="text-muted-foreground truncate flex-1">{h.detail}</span>
                <span className="text-[10px] text-muted-foreground">{new Date(h.ts).toLocaleTimeString()}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
