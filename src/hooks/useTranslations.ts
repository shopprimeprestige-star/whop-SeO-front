import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

export type TranslationMap = Record<string, Record<string, string>>; // entity_id -> field -> value

/**
 * Carica le traduzioni cachate per più entità nella lingua corrente.
 * Se lang === "it" ritorna mappa vuota (sorgente).
 */
export function useEntityTranslations(entity_type: string, entity_ids: string[]): TranslationMap {
  const { lang } = useI18n();
  const [map, setMap] = useState<TranslationMap>({});

  const idsKey = entity_ids.slice().sort().join(",");

  useEffect(() => {
    if (lang === "it" || !entity_ids.length) {
      setMap({});
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("translations")
        .select("entity_id, field, value")
        .eq("entity_type", entity_type)
        .eq("lang", lang)
        .in("entity_id", entity_ids);
      if (cancelled) return;
      const next: TranslationMap = {};
      for (const r of data || []) {
        if (!next[r.entity_id]) next[r.entity_id] = {};
        next[r.entity_id][r.field] = r.value;
      }
      setMap(next);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, entity_type, idsKey]);

  return map;
}

/** Helper: ritorna la traduzione o il fallback.
 *  Se il sorgente è vuoto/null, ritorna stringa vuota (per non mostrare contenuti rimossi
 *  che non sono ancora stati ripuliti dal cron di rigenera traduzioni). */
export function tField(map: TranslationMap, id: string, field: string, fallback: string | null | undefined): string {
  // Se il sorgente IT è vuoto, il contenuto è stato rimosso → non mostrare la vecchia traduzione
  if (!fallback || !String(fallback).trim()) return "";
  const v = map[id]?.[field];
  return v && v.trim() ? v : (fallback || "");
}
