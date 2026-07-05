ALTER TABLE public.footer_config 
  ADD COLUMN IF NOT EXISTS shipped_with_logos jsonb NOT NULL DEFAULT '[]'::jsonb;