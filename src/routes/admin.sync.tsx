import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, RefreshCw, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { syncProductToBridge } from "@/lib/bridge.functions";

export const Route = createFileRoute("/admin/sync")({
  component: SyncPage,
});

type ProductRow = {
  id: string;
  name: string | null;
  slug: string | null;
  price: number | null;
  bridge_shadow_map?: any;
};

type StoreRow = {
  id: string;
  shop_domain: string | null;
  bridge_site_url: string | null;
  product_push_url?: string | null;
  bridge_status: string | null;
  lovable_sync_enabled?: boolean | null;
  lovable_sync_url?: string | null;
};

// Dominio reale dello store (host del bridge URL), non il placeholder native-*.
function storeHost(s: StoreRow): string {
  const u = s.bridge_site_url?.trim();
  if (u) { try { return new URL(/^https?:\/\//.test(u) ? u : `https://${u}`).host; } catch { return u.replace(/^https?:\/\//, "").replace(/\/$/, ""); } }
  return s.shop_domain || s.id;
}

function SyncPage() {
  const syncFn = useServerFn(syncProductToBridge);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [selectedStores, setSelectedStores] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [bulk, setBulk] = useState<{ done: number; total: number; ok: number; fail: number } | null>(null);
  const [lastDebug, setLastDebug] = useState<any>(null);

  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    const errors: string[] = [];

    // Stores: indipendente dai prodotti, ignora is_active se non c'è
    try {
      const storeColumns = "id, shop_domain, bridge_site_url, product_push_url, bridge_status, lovable_sync_enabled, lovable_sync_url";
      let { data: sts, error: sErr } = await supabase
        .from("stores").select(storeColumns).eq("is_active", true);
      if (sErr) {
        // fallback senza filtro is_active
        const r2 = await supabase.from("stores").select(storeColumns);
        sts = r2.data as any; sErr = r2.error as any;
      }
      if (sErr) throw sErr;
      const list = (sts as StoreRow[]) || [];
      setStores(list);
      // default: seleziona gli store col bridge connesso (o, se nessuno, tutti quelli con bridge URL)
      setSelectedStores((prev) => {
        if (prev.size) return prev;
        const connected = list.filter((s) => s.bridge_site_url && (s.bridge_status === "connected" || s.bridge_status === "ok"));
        const base = connected.length ? connected : list.filter((s) => s.bridge_site_url);
        return new Set(base.map((s) => s.id));
      });
    } catch (e: any) {
      console.error("[admin.sync] stores load failed", e);
      errors.push(`stores: ${e?.message || e}`);
      setStores([]);
    }

    // Products: prova con bridge_shadow_map, se la colonna non esiste fallback senza
    try {
      const PAGE = 1000;
      const all: ProductRow[] = [];
      let useMap = true;
      for (let from = 0; ; from += PAGE) {
        const cols = useMap ? "id, name, slug, price, bridge_shadow_map" : "id, name, slug, price";
        const { data, error } = await supabase
          .from("products").select(cols).order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) {
          if (useMap && /bridge_shadow_map/i.test(error.message || "")) {
            // retry senza la colonna
            useMap = false;
            from -= PAGE;
            continue;
          }
          throw error;
        }
        if (!data || data.length === 0) break;
        all.push(...(data as unknown as ProductRow[]));
        if (data.length < PAGE) break;
      }
      setProducts(all);
    } catch (e: any) {
      console.error("[admin.sync] products load failed", e);
      errors.push(`products: ${e?.message || e}`);
      setProducts([]);
    }

    if (errors.length) {
      setLoadError(errors.join(" · "));
      toast.error(errors[0]);
    }
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return products;
    return products.filter(p =>
      (p.name || "").toLowerCase().includes(q) ||
      (p.slug || "").toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q),
    );
  }, [products, filter]);

  // Store di destinazione = quelli selezionati che hanno un bridge URL.
  const targetStores = useMemo(
    () => stores.filter(s => selectedStores.has(s.id) && s.bridge_site_url),
    [stores, selectedStores],
  );

  function toggleStore(id: string) {
    setSelectedStores(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Invia UN prodotto a TUTTI gli store selezionati, in sequenza.
  const pushOne = async (productId: string): Promise<{ ok: boolean; okStores: number; totalStores: number; detail: any }> => {
    const targets = targetStores;
    if (!targets.length) return { ok: false, okStores: 0, totalStores: 0, detail: { error: "Nessuno store selezionato" } };
    const results: any[] = [];
    for (const st of targets) {
      const res: any = await syncFn({ data: { product_id: productId, store_id: st.id } });
      results.push({ store_id: st.id, domain: storeHost(st), ...res });
      if (res?.ok) {
        setProducts(prev => prev.map(p => p.id === productId
          ? { ...p, bridge_shadow_map: { ...(p.bridge_shadow_map || {}), [st.id]: { shadow_handle: res?.slug || "synced", shadow_product_id: res?.product_id || null, updated_at: new Date().toISOString() } } }
          : p));
      }
    }
    const okStores = results.filter(r => r?.ok).length;
    setLastDebug({ product_id: productId, stores: targets.length, results });
    return { ok: okStores > 0, okStores, totalStores: targets.length, detail: results };
  };

  const handleSingle = async (productId: string) => {
    setPushingId(productId);
    try {
      const { ok, okStores, totalStores, detail } = await pushOne(productId);
      if (ok) toast.success(`Inviato a ${okStores}/${totalStores} store`);
      else toast.error(`Errore: ${(Array.isArray(detail) ? detail.find((r: any) => !r?.ok)?.error : detail?.error) || "nessuno store selezionato"}`);
      await load();
    } catch (e: any) {
      const debug = {
        ok: false,
        step: "client_call",
        product_id: productId,
        error: e?.message || String(e),
        raw: e,
        happened_at: new Date().toISOString(),
      };
      setLastDebug(debug);
      toast.error(`Errore: ${debug.error}`);
    } finally {
      setPushingId(null);
    }
  };

  const handleBulk = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setBulk({ done: 0, total: ids.length, ok: 0, fail: 0 });
    let ok = 0, fail = 0;
    for (let i = 0; i < ids.length; i++) {
      try {
        const r = await pushOne(ids[i]);
        if (r.ok) ok++; else fail++;
      } catch (e: any) {
        fail++;
        setLastDebug({
          ok: false,
          step: "bulk_client_call",
          product_id: ids[i],
          error: e?.message || String(e),
          raw: e,
          happened_at: new Date().toISOString(),
        });
      }
      setBulk({ done: i + 1, total: ids.length, ok, fail });
    }
    toast[fail ? "warning" : "success"](`Sync completata: ${ok} ok / ${fail} fail`);
    await load();
    setTimeout(() => setBulk(null), 5000);
  };

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(p => p.id)));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sync prodotti → Sito B</h1>
          <p className="text-muted-foreground">
            Invia i prodotti al catalogo del Sito B (shop_products) tramite il canale Bridge, con la stessa API key di handshake/checkout.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to="/admin/products">← Prodotti</Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Store di destinazione</CardTitle>
          <span className="text-xs text-muted-foreground">{targetStores.length} selezionati</span>
        </CardHeader>
        <CardContent className="space-y-2">
          {stores.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessuno store configurato. <Link className="underline" to="/admin/stores">Vai a Stores →</Link></p>
          ) : (
            <>
              <p className="text-[11px] text-muted-foreground">Seleziona uno o più store: il prodotto verrà inviato a tutti quelli spuntati (in sequenza).</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {stores.map(s => {
                  const has = !!s.bridge_site_url;
                  const checked = selectedStores.has(s.id);
                  const ok = s.bridge_status === "connected" || s.bridge_status === "ok";
                  return (
                    <label
                      key={s.id}
                      className={`flex items-center gap-3 rounded-lg border p-3 ${has ? "cursor-pointer hover:bg-muted/40" : "opacity-50"} ${checked ? "border-primary ring-1 ring-primary/40 bg-primary/5" : "border-border"}`}
                    >
                      <Checkbox checked={checked} disabled={!has} onCheckedChange={() => has && toggleStore(s.id)} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{storeHost(s)}</span>
                          <span className={`h-2 w-2 rounded-full shrink-0 ${ok ? "bg-emerald-500" : s.bridge_status === "error" ? "bg-red-500" : "bg-muted-foreground"}`} />
                        </div>
                        <div className="truncate font-mono text-[10px] text-muted-foreground">{has ? `${s.bridge_site_url!.replace(/\/$/, "")}/api/public/bridge/push-product` : "nessun bridge URL"}</div>
                      </div>
                      {has && (
                        <a href={s.bridge_site_url!.replace(/\/$/, "")} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                        </a>
                      )}
                    </label>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground">Auth: header <code>X-Bridge-Api-Key</code> (la key di ogni store).</p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Prodotti ({filtered.length})</CardTitle>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Cerca per nome, slug o id…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="w-64"
            />
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button size="sm" onClick={handleBulk} disabled={!selected.size || !!bulk || targetStores.length === 0}>
              {bulk ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{bulk.done}/{bulk.total}</> : <><Send className="h-4 w-4 mr-2" />Sync selezionati ({selected.size})</>}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Carico…</div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {loadError ? `Errore: ${loadError}` : products.length === 0 ? "Nessun prodotto trovato nel DB." : "Nessun risultato per il filtro."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="text-left py-2 w-8">
                      <Checkbox checked={selected.size === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} />
                    </th>
                    <th className="text-left py-2">Prodotto</th>
                    <th className="text-left py-2">Slug</th>
                    <th className="text-right py-2">Prezzo</th>
                    <th className="text-left py-2">Stato sync</th>
                    <th className="text-right py-2">Azione</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => {
                    const syncedCount = targetStores.filter(s => p.bridge_shadow_map?.[s.id]).length;
                    return (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="py-2"><Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggle(p.id)} /></td>
                        <td className="py-2">
                          <div className="font-medium">{p.name || "—"}</div>
                          <div className="text-xs text-muted-foreground font-mono">{p.id.slice(0, 8)}…</div>
                        </td>
                        <td className="py-2 text-muted-foreground">{p.slug || "—"}</td>
                        <td className="py-2 text-right">{p.price != null ? `€${Number(p.price).toFixed(2)}` : "—"}</td>
                        <td className="py-2">
                          {syncedCount > 0
                            ? <Badge variant="secondary">inviato {syncedCount}/{targetStores.length || 0}</Badge>
                            : <Badge variant="outline">non inviato</Badge>}
                        </td>
                        <td className="py-2 text-right">
                          <Button size="sm" variant="outline" disabled={pushingId === p.id || !!bulk || targetStores.length === 0} onClick={() => handleSingle(p.id)}>
                            {pushingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-3 w-3 mr-1" />Sync</>}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {lastDebug && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Debug ultima chiamata</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(JSON.stringify(lastDebug, null, 2)); toast.success("Copiato"); }}>Copia</Button>
          </CardHeader>
          <CardContent>
            <pre className="text-[11px] bg-muted/50 p-3 rounded-md overflow-x-auto max-h-80">{JSON.stringify(lastDebug, null, 2)}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
