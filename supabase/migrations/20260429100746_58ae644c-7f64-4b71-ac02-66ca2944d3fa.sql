ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS subtitle text,
  ADD COLUMN IF NOT EXISTS description_html text,
  ADD COLUMN IF NOT EXISTS trust_badge_text text;

ALTER TABLE public.footer_config
  ADD COLUMN IF NOT EXISTS footer_description text;