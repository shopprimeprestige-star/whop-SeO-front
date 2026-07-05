import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/ab-tests")({
  component: AbTestsPage,
});

interface AbTest {
  id: string;
  name: string;
  product_id: string | null;
  variant_a: any;
  variant_b: any;
  traffic_split: number;
  is_active: boolean;
  impressions_a: number;
  impressions_b: number;
  checkouts_a: number;
  checkouts_b: number;
  conversions_a: number;
  conversions_b: number;
  revenue_a: number;
  revenue_b: number;
  winner: string | null;
  confidence_level: number;
}

interface ProductLite {
  id: string;
  name: string;
  slug: string;
}

interface EventRow {
  ab_test_id: string;
  variant: string;
  event_type: string;
  value: number | null;
}

// z = (p1-p2) / sqrt(p*(1-p)*(1/n1+1/n2))
function confidence(a_imp: number, a_conv: number, b_imp: number, b_conv: number) {
  if (a_imp < 30 || b_imp < 30) return 0;
  const p1 = a_conv / a_imp;
  const p2 = b_conv / b_imp;
  const p = (a_conv + b_conv) / (a_imp + b_imp);
  const se = Math.sqrt(p * (1 - p) * (1 / a_imp + 1 / b_imp));
  if (se === 0) return 0;
  const z = Math.abs((p1 - p2) / se);
  // approx normal CDF
  const t = 1 / (1 + 0.2316419 * z);
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const cdf = 1 - d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return Math.round(cdf * 1000) / 10;
}

function AbTestsPage() {
  const [tests, setTests] = useState<AbTest[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AbTest | null>(null);

  async function load() {
    const [t, p, e] = await Promise.all([
      supabase.from("ab_tests").select("*").order("created_at", { ascending: false }),
      supabase.from("products").select("id,name,slug").order("name"),
      supabase.from("ab_test_events").select("ab_test_id,variant,event_type,value"),
    ]);
    setTests((t.data as AbTest[]) || []);
    setProducts((p.data as ProductLite[]) || []);
    setEvents((e.data as EventRow[]) || []);
  }
  useEffect(() => {
    load();
  }, []);

  // Aggregate live counts from ab_test_events
  const stats = useMemo(() => {
    const m: Record<string, { impA: number; impB: number; convA: number; convB: number; revA: number; revB: number }> = {};
    for (const ev of events) {
      const k = ev.ab_test_id;
      m[k] ??= { impA: 0, impB: 0, convA: 0, convB: 0, revA: 0, revB: 0 };
      const isA = ev.variant === "A";
      if (ev.event_type === "impression") isA ? m[k].impA++ : m[k].impB++;
      if (ev.event_type === "checkout" || ev.event_type === "conversion") {
        isA ? m[k].convA++ : m[k].convB++;
        if (ev.value) (isA ? (m[k].revA += Number(ev.value)) : (m[k].revB += Number(ev.value)));
      }
    }
    return m;
  }, [events]);

  async function toggleActive(t: AbTest) {
    await supabase.from("ab_tests").update({ is_active: !t.is_active }).eq("id", t.id);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">A/B Test</h1>
          <p className="text-muted-foreground">
            Crea split test sui prodotti. Le metriche sono live da <code>ab_test_events</code>.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Nuovo test
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{tests.length} test</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Prodotto</TableHead>
                <TableHead>Split</TableHead>
                <TableHead>A: imp / conv</TableHead>
                <TableHead>B: imp / conv</TableHead>
                <TableHead>CVR A → B</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tests.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center text-muted-foreground">
                    Nessun test. Creane uno e collegalo a un prodotto.
                  </TableCell>
                </TableRow>
              )}
              {tests.map((t) => {
                const s = stats[t.id] || { impA: 0, impB: 0, convA: 0, convB: 0, revA: 0, revB: 0 };
                const cvrA = s.impA ? (s.convA / s.impA) * 100 : 0;
                const cvrB = s.impB ? (s.convB / s.impB) * 100 : 0;
                const conf = confidence(s.impA, s.convA, s.impB, s.convB);
                const winner = conf >= 95 ? (cvrA > cvrB ? "A" : "B") : null;
                const product = products.find((p) => p.id === t.product_id);
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>
                      {product ? (
                        <Link to="/{-$locale}/p/$slug" params={{ slug: product.slug } as any} className="text-primary underline">
                          {product.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{t.traffic_split}/{100 - t.traffic_split}</TableCell>
                    <TableCell className="font-mono text-xs">{s.impA} / {s.convA}</TableCell>
                    <TableCell className="font-mono text-xs">{s.impB} / {s.convB}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {cvrA.toFixed(1)}% → {cvrB.toFixed(1)}%
                    </TableCell>
                    <TableCell>
                      <Badge variant={conf >= 95 ? "default" : "secondary"}>{conf}%</Badge>
                      {winner && <Badge className="ml-1" variant="default">Win {winner}</Badge>}
                    </TableCell>
                    <TableCell>
                      <Switch checked={t.is_active} onCheckedChange={() => toggleActive(t)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(t); setOpen(true); }}>
                        Modifica
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? "Modifica test" : "Nuovo test"}</SheetTitle>
          </SheetHeader>
          <AbTestForm
            test={editing}
            products={products}
            onSaved={() => { setOpen(false); load(); }}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function AbTestForm({
  test,
  products,
  onSaved,
}: {
  test: AbTest | null;
  products: ProductLite[];
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: test?.name || "",
    product_id: test?.product_id || "",
    traffic_split: test?.traffic_split ?? 50,
    is_active: test?.is_active ?? true,
    a_name: (test?.variant_a as any)?.name || "",
    a_cta: (test?.variant_a as any)?.cta_label || "",
    a_short: (test?.variant_a as any)?.short || "",
    a_hero: (test?.variant_a as any)?.hero_image || "",
    a_badge: (test?.variant_a as any)?.badge || "",
    b_name: (test?.variant_b as any)?.name || "",
    b_cta: (test?.variant_b as any)?.cta_label || "",
    b_short: (test?.variant_b as any)?.short || "",
    b_hero: (test?.variant_b as any)?.hero_image || "",
    b_badge: (test?.variant_b as any)?.badge || "",
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.name || !form.product_id) {
      toast.error("Nome e prodotto richiesti");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        product_id: form.product_id,
        traffic_split: Number(form.traffic_split),
        is_active: form.is_active,
        variant_a: {
          name: form.a_name || null,
          cta_label: form.a_cta || null,
          short: form.a_short || null,
          hero_image: form.a_hero || null,
          badge: form.a_badge || null,
        },
        variant_b: {
          name: form.b_name || null,
          cta_label: form.b_cta || null,
          short: form.b_short || null,
          hero_image: form.b_hero || null,
          badge: form.b_badge || null,
        },
      };
      let testId = test?.id;
      if (test) {
        await supabase.from("ab_tests").update(payload as any).eq("id", test.id);
      } else {
        const { data } = await supabase.from("ab_tests").insert(payload as any).select("id").single();
        testId = (data as any)?.id;
      }
      // Link product to ab_test
      if (testId) {
        await supabase.from("products").update({ ab_test_id: testId }).eq("id", form.product_id);
      }
      toast.success("Test salvato");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="space-y-2">
        <Label>Nome test</Label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Prodotto</Label>
          <Select
            value={form.product_id || "none"}
            onValueChange={(v) => setForm({ ...form, product_id: v === "none" ? "" : v })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Seleziona —</SelectItem>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Traffico A (%)</Label>
          <Input
            type="number"
            min={0}
            max={100}
            value={form.traffic_split}
            onChange={(e) => setForm({ ...form, traffic_split: Number(e.target.value) })}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
        <Label>Test attivo</Label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {(["a", "b"] as const).map((k) => (
          <Card key={k}>
            <CardHeader>
              <CardTitle className="text-base">Variante {k.toUpperCase()}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Input
                placeholder="Nome (override)"
                value={(form as any)[`${k}_name`]}
                onChange={(e) => setForm({ ...form, [`${k}_name`]: e.target.value } as any)}
              />
              <Input
                placeholder="CTA label"
                value={(form as any)[`${k}_cta`]}
                onChange={(e) => setForm({ ...form, [`${k}_cta`]: e.target.value } as any)}
              />
              <Textarea
                rows={2}
                placeholder="Descrizione breve"
                value={(form as any)[`${k}_short`]}
                onChange={(e) => setForm({ ...form, [`${k}_short`]: e.target.value } as any)}
              />
              <Input
                placeholder="Hero image URL"
                value={(form as any)[`${k}_hero`]}
                onChange={(e) => setForm({ ...form, [`${k}_hero`]: e.target.value } as any)}
              />
              <Input
                placeholder="Badge"
                value={(form as any)[`${k}_badge`]}
                onChange={(e) => setForm({ ...form, [`${k}_badge`]: e.target.value } as any)}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      <Button onClick={save} disabled={saving} className="w-full">
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Salva test
      </Button>
    </div>
  );
}
