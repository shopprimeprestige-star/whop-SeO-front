ALTER TABLE public.footer_config 
  ADD COLUMN IF NOT EXISTS courier_logo_height_mobile integer DEFAULT 32,
  ADD COLUMN IF NOT EXISTS courier_logo_height_desktop integer DEFAULT 24;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS shipping_returns_html text;