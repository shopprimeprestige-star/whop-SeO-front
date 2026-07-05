-- Aggiungi campi OG / SEO al branding per condivisione social
ALTER TABLE public.site_branding
  ADD COLUMN IF NOT EXISTS og_title text,
  ADD COLUMN IF NOT EXISTS og_description text,
  ADD COLUMN IF NOT EXISTS og_image_url text,
  ADD COLUMN IF NOT EXISTS default_product_tagline text,
  ADD COLUMN IF NOT EXISTS twitter_handle text;