import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Languages, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { SUPPORTED_LANGS, type Lang } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { getTranslationPlan, translateOneStep } from "@/lib/translate.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/i18n")({
  component: I18nDebugPage,
});

import * as i18nMod from "@/lib/i18n";

function StoreTranslateCard() {
  const ALL_TRANS_LANGS = SUPPORTED_LANGS.filter((l) => l.code !== "it");
  const planFn = useServerFn(getTranslationPlan);
  const stepFn = useServerFn(translateOneStep);

  const [selectedLangs, setSelectedLangs] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set(ALL_TRANS_LANGS.map((l) => l.code));
    try {
      const raw = localStorage.getItem("lp_translate_langs");
      const knownRaw = localStorage.getItem("lp_translate_known_langs");
      const saved: string[] = raw ? (JSON.parse(raw) || []) : ALL_TRANS_LANGS.map((l) => l.code);
      const known: string[] = knownRaw ? (JSON.parse(knownRaw) || []) : [];
      const merged = new Set<string>(Array.isArray(saved) ? saved : []);
      for (const l of ALL_TRANS_LANGS) if (!known.includes(l.code)) merged.add(l.code);
      return merged;
    } catch {
      return new Set(ALL_TRANS_LANGS.map((l) => l.code));
    }
  });
  const lastClickRef = useRef<number | null>(null);
  useEffect(() => {
    try {
      localStorage.setItem("lp_translate_langs", JSON.stringify(Array.from(selectedLangs)));
      localStorage.setItem("lp_translate_known_langs", JSON.stringify(ALL_TRANS_LANGS.map((l) => l.code)));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLangs]);

  function toggleLang(idx: number, e: React.MouseEvent) {
    const code = ALL_TRANS_LANGS[idx].code;
    if (e.shiftKey && lastClickRef.current !== null) {
      const [a, b] = [lastClickRef.current, idx].sort((x, y) => x - y);
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
    lastClickRef.current = idx;
  }

  const [force, setForce] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; lang: string; entity: string } | null>(null);
  const cancelRef = useRef(false);

  async function translateStore() {
    if (selectedLangs.size === 0) return;
    if (force && !confirm("Forzare la ritraduzione dello store? Consuma più chiamate AI.")) return;
    setRunning(true);
    setProgress(null);
    cancelRef.current = false;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const plan: any = await planFn({ data: { accessToken, force, fieldGroups: [], entityIds: undefined, langs: Array.from(selectedLangs), scope: "store" } });
      if (!plan?.ok) { toast.error(plan?.error || "Errore piano traduzioni"); return; }
      if (!plan.steps?.length) { toast.success("Store già tradotto. Nulla da aggiornare."); return; }
      let done = 0, ok = 0, fail = 0;
      setProgress({ done: 0, total: plan.steps.length, lang: plan.steps[0].lang, entity: plan.steps[0].entity_label });
      for (const step of plan.steps) {
        if (cancelRef.current) break;
        setProgress({ done, total: plan.steps.length, lang: step.lang, entity: step.entity_label });
        try {
          const r: any = await stepFn({ data: { accessToken, lang: step.lang, entity_type: step.entity_type, entity_id: step.entity_id, fields: step.fields, force, fieldGroups: [], scope: "store" } });
          ok += r?.translated || 0;
          fail += r?.failed || 0;
          if (!r?.ok && r?.error) toast.error(`${step.lang.toUpperCase()} · ${step.entity_label}: ${String(r.error).slice(0, 120)}`);
        } catch (e: any) {
          fail += step.count || 1;
          toast.error(`${step.lang.toUpperCase()} · ${step.entity_label}: ${(e?.message || String(e)).slice(0, 120)}`);
        }
        done++;
        setProgress({ done, total: plan.steps.length, lang: step.lang, entity: step.entity_label });
      }
      if (cancelRef.current) toast.warning(`Interrotto. ${ok} tradotti, ${fail} falliti.`);
      else if (fail > 0) toast.warning(`Completato con ${fail} campi falliti. ${ok} tradotti.`);
      else toast.success(`Store tradotto: ${ok} campi.`);
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Card className="border-primary/25">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Languages className="h-4 w-4" /> Traduci store
        </CardTitle>
        <CardDescription>
          Branding, categorie, footer e pagine legali. Le traduzioni prodotti restano gestite in Admin → Prodotti.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-border/60 bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-xs font-medium text-muted-foreground">
              Lingue selezionate: {selectedLangs.size} / {ALL_TRANS_LANGS.length}
              <span className="ml-2 opacity-70">(shift+click per range)</span>
            </div>
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setSelectedLangs(new Set(ALL_TRANS_LANGS.map((l) => l.code)))}>Tutte</Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setSelectedLangs(new Set())}>Nessuna</Button>
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
                    active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted"
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
          <Checkbox checked={force} onCheckedChange={(v) => setForce(v === true)} />
          Forza ritraduzione anche se risulta già tradotto
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={translateStore} disabled={running || selectedLangs.size === 0}>
            {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Languages className="mr-2 h-4 w-4" />}
            Traduci store
          </Button>
          {running && (
            <Button variant="outline" onClick={() => { cancelRef.current = true; }}>Interrompi</Button>
          )}
        </div>

        {progress && (
          <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">{progress.lang.toUpperCase()} · {progress.entity}</span>
              <span className="text-muted-foreground">{progress.done}/{progress.total}</span>
            </div>
            <Progress value={pct} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function I18nDebugPage() {
  // Heuristic: read DICT from module if exposed; otherwise reconstruct via t().
  // We exported t but DICT is module-private — so we infer presence via t(key)
  // returning the key itself when missing. Listing keys explicitly:
  const KEYS = [
    "nav.shop", "nav.cart",
    "cta.buy_now", "cta.add_to_cart", "cta.checkout",
    "trust.shipping", "trust.warranty", "trust.return", "trust.secure", "trust.original", "trust.support",
    "courier.shipped_with",
    "footer.payments", "footer.certs",
    "trustpilot.excellent",
  ];

  // Snapshot translations using transient providers per language
  const snapshot = useMemo(() => {
    // Re-import the raw dictionary by parsing the exported object reference.
    // Since DICT isn't exported, we approximate by reading via a temporary
    // setLang in localStorage — but that mutates user state. Instead we
    // expose a debug helper if available, else fall back to test render.
    const rows: Array<{ key: string; values: Record<Lang, string>; missing: Lang[] }> = [];
    const langs = SUPPORTED_LANGS.map((l) => l.code);

    const dict: Record<string, Record<Lang, string>> | undefined =
      (i18nMod as any).__DICT__;

    if (dict) {
      for (const key of KEYS) {
        const values = (dict[key] || {}) as Record<Lang, string>;
        const missing = langs.filter((l) => !values[l]);
        rows.push({ key, values, missing });
      }
    } else {
      // Fallback: only the active language is queryable via t().
      for (const key of KEYS) {
        rows.push({ key, values: {} as any, missing: langs as Lang[] });
      }
    }
    return rows;
  }, []);

  const totalKeys = KEYS.length;
  const totalMissing = snapshot.reduce((n, r) => n + r.missing.length, 0);
  const totalSlots = totalKeys * SUPPORTED_LANGS.length;
  const coverage = totalSlots === 0 ? 0 : Math.round(((totalSlots - totalMissing) / totalSlots) * 100);

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground">
          <Languages className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">i18n — verifica traduzioni</h1>
          <p className="text-sm text-muted-foreground">
            Tutte le chiavi del dizionario, con badge per le lingue mancanti.
          </p>
        </div>
      </div>

      <StoreTranslateCard />


      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Chiavi totali</CardDescription>
            <CardTitle className="text-3xl">{totalKeys}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Lingue supportate</CardDescription>
            <CardTitle className="text-3xl">{SUPPORTED_LANGS.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Copertura totale</CardDescription>
            <CardTitle className="text-3xl flex items-center gap-2">
              {coverage}%
              {coverage === 100 ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-amber-500" />
              )}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Matrice traduzioni</CardTitle>
          <CardDescription>
            Verde = presente · Rosso = mancante (fallback IT). Le chiavi sono case-sensitive.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-2 font-semibold">Chiave</th>
                {SUPPORTED_LANGS.map((l) => (
                  <th key={l.code} className="text-center py-2 px-2 font-semibold">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-base">{l.flag}</span>
                      <span className="uppercase text-[10px]">{l.code}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshot.map((row) => (
                <tr key={row.key} className="border-b hover:bg-muted/30">
                  <td className="py-2 px-2 font-mono text-[11px]">{row.key}</td>
                  {SUPPORTED_LANGS.map((l) => {
                    const val = row.values[l.code as Lang];
                    return (
                      <td key={l.code} className="text-center py-2 px-2">
                        {val ? (
                          <span className="text-emerald-600 dark:text-emerald-400" title={val}>✓</span>
                        ) : (
                          <Badge variant="destructive" className="text-[9px] px-1.5 py-0">missing</Badge>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {snapshot.every((r) => r.missing.length === SUPPORTED_LANGS.length) && (
            <p className="text-xs text-muted-foreground mt-4 text-center">
              ⚠️ Il dizionario non è esposto staticamente. Vai in <code>src/lib/i18n.tsx</code> e
              esporta <code>DICT</code> per analisi completa, oppure aggiungi <code>export const __DICT__ = DICT;</code>.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
