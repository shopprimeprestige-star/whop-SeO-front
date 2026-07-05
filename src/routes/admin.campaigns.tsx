import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, Plus, Trash2, TrendingUp, Link2, RefreshCw, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/admin/campaigns")({
  component: CampaignsPage,
});

interface Campaign {
  id: string;
  name: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  generated_url: string | null;
  clicks: number;
  checkouts: number;
  orders: number;
  revenue: number;
  created_at: string;
}

const PRESETS = [
  { source: "facebook", medium: "cpc", label: "Meta Ads" },
  { source: "tiktok", medium: "cpc", label: "TikTok Ads" },
  { source: "google", medium: "cpc", label: "Google Ads" },
  { source: "instagram", medium: "social", label: "Instagram organic" },
  { source: "newsletter", medium: "email", label: "Email" },
  { source: "influencer", medium: "social", label: "Influencer" },
];

function buildUrl(base: string, utm: Partial<Campaign>) {
  try {
    const u = new URL(base);
    if (utm.utm_source) u.searchParams.set("utm_source", utm.utm_source);
    if (utm.utm_medium) u.searchParams.set("utm_medium", utm.utm_medium);
    if (utm.utm_campaign) u.searchParams.set("utm_campaign", utm.utm_campaign);
    if (utm.utm_content) u.searchParams.set("utm_content", utm.utm_content);
    if (utm.utm_term) u.searchParams.set("utm_term", utm.utm_term);
    return u.toString();
  } catch {
    return "";
  }
}

function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [siteUrl, setSiteUrl] = useState<string>(typeof window !== "undefined" ? window.location.origin : "");
  const [form, setForm] = useState({
    name: "",
    landing: "/",
    utm_source: "",
    utm_medium: "",
    utm_campaign: "",
    utm_content: "",
    utm_term: "",
  });

  const load = async () => {
    const { data } = await supabase.from("utm_campaigns").select("*").order("created_at", { ascending: false });
    setCampaigns((data as Campaign[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const generated = useMemo(
    () => buildUrl(siteUrl + form.landing, form as Partial<Campaign>),
    [siteUrl, form],
  );

  const create = async () => {
    if (!form.name || !form.utm_source || !form.utm_campaign) {
      toast.error("Nome, source e campaign obbligatori");
      return;
    }
    const { error } = await supabase.from("utm_campaigns").insert({
      name: form.name,
      utm_source: form.utm_source || null,
      utm_medium: form.utm_medium || null,
      utm_campaign: form.utm_campaign || null,
      utm_content: form.utm_content || null,
      utm_term: form.utm_term || null,
      generated_url: generated,
    });
    if (error) return toast.error(error.message);
    toast.success("Campagna creata");
    setForm({ name: "", landing: "/", utm_source: "", utm_medium: "", utm_campaign: "", utm_content: "", utm_term: "" });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Eliminare campagna?")) return;
    await supabase.from("utm_campaigns").delete().eq("id", id);
    load();
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("Copiato");
  };

  // Recompute click/checkout/order/revenue from sessions table
  const refreshStats = async () => {
    setRefreshing(true);
    try {
      const sinceISO = new Date(Date.now() - 90 * 86400000).toISOString();
      const { data: sess } = await supabase
        .from("sessions")
        .select("utm_source,utm_medium,utm_campaign,converted")
        .gte("created_at", sinceISO);

      const grouped = new Map<string, { clicks: number; checkouts: number }>();
      for (const s of sess || []) {
        const key = `${s.utm_source || ""}|${s.utm_medium || ""}|${s.utm_campaign || ""}`;
        const cur = grouped.get(key) || { clicks: 0, checkouts: 0 };
        cur.clicks += 1;
        if (s.converted) cur.checkouts += 1;
        grouped.set(key, cur);
      }

      for (const c of campaigns) {
        const key = `${c.utm_source || ""}|${c.utm_medium || ""}|${c.utm_campaign || ""}`;
        const stats = grouped.get(key);
        if (!stats) continue;
        await supabase
          .from("utm_campaigns")
          .update({ clicks: stats.clicks, checkouts: stats.checkouts })
          .eq("id", c.id);
      }
      toast.success("Statistiche aggiornate");
      load();
    } finally {
      setRefreshing(false);
    }
  };

  const totals = useMemo(() => {
    return campaigns.reduce(
      (a, c) => ({
        clicks: a.clicks + c.clicks,
        checkouts: a.checkouts + c.checkouts,
        orders: a.orders + c.orders,
        revenue: a.revenue + Number(c.revenue || 0),
      }),
      { clicks: 0, checkouts: 0, orders: 0, revenue: 0 },
    );
  }, [campaigns]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Campagne UTM</h1>
          <p className="text-muted-foreground">Genera link tracciati e monitora performance</p>
        </div>
        <Button variant="outline" onClick={refreshStats} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Aggiorna stats
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="Click totali" value={totals.clicks.toString()} />
        <KPI label="Checkout" value={totals.checkouts.toString()} />
        <KPI label="Ordini" value={totals.orders.toString()} />
        <KPI label="Revenue" value={`€${totals.revenue.toFixed(2)}`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Link2 className="h-4 w-4" /> Genera nuovo link</CardTitle>
          <CardDescription>Compila i parametri UTM e copia il link tracciato</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground self-center">Preset:</span>
            {PRESETS.map((p) => (
              <Button key={p.source} size="sm" variant="outline" onClick={() => setForm({ ...form, utm_source: p.source, utm_medium: p.medium })}>
                {p.label}
              </Button>
            ))}
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Nome campagna interno *">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Black Friday Meta" />
            </Field>
            <Field label="Landing page">
              <Input value={form.landing} onChange={(e) => setForm({ ...form, landing: e.target.value })} placeholder="/p/prodotto-x" />
            </Field>
            <Field label="utm_source *">
              <Input value={form.utm_source} onChange={(e) => setForm({ ...form, utm_source: e.target.value })} placeholder="facebook" />
            </Field>
            <Field label="utm_medium">
              <Input value={form.utm_medium} onChange={(e) => setForm({ ...form, utm_medium: e.target.value })} placeholder="cpc" />
            </Field>
            <Field label="utm_campaign *">
              <Input value={form.utm_campaign} onChange={(e) => setForm({ ...form, utm_campaign: e.target.value })} placeholder="bf2025" />
            </Field>
            <Field label="utm_content">
              <Input value={form.utm_content} onChange={(e) => setForm({ ...form, utm_content: e.target.value })} placeholder="banner-rosso" />
            </Field>
            <Field label="utm_term">
              <Input value={form.utm_term} onChange={(e) => setForm({ ...form, utm_term: e.target.value })} placeholder="parola-chiave" />
            </Field>
            <Field label="Base URL">
              <Input value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} />
            </Field>
          </div>

          <div className="rounded-md bg-muted p-3 space-y-2">
            <Label className="text-xs">Link generato</Label>
            <div className="flex gap-2">
              <Input value={generated} readOnly className="font-mono text-xs" />
              <Button size="icon" variant="outline" onClick={() => copy(generated)}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Button onClick={create}><Plus className="h-4 w-4 mr-2" /> Salva campagna</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Campagne attive</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <p className="text-center py-8 text-muted-foreground">Caricamento...</p>
          ) : campaigns.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">Nessuna campagna ancora.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="py-2">Nome</th>
                  <th>Source / Medium</th>
                  <th>Campaign</th>
                  <th className="text-right">Click</th>
                  <th className="text-right">Checkout</th>
                  <th className="text-right">Ordini</th>
                  <th className="text-right">Revenue</th>
                  <th className="text-right">CR%</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const cr = c.clicks > 0 ? Math.round((c.orders / c.clicks) * 1000) / 10 : 0;
                  return (
                    <tr key={c.id} className="border-b hover:bg-muted/30">
                      <td className="py-2 font-medium">{c.name}</td>
                      <td><Badge variant="outline">{c.utm_source}</Badge> / {c.utm_medium || "—"}</td>
                      <td className="font-mono text-xs">{c.utm_campaign}</td>
                      <td className="text-right">{c.clicks}</td>
                      <td className="text-right">{c.checkouts}</td>
                      <td className="text-right">{c.orders}</td>
                      <td className="text-right">€{Number(c.revenue || 0).toFixed(2)}</td>
                      <td className="text-right">
                        <Badge variant={cr > 1 ? "default" : "secondary"}>{cr}%</Badge>
                      </td>
                      <td className="text-right">
                        <div className="flex justify-end gap-1">
                          {c.generated_url && (
                            <>
                              <Button size="icon" variant="ghost" onClick={() => copy(c.generated_url!)} title="Copia link">
                                <Copy className="h-3 w-3" />
                              </Button>
                              <Button size="icon" variant="ghost" asChild title="Apri">
                                <a href={c.generated_url} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" /></a>
                              </Button>
                            </>
                          )}
                          <Button size="icon" variant="ghost" onClick={() => remove(c.id)}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
