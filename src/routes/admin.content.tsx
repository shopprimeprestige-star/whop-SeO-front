import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  LayoutTemplate, Loader2, Save, Plus, Trash2, Home, PanelBottom,
  GripVertical, ChevronDown, Eye, EyeOff,
} from "lucide-react";
import { AssetUploader } from "@/components/admin/AssetUploader";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export const Route = createFileRoute("/admin/content")({
  component: ContentPage,
});

// ============= SECTION TYPES & FORMS =============

type SectionData = Record<string, unknown>;
interface HomeSection {
  id: string;
  section_key: string;
  enabled: boolean;
  sort_order: number;
  data: SectionData;
}

const SECTION_PRESETS: Array<{
  key: string;
  label: string;
  emoji: string;
  description: string;
  defaults: SectionData;
}> = [
  {
    key: "hero", label: "Hero", emoji: "🎯",
    description: "Banner principale con titolo, sottotitolo e CTA",
    defaults: { title: "Benvenuto", subtitle: "Il nostro store premium", cta_text: "Acquista ora", cta_link: "/shop", image_url: "" },
  },
  {
    key: "features", label: "Vantaggi", emoji: "✨",
    description: "Griglia di 3-4 vantaggi con icona",
    defaults: { title: "Perché sceglierci", items: [{ icon: "🚚", title: "Spedizione veloce", text: "In 24-48h" }] },
  },
  {
    key: "best_sellers", label: "Best sellers", emoji: "🔥",
    description: "Carosello prodotti più venduti",
    defaults: { title: "I più venduti", limit: 4 },
  },
  {
    key: "testimonials", label: "Recensioni", emoji: "💬",
    description: "Slider di recensioni clienti",
    defaults: { title: "I clienti dicono", items: [{ name: "Mario R.", text: "Ottimo!", rating: 5 }] },
  },
  {
    key: "faq", label: "FAQ", emoji: "❓",
    description: "Domande frequenti a fisarmonica",
    defaults: { title: "Domande frequenti", items: [{ q: "Spedite all'estero?", a: "Sì, in tutta Europa." }] },
  },
  {
    key: "newsletter", label: "Newsletter", emoji: "📧",
    description: "Banda CTA newsletter",
    defaults: { title: "Iscriviti", subtitle: "Sconti esclusivi" },
  },
];

function getPreset(key: string) {
  return SECTION_PRESETS.find((p) => p.key === key);
}

// ============= MAIN PAGE =============

function ContentPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Home &amp; Footer</h1>
        <p className="mt-1 text-sm text-muted-foreground">Costruisci home e footer trascinando i blocchi, senza codice.</p>
      </div>

      <Tabs defaultValue="home">
        <TabsList className="inline-flex rounded-full bg-muted/60 p-1">
          <TabsTrigger value="home" className="rounded-full px-4 data-[state=active]:bg-background data-[state=active]:shadow-sm"><Home className="mr-1.5 h-3.5 w-3.5" /> Home</TabsTrigger>
          <TabsTrigger value="footer" className="rounded-full px-4 data-[state=active]:bg-background data-[state=active]:shadow-sm"><PanelBottom className="mr-1.5 h-3.5 w-3.5" /> Footer</TabsTrigger>
        </TabsList>
        <TabsContent value="home" className="mt-5"><HomeBuilder /></TabsContent>
        <TabsContent value="footer" className="mt-5"><FooterBuilder /></TabsContent>
      </Tabs>
    </div>
  );
}

// ============= HOME BUILDER (with drag & drop) =============

function HomeBuilder() {
  const [sections, setSections] = useState<HomeSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = async () => {
    const { data } = await supabase.from("home_sections").select("*").order("sort_order");
    setSections((data as HomeSection[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const addPreset = async (preset: typeof SECTION_PRESETS[0]) => {
    const sort_order = sections.length;
    const { data } = await supabase
      .from("home_sections")
      .insert([{ section_key: preset.key, data: preset.defaults as never, sort_order, enabled: true }])
      .select()
      .maybeSingle();
    toast.success(`${preset.label} aggiunta`);
    if (data) setEditingId((data as HomeSection).id);
    load();
  };

  const toggle = async (s: HomeSection) => {
    await supabase.from("home_sections").update({ enabled: !s.enabled }).eq("id", s.id);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Eliminare questa sezione?")) return;
    await supabase.from("home_sections").delete().eq("id", id);
    if (editingId === id) setEditingId(null);
    load();
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = sections.findIndex((s) => s.id === active.id);
    const newIndex = sections.findIndex((s) => s.id === over.id);
    const reordered = arrayMove(sections, oldIndex, newIndex);
    setSections(reordered); // optimistic
    await Promise.all(
      reordered.map((s, i) =>
        supabase.from("home_sections").update({ sort_order: i }).eq("id", s.id),
      ),
    );
  };

  const updateData = async (id: string, newData: SectionData) => {
    await supabase.from("home_sections").update({ data: newData as never }).eq("id", id);
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, data: newData } : s)));
    toast.success("Salvato");
  };

  if (loading) return <Loader2 className="h-6 w-6 animate-spin mx-auto mt-12" />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aggiungi sezione</CardTitle>
          <CardDescription>Scegli un blocco da inserire alla fine della home</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {SECTION_PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => addPreset(p)}
                className="text-left rounded-lg border p-3 hover:border-primary hover:bg-primary/5 transition"
              >
                <div className="text-2xl mb-1">{p.emoji}</div>
                <div className="font-semibold text-sm">{p.label}</div>
                <div className="text-xs text-muted-foreground">{p.description}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sezioni in pagina</CardTitle>
          <CardDescription>Trascina dall'icona ⋮⋮ per riordinare</CardDescription>
        </CardHeader>
        <CardContent>
          {sections.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nessuna sezione ancora.</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {sections.map((s) => (
                    <SortableSectionRow
                      key={s.id}
                      section={s}
                      isEditing={editingId === s.id}
                      onEdit={() => setEditingId(editingId === s.id ? null : s.id)}
                      onToggle={() => toggle(s)}
                      onRemove={() => remove(s.id)}
                      onSave={(d) => updateData(s.id, d)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SortableSectionRow({
  section, isEditing, onEdit, onToggle, onRemove, onSave,
}: {
  section: HomeSection;
  isEditing: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onRemove: () => void;
  onSave: (data: SectionData) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const preset = getPreset(section.section_key);

  return (
    <div ref={setNodeRef} style={style} className="border rounded-lg overflow-hidden bg-card">
      <div className="flex items-center gap-2 p-3">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none p-1 hover:bg-muted rounded">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
        <span className="text-xl">{preset?.emoji || "📦"}</span>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{preset?.label || section.section_key}</div>
          <div className="text-xs text-muted-foreground">{section.enabled ? "Visibile" : "Nascosta"}</div>
        </div>
        <button onClick={onToggle} className="p-2 hover:bg-muted rounded" title={section.enabled ? "Nascondi" : "Mostra"}>
          {section.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
        </button>
        <button onClick={onEdit} className="text-xs text-primary hover:underline px-2">
          {isEditing ? "Chiudi" : "Modifica"}
          <ChevronDown className={`inline-block h-3 w-3 ml-1 transition-transform ${isEditing ? "rotate-180" : ""}`} />
        </button>
        <button onClick={onRemove} className="p-2 hover:bg-destructive/10 rounded">
          <Trash2 className="h-4 w-4 text-destructive" />
        </button>
      </div>
      {isEditing && (
        <div className="border-t bg-muted/30 p-4">
          <SectionForm sectionKey={section.section_key} data={section.data} onSave={onSave} />
        </div>
      )}
    </div>
  );
}

// ============= PER-SECTION FORM =============

function SectionForm({
  sectionKey, data, onSave,
}: { sectionKey: string; data: SectionData; onSave: (d: SectionData) => void }) {
  const [d, setD] = useState<SectionData>(data);

  const setField = (k: string, v: unknown) => setD({ ...d, [k]: v });

  const renderItems = (key: string, fields: { key: string; label: string; placeholder?: string }[]) => {
    const items = (d[key] as Array<Record<string, unknown>>) || [];
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>{key}</Label>
          <Button type="button" size="sm" variant="outline" onClick={() => setD({ ...d, [key]: [...items, {}] })}>
            <Plus className="h-3 w-3 mr-1" /> Aggiungi
          </Button>
        </div>
        {items.map((it, i) => (
          <div key={i} className="grid gap-2 p-2 border rounded">
            {fields.map((f) => (
              <Input
                key={f.key}
                placeholder={f.placeholder || f.label}
                value={(it[f.key] as string) || ""}
                onChange={(e) => {
                  const arr = [...items];
                  arr[i] = { ...arr[i], [f.key]: e.target.value };
                  setD({ ...d, [key]: arr });
                }}
              />
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setD({ ...d, [key]: items.filter((_, x) => x !== i) })}
              className="text-destructive justify-self-end"
            >
              <Trash2 className="h-3 w-3 mr-1" /> Rimuovi
            </Button>
          </div>
        ))}
      </div>
    );
  };

  let body: React.ReactNode = null;
  switch (sectionKey) {
    case "hero":
      body = (
        <>
          <Field label="Titolo"><Input value={(d.title as string) || ""} onChange={(e) => setField("title", e.target.value)} /></Field>
          <Field label="Sottotitolo"><Input value={(d.subtitle as string) || ""} onChange={(e) => setField("subtitle", e.target.value)} /></Field>
          <Field label="Testo CTA"><Input value={(d.cta_text as string) || ""} onChange={(e) => setField("cta_text", e.target.value)} /></Field>
          <Field label="Link CTA"><Input value={(d.cta_link as string) || ""} onChange={(e) => setField("cta_link", e.target.value)} placeholder="/shop" /></Field>
          <Field label="Immagine sfondo (URL)"><Input value={(d.image_url as string) || ""} onChange={(e) => setField("image_url", e.target.value)} placeholder="https://..." /></Field>
        </>
      );
      break;
    case "features":
      body = (
        <>
          <Field label="Titolo sezione"><Input value={(d.title as string) || ""} onChange={(e) => setField("title", e.target.value)} /></Field>
          {renderItems("items", [
            { key: "icon", label: "Icona/Emoji", placeholder: "🚚" },
            { key: "title", label: "Titolo" },
            { key: "text", label: "Descrizione" },
          ])}
        </>
      );
      break;
    case "best_sellers":
      body = (
        <>
          <Field label="Titolo"><Input value={(d.title as string) || ""} onChange={(e) => setField("title", e.target.value)} /></Field>
          <Field label="Numero prodotti"><Input type="number" min={2} max={12} value={(d.limit as number) || 4} onChange={(e) => setField("limit", Number(e.target.value))} /></Field>
        </>
      );
      break;
    case "testimonials":
      body = (
        <>
          <Field label="Titolo"><Input value={(d.title as string) || ""} onChange={(e) => setField("title", e.target.value)} /></Field>
          {renderItems("items", [
            { key: "name", label: "Nome cliente" },
            { key: "text", label: "Testo recensione" },
            { key: "rating", label: "Voto (1-5)", placeholder: "5" },
          ])}
        </>
      );
      break;
    case "faq":
      body = (
        <>
          <Field label="Titolo"><Input value={(d.title as string) || ""} onChange={(e) => setField("title", e.target.value)} /></Field>
          {renderItems("items", [
            { key: "q", label: "Domanda" },
            { key: "a", label: "Risposta" },
          ])}
        </>
      );
      break;
    case "newsletter":
      body = (
        <>
          <Field label="Titolo"><Input value={(d.title as string) || ""} onChange={(e) => setField("title", e.target.value)} /></Field>
          <Field label="Sottotitolo"><Input value={(d.subtitle as string) || ""} onChange={(e) => setField("subtitle", e.target.value)} /></Field>
        </>
      );
      break;
    default:
      body = (
        <Textarea
          rows={10}
          className="font-mono text-xs"
          value={JSON.stringify(d, null, 2)}
          onChange={(e) => { try { setD(JSON.parse(e.target.value)); } catch { /* ignore */ } }}
        />
      );
  }

  return (
    <div className="space-y-3">
      {body}
      <Button onClick={() => onSave(d)} size="sm"><Save className="h-3 w-3 mr-1" /> Salva sezione</Button>
    </div>
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

// ============= FOOTER BUILDER =============

interface FooterRow {
  id?: string;
  links?: Array<{ label?: string; url?: string }>;
  badges?: Array<{ name?: string; url?: string }>;
  payment_methods?: Array<{ name?: string; url?: string }>;
  payment_methods_custom?: Array<{ name?: string; src?: string }>;
  couriers_custom?: Array<{ name?: string; src?: string }>;
  shipped_with_logos?: Array<{ name?: string; src?: string }>;
  certifications?: Array<{ name?: string; description?: string }>;
  newsletter_enabled?: boolean;
  newsletter_title?: string | null;
  newsletter_subtitle?: string | null;
  copyright_text?: string | null;
  footer_description?: string | null;
  courier_logo_height_mobile?: number | null;
  courier_logo_height_desktop?: number | null;
}

function FooterBuilder() {
  const [data, setData] = useState<FooterRow>({ links: [], badges: [], payment_methods: [], payment_methods_custom: [], couriers_custom: [], certifications: [], newsletter_enabled: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: row } = await supabase.from("footer_config").select("*").maybeSingle();
      if (row) setData(row as FooterRow);
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const { error } = data.id
      ? await supabase.from("footer_config").update(data).eq("id", data.id)
      : await supabase.from("footer_config").insert(data);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Footer salvato");
  };

  if (loading) return <Loader2 className="h-6 w-6 animate-spin mx-auto mt-12" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configurazione Footer</CardTitle>
        <CardDescription>Link, badge sicurezza, pagamenti, newsletter</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Field label="Testo copyright">
          <Input value={data.copyright_text || ""} onChange={(e) => setData({ ...data, copyright_text: e.target.value })} placeholder="© 2025 My Store" />
        </Field>

        <Field label="Descrizione sotto al logo (footer)">
          <Textarea
            rows={3}
            value={data.footer_description || ""}
            onChange={(e) => setData({ ...data, footer_description: e.target.value })}
            placeholder="Es. Northbyte è il tuo store premium per elettronica e mobilità di nuova generazione."
          />
        </Field>

        <div className="flex items-center gap-2">
          <Switch checked={data.newsletter_enabled} onCheckedChange={(v) => setData({ ...data, newsletter_enabled: v })} />
          <Label>Mostra blocco newsletter</Label>
        </div>
        {data.newsletter_enabled && (
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Titolo newsletter" value={data.newsletter_title || ""} onChange={(e) => setData({ ...data, newsletter_title: e.target.value })} />
            <Input placeholder="Sottotitolo" value={data.newsletter_subtitle || ""} onChange={(e) => setData({ ...data, newsletter_subtitle: e.target.value })} />
          </div>
        )}

        <SortableList
          label="Link footer"
          items={data.links || []}
          fields={[{ key: "label", placeholder: "Etichetta" }, { key: "url", placeholder: "/chi-siamo" }]}
          onChange={(arr) => setData({ ...data, links: arr })}
        />

        <SortableList
          label="Badge sicurezza"
          items={data.badges || []}
          fields={[{ key: "name", placeholder: "Nome (es. SSL)" }, { key: "url", placeholder: "URL logo" }]}
          onChange={(arr) => setData({ ...data, badges: arr })}
        />

        <SortableList
          label="Metodi di pagamento (legacy)"
          items={data.payment_methods || []}
          fields={[{ key: "name", placeholder: "Visa" }, { key: "url", placeholder: "URL logo (opzionale)" }]}
          onChange={(arr) => setData({ ...data, payment_methods: arr })}
        />

        <SortableList
          label="🆕 Loghi pagamento custom (sostituisce default footer)"
          items={(data.payment_methods_custom as any) || []}
          fields={[{ key: "name", placeholder: "Visa" }, { key: "src", placeholder: "https://… URL immagine logo" }]}
          onChange={(arr) => setData({ ...data, payment_methods_custom: arr as any })}
        />

        <SortableList
          label="🚚 Shipped with — Loghi corrieri (max 3 consigliati • PNG/WebP/SVG • DHL/UPS/FedEx default se vuoto)"
          items={(data.shipped_with_logos as any) || []}
          fields={[{ key: "name", placeholder: "DHL" }, { key: "src", placeholder: "URL logo (PNG/WebP/SVG)" }]}
          onChange={(arr) => setData({ ...data, shipped_with_logos: arr as any })}
        />

        <SortableList
          label="🚚 Corrieri (legacy — usato se 'Shipped with' è vuoto)"
          items={(data.couriers_custom as any) || []}
          fields={[{ key: "name", placeholder: "DHL" }, { key: "src", placeholder: "URL logo" }]}
          onChange={(arr) => setData({ ...data, couriers_custom: arr as any })}
        />

        <div className="grid grid-cols-2 gap-3">
          <Field label="Altezza loghi corrieri MOBILE (px)">
            <Input
              type="number"
              min={12}
              max={96}
              value={data.courier_logo_height_mobile ?? 32}
              onChange={(e) => setData({ ...data, courier_logo_height_mobile: e.target.value === "" ? null : Number(e.target.value) })}
              placeholder="32"
            />
          </Field>
          <Field label="Altezza loghi corrieri DESKTOP (px)">
            <Input
              type="number"
              min={12}
              max={64}
              value={data.courier_logo_height_desktop ?? 24}
              onChange={(e) => setData({ ...data, courier_logo_height_desktop: e.target.value === "" ? null : Number(e.target.value) })}
              placeholder="24"
            />
          </Field>
        </div>

        <SortableList
          label="🏅 Certificazioni (CE, RoHS, WEEE…)"
          items={(data.certifications as any) || []}
          fields={[{ key: "name", placeholder: "CE" }, { key: "description", placeholder: "Conformità Europea" }]}
          onChange={(arr) => setData({ ...data, certifications: arr as any })}
        />

        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Salva footer
        </Button>
      </CardContent>
    </Card>
  );
}

function SortableList({
  label, items, fields, onChange,
}: {
  label: string;
  items: Array<Record<string, unknown>>;
  fields: Array<{ key: string; placeholder: string }>;
  onChange: (items: Array<Record<string, unknown>>) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const ids = items.map((_, i) => `${label}-${i}`);
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    onChange(arrayMove(items, oldIndex, newIndex));
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...items, {}])}>
          <Plus className="h-3 w-3 mr-1" /> Aggiungi
        </Button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {items.map((item, i) => (
            <SortableListRow
              key={ids[i]}
              id={ids[i]}
              item={item}
              fields={fields}
              onChange={(v) => {
                const arr = [...items]; arr[i] = v; onChange(arr);
              }}
              onRemove={() => onChange(items.filter((_, x) => x !== i))}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableListRow({
  id, item, fields, onChange, onRemove,
}: {
  id: string;
  item: Record<string, unknown>;
  fields: Array<{ key: string; placeholder: string }>;
  onChange: (v: Record<string, unknown>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="flex gap-2 items-center bg-card border rounded p-2 flex-wrap">
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>
      {fields.map((f) => {
        const isImageField = f.key === "src" || f.key === "url";
        return (
          <div key={f.key} className={isImageField ? "flex items-center gap-2 flex-1 min-w-[260px]" : "flex-1 min-w-[120px]"}>
            {isImageField && (
              <AssetUploader
                value={(item[f.key] as string) || ""}
                onChange={(url) => onChange({ ...item, [f.key]: url })}
                folder="payment"
                preview="light"
              />
            )}
            <Input
              placeholder={f.placeholder}
              value={(item[f.key] as string) || ""}
              onChange={(e) => onChange({ ...item, [f.key]: e.target.value })}
              className={isImageField ? "flex-1" : ""}
            />
          </div>
        );
      })}
      <Button variant="ghost" size="icon" onClick={onRemove}>
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}
