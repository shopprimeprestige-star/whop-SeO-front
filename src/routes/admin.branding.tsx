import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Palette, Loader2, Save, Plus, Trash2, GripVertical } from "lucide-react";
import { AssetUploader } from "@/components/admin/AssetUploader";

export const Route = createFileRoute("/admin/branding")({
  component: BrandingPage,
});

type Branding = {
  id?: string;
  store_name: string;
  logo_url: string | null;
  logo_dark_url: string | null;
  favicon_url: string | null;
  header_tagline: string | null;
  top_banner_enabled: boolean;
  top_banner_text: string | null;
  top_banner_link: string | null;
  top_banner_bg: string | null;
  top_banner_fg: string | null;
  horizon_enabled: boolean;
  horizon_text: string | null;
  horizon_logos: { name: string; url: string }[];
  primary_color: string | null;
  accent_color: string | null;
  // Social / SEO
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
  default_product_tagline: string | null;
  twitter_handle: string | null;
};

const empty: Branding = {
  store_name: "My Store",
  logo_url: "",
  logo_dark_url: "",
  favicon_url: "",
  header_tagline: "",
  top_banner_enabled: false,
  top_banner_text: "",
  top_banner_link: "",
  top_banner_bg: "#0a0a0a",
  top_banner_fg: "#ffffff",
  horizon_enabled: true,
  horizon_text: "Pagamenti sicuri • Reso 30 giorni • Spedizione tracciata",
  horizon_logos: [],
  primary_color: "#0a0a0a",
  accent_color: "#3b82f6",
  og_title: "",
  og_description: "",
  og_image_url: "",
  default_product_tagline: "",
  twitter_handle: "",
};

function BrandingPage() {
  const [data, setData] = useState<Branding>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: row } = await supabase.from("site_branding").select("*").maybeSingle();
      if (row) setData({ ...empty, ...row, horizon_logos: (row.horizon_logos as any) || [] });
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const payload = { ...data, horizon_logos: data.horizon_logos as any };
    const { error } = data.id
      ? await supabase.from("site_branding").update(payload).eq("id", data.id)
      : await supabase.from("site_branding").insert(payload).select().single();
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Branding salvato");
    if (!data.id) {
      const { data: row } = await supabase.from("site_branding").select("*").maybeSingle();
      if (row) setData({ ...empty, ...row, horizon_logos: (row.horizon_logos as any) || [] });
    }
  };

  const addLogo = () =>
    setData({ ...data, horizon_logos: [...data.horizon_logos, { name: "", url: "" }] });
  const updateLogo = (i: number, k: "name" | "url", v: string) => {
    const arr = [...data.horizon_logos];
    arr[i] = { ...arr[i], [k]: v };
    setData({ ...data, horizon_logos: arr });
  };
  const removeLogo = (i: number) =>
    setData({ ...data, horizon_logos: data.horizon_logos.filter((_, x) => x !== i) });

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Branding</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Logo, banner promozionale, header e linea di rassicurazione.
          </p>
        </div>
        <Button onClick={save} disabled={saving} className="rounded-full">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Salva tutto
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Identità</CardTitle>
          <CardDescription>Nome del sito, logo e favicon</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Nome store</Label>
              <Input value={data.store_name} onChange={(e) => setData({ ...data, store_name: e.target.value })} />
            </div>
            <div>
              <Label>Tagline header (opzionale)</Label>
              <Input value={data.header_tagline || ""} onChange={(e) => setData({ ...data, header_tagline: e.target.value })} />
            </div>
            <div>
              <Label>Logo (chiaro)</Label>
              <div className="flex items-center gap-2 mt-1">
                <AssetUploader
                  value={data.logo_url}
                  onChange={(url) => setData({ ...data, logo_url: url })}
                  folder="logo"
                  preview="light"
                />
                <Input
                  value={data.logo_url || ""}
                  onChange={(e) => setData({ ...data, logo_url: e.target.value })}
                  placeholder="…oppure incolla URL"
                  className="flex-1"
                />
              </div>
            </div>
            <div>
              <Label>Logo (scuro)</Label>
              <div className="flex items-center gap-2 mt-1">
                <AssetUploader
                  value={data.logo_dark_url}
                  onChange={(url) => setData({ ...data, logo_dark_url: url })}
                  folder="logo"
                  preview="dark"
                />
                <Input
                  value={data.logo_dark_url || ""}
                  onChange={(e) => setData({ ...data, logo_dark_url: e.target.value })}
                  placeholder="…oppure incolla URL"
                  className="flex-1"
                />
              </div>
            </div>
            <div>
              <Label>Favicon URL</Label>
              <Input value={data.favicon_url || ""} onChange={(e) => setData({ ...data, favicon_url: e.target.value })} placeholder="https://.../favicon.ico" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Primary</Label>
                <Input type="color" value={data.primary_color || "#0a0a0a"} onChange={(e) => setData({ ...data, primary_color: e.target.value })} />
              </div>
              <div>
                <Label>Accent</Label>
                <Input type="color" value={data.accent_color || "#3b82f6"} onChange={(e) => setData({ ...data, accent_color: e.target.value })} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SEO Social — anteprima quando il negozio viene condiviso */}
      <Card>
        <CardHeader>
          <CardTitle>Anteprima social (Open Graph)</CardTitle>
          <CardDescription>
            Cosa appare quando il link del negozio viene condiviso (WhatsApp, Facebook, Twitter…).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Titolo condivisione (OG title)</Label>
              <Input value={data.og_title || ""} onChange={(e) => setData({ ...data, og_title: e.target.value })} maxLength={70} placeholder={data.store_name} />
              <p className="text-right text-[10px] text-muted-foreground mt-0.5">{(data.og_title || "").length}/70</p>
            </div>
            <div>
              <Label>Twitter handle (opzionale)</Label>
              <Input value={data.twitter_handle || ""} onChange={(e) => setData({ ...data, twitter_handle: e.target.value })} placeholder="@nomestore" />
            </div>
            <div className="md:col-span-2">
              <Label>Descrizione condivisione (OG description)</Label>
              <Textarea rows={2} maxLength={200} value={data.og_description || ""} onChange={(e) => setData({ ...data, og_description: e.target.value })} placeholder="Frase di vendita breve, max 200 caratteri" />
              <p className="text-right text-[10px] text-muted-foreground mt-0.5">{(data.og_description || "").length}/200</p>
            </div>
            <div className="md:col-span-2">
              <Label>Immagine condivisione (OG image — 1200×630)</Label>
              <div className="flex items-center gap-2 mt-1">
                <AssetUploader value={data.og_image_url} onChange={(url) => setData({ ...data, og_image_url: url })} folder="logo" preview="light" />
                <Input value={data.og_image_url || ""} onChange={(e) => setData({ ...data, og_image_url: e.target.value })} placeholder="…oppure incolla URL" className="flex-1" />
              </div>
            </div>
            <div className="md:col-span-2">
              <Label>Slogan default prodotti</Label>
              <Input value={data.default_product_tagline || ""} onChange={(e) => setData({ ...data, default_product_tagline: e.target.value })} placeholder="es. Spedizione gratuita 24h · Garanzia 2 anni" />
              <p className="text-[10px] text-muted-foreground mt-0.5">Usato sotto il nome del prodotto quando manca un sottotitolo specifico.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Top banner</CardTitle>
            <CardDescription>Striscia promozionale sopra l'header</CardDescription>
          </div>
          <Switch checked={data.top_banner_enabled} onCheckedChange={(v) => setData({ ...data, top_banner_enabled: v })} />
        </CardHeader>
        {data.top_banner_enabled && (
          <CardContent className="space-y-4">
            <div>
              <Label>Testo</Label>
              <Input value={data.top_banner_text || ""} onChange={(e) => setData({ ...data, top_banner_text: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Link (opzionale)</Label>
                <Input value={data.top_banner_link || ""} onChange={(e) => setData({ ...data, top_banner_link: e.target.value })} placeholder="/shop o https://..." />
              </div>
              <div>
                <Label>Sfondo</Label>
                <Input type="color" value={data.top_banner_bg || "#0a0a0a"} onChange={(e) => setData({ ...data, top_banner_bg: e.target.value })} />
              </div>
              <div>
                <Label>Testo</Label>
                <Input type="color" value={data.top_banner_fg || "#ffffff"} onChange={(e) => setData({ ...data, top_banner_fg: e.target.value })} />
              </div>
            </div>
            <div
              className="rounded-md text-center py-2 text-sm font-medium"
              style={{ background: data.top_banner_bg || "#000", color: data.top_banner_fg || "#fff" }}
            >
              {data.top_banner_text || "Anteprima banner"}
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Linea Horizon</CardTitle>
            <CardDescription>Strip di rassicurazione (testo + loghi/icone)</CardDescription>
          </div>
          <Switch checked={data.horizon_enabled} onCheckedChange={(v) => setData({ ...data, horizon_enabled: v })} />
        </CardHeader>
        {data.horizon_enabled && (
          <CardContent className="space-y-4">
            <div>
              <Label>Testo principale</Label>
              <Textarea rows={2} value={data.horizon_text || ""} onChange={(e) => setData({ ...data, horizon_text: e.target.value })} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <Label>Loghi/Badge</Label>
              <Button size="sm" variant="outline" onClick={addLogo}>
                <Plus className="h-3 w-3 mr-1" /> Aggiungi
              </Button>
            </div>
            <div className="space-y-2">
              {data.horizon_logos.map((l, i) => (
                <div key={i} className="flex items-center gap-2 p-2 border rounded-md">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Nome (es. Visa)" value={l.name} onChange={(e) => updateLogo(i, "name", e.target.value)} className="flex-1" />
                  <Input placeholder="URL immagine" value={l.url} onChange={(e) => updateLogo(i, "url", e.target.value)} className="flex-[2]" />
                  {l.url && <img src={l.url} alt={l.name} className="h-6 w-auto object-contain" />}
                  <Button variant="ghost" size="icon" onClick={() => removeLogo(i)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              {data.horizon_logos.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">Nessun logo aggiunto</p>
              )}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
