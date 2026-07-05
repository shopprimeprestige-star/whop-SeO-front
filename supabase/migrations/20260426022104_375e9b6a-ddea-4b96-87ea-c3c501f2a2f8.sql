-- Tabella per cachare traduzioni di tutti i contenuti dinamici (prodotti, pagine legali, footer, ecc.)
CREATE TABLE IF NOT EXISTS public.translations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL,        -- 'product' | 'legal_page' | 'footer' | 'branding' | 'category' | 'company'
  entity_id TEXT NOT NULL,          -- uuid o slug o key
  field TEXT NOT NULL,              -- es. 'name', 'description_short', 'description_long', 'body_markdown', 'title', 'variant_label', 'break_label'
  lang TEXT NOT NULL,               -- 'en' | 'de' | 'fr' | 'es' | 'pt' | 'nl'
  value TEXT NOT NULL,              -- testo tradotto
  source_hash TEXT NOT NULL,        -- hash del contenuto sorgente per invalidare automaticamente
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, field, lang)
);

CREATE INDEX IF NOT EXISTS idx_translations_lookup
  ON public.translations (entity_type, entity_id, lang);

ALTER TABLE public.translations ENABLE ROW LEVEL SECURITY;

-- Pubblicamente leggibili (sono testi mostrati nel sito)
CREATE POLICY "Translations are publicly readable"
  ON public.translations FOR SELECT
  USING (true);

-- Solo admin gestiscono (la rigenerazione passa via service role / server function)
CREATE POLICY "Admins manage translations"
  ON public.translations FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_translations_updated_at
  BEFORE UPDATE ON public.translations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();