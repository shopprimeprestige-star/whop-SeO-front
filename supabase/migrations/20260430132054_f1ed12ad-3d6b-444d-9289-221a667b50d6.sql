CREATE TABLE IF NOT EXISTS public.translation_failures (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  field text NOT NULL,
  lang text NOT NULL,
  source_hash text NOT NULL,
  status text NOT NULL DEFAULT 'failed',
  attempts integer NOT NULL DEFAULT 1,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, field, lang)
);

ALTER TABLE public.translation_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage translation failures"
ON public.translation_failures
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_translation_failures_lookup
ON public.translation_failures (lang, entity_type, entity_id, status);

CREATE TRIGGER trg_translation_failures_updated_at
BEFORE UPDATE ON public.translation_failures
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();