import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, ExternalLink, Plus, Trash2, Send } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  productId: string;
  onSaved?: () => void;
}

interface Variant {
  label: string;
  price?: number;
  compare_price?: number;
  shopify_variant_id?: string | number;
  type?: "text" | "color" | "image";
  color?: string;
  image?: string;
  available?: boolean;
}

interface QuantityBreak {
  qty: number;
  discount_percent: number;
  label?: string;
  badge?: string;
}

interface EditableProduct {
  id: string;
  name: string;
  subtitle: string | null;
  description_short: string | null;
  description_long: string | null;
  price: number;
  compare_price: number | null;
  status: string;
  variants: Variant[];
  quantity_breaks: QuantityBreak[];
  shopify_target_stores: string[];
}

interface StoreOption {
  id: string;
  shop_domain: string;
  display_name: string | null;
}

export function AdminProductEditDrawer({ open, onOpenChange, productId, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [p, setP] = useState<EditableProduct | null>(null);
  const [stores, setStores] = useState<StoreOption[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [{ data }, { data: storeRows }] = await Promise.all([
        supabase
          .from("products")
          .select("id, name, subtitle, description_short, description_long, price, compare_price, status, variants, quantity_breaks, shopify_target_stores")
          .eq("id", productId)
          .maybeSingle(),
        supabase
          .from("stores")
          .select("id, shop_domain, display_name")
          .eq("is_active", true)
          .order("sort_order", { ascending: true }),
      ]);
      if (cancelled || !data) return;
      setStores((storeRows as StoreOption[]) || []);
      setP({
        ...(data as any),
        variants: Array.isArray((data as any).variants) ? (data as any).variants : [],
        quantity_breaks: Array.isArray((data as any).quantity_breaks) ? (data as any).quantity_breaks : [],
        shopify_target_stores: Array.isArray((data as any).shopify_target_stores)
          ? ((data as any).shopify_target_stores as string[])
          : [],
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, productId]);

  async function save() {
    if (!p) return;
    setSaving(true);
    const { error } = await supabase
      .from("products")
      .update({
        name: p.name,
        subtitle: p.subtitle,
        description_short: p.description_short,
        description_long: p.description_long,
        price: p.price,
        compare_price: p.compare_price,
        status: p.status,
        variants: p.variants as any,
        quantity_breaks: p.quantity_breaks as any,
        shopify_target_stores: p.shopify_target_stores as any,
      })
      .eq("id", p.id);
    setSaving(false);
    if (error) { toast.error("Errore: " + error.message); return; }
    toast.success("Prodotto aggiornato");
    onSaved?.();
    onOpenChange(false);
  }

  function updateVariant(i: number, patch: Partial<Variant>) {
    if (!p) return;
    const variants = p.variants.slice();
    variants[i] = { ...variants[i], ...patch };
    setP({ ...p, variants });
  }
  function addVariant() {
    if (!p) return;
    setP({ ...p, variants: [...p.variants, { label: "Nuova variante", price: p.price, available: true }] });
  }
  function removeVariant(i: number) {
    if (!p) return;
    setP({ ...p, variants: p.variants.filter((_, idx) => idx !== i) });
  }

  function updateBreak(i: number, patch: Partial<QuantityBreak>) {
    if (!p) return;
    const quantity_breaks = p.quantity_breaks.slice();
    quantity_breaks[i] = { ...quantity_breaks[i], ...patch };
    setP({ ...p, quantity_breaks });
  }
  function addBreak() {
    if (!p) return;
    const lastQty = p.quantity_breaks.reduce((m, b) => Math.max(m, b.qty || 0), 1);
    setP({ ...p, quantity_breaks: [...p.quantity_breaks, { qty: lastQty + 1, discount_percent: 5 }] });
  }
  function removeBreak(i: number) {
    if (!p) return;
    setP({ ...p, quantity_breaks: p.quantity_breaks.filter((_, idx) => idx !== i) });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Modifica rapida</SheetTitle>
          <SheetDescription>Modifica nome, descrizioni, prezzi, varianti e quantity breaks senza lasciare la pagina.</SheetDescription>
        </SheetHeader>

        {loading || !p ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {/* Base */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Base</h3>
              <div>
                <Label>Nome</Label>
                <Input value={p.name || ""} onChange={(e) => setP({ ...p, name: e.target.value })} />
              </div>
              <div>
                <Label>Sottotitolo</Label>
                <Input value={p.subtitle || ""} onChange={(e) => setP({ ...p, subtitle: e.target.value })} />
              </div>
              <div>
                <Label>Descrizione breve</Label>
                <Textarea rows={2} value={p.description_short || ""} onChange={(e) => setP({ ...p, description_short: e.target.value })} />
              </div>
              <div>
                <Label>Descrizione lunga</Label>
                <Textarea rows={4} value={p.description_long || ""} onChange={(e) => setP({ ...p, description_long: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Prezzo</Label>
                  <Input type="number" step="0.01" value={p.price ?? 0}
                    onChange={(e) => setP({ ...p, price: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <Label>Prezzo confronto</Label>
                  <Input type="number" step="0.01" value={p.compare_price ?? ""}
                    onChange={(e) => setP({ ...p, compare_price: e.target.value ? parseFloat(e.target.value) : null })} />
                </div>
              </div>
              <div>
                <Label>Stato</Label>
                <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={p.status} onChange={(e) => setP({ ...p, status: e.target.value })}>
                  <option value="active">Attivo</option>
                  <option value="draft">Bozza</option>
                  <option value="archived">Archiviato</option>
                </select>
              </div>
            </section>

            {/* Store assegnati */}
            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold">Store assegnati ({p.shopify_target_stores.length})</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Se nessuno store è selezionato, il prodotto usa <strong>tutti</strong> gli store (rotazione standard).
                  Se selezioni uno o più store, la rotazione e il checkout useranno <strong>solo quelli</strong>.
                </p>
              </div>
              {stores.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nessuno store attivo configurato.</p>
              ) : (
                <div className="space-y-1.5 rounded-md border border-border/70 p-3">
                  {stores.map((s) => {
                    const checked = p.shopify_target_stores.includes(s.id);
                    return (
                      <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 hover:bg-muted/50">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...p.shopify_target_stores, s.id]
                              : p.shopify_target_stores.filter((id) => id !== s.id);
                            setP({ ...p, shopify_target_stores: next });
                          }}
                        />
                        <span className="text-sm">
                          {s.display_name || s.shop_domain}
                          <span className="ml-2 text-xs text-muted-foreground">{s.shop_domain}</span>
                        </span>
                      </label>
                    );
                  })}
                  {p.shopify_target_stores.length > 0 && (
                    <button
                      type="button"
                      className="mt-2 text-xs text-muted-foreground underline-offset-2 hover:underline"
                      onClick={() => setP({ ...p, shopify_target_stores: [] })}
                    >
                      Deseleziona tutti (usa tutti gli store)
                    </button>
                  )}
                </div>
              )}
            </section>

            {/* Varianti */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Varianti ({p.variants.length})</h3>
                <Button size="sm" variant="outline" onClick={addVariant}><Plus className="mr-1 h-3.5 w-3.5" />Aggiungi</Button>
              </div>
              {p.variants.length === 0 && <p className="text-xs text-muted-foreground">Nessuna variante.</p>}
              <div className="space-y-3">
                {p.variants.map((v, i) => (
                  <div key={i} className="rounded-md border border-border/70 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">#{i + 1}</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeVariant(i)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                    <div>
                      <Label className="text-xs">Etichetta</Label>
                      <Input value={v.label || ""} onChange={(e) => updateVariant(i, { label: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Prezzo</Label>
                        <Input type="number" step="0.01" value={v.price ?? ""}
                          onChange={(e) => updateVariant(i, { price: e.target.value ? parseFloat(e.target.value) : undefined })} />
                      </div>
                      <div>
                        <Label className="text-xs">Prezzo confronto</Label>
                        <Input type="number" step="0.01" value={v.compare_price ?? ""}
                          onChange={(e) => updateVariant(i, { compare_price: e.target.value ? parseFloat(e.target.value) : undefined })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Shopify variant ID</Label>
                        <Input value={v.shopify_variant_id?.toString() || ""}
                          onChange={(e) => updateVariant(i, { shopify_variant_id: e.target.value })} />
                      </div>
                      <div>
                        <Label className="text-xs">Disponibile</Label>
                        <select className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                          value={v.available === false ? "no" : "yes"}
                          onChange={(e) => updateVariant(i, { available: e.target.value === "yes" })}>
                          <option value="yes">Sì</option>
                          <option value="no">No</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Quantity Breaks */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Quantity breaks ({p.quantity_breaks.length})</h3>
                <Button size="sm" variant="outline" onClick={addBreak}><Plus className="mr-1 h-3.5 w-3.5" />Aggiungi</Button>
              </div>
              {p.quantity_breaks.length === 0 && <p className="text-xs text-muted-foreground">Nessun bundle.</p>}
              <div className="space-y-3">
                {p.quantity_breaks.map((b, i) => (
                  <div key={i} className="rounded-md border border-border/70 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Bundle #{i + 1}</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeBreak(i)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Quantità</Label>
                        <Input type="number" min={1} value={b.qty ?? 1}
                          onChange={(e) => updateBreak(i, { qty: parseInt(e.target.value) || 1 })} />
                      </div>
                      <div>
                        <Label className="text-xs">Sconto %</Label>
                        <Input type="number" min={0} max={100} value={b.discount_percent ?? 0}
                          onChange={(e) => updateBreak(i, { discount_percent: parseFloat(e.target.value) || 0 })} />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Etichetta</Label>
                      <Input value={b.label || ""} onChange={(e) => updateBreak(i, { label: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Badge</Label>
                      <Input value={b.badge || ""} onChange={(e) => updateBreak(i, { badge: e.target.value })} />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div className="sticky bottom-0 -mx-6 flex flex-wrap items-center gap-2 border-t border-border/60 bg-background/95 px-6 py-3 backdrop-blur">
              <Button onClick={save} disabled={saving} className="flex-1 min-w-[160px]">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salva modifiche
              </Button>
              <Button asChild variant="outline">
                <a href="/admin/products" target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-1.5 h-4 w-4" />
                  Editor completo
                </a>
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
