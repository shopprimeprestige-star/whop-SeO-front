import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { callEdge } from "@/lib/edge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetDescription,
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
import { Plus, RefreshCw, Loader2, Search, Trash2, GripVertical, ExternalLink, Languages, Upload, Bold, Italic, List, ListOrdered, Eraser, Eye, FileSpreadsheet, Download } from "lucide-react";
import { uploadBrandAsset } from "@/lib/storage-upload";
import { SUPPORTED_LANGS } from "@/lib/i18n";
import { toast } from "sonner";
import { prdCodeFor } from "@/lib/prd-code";
import { Checkbox } from "@/components/ui/checkbox";
import { getTranslationFailures, getTranslationPlan, translateOneStep } from "@/lib/translate.functions";
import { useServerFn } from "@tanstack/react-start";

export const Route = createFileRoute("/admin/products")({
  component: ProductsPage,
});

interface Product {
  id: string;
  slug: string;
  name: string;
  price: number;
  compare_price: number | null;
  cost_price: number | null;
  status: string;
  shopify_handle: string;
  category_id: string | null;
  description_short: string | null;
  description_long: string | null;
  description_html?: string | null;
  subtitle?: string | null;
  trust_badge_text?: string | null;
  bullets?: { icon?: string; text: string }[] | null;
  image_fit?: string | null;
  images: string[];
  variants: any[];
  quantity_breaks: any[];
  tags: string[];
  sku: string | null;
  product_code: string | null;
  seo_title: string | null;
  seo_description: string | null;
  og_image: string | null;
  page_builder_data: Record<string, unknown> | null;
  shopify_title_override?: string | null;
  shopify_target_stores?: string[] | null;
  checkout_image_url?: string | null;
}

interface Category {
  id: string;
  name: string;
}

type TranslationFieldGroup = "titles" | "descriptions" | "variants" | "quantity_breaks";

const TRANSLATION_GROUPS: Array<{ id: TranslationFieldGroup; label: string; description: string }> = [
  { id: "titles", label: "Titoli prodotto", description: "name, sottotitolo, SEO title" },
  { id: "descriptions", label: "Descrizioni", description: "short, long, HTML, bullet, SEO description" },
  { id: "variants", label: "Varianti", description: "testi varianti prodotto" },
  { id: "quantity_breaks", label: "Quantity breaks", description: "label e badge bundle" },
];

type TranslationReport = {
  status: "completed" | "partial" | "stopped" | "empty";
  fieldGroups: TranslationFieldGroup[];
  durationSec: number;
  totalSteps: number;
  totalFields: number;
  doneFields: number;
  skippedFields: number;
  failedFields: number;
  languages: Record<string, { translated: number; skipped: number; failed: number }>;
  errors: Array<{ when: number; lang: string; entity: string; message: string; fields?: string[] }>;
};



function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stores, setStores] = useState<{ id: string; display_name: string | null; shop_domain: string }[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [regenerating, setRegenerating] = useState(false);
  const [translationJob, setTranslationJob] = useState<{
    active: boolean;
    startedAt: number;
    elapsed: number;
    totalSteps: number;
    doneSteps: number;
    totalFields: number;
    doneFields: number;
    skippedFields: number;
    failedFields: number;
    currentLang: string;
    currentEntityLabel: string;
    currentEntityType: string;
    currentFields: string[];
    lastError: string | null;
    errorsLog: Array<{ when: number; lang: string; entity: string; message: string; fields?: string[] }>;
  } | null>(null);
  const [geminiLogs, setGeminiLogs] = useState<any[]>([]);
  const [geminiOpen, setGeminiOpen] = useState(false);
  const [clearingLogs, setClearingLogs] = useState(false);
  const [translationFailures, setTranslationFailures] = useState<any[]>([]);
  const [translationReport, setTranslationReport] = useState<TranslationReport | null>(null);
  const cancelTranslationRef = useRef(false);
  const failuresFn = useServerFn(getTranslationFailures);
  const planFn = useServerFn(getTranslationPlan);
  const stepFn = useServerFn(translateOneStep);
  const [translatingProductId, setTranslatingProductId] = useState<string | null>(null);
  const [failuresOpen, setFailuresOpen] = useState(false);
  const [singleProgress, setSingleProgress] = useState<{
    productId: string;
    doneSteps: number;
    totalSteps: number;
    doneFields: number;
    failedFields: number;
    skippedFields: number;
    totalFields: number;
    currentLang: string;
    status: "translating" | "skipping" | "failing" | "done";
    statusText: string;
  } | null>(null);
  const [forceRetranslate, setForceRetranslate] = useState(false);

  // Lingue selezionate per traduzione (persistite in localStorage).
  // Le lingue NUOVE (non ancora viste in "known") vengono auto-aggiunte alla selezione,
  // così quando aggiungiamo nuove lingue al sistema non restano fuori dal piano.
  const ALL_TRANS_LANGS = SUPPORTED_LANGS.filter((l) => l.code !== "it");
  const [selectedLangs, setSelectedLangs] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set(ALL_TRANS_LANGS.map((l) => l.code));
    try {
      const raw = localStorage.getItem("lp_translate_langs");
      const knownRaw = localStorage.getItem("lp_translate_known_langs");
      const saved: string[] = raw ? (JSON.parse(raw) || []) : ALL_TRANS_LANGS.map((l) => l.code);
      const known: string[] = knownRaw ? (JSON.parse(knownRaw) || []) : [];
      const merged = new Set<string>(Array.isArray(saved) ? saved : []);
      // Per ogni lingua ATTUALE che non era ancora "conosciuta" dal client → auto-aggiungila
      for (const l of ALL_TRANS_LANGS) {
        if (!known.includes(l.code)) merged.add(l.code);
      }
      return merged;
    } catch {
      return new Set(ALL_TRANS_LANGS.map((l) => l.code));
    }
  });
  const lastLangClickRef = useRef<number | null>(null);
  useEffect(() => {
    try {
      localStorage.setItem("lp_translate_langs", JSON.stringify(Array.from(selectedLangs)));
      // Aggiorna l'elenco delle lingue "conosciute" dal client
      localStorage.setItem("lp_translate_known_langs", JSON.stringify(ALL_TRANS_LANGS.map((l) => l.code)));
    } catch {}
  }, [selectedLangs]);

  function toggleLang(idx: number, e: React.MouseEvent) {
    const code = ALL_TRANS_LANGS[idx].code;
    if (e.shiftKey && lastLangClickRef.current !== null) {
      const [a, b] = [lastLangClickRef.current, idx].sort((x, y) => x - y);
      const targetState = !selectedLangs.has(code);
      setSelectedLangs((prev) => {
        const n = new Set(prev);
        for (let i = a; i <= b; i++) {
          const c = ALL_TRANS_LANGS[i].code;
          if (targetState) n.add(c); else n.delete(c);
        }
        return n;
      });
    } else {
      setSelectedLangs((prev) => {
        const n = new Set(prev);
        if (n.has(code)) n.delete(code); else n.add(code);
        return n;
      });
    }
    lastLangClickRef.current = idx;
  }

  async function translateSingleProduct(p: Product, opts?: { force?: boolean }) {
    if (translatingProductId) return;
    const force = opts?.force ?? forceRetranslate;
    setTranslatingProductId(p.id);
    setSingleProgress({ productId: p.id, doneSteps: 0, totalSteps: 0, doneFields: 0, failedFields: 0, skippedFields: 0, totalFields: 0, currentLang: "", status: "translating", statusText: "Preparazione…" });
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const plan = await planFn({ data: { accessToken, force, entityIds: [p.id], langs: Array.from(selectedLangs) } });
      if (!plan.ok) {
        toast.error(plan.error || "Errore piano traduzioni");
        return;
      }
      const steps = plan.steps.filter((s) => s.entity_type === "product" && s.entity_id === p.id);
      if (steps.length === 0) {
        setSingleProgress((sp) => sp && { ...sp, status: "done", statusText: "Già tradotto in tutte le lingue — nessun campo modificato" });
        toast.success(`"${p.name}" già tradotto. Nessun campo da aggiornare.`);
        return;
      }
      const totalFields = steps.reduce((n, s) => n + s.count, 0);

      setSingleProgress({
        productId: p.id,
        doneSteps: 0,
        totalSteps: steps.length,
        doneFields: 0,
        failedFields: 0,
        skippedFields: 0,
        totalFields,
        currentLang: steps[0].lang,
        status: "translating",
        statusText: `Avvio ${steps[0].lang.toUpperCase()}…`,
      });
      toast.info(`Traduzione "${p.name}": ${totalFields} campi su ${steps.length} lingue...`);
      let done = 0, failed = 0, skipped = 0, doneSteps = 0;
      for (const step of steps) {
        setSingleProgress((sp) => sp && { ...sp, currentLang: step.lang, status: "translating", statusText: `Traducendo ${step.lang.toUpperCase()} (${step.count} campi)…` });
        try {
          const r = await stepFn({
            data: { accessToken, lang: step.lang, entity_type: step.entity_type, entity_id: step.entity_id, fields: step.fields, force },
          });
          done += r.translated || 0;
          failed += r.failed || 0;
          skipped += (r as any).skipped || 0;
          let status: "translating" | "skipping" | "failing" = "translating";
          let statusText = `${step.lang.toUpperCase()}: ${r.translated || 0} tradotti`;
          if (!r.ok || (r.failed || 0) > 0) {
            status = "failing";
            statusText = `${step.lang.toUpperCase()}: ${r.failed || 0} falliti${r.error ? " — " + r.error.slice(0, 80) : ""}`;
            if (r.error) toast.error(`${step.lang.toUpperCase()}: ${r.error.slice(0, 140)}`);
          } else if ((r.translated || 0) === 0 && ((r as any).skipped || 0) > 0) {
            status = "skipping";
            statusText = `${step.lang.toUpperCase()}: ${(r as any).skipped} saltati (già tradotti)`;
          }
          doneSteps += 1;
          setSingleProgress((sp) => sp && { ...sp, doneSteps, doneFields: done, failedFields: failed, skippedFields: skipped, status, statusText });
        } catch (e: any) {
          failed += step.count;
          doneSteps += 1;
          const msg = e?.message || "errore";
          toast.error(`${step.lang.toUpperCase()}: ${msg}`);
          setSingleProgress((sp) => sp && { ...sp, doneSteps, doneFields: done, failedFields: failed, skippedFields: skipped, status: "failing", statusText: `${step.lang.toUpperCase()}: ${msg.slice(0, 80)}` });
        }
      }
      setSingleProgress((sp) => sp && { ...sp, status: "done", statusText: failed > 0 ? `${done} ok · ${failed} falliti · ${skipped} saltati` : `${done} campi tradotti · ${skipped} saltati` });
      if (failed > 0) toast.warning(`"${p.name}": ${done} ok, ${failed} falliti.`);
      else toast.success(`"${p.name}": ${done} campi tradotti.`);
    } catch (e: any) {
      toast.error(e?.message || "Errore traduzione prodotto");
    } finally {
      setTranslatingProductId(null);
      setTimeout(() => setSingleProgress((sp) => (sp?.productId === p.id ? null : sp)), 6000);
    }
  }

  // Tick orologio per "elapsed"
  useEffect(() => {
    if (!translationJob?.active) return;
    const id = window.setInterval(() => {
      setTranslationJob((job) => {
        if (!job?.active) return job;
        return { ...job, elapsed: Math.floor((Date.now() - job.startedAt) / 1000) };
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [translationJob?.active]);

  async function load() {
    const [pRes, cRes, sRes] = await Promise.all([
      supabase.from("products").select("*").order("created_at", { ascending: false }),
      supabase.from("categories").select("id,name").order("name"),
      supabase.from("stores").select("id,display_name,shop_domain").eq("is_active", true),
    ]);
    setProducts((pRes.data as Product[]) || []);
    setCategories((cRes.data as Category[]) || []);
    setStores(sRes.data || []);
  }

  useEffect(() => {
    load();
    loadGeminiLogs();
    loadTranslationFailures();
  }, []);

  // ===== Export / Import Excel =====
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number; inserted: number; updated: number; errors: string[]; current?: string } | null>(null);


  async function exportProductsXlsx(onlyIds?: Set<string>) {
    try {
      const XLSX = await import("xlsx");
      // Paginate to bypass Supabase 1000-row default limit
      const PAGE = 1000;
      let from = 0;
      const all: any[] = [];
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from("products")
          .select("*")
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      const filteredAll = onlyIds && onlyIds.size > 0 ? all.filter((p: any) => onlyIds.has(p.id)) : all;
      // Pre-fetch categories for export name/slug
      const { data: catAll } = await supabase.from("categories").select("id,name,slug");
      const catById = new Map<string, { name: string; slug: string }>(
        (catAll || []).map((c: any) => [c.id, { name: c.name, slug: c.slug }])
      );
      const rows = filteredAll.map((p: any) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        subtitle: p.subtitle ?? "",
        sku: p.sku ?? "",
        status: p.status ?? "draft",
        category_id: p.category_id ?? "",
        category_name: p.category_id ? (catById.get(p.category_id)?.name ?? "") : "",
        category_slug: p.category_id ? (catById.get(p.category_id)?.slug ?? "") : "",
        price: p.price ?? 0,
        compare_price: p.compare_price ?? "",
        cost_price: p.cost_price ?? "",
        shopify_handle: p.shopify_handle ?? "",
        description_short: p.description_short ?? "",
        description_long: p.description_long ?? "",
        description_html: p.description_html ?? "",
        trust_badge_text: p.trust_badge_text ?? "",
        shipping_returns_html: p.shipping_returns_html ?? "",
        image_fit: p.image_fit ?? "",
        seo_title: p.seo_title ?? "",
        seo_description: p.seo_description ?? "",
        og_image: p.og_image ?? "",
        tags: Array.isArray(p.tags) ? p.tags.join(",") : "",
        images: JSON.stringify(p.images ?? []),
        variants: JSON.stringify(p.variants ?? []),
        quantity_breaks: JSON.stringify(p.quantity_breaks ?? []),
        bullets: JSON.stringify(p.bullets ?? []),
        page_builder_data: JSON.stringify(p.page_builder_data ?? null),
        shopify_title_override: p.shopify_title_override ?? "",
        shopify_target_stores: JSON.stringify(p.shopify_target_stores ?? []),
        checkout_image_url: p.checkout_image_url ?? "",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Products");
      const ts = new Date().toISOString().slice(0, 10);
      const suffix = onlyIds && onlyIds.size > 0 ? `-selected-${rows.length}` : "";
      XLSX.writeFile(wb, `products-${ts}${suffix}.xlsx`);
      toast.success(`Esportati ${rows.length} prodotti`);
    } catch (e: any) {
      toast.error(e?.message || "Errore export");
    }
  }

  function tryParseJson<T>(v: any, fallback: T): T {
    if (v === null || v === undefined || v === "") return fallback;
    if (typeof v !== "string") return v as T;
    try { return JSON.parse(v) as T; } catch { return fallback; }
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const VALID_PRODUCT_STATUSES = new Set(["draft", "active", "archived"]);

  function cleanCell(v: any) {
    return v === null || v === undefined ? "" : String(v).trim();
  }

  function parseImportNumber(v: any, fallback: number | null) {
    if (v === null || v === undefined || v === "") return fallback;
    if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
    let s = String(v).trim().replace(/[^\d,.-]/g, "");
    if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
    else if (s.includes(",")) s = s.replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : fallback;
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    setImportProgress({ done: 0, total: 0, inserted: 0, updated: 0, errors: [] });
    try {
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
      if (!rows.length) { toast.error("File vuoto"); setImportProgress(null); return; }

      let updated = 0;
      let inserted = 0;
      const errors: string[] = [];
      setImportProgress({ done: 0, total: rows.length, inserted: 0, updated: 0, errors: [] });

      // Pre-fetch valid category ids and slug map to allow lookup by category_slug
      const { data: catRows } = await supabase.from("categories").select("id,slug");
      const validCategoryIds = new Set((catRows || []).map((c: any) => c.id));
      const slugToId = new Map<string, string>((catRows || []).map((c: any) => [c.slug, c.id]));
      let droppedCategories = 0;

      let idx = 0;
      for (const r of rows) {
        idx++;
        const slug = cleanCell(r.slug);
        const name = cleanCell(r.name);
        const status = VALID_PRODUCT_STATUSES.has(cleanCell(r.status)) ? cleanCell(r.status) : "active";
        const shopifyHandle = cleanCell(r.shopify_handle) || slug;
        let catId: string | null = cleanCell(r.category_id) || null;
        if (catId && !validCategoryIds.has(catId)) catId = null;
        if (!catId && r.category_slug) catId = slugToId.get(cleanCell(r.category_slug)) || null;
        if (!catId && r.category_id) droppedCategories++;
        const payload: any = {
          slug,
          name,
          subtitle: r.subtitle || null,
          sku: r.sku || null,
          status,
          category_id: catId,
          price: parseImportNumber(r.price, 0) ?? 0,
          compare_price: parseImportNumber(r.compare_price, null),
          cost_price: parseImportNumber(r.cost_price, null),
          shopify_handle: shopifyHandle,
          description_short: r.description_short || null,
          description_long: r.description_long || null,
          description_html: r.description_html || null,
          trust_badge_text: r.trust_badge_text || null,
          shipping_returns_html: r.shipping_returns_html || null,
          image_fit: r.image_fit || null,
          seo_title: r.seo_title || null,
          seo_description: r.seo_description || null,
          og_image: r.og_image || null,
          tags: r.tags ? String(r.tags).split(",").map((s: string) => s.trim()).filter(Boolean) : [],
          images: tryParseJson(r.images, []),
          variants: tryParseJson(r.variants, []),
          quantity_breaks: tryParseJson(r.quantity_breaks, []),
          bullets: tryParseJson(r.bullets, []),
          page_builder_data: tryParseJson(r.page_builder_data, null),
          shopify_title_override: r.shopify_title_override || null,
          shopify_target_stores: tryParseJson(r.shopify_target_stores, []),
          checkout_image_url: r.checkout_image_url || null,
        };
        setImportProgress({ done: idx - 1, total: rows.length, inserted, updated, errors: [...errors], current: payload.slug || `riga ${idx}` });
        if (!payload.slug || !payload.name) {
          errors.push(`Riga ${idx}: manca slug/name`);
          setImportProgress({ done: idx, total: rows.length, inserted, updated, errors: [...errors] });
          continue;
        }
        try {
          const id = cleanCell(r.id);
          if (id && UUID_RE.test(id)) {
            const { data: existingById, error: idLookupErr } = await supabase
              .from("products").select("id").eq("id", id).maybeSingle();
            if (idLookupErr) {
              errors.push(`${payload.slug} (lookup id): ${idLookupErr.message}`);
            } else if (existingById?.id) {
              const { error } = await supabase.from("products").update(payload).eq("id", id);
              if (error) errors.push(`${payload.slug}: ${error.message}`); else updated++;
            } else {
              const { data: existingBySlug, error: slugLookupErr } = await supabase
                .from("products").select("id").eq("slug", payload.slug).maybeSingle();
              if (slugLookupErr) errors.push(`${payload.slug} (lookup slug): ${slugLookupErr.message}`);
              else if (existingBySlug?.id) {
                const { error } = await supabase.from("products").update(payload).eq("id", existingBySlug.id);
                if (error) errors.push(`${payload.slug}: ${error.message}`); else updated++;
              } else {
                const { error } = await supabase.from("products").insert({ id, ...payload });
                if (error) errors.push(`${payload.slug}: ${error.message}`); else inserted++;
              }
            }
          } else if (id && !UUID_RE.test(id)) {
            errors.push(`${payload.slug}: ID non valido nel file (${id}), importata/aggiornata tramite slug`);
            const { data: existing, error: selErr } = await supabase
              .from("products").select("id").eq("slug", payload.slug).maybeSingle();
            if (selErr) errors.push(`${payload.slug} (lookup): ${selErr.message}`);
            else if (existing?.id) {
              const { error } = await supabase.from("products").update(payload).eq("id", existing.id);
              if (error) errors.push(`${payload.slug}: ${error.message}`); else updated++;
            } else {
              const { error } = await supabase.from("products").insert(payload);
              if (error) errors.push(`${payload.slug}: ${error.message}`); else inserted++;
            }
          } else {
            const { data: existing, error: selErr } = await supabase
              .from("products").select("id").eq("slug", payload.slug).maybeSingle();
            if (selErr) {
              errors.push(`${payload.slug} (lookup): ${selErr.message}`);
            } else if (existing?.id) {
              const { error } = await supabase.from("products").update(payload).eq("id", existing.id);
              if (error) errors.push(`${payload.slug}: ${error.message}`); else updated++;
            } else {
              const { error } = await supabase.from("products").insert(payload);
              if (error) errors.push(`${payload.slug}: ${error.message}`); else inserted++;
            }
          }
        } catch (rowErr: any) {
          errors.push(`${payload.slug || `riga ${idx}`}: ${rowErr?.message || String(rowErr)}`);
        }
        setImportProgress({ done: idx, total: rows.length, inserted, updated, errors: [...errors] });
      }
      const dropMsg = droppedCategories > 0 ? ` · ${droppedCategories} categorie inesistenti rimosse` : "";
      if (errors.length) {
        toast.warning(`Import: ${inserted} nuovi, ${updated} aggiornati, ${errors.length} errori${dropMsg}`);
        console.error("[Import] Errori:", errors);
      } else {
        toast.success(`Import completato: ${inserted} nuovi, ${updated} aggiornati${dropMsg}`);
      }
      await load();
    } catch (e: any) {
      console.error("[Import] Fatal:", e);
      toast.error(e?.message || "Errore import");
      setImportProgress((p) => p ? { ...p, errors: [...p.errors, `FATAL: ${e?.message || String(e)}`] } : p);
    } finally {
      setImporting(false);
      if (importFileRef.current) importFileRef.current.value = "";
    }
  }

  async function loadGeminiLogs() {
    const { data } = await supabase
      .from("system_logs")
      .select("id,level,message,metadata,created_at")
      .eq("category", "gemini")
      .order("created_at", { ascending: false })
      .limit(30);
    setGeminiLogs(data || []);
  }

  async function clearGeminiLogs() {
    if (!confirm("Svuotare tutti i log Gemini?")) return;
    setClearingLogs(true);
    const { error } = await supabase.from("system_logs").delete().eq("category", "gemini");
    setClearingLogs(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Log svuotati");
    setGeminiLogs([]);
  }

  async function loadTranslationFailures() {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const r = await failuresFn({ data: { accessToken } });
      setTranslationFailures(r.rows || []);
    } catch {
      setTranslationFailures([]);
    }
  }


  async function deleteProduct(p: Product) {
    if (!confirm(`Eliminare ${p.name}?`)) return;
    await supabase.from("products").delete().eq("id", p.id);
    toast.success("Prodotto eliminato");
    load();
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    if (!confirm(`Eliminare ${selected.size} prodotti selezionati? Operazione irreversibile.`)) return;
    const ids = Array.from(selected);
    const { error } = await supabase.from("products").delete().in("id", ids);
    if (error) { toast.error(error.message); return; }
    toast.success(`${ids.length} prodotti eliminati`);
    setSelected(new Set());
    load();
  }

  function toggleSelect(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function cancelTranslation() {
    cancelTranslationRef.current = true;
  }

  async function regenerateTranslations(fieldGroups: TranslationFieldGroup[], force = forceRetranslate, entityIds?: string[], scope: "products" | "store" = "products") {
    const selectedGroups = scope === "products" ? (fieldGroups.length ? fieldGroups : TRANSLATION_GROUPS.map((g) => g.id)) : [];
    const ids = scope === "products" && entityIds && entityIds.length ? entityIds : undefined;
    if (force && !confirm(`Forzare la ritraduzione${scope === "store" ? " dello store" : ids ? ` dei ${ids.length} prodotti selezionati` : " di tutti i prodotti"}? L'operazione consuma più chiamate AI.`)) return;
    setRegenerating(true);
    setTranslationReport(null);
    cancelTranslationRef.current = false;
    const startedAt = Date.now();
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    // 1. Costruisci il piano: solo entity/lingua/campi che mancano
    let plan: Awaited<ReturnType<typeof planFn>>;
    try {
      plan = await planFn({ data: { accessToken, force, fieldGroups: selectedGroups, entityIds: ids, langs: Array.from(selectedLangs), scope } });
    } catch (e: any) {
      toast.error(e?.message || "Impossibile costruire il piano traduzioni");
      setRegenerating(false);
      return;
    }
    if (!plan.ok) {
      toast.error(plan.error || "Errore: chiave Gemini mancante. Vai in Impostazioni → Gemini API.");
      setRegenerating(false);
      return;
    }
    if (plan.steps.length === 0) {
      setTranslationReport({
        status: "empty",
        fieldGroups: selectedGroups,
        durationSec: Math.round((Date.now() - startedAt) / 1000),
        totalSteps: 0,
        totalFields: 0,
        doneFields: 0,
        skippedFields: 0,
        failedFields: 0,
        languages: {},
        errors: [],
      });
      toast.success(scope === "store" ? "Store già tradotto. Nessun campo da aggiornare." : "Campi prodotto già tradotti. Nessun campo da aggiornare.");
      setRegenerating(false);
      return;
    }

    setTranslationJob({
      active: true,
      startedAt: Date.now(),
      elapsed: 0,
      totalSteps: plan.steps.length,
      doneSteps: 0,
      totalFields: plan.totalFields,
      doneFields: 0,
      skippedFields: 0,
      failedFields: 0,
      currentLang: plan.steps[0].lang,
      currentEntityLabel: plan.steps[0].entity_label,
      currentEntityType: plan.steps[0].entity_type,
      currentFields: plan.steps[0].fields.slice(0, 6),
      lastError: null,
      errorsLog: [],
    });

    // 2. Esegui step-by-step, aggiornando la barra in tempo reale
    let doneSteps = 0;
    let doneFields = 0;
    let skippedFields = 0;
    let failedFields = 0;
    const errorsLog: Array<{ when: number; lang: string; entity: string; message: string; fields?: string[] }> = [];
    const languages: TranslationReport["languages"] = {};

    for (const step of plan.steps) {
      if (cancelTranslationRef.current) break;
      setTranslationJob((job) => job ? {
        ...job,
        currentLang: step.lang,
        currentEntityLabel: step.entity_label,
        currentEntityType: step.entity_type,
        currentFields: step.fields.slice(0, 6),
      } : job);

      try {
        const r = await stepFn({
          data: {
            accessToken,
            lang: step.lang,
            entity_type: step.entity_type,
            entity_id: step.entity_id,
            fields: step.fields,
            force,
            fieldGroups: selectedGroups,
            scope,
          },
        });
        doneFields += r.translated || 0;
        skippedFields += r.skipped || 0;
        failedFields += r.failed || 0;
        languages[step.lang] = languages[step.lang] || { translated: 0, skipped: 0, failed: 0 };
        languages[step.lang].translated += r.translated || 0;
        languages[step.lang].skipped += r.skipped || 0;
        languages[step.lang].failed += r.failed || 0;
        if (!r.ok && r.error) {
          const entry = { when: Date.now(), lang: step.lang, entity: `${step.entity_type}/${step.entity_label}`, message: r.error, fields: r.failedFields || [] };
          errorsLog.unshift(entry);
          toast.error(`${step.lang.toUpperCase()} · ${step.entity_label}: ${r.error.slice(0, 140)}`);
        }
      } catch (e: any) {
        failedFields += step.count;
        languages[step.lang] = languages[step.lang] || { translated: 0, skipped: 0, failed: 0 };
        languages[step.lang].failed += step.count;
        const msg = e?.message || String(e || "Errore sconosciuto");
        const entry = { when: Date.now(), lang: step.lang, entity: `${step.entity_type}/${step.entity_label}`, message: msg, fields: step.fields };
        errorsLog.unshift(entry);
        toast.error(`${step.lang.toUpperCase()} · ${step.entity_label}: ${msg.slice(0, 140)}`);
      }
      doneSteps++;
      setTranslationJob((job) => job ? {
        ...job,
        doneSteps,
        doneFields,
        skippedFields,
        failedFields,
        lastError: errorsLog[0]?.message || null,
        errorsLog: errorsLog.slice(0, 20),
      } : job);
    }

    await loadGeminiLogs();
    await loadTranslationFailures();

    setTranslationReport({
      status: cancelTranslationRef.current ? "stopped" : failedFields > 0 ? "partial" : "completed",
      fieldGroups: selectedGroups,
      durationSec: Math.round((Date.now() - startedAt) / 1000),
      totalSteps: plan.steps.length,
      totalFields: plan.totalFields,
      doneFields,
      skippedFields,
      failedFields,
      languages,
      errors: errorsLog,
    });

    if (cancelTranslationRef.current) {
      toast.warning(`Interrotto. ${doneFields} campi tradotti, ${failedFields} falliti.`);
    } else if (failedFields > 0) {
      toast.warning(`Completato con ${failedFields} campi falliti su ${plan.totalFields}. Vedi pannello "Partially translated".`);
    } else {
      toast.success(`Tutto tradotto: ${doneFields} campi su ${plan.totalFields}.`);
    }
    setRegenerating(false);
    setTranslationJob(null);
  }

  const translationProgress = translationJob && translationJob.totalFields > 0
    ? Math.min(100, Math.round((translationJob.doneFields + translationJob.failedFields) / translationJob.totalFields * 100))
    : 0;

  const filtered = products.filter(
    (p) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.slug.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Prodotti</h1>
          <p className="text-muted-foreground">
            Catalogo della vetrina. Shopify viene usato solo come motore di checkout.
          </p>
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <Button variant="destructive" onClick={deleteSelected}>
              <Trash2 className="mr-2 h-4 w-4" /> Elimina ({selected.size})
            </Button>
          )}
          <Link to="/admin/categories">
            <Button variant="outline">Gestisci categorie</Button>
          </Link>
          <input
            ref={importFileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportFile(f);
            }}
          />
          <Button variant="outline" onClick={() => importFileRef.current?.click()} disabled={importing}>
            {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Importa Excel
          </Button>
          {importProgress && (
            <Button variant="ghost" size="sm" onClick={() => setImportProgress(null)} disabled={importing}>
              Chiudi report
            </Button>
          )}
          {selected.size > 0 && (
            <Button variant="outline" onClick={() => exportProductsXlsx(selected)}>
              <Download className="mr-2 h-4 w-4" /> Esporta selezionati ({selected.size})
            </Button>
          )}
          <Button variant="outline" onClick={() => exportProductsXlsx()}>
            <Download className="mr-2 h-4 w-4" /> Esporta Excel
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Nuovo
          </Button>
        </div>
      </div>

      {importProgress && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="h-4 w-4" /> Import prodotti — {importProgress.done}/{importProgress.total}
              {importing && <Loader2 className="h-4 w-4 animate-spin" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={importProgress.total ? (importProgress.done / importProgress.total) * 100 : 0} />
            <div className="flex flex-wrap gap-3 text-sm">
              <Badge variant="secondary">Nuovi: {importProgress.inserted}</Badge>
              <Badge variant="secondary">Aggiornati: {importProgress.updated}</Badge>
              <Badge variant={importProgress.errors.length ? "destructive" : "secondary"}>Errori: {importProgress.errors.length}</Badge>
              <Badge variant="outline">Mancanti: {Math.max(0, importProgress.total - importProgress.done)}</Badge>
              {importProgress.current && <span className="text-muted-foreground">In corso: {importProgress.current}</span>}
            </div>
            {importProgress.errors.length > 0 && (
              <div className="max-h-48 overflow-auto rounded border border-destructive/40 bg-destructive/5 p-2 text-xs font-mono">
                {importProgress.errors.map((e, i) => (
                  <div key={i} className="text-destructive">{e}</div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}



      <Card className="border-primary/25">
        <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Languages className="h-4 w-4" /> Traduzioni store e prodotti
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Selettore lingue */}
          <div className="rounded-md border border-border/60 bg-muted/30 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-xs font-medium text-muted-foreground">
                Lingue selezionate: {selectedLangs.size} / {ALL_TRANS_LANGS.length}
                <span className="ml-2 opacity-70">(shift+click per range)</span>
              </div>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setSelectedLangs(new Set(ALL_TRANS_LANGS.map((l) => l.code)))}
                >
                  Tutte
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setSelectedLangs(new Set())}
                >
                  Nessuna
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ALL_TRANS_LANGS.map((l, idx) => {
                const active = selectedLangs.has(l.code);
                return (
                  <button
                    key={l.code}
                    type="button"
                    onClick={(e) => toggleLang(idx, e)}
                    className={`select-none rounded-md border px-2 py-1 text-xs transition-colors ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:bg-muted"
                    }`}
                    title={l.label}
                  >
                    {l.code.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-xs text-muted-foreground">
            <Checkbox checked={forceRetranslate} onCheckedChange={(v) => setForceRetranslate(v === true)} />
            Forza ritraduzione anche se risulta già tradotto
          </label>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <Button
              variant="secondary"
              className="h-auto justify-start px-3 py-3 text-left"
              onClick={() => regenerateTranslations([], forceRetranslate, undefined, "store")}
              disabled={regenerating || selectedLangs.size === 0}
            >
              {regenerating ? <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" /> : <Languages className="mr-2 h-4 w-4 shrink-0" />}
              <span className="min-w-0">
                <span className="block text-sm font-medium">Traduci store</span>
                <span className="block truncate text-xs font-normal opacity-80">branding + categorie + footer + legali</span>
              </span>
            </Button>
            <Button
              variant="default"
              className="h-auto justify-start px-3 py-3 text-left"
              onClick={() => regenerateTranslations(TRANSLATION_GROUPS.map((g) => g.id), forceRetranslate, selected.size > 0 ? Array.from(selected) : undefined)}
              disabled={regenerating || selectedLangs.size === 0}
            >
              {regenerating ? <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" /> : <Languages className="mr-2 h-4 w-4 shrink-0" />}
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  {selected.size > 0 ? `Traduci ${selected.size} selezionati` : "Traduci tutto"}
                </span>
                <span className="block truncate text-xs font-normal opacity-80">
                  {selected.size > 0 ? "solo prodotti selezionati" : "titoli + descrizioni + varianti + bundle"}
                </span>
              </span>
            </Button>
            {TRANSLATION_GROUPS.map((group) => (
              <Button
                key={group.id}
                variant="outline"
                className="h-auto justify-start px-3 py-3 text-left"
                onClick={() => regenerateTranslations([group.id], forceRetranslate, selected.size > 0 ? Array.from(selected) : undefined)}
                disabled={regenerating || selectedLangs.size === 0}
              >
                {regenerating ? <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4 shrink-0" />}
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{group.label}{selected.size > 0 ? ` (${selected.size})` : ""}</span>
                  <span className="block truncate text-xs font-normal text-muted-foreground">{group.description}</span>
                </span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>


      {translationJob?.active && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="space-y-3 py-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">
                Traduzione live · {translationJob.doneSteps}/{translationJob.totalSteps} step ·{" "}
                {translationProgress}%
              </span>
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground tabular-nums">{translationJob.elapsed}s</span>
                <Button size="sm" variant="ghost" onClick={cancelTranslation}>Stop</Button>
              </div>
            </div>
            <Progress value={translationProgress} className="h-2" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs">
              <div className="rounded-md border border-primary/20 bg-background/60 px-3 py-2">
                <div className="text-muted-foreground">Sto traducendo</div>
                <div className="font-mono text-[11px] uppercase">{translationJob.currentLang}</div>
                <div className="truncate font-medium" title={translationJob.currentEntityLabel}>
                  {translationJob.currentEntityType} · {translationJob.currentEntityLabel}
                </div>
                <div className="mt-1 truncate text-muted-foreground">
                  Campi: {translationJob.currentFields.join(", ")}
                </div>
              </div>
              <div className="rounded-md border border-primary/20 bg-background/60 px-3 py-2">
                <div className="text-muted-foreground">Avanzamento</div>
                <div>
                  ✓ <span className="font-medium text-emerald-600">{translationJob.doneFields}</span> tradotti ·{" "}
                  ⏭ <span className="font-medium">{translationJob.skippedFields}</span> saltati ·{" "}
                  ✗ <span className="font-medium text-destructive">{translationJob.failedFields}</span> falliti
                </div>
                <div className="text-muted-foreground">
                  {translationJob.doneFields + translationJob.failedFields}/{translationJob.totalFields} campi
                </div>
              </div>
            </div>
            {translationJob.lastError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <div className="font-medium">Ultimo errore:</div>
                <div className="break-words font-mono text-[11px]">{translationJob.lastError}</div>
              </div>
            )}
            {translationJob.errorsLog.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground">
                  Log errori ({translationJob.errorsLog.length})
                </summary>
                <ul className="mt-1 max-h-40 space-y-1 overflow-auto rounded-md border border-border bg-background/60 p-2">
                  {translationJob.errorsLog.map((er, i) => (
                    <li key={i} className="break-words font-mono text-[10px]">
                      <span className="uppercase">{er.lang}</span> · {er.entity}: {er.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </CardContent>
        </Card>
      )}

      {translationReport && (
        <Card className={translationReport.failedFields > 0 ? "border-destructive/30 bg-destructive/5" : "border-emerald-500/30 bg-emerald-500/5"}>
          <CardHeader>
            <CardTitle className="text-base">
              Report traduzioni · {translationReport.status === "completed" ? "completato" : translationReport.status === "empty" ? "niente da tradurre" : translationReport.status === "stopped" ? "interrotto" : "parziale"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid gap-2 sm:grid-cols-4">
              <div className="rounded-md border border-border bg-background px-3 py-2"><div className="text-xs text-muted-foreground">Tradotti</div><div className="text-xl font-semibold text-emerald-600">{translationReport.doneFields}</div></div>
              <div className="rounded-md border border-border bg-background px-3 py-2"><div className="text-xs text-muted-foreground">Saltati</div><div className="text-xl font-semibold">{translationReport.skippedFields}</div></div>
              <div className="rounded-md border border-border bg-background px-3 py-2"><div className="text-xs text-muted-foreground">Falliti</div><div className="text-xl font-semibold text-destructive">{translationReport.failedFields}</div></div>
              <div className="rounded-md border border-border bg-background px-3 py-2"><div className="text-xs text-muted-foreground">Durata</div><div className="text-xl font-semibold tabular-nums">{translationReport.durationSec}s</div></div>
            </div>
            <div className="text-xs text-muted-foreground">
              Campi: {translationReport.fieldGroups.map((id) => TRANSLATION_GROUPS.find((g) => g.id === id)?.label || id).join(", ")} · Step: {translationReport.totalSteps} · Totale campi: {translationReport.totalFields}
            </div>
            {Object.keys(translationReport.languages).length > 0 && (
              <div className="max-h-36 overflow-auto rounded-md border border-border bg-background p-2 text-xs">
                {Object.entries(translationReport.languages).map(([langCode, row]) => (
                  <div key={langCode} className="flex items-center justify-between gap-3 border-b border-border/60 py-1 last:border-0">
                    <span className="font-mono uppercase">{langCode}</span>
                    <span>✓ {row.translated} · ⏭ {row.skipped} · ✗ {row.failed}</span>
                  </div>
                ))}
              </div>
            )}
            {translationReport.errors.length > 0 && (
              <div className="max-h-48 overflow-auto rounded-md border border-destructive/30 bg-background p-2 text-xs">
                {translationReport.errors.map((er, i) => (
                  <div key={i} className="break-words border-b border-border/60 py-1 last:border-0">
                    <span className="font-mono uppercase">{er.lang}</span> · {er.entity} · {er.fields?.join(", ") || "campo"}: {er.message}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {translationFailures.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setFailuresOpen((v) => !v)}
              className="flex items-center gap-2 text-left"
            >
              <CardTitle className="text-base">
                Partially translated · campi da ritentare {failuresOpen ? "▾" : "▸"}
              </CardTitle>
              <span className="text-xs text-muted-foreground">({translationFailures.length})</span>
            </button>
            <Button size="sm" variant="outline" onClick={loadTranslationFailures}>
              <RefreshCw className="mr-2 h-4 w-4" /> Aggiorna
            </Button>
          </CardHeader>
          {failuresOpen && (
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">Questi campi non verranno saltati: la prossima rigenerazione riprova solo le parti fallite o non aggiornate.</p>
              <div className="max-h-64 overflow-auto rounded-md border border-border bg-background">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lingua</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>ID</TableHead>
                      <TableHead>Campo</TableHead>
                      <TableHead>Errore</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {translationFailures.slice(0, 80).map((f, i) => (
                      <TableRow key={`${f.lang}-${f.entity_type}-${f.entity_id}-${f.field}-${i}`}>
                        <TableCell className="font-mono text-xs uppercase">{f.lang}</TableCell>
                        <TableCell className="text-xs">{f.entity_type}</TableCell>
                        <TableCell className="max-w-[180px] truncate font-mono text-[11px]">{f.entity_id}</TableCell>
                        <TableCell className="font-mono text-xs">{f.field}</TableCell>
                        <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground">{f.last_error || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          )}
        </Card>
      )}


      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setGeminiOpen((v) => !v)}
            className="flex items-center gap-2 text-left"
          >
            <CardTitle className="text-base">
              Debug Gemini · ultimi batch {geminiOpen ? "▾" : "▸"}
            </CardTitle>
            <span className="text-xs text-muted-foreground">({geminiLogs.length})</span>
          </button>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={loadGeminiLogs}>
              <RefreshCw className="mr-2 h-4 w-4" /> Aggiorna
            </Button>
            <Button size="sm" variant="outline" onClick={clearGeminiLogs} disabled={clearingLogs || geminiLogs.length === 0}>
              <Trash2 className="mr-2 h-4 w-4" /> Svuota log
            </Button>
          </div>
        </CardHeader>
        {geminiOpen && (
          <CardContent className="space-y-2">
            {geminiLogs.length === 0 && <p className="text-sm text-muted-foreground">Nessun log Gemini ancora salvato.</p>}
            {geminiLogs.slice(0, 8).map((log) => {
              const meta = (log.metadata || {}) as any;
              const response = typeof meta.response === "string" ? meta.response : JSON.stringify(meta.response || {}).slice(0, 900);
              const request = JSON.stringify(meta.request || {}).slice(0, 700);
              return (
                <details key={log.id} className="rounded-md border border-border bg-muted/20 p-2 text-xs">
                  <summary className="cursor-pointer font-medium">
                    {new Date(log.created_at).toLocaleString("it-IT")} · {meta.lang || "—"} · batch {meta.batchIndex || "—"}/{meta.totalBatches || "—"} · {meta.finishReason || log.level} · {meta.durationMs ? `${meta.durationMs}ms` : ""}
                  </summary>
                  <div className="mt-2 grid gap-2">
                    <pre className="max-h-32 overflow-auto rounded bg-background p-2">Request: {request}</pre>
                    <pre className="max-h-40 overflow-auto rounded bg-background p-2">Risposta: {response}</pre>
                    <pre className="max-h-24 overflow-auto rounded bg-background p-2">Chiavi: {JSON.stringify(meta.itemKeys || meta.failedKeys || [])}</pre>
                  </div>
                </details>
              );
            })}
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{filtered.length} prodotti</CardTitle>
          <div className="relative w-72">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cerca…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={filtered.length > 0 && filtered.every((p) => selected.has(p.id))}
                    onCheckedChange={(v) => {
                      if (v) setSelected(new Set(filtered.map((p) => p.id)));
                      else setSelected(new Set());
                    }}
                  />
                </TableHead>
                <TableHead>Prodotto</TableHead>
                <TableHead>Codice</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Prezzo</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                    Nessun prodotto. Esegui un sync o creane uno manualmente.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((p) => (
                <TableRow key={p.id} data-state={selected.has(p.id) ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggleSelect(p.id)} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {p.images?.[0] ? (
                        <img
                          src={p.images[0]}
                          alt=""
                          className="h-10 w-10 rounded object-cover"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded bg-muted" />
                      )}
                      <div>
                        <div className="font-medium">{p.name}</div>
                        {p.sku && (
                          <div className="text-xs text-muted-foreground">SKU {p.sku}</div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted" title="Codice comunicato a Sito B (slug)">{prdCodeFor(p.id)}</span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.slug}</TableCell>
                  <TableCell>
                    {categories.find((c) => c.id === p.category_id)?.name || "—"}
                  </TableCell>
                  <TableCell className="font-mono">€ {Number(p.price).toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge variant={p.status === "active" ? "default" : "secondary"}>
                      {p.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <a href={`/p/${p.slug}`} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="ghost" title="Vedi pagina">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </a>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Traduci questo prodotto in tutte le lingue"
                      onClick={() => translateSingleProduct(p)}
                      disabled={translatingProductId !== null}
                    >
                      {translatingProductId === p.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Languages className="h-4 w-4" />
                      )}
                    </Button>
                    {singleProgress && singleProgress.productId === p.id && (
                      <div className="mt-1 inline-flex w-56 flex-col gap-1 align-middle">
                        <Progress
                          value={singleProgress.totalFields ? Math.min(100, Math.round((singleProgress.doneFields + singleProgress.failedFields + singleProgress.skippedFields) / singleProgress.totalFields * 100)) : 0}
                          className="h-1.5"
                        />
                        <div className="text-[10px] text-left flex items-center gap-1">
                          <span className={
                            singleProgress.status === "failing" ? "text-destructive font-medium" :
                            singleProgress.status === "skipping" ? "text-amber-600 font-medium" :
                            singleProgress.status === "done" ? "text-emerald-600 font-medium" :
                            "text-sky-600 font-medium"
                          }>
                            {singleProgress.status === "failing" ? "✗ Errore" :
                             singleProgress.status === "skipping" ? "⏭ Skip" :
                             singleProgress.status === "done" ? "✓ Fine" :
                             "⟳ Traducendo"}
                          </span>
                          <span className="text-muted-foreground truncate" title={singleProgress.statusText}>· {singleProgress.statusText}</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground text-left">
                          {singleProgress.doneSteps}/{singleProgress.totalSteps} lingue · ✓{singleProgress.doneFields} ⏭{singleProgress.skippedFields} ✗{singleProgress.failedFields} / {singleProgress.totalFields}
                        </div>
                      </div>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditing(p);
                        setOpen(true);
                      }}
                    >
                      Modifica
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => deleteProduct(p)}
                    >
                      Elimina
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? "Modifica prodotto" : "Nuovo prodotto"}</SheetTitle>
            <SheetDescription>I dati vengono salvati live in Supabase.</SheetDescription>
          </SheetHeader>
          <ProductForm
            key={editing?.id ?? "new"}
            product={editing}
            categories={categories}
            stores={stores}
            onSaved={() => {
              setOpen(false);
              load();
            }}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

interface VariantRow {
  label: string;
  type?: "text" | "color" | "image";
  color?: string;
  image?: string;
  shopify_variant_id?: string;
  price?: number | "";
  available?: boolean;
}

interface BreakRow {
  qty: number;
  discount_percent: number;
  label?: string;
  badge?: string;
}

function ProductForm({
  product,
  categories,
  stores,
  onSaved,
}: {
  product: Product | null;
  categories: Category[];
  stores: { id: string; display_name: string | null; shop_domain: string }[];
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    slug: product?.slug || "",
    name: product?.name || "",
    shopify_handle: product?.shopify_handle || "",
    price: product?.price ?? 0,
    compare_price: product?.compare_price ?? "",
    cost_price: product?.cost_price ?? "",
    sku: product?.sku || "",
    status: product?.status || "active",
    category_id: product?.category_id || "",
    description_short: product?.description_short || "",
    description_long: product?.description_long || "",
    description_html: (product as any)?.description_html || "",
    subtitle: (product as any)?.subtitle || "",
    trust_badge_text: (product as any)?.trust_badge_text || "",
    shipping_returns_html: (product as any)?.shipping_returns_html || "",
    image_fit: (product as any)?.image_fit || (product ? "contain" : "cover"),
    tags: (product?.tags || []).join(", "),
    seo_title: product?.seo_title || "",
    seo_description: product?.seo_description || "",
    og_image: product?.og_image || "",
    shopify_title_override: product?.shopify_title_override || "",
    checkout_image_url: product?.checkout_image_url || "",
  });
  const [targetStores, setTargetStores] = useState<string[]>(
    (product?.shopify_target_stores as string[]) || []
  );
  const [images, setImages] = useState<string[]>(product?.images || []);
  const [imageUpload, setImageUpload] = useState<{ total: number; done: number; current: string; progress: number } | null>(null);
  const [imageDropActive, setImageDropActive] = useState(false);
  const imageDragIndex = useRef<number | null>(null);
  const richEditorRef = useRef<HTMLDivElement | null>(null);
  const [variants, setVariants] = useState<VariantRow[]>(
    (product?.variants as VariantRow[]) || [],
  );
  const [variantType, setVariantType] = useState<"text" | "color" | "image">(
    (product?.variants?.[0]?.type as "text" | "color" | "image") || "text",
  );
  const [breaks, setBreaks] = useState<BreakRow[]>(
    product
      ? ((product.quantity_breaks as BreakRow[]) || [])
      : [
          { qty: 1, discount_percent: 0, label: "1 pezzo" },
          { qty: 2, discount_percent: 10, label: "2 pezzi", badge: "Più scelto" },
          { qty: 3, discount_percent: 20, label: "3 pezzi", badge: "Più risparmio" },
        ],
  );
  const [bullets, setBullets] = useState<{ icon?: string; text: string }[]>(
    (product?.bullets as any) || [],
  );
  const [variantCache, setVariantCache] = useState<
    { store_id: string; variant_data: Record<string, unknown>; last_used: string }[]
  >([]);
  
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("base");

  const margin = useMemo(() => {
    const p = Number(form.price);
    const c = Number(form.cost_price || 0);
    if (!p || !c) return null;
    return (((p - c) / p) * 100).toFixed(1);
  }, [form.price, form.cost_price]);

  useEffect(() => {
    if (!product?.slug) return;
    void supabase
      .from("variant_cache")
      .select("store_id,variant_data,last_used")
      .eq("product_slug", product.slug)
      .then(({ data }) => setVariantCache((data as any) || []));
  }, [product?.slug]);

  useEffect(() => {
    if (richEditorRef.current) richEditorRef.current.innerHTML = form.description_long || "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  function addImage() {
    setImages((arr) => [...arr, ""]);
  }
  function removeImage(i: number) {
    setImages((arr) => arr.filter((_, idx) => idx !== i));
  }
  function moveImage(i: number, dir: -1 | 1) {
    setImages((arr) => {
      const next = [...arr];
      const j = i + dir;
      if (j < 0 || j >= next.length) return next;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function moveImageTo(from: number, to: number) {
    setImages((arr) => {
      if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
      const next = [...arr];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }
  function setMainImage(i: number) {
    moveImageTo(i, 0);
  }
  async function uploadGalleryFiles(files: File[], replaceIndex?: number) {
    if (!files.length) return;
    let done = 0;
    setImageUpload({ total: files.length, done: 0, current: files[0]?.name || "", progress: 0 });
    try {
      for (const file of files) {
        let progress = 0;
        setImageUpload({ total: files.length, done, current: file.name, progress: 0 });
        const timer = window.setInterval(() => {
          progress = Math.min(92, progress + Math.max(2, Math.round((100 - progress) * 0.12)));
          setImageUpload((u) => (u ? { ...u, progress } : u));
        }, 180);
        try {
          const { url } = await uploadBrandAsset(file, "gallery");
          if (typeof replaceIndex === "number") {
            setImages((arr) => arr.map((s, idx) => (idx === replaceIndex ? url : s)));
          } else {
            setImages((arr) => [...arr, url]);
          }
          done += 1;
          setImageUpload({ total: files.length, done, current: file.name, progress: 100 });
        } catch (err: any) {
          toast.error(err?.message || `Upload fallito: ${file.name}`);
        } finally {
          window.clearInterval(timer);
        }
      }
      if (done > 0) toast.success(done === 1 ? "Immagine caricata" : `${done} immagini caricate`);
    } finally {
      window.setTimeout(() => setImageUpload(null), 500);
    }
  }
  function syncRichDescription() {
    const html = richEditorRef.current?.innerHTML || "";
    setForm((current) => ({ ...current, description_long: html }));
  }
  function execRich(command: string, value?: string) {
    richEditorRef.current?.focus();
    document.execCommand(command, false, value);
    syncRichDescription();
  }
  function setBlock(tag: "P" | "H1" | "H2" | "H3") {
    execRich("formatBlock", tag);
  }
  function addVariant() {
    setVariants((arr) => [
      ...arr,
      { label: "", type: variantType, available: true, color: "#000000" },
    ]);
  }
  function updateVariant(i: number, patch: Partial<VariantRow>) {
    setVariants((arr) => arr.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  }
  function removeVariant(i: number) {
    setVariants((arr) => arr.filter((_, idx) => idx !== i));
  }
  function addBreak() {
    setBreaks((arr) =>
      [...arr, { qty: arr.length === 0 ? 1 : (arr[arr.length - 1]?.qty ?? 0) + 1, discount_percent: arr.length === 0 ? 0 : 10 }].sort(
        (a, b) => a.qty - b.qty,
      ),
    );
  }
  function updateBreak(i: number, patch: Partial<BreakRow>) {
    setBreaks((arr) => arr.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  }
  function removeBreak(i: number) {
    setBreaks((arr) => arr.filter((_, idx) => idx !== i));
  }

  // Sync manuale rimosso: le stats e la variant cache vengono aggiornate solo via webhook.

  async function invalidateCache() {
    if (!product) return;
    if (!confirm("Invalidare la cache variant ID per tutti gli store?")) return;
    await supabase.from("variant_cache").delete().eq("product_slug", product.slug);
    setVariantCache([]);
    toast.success("Cache invalidata");
  }

  async function save() {
    setSaving(true);
    try {
      const payload = {
        slug: form.slug.trim(),
        name: form.name.trim(),
        shopify_handle: form.shopify_handle.trim() || form.slug.trim(),
        price: Number(form.price),
        compare_price: form.compare_price === "" ? null : Number(form.compare_price),
        cost_price: form.cost_price === "" ? null : Number(form.cost_price),
        sku: form.sku.trim() || null,
        status: form.status,
        category_id: form.category_id || null,
        description_short: form.description_short || null,
        description_long: form.description_long || null,
        description_html: form.description_html || null,
        subtitle: form.subtitle || null,
        trust_badge_text: form.trust_badge_text || null,
        shipping_returns_html: form.shipping_returns_html || null,
        image_fit: form.image_fit || "cover",
        bullets: bullets.filter((b) => b.text.trim()),
        seo_title: form.seo_title || null,
        seo_description: form.seo_description || null,
        og_image: form.og_image || null,
        shopify_title_override: form.shopify_title_override.trim() || null,
        shopify_target_stores: targetStores,
        checkout_image_url: form.checkout_image_url.trim() || null,
        images: images.map((s) => s.trim()).filter(Boolean),
        variants: variants
          .filter((v) => v.label.trim())
          .map((v) => ({
            ...v,
            type: variantType,
            price: v.price === "" ? undefined : v.price,
          })),
        quantity_breaks: breaks
          .filter((b) => b.qty >= 1 && b.discount_percent >= 0)
          .sort((a, b) => a.qty - b.qty),
        tags: form.tags.split(",").map((x) => x.trim()).filter(Boolean),
      };
      if (product) {
        const { error } = await supabase.from("products").update(payload as any).eq("id", product.id);
        if (error) throw error;
        toast.success("Prodotto aggiornato");
      } else {
        const { error } = await supabase.from("products").insert(payload as any);
        if (error) throw error;
        toast.success("Prodotto creato");
      }
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-4 gap-1 lg:grid-cols-8">
          <TabsTrigger value="base">Base</TabsTrigger>
          <TabsTrigger value="prezzi">Prezzi</TabsTrigger>
          <TabsTrigger value="varianti">Varianti</TabsTrigger>
          <TabsTrigger value="breaks">Quantità</TabsTrigger>
          <TabsTrigger value="immagini">Immagini</TabsTrigger>
          <TabsTrigger value="seo">SEO</TabsTrigger>
          <TabsTrigger value="shopify">Shopify</TabsTrigger>
          <TabsTrigger value="builder">Builder</TabsTrigger>
        </TabsList>

        {/* TAB BASE */}
        <TabsContent value="base" className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label>Nome prodotto *</Label>
            <Input
              value={form.name}
              onChange={(e) => {
                const name = e.target.value;
                const auto =
                  !product && (!form.slug || form.slug === slugify(form.name))
                    ? slugify(name)
                    : form.slug;
                setForm({ ...form, name, slug: auto });
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Slug URL *</Label>
              <Input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground">/p/{form.slug || "..."}</p>
            </div>
            <div className="space-y-2">
              <Label>Stato</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Attivo</SelectItem>
                  <SelectItem value="draft">Bozza</SelectItem>
                  <SelectItem value="archived">Archiviato</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select
              value={form.category_id || "none"}
              onValueChange={(v) =>
                setForm({ ...form, category_id: v === "none" ? "" : v })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Nessuna —</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Sottotitolo (mostrato sotto al titolo del prodotto)</Label>
            <Input
              value={form.subtitle}
              placeholder="Es. Premium edition · 2026"
              onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Descrizione breve (max 160 char)</Label>
            <Textarea
              maxLength={160}
              rows={2}
              value={form.description_short}
              onChange={(e) => setForm({ ...form, description_short: e.target.value })}
            />
            <p className="text-right text-xs text-muted-foreground">
              {form.description_short.length}/160
            </p>
          </div>

          {/* Bullet points (alternativa moderna alla short description) */}
          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-4">
            <div className="flex items-center justify-between">
              <Label>Bullet points (sostituiscono la short description nella scheda)</Label>
              <button
                type="button"
                onClick={() => setBullets((arr) => [...arr, { icon: "check", text: "" }])}
                className="text-xs font-semibold text-primary hover:underline"
              >
                + Aggiungi bullet
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">Se vuoti, viene usata la short description.</p>
            {bullets.length === 0 && (
              <p className="text-xs italic text-muted-foreground">Nessun bullet. Verrà mostrata la short description.</p>
            )}
            {bullets.map((b, i) => (
              <div key={i} className="flex gap-2 items-center">
                <select
                  value={b.icon || "check"}
                  onChange={(e) => setBullets((arr) => arr.map((x, idx) => idx === i ? { ...x, icon: e.target.value } : x))}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="check">✓ Check</option>
                  <option value="star">★ Star</option>
                  <option value="sparkles">✨ Sparkles</option>
                  <option value="award">🏅 Award</option>
                  <option value="heart">♥ Heart</option>
                  <option value="shield">🛡 Shield</option>
                  <option value="truck">🚚 Truck</option>
                  <option value="zap">⚡ Zap</option>
                  <option value="lock">🔒 Lock</option>
                  <option value="badge">✅ Badge</option>
                </select>
                <Input
                  value={b.text}
                  placeholder="Es. Garanzia ufficiale 24 mesi inclusa"
                  onChange={(e) => setBullets((arr) => arr.map((x, idx) => idx === i ? { ...x, text: e.target.value } : x))}
                />
                <button
                  type="button"
                  onClick={() => setBullets((arr) => arr.filter((_, idx) => idx !== i))}
                  className="px-2 text-sm text-destructive hover:underline"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label>Adattamento immagine prodotto</Label>
            <select
              value={form.image_fit}
              onChange={(e) => setForm({ ...form, image_fit: e.target.value })}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="contain">Contain — con padding intorno (default)</option>
              <option value="cover">Cover — adatta all'intero contenitore (no padding)</option>
            </select>
            <p className="text-[11px] text-muted-foreground">Usa "Cover" se l'immagine ha già il proprio sfondo / cornice.</p>
          </div>
          <div className="space-y-2">
            <Label>Testo sotto badge Trustpilot (opzionale)</Label>
            <Input
              value={form.trust_badge_text}
              placeholder="Es. Garanzia ufficiale produttore · spedizione 24h"
              onChange={(e) => setForm({ ...form, trust_badge_text: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Descrizione lunga</Label>
              <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-muted/30 p-1">
                <Button type="button" size="sm" variant="ghost" onClick={() => setBlock("H1")} className="h-8 px-2 text-xs">H1</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setBlock("H2")} className="h-8 px-2 text-xs">H2</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setBlock("H3")} className="h-8 px-2 text-xs">H3</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setBlock("P")} className="h-8 px-2 text-xs">Paragrafo</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => execRich("bold")} className="h-8 px-2"><Bold className="h-4 w-4" /></Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => execRich("italic")} className="h-8 px-2"><Italic className="h-4 w-4" /></Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => execRich("insertUnorderedList")} className="h-8 px-2"><List className="h-4 w-4" /></Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => execRich("insertOrderedList")} className="h-8 px-2"><ListOrdered className="h-4 w-4" /></Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => execRich("removeFormat")} className="h-8 px-2"><Eraser className="h-4 w-4" /></Button>
              </div>
            </div>
            <div
              ref={richEditorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={syncRichDescription}
              onBlur={syncRichDescription}
              className="min-h-48 rounded-md border border-input bg-background px-4 py-3 text-sm leading-relaxed outline-none focus-visible:ring-1 focus-visible:ring-ring [&_h1]:text-3xl [&_h1]:font-bold [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:text-xl [&_h3]:font-semibold [&_ul]:ml-6 [&_ul]:list-disc [&_ol]:ml-6 [&_ol]:list-decimal [&_li]:my-1"
            />
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground"><Eye className="h-3.5 w-3.5" /> Preview live</div>
              <div className="min-h-16 text-sm leading-relaxed [&_h1]:text-3xl [&_h1]:font-bold [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:text-xl [&_h3]:font-semibold [&_ul]:ml-6 [&_ul]:list-disc [&_ol]:ml-6 [&_ol]:list-decimal [&_li]:my-1" dangerouslySetInnerHTML={{ __html: form.description_long || "" }} />
            </div>
            <p className="text-xs text-muted-foreground">Editor HTML visuale: le liste sono veri &lt;ul&gt;/&lt;ol&gt;, non trattini Markdown.</p>
          </div>
          <div className="space-y-2">
            <Label>Descrizione HTML custom (full width — accetta CSS / JS inline)</Label>
            <Textarea
              rows={10}
              value={form.description_html}
              placeholder={`<style>.my-section{padding:40px;background:#f8f9fb;}</style>\n<section class="my-section"><h2>Caratteristiche</h2>...</section>`}
              onChange={(e) => setForm({ ...form, description_html: e.target.value })}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">Mostrato a tutta larghezza nella pagina prodotto. Style e script inline vengono applicati.</p>
          </div>
          <div className="space-y-2">
            <Label>📦 Spedizione, resi e garanzia (HTML — opzionale)</Label>
            <Textarea
              rows={8}
              value={form.shipping_returns_html}
              placeholder={`Lascia vuoto per usare il contenuto predefinito.\nSupporta HTML semplice: <h4>, <p>, <strong>, <em>, <ul><li>...`}
              onChange={(e) => setForm({ ...form, shipping_returns_html: e.target.value })}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">Sostituisce il contenuto del collapse "Spedizione e resi" nella pagina prodotto.</p>
          </div>
          <div className="space-y-2">
            <Label>Tag (separati da virgola)</Label>
            <Input
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
            />
          </div>
        </TabsContent>

        {/* TAB PREZZI */}
        <TabsContent value="prezzi" className="mt-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Prezzo base (€)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Prezzo barrato (€)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.compare_price as any}
                onChange={(e) =>
                  setForm({ ...form, compare_price: e.target.value as any })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Costo (€)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.cost_price as any}
                onChange={(e) => setForm({ ...form, cost_price: e.target.value as any })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>SKU</Label>
            <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          </div>
          {margin !== null && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              Margine calcolato: <strong className="text-primary">{margin}%</strong>
            </div>
          )}
        </TabsContent>

        {/* TAB VARIANTI */}
        <TabsContent value="varianti" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Tipo selettore</Label>
              <Select value={variantType} onValueChange={(v) => setVariantType(v as any)}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Testo (Taglie, etc.)</SelectItem>
                  <SelectItem value="color">Colore</SelectItem>
                  <SelectItem value="image">Immagine</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={addVariant}>
              <Plus className="mr-1 h-4 w-4" /> Variante
            </Button>
          </div>
          {variants.length === 0 && (
            <p className="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nessuna variante. Il prodotto avrà un solo selettore.
            </p>
          )}
          <div className="space-y-2">
            {variants.map((v, i) => (
              <div
                key={i}
                className="grid grid-cols-12 items-end gap-2 rounded-md border border-border p-2"
              >
                <div className="col-span-3 space-y-1">
                  <Label className="text-xs">Etichetta</Label>
                  <Input
                    value={v.label}
                    onChange={(e) => updateVariant(i, { label: e.target.value })}
                  />
                </div>
                {variantType === "color" && (
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Colore</Label>
                    <Input
                      type="color"
                      value={v.color || "#000000"}
                      onChange={(e) => updateVariant(i, { color: e.target.value })}
                      className="h-10 p-1"
                    />
                  </div>
                )}
                {variantType === "image" && (
                  <div className="col-span-3 space-y-1">
                    <Label className="text-xs">URL immagine</Label>
                    <Input
                      value={v.image || ""}
                      onChange={(e) => updateVariant(i, { image: e.target.value })}
                    />
                  </div>
                )}
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Mod. prezzo</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={v.price ?? ""}
                    onChange={(e) =>
                      updateVariant(i, {
                        price: e.target.value === "" ? "" : Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="col-span-3 space-y-1">
                  <Label className="text-xs">Shopify variant ID</Label>
                  <Input
                    value={v.shopify_variant_id || ""}
                    onChange={(e) => updateVariant(i, { shopify_variant_id: e.target.value })}
                  />
                </div>
                <div className="col-span-1 flex items-center gap-1 pb-1">
                  <Switch
                    checked={v.available !== false}
                    onCheckedChange={(c) => updateVariant(i, { available: c })}
                  />
                </div>
                <div className="col-span-1 pb-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeVariant(i)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* TAB QUANTITY BREAKS */}
        <TabsContent value="breaks" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Sconti automatici applicati alla quantità acquistata.
            </p>
            <Button size="sm" onClick={addBreak}>
              <Plus className="mr-1 h-4 w-4" /> Break
            </Button>
          </div>
          {breaks.length === 0 && (
            <p className="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nessuno sconto quantità.
            </p>
          )}
          <div className="space-y-2">
            {breaks.map((b, i) => (
              <div
                key={i}
                className="grid grid-cols-12 items-end gap-2 rounded-md border border-border p-2"
              >
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Da quantità</Label>
                  <Input
                    type="number"
                    min={2}
                    value={b.qty}
                    onChange={(e) => updateBreak(i, { qty: Number(e.target.value) })}
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Sconto %</Label>
                  <Input
                    type="number"
                    min={1}
                    max={90}
                    value={b.discount_percent}
                    onChange={(e) =>
                      updateBreak(i, { discount_percent: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="col-span-3 space-y-1">
                  <Label className="text-xs">Etichetta risparmio</Label>
                  <Input
                    value={b.label || ""}
                    placeholder={`Risparmi ${b.discount_percent}%`}
                    onChange={(e) => updateBreak(i, { label: e.target.value })}
                  />
                </div>
                <div className="col-span-3 space-y-1">
                  <Label className="text-xs">Badge (es. Più popolare)</Label>
                  <Input
                    value={b.badge || ""}
                    onChange={(e) => updateBreak(i, { badge: e.target.value })}
                  />
                </div>
                <div className="col-span-2 pb-1 text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeBreak(i)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          {breaks.length > 0 && (
            <Card className="bg-muted/40">
              <CardHeader>
                <CardTitle className="text-sm">Anteprima pricing</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-3">
                {breaks.map((b) => {
                  const p = Number(form.price) * (1 - b.discount_percent / 100);
                  return (
                    <div
                      key={b.qty}
                      className="rounded border border-border bg-background p-2 text-sm"
                    >
                      <div className="font-bold">{b.qty} pezzi</div>
                      <div className="text-xs text-muted-foreground">
                        € {p.toFixed(2)} cad.
                      </div>
                      <div className="text-xs text-emerald-600">
                        -{b.discount_percent}%
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* TAB IMMAGINI */}
        <TabsContent value="immagini" className="mt-4 space-y-3">
          <div
            className={`space-y-3 rounded-lg border border-dashed p-3 transition-colors ${
              imageDropActive ? "border-primary bg-primary/5" : "border-border"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setImageDropActive(true);
            }}
            onDragLeave={() => setImageDropActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setImageDropActive(false);
              void uploadGalleryFiles(Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith("image/")));
            }}
          >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Trascina qui le immagini o caricale dal pulsante. La prima immagine è quella principale.
            </p>
            <div className="flex gap-2">
              <label className="inline-flex">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml,image/avif,image/gif"
                  multiple
                  className="hidden"
                  onChange={async (e) => {
                    const files = Array.from(e.target.files || []);
                    e.target.value = "";
                    await uploadGalleryFiles(files);
                  }}
                />
                <span className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 cursor-pointer">
                  <Upload className="h-3.5 w-3.5" /> Carica file
                </span>
              </label>
              <Button size="sm" variant="outline" onClick={addImage}>
                <Plus className="mr-1 h-4 w-4" /> URL
              </Button>
            </div>
          </div>
          {imageUpload && (
            <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
              <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                <span className="truncate font-medium">{imageUpload.current}</span>
                <span className="shrink-0 text-muted-foreground">{imageUpload.done}/{imageUpload.total}</span>
              </div>
              <Progress value={imageUpload.progress} className="h-2" />
            </div>
          )}
          {images.length === 0 && (
            <p className="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nessuna immagine. Puoi trascinarle direttamente in questa scheda.
            </p>
          )}
          <div className="space-y-2">
            {images.map((src, i) => (
              <div
                key={`${src}-${i}`}
                draggable
                onDragStart={() => { imageDragIndex.current = i; }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const from = imageDragIndex.current;
                  imageDragIndex.current = null;
                  if (from !== null) moveImageTo(from, i);
                }}
                className="flex items-center gap-2 rounded-md border border-border p-2 transition-colors hover:bg-muted/30"
              >
                <button
                  className="cursor-grab text-muted-foreground"
                  onClick={() => moveImage(i, -1)}
                  title="Sposta su"
                >
                  <GripVertical className="h-4 w-4" />
                </button>
                {src && (
                  <img
                    src={src}
                    alt=""
                    className="h-12 w-12 rounded border border-border object-cover"
                  />
                )}
                <Input
                  value={src}
                  placeholder="https://... oppure usa Carica file"
                  onChange={(e) =>
                    setImages((arr) => arr.map((s, idx) => (idx === i ? e.target.value : s)))
                  }
                />
                <label className="inline-flex shrink-0">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml,image/avif,image/gif"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      await uploadGalleryFiles([f], i);
                    }}
                  />
                  <span className="inline-flex items-center rounded-md border px-2 py-1 text-xs cursor-pointer hover:bg-muted">
                    <Upload className="h-3.5 w-3.5" />
                  </span>
                </label>
                {i === 0 ? (
                  <Badge variant="secondary">Principale</Badge>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setMainImage(i)}>
                    Principale
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => removeImage(i)}
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          </div>
        </TabsContent>

        {/* TAB SEO */}
        <TabsContent value="seo" className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label>Meta title</Label>
            <Input
              maxLength={60}
              value={form.seo_title}
              onChange={(e) => setForm({ ...form, seo_title: e.target.value })}
            />
            <p className="text-right text-xs text-muted-foreground">
              {form.seo_title.length}/60
            </p>
          </div>
          <div className="space-y-2">
            <Label>Meta description</Label>
            <Textarea
              rows={2}
              maxLength={160}
              value={form.seo_description}
              onChange={(e) => setForm({ ...form, seo_description: e.target.value })}
            />
            <p className="text-right text-xs text-muted-foreground">
              {form.seo_description.length}/160
            </p>
          </div>
          <div className="space-y-2">
            <Label>OG Image (URL)</Label>
            <Input
              value={form.og_image}
              onChange={(e) => setForm({ ...form, og_image: e.target.value })}
            />
          </div>
          <Card className="border-dashed bg-muted/30">
            <CardHeader>
              <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
                Anteprima Google
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-emerald-700">
                happyscam.com › p › {form.slug || "slug"}
              </div>
              <div className="text-base text-blue-700 hover:underline">
                {form.seo_title || form.name || "Titolo prodotto"}
              </div>
              <div className="text-xs text-muted-foreground">
                {form.seo_description || form.description_short || "Descrizione…"}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB SHOPIFY */}
        <TabsContent value="shopify" className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label>Shopify product handle *</Label>
            <Input
              value={form.shopify_handle}
              placeholder="es. t-shirt-vintage"
              onChange={(e) => setForm({ ...form, shopify_handle: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Usato per cercare il prodotto su Shopify durante il checkout.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Title override (titolo per Shopify)</Label>
            <Input
              value={form.shopify_title_override}
              placeholder={`Lascia vuoto per usare "${form.name || "nome prodotto"}"`}
              onChange={(e) => setForm({ ...form, shopify_title_override: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Se compilato, sostituisce il nome prodotto su tutti gli store target.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Immagine checkout</Label>
            <div className="flex gap-2">
              <Input
                value={form.checkout_image_url}
                placeholder="https://... oppure carica file"
                onChange={(e) => setForm({ ...form, checkout_image_url: e.target.value })}
              />
              <label className="inline-flex shrink-0">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml,image/avif,image/gif"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    try {
                      const { url } = await uploadBrandAsset(f, "product");
                      setForm({ ...form, checkout_image_url: url });
                      toast.success("Immagine caricata");
                    } catch (err: any) {
                      toast.error(err?.message || "Upload fallito");
                    }
                  }}
                />
                <span className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-xs cursor-pointer hover:bg-muted">
                  <Upload className="h-3.5 w-3.5" /> Carica
                </span>
              </label>
            </div>
            {form.checkout_image_url && (
              <img
                src={form.checkout_image_url}
                alt="anteprima"
                className="mt-2 h-24 w-24 rounded border border-border object-cover"
                onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
              />
            )}
            <p className="text-xs text-muted-foreground">
              Inviata al Sito B come immagine prodotto nel checkout (sostituisce quella reale).
              Se vuota viene usata l'immagine di fallback dalle Impostazioni; se anche quella manca,
              il checkout viene mostrato senza immagine.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Stores target ({targetStores.length}/{stores.length})</Label>
            <p className="text-xs text-muted-foreground">
              Seleziona gli store su cui questo prodotto deve essere sincronizzato.
            </p>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {stores.map((s) => {
                const checked = targetStores.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() =>
                      setTargetStores(
                        checked ? targetStores.filter((x) => x !== s.id) : [...targetStores, s.id]
                      )
                    }
                    className={`text-left rounded-md border p-2 text-sm transition-all ${
                      checked
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium truncate">
                        {s.display_name || s.shop_domain}
                      </span>
                      {checked && <span className="text-primary">✓</span>}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {s.shop_domain}
                    </div>
                  </button>
                );
              })}
              {stores.length === 0 && (
                <p className="col-span-full text-xs text-muted-foreground">
                  Nessuno store configurato.
                </p>
              )}
            </div>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Cache Variant ID per store</CardTitle>
              {product && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={invalidateCache}
                  disabled={variantCache.length === 0}
                >
                  Invalida cache
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              {!product && (
                <p className="text-sm text-muted-foreground">
                  Salva prima il prodotto per gestire la cache.
                </p>
              )}
              {product &&
                stores.map((s) => {
                  const cache = variantCache.find((c) => c.store_id === s.id);
                  return (
                    <div
                      key={s.id}
                      className="flex items-center justify-between rounded border border-border p-2 text-sm"
                    >
                      <div>
                        <div className="font-medium">
                          {s.display_name || s.shop_domain}
                        </div>
                        {cache ? (
                          <div className="font-mono text-xs text-muted-foreground">
                            ID:{" "}
                            {String(
                              (cache.variant_data as Record<string, unknown>).variant_id ??
                                "—",
                            )}{" "}
                            · {new Date(cache.last_used).toLocaleString("it-IT")}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">Non in cache</div>
                        )}
                      </div>
                    </div>
                  );
                })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB BUILDER */}
        <TabsContent value="builder" className="mt-4">
          <Card className="border-dashed bg-muted/30">
            <CardContent className="py-12 text-center text-muted-foreground">
              <p className="mb-2 font-medium">Page Builder</p>
              <p className="text-sm">
                Builder visuale in arrivo. Per ora la PDP usa il template standard con varianti,
                quantity break, gallery e CTA.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-0 mt-6 -mx-6 border-t border-border bg-background/95 px-6 py-3 backdrop-blur">
        <Button
          onClick={save}
          disabled={saving || !form.slug || !form.name}
          className="w-full"
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {product ? "Aggiorna prodotto" : "Crea prodotto"}
        </Button>
      </div>
    </div>
  );
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}