ALTER TABLE public.stores 
  ADD COLUMN IF NOT EXISTS shadow_checkout_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shadow_api_url text,
  ADD COLUMN IF NOT EXISTS washer_url text;