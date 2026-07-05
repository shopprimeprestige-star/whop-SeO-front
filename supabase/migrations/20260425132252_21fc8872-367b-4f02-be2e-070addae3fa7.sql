-- Add bridge site columns
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS bridge_site_url text,
  ADD COLUMN IF NOT EXISTS bridge_api_key_encrypted text,
  ADD COLUMN IF NOT EXISTS bridge_status text NOT NULL DEFAULT 'not_configured',
  ADD COLUMN IF NOT EXISTS bridge_last_connected timestamptz,
  ADD COLUMN IF NOT EXISTS bridge_last_sync timestamptz,
  ADD COLUMN IF NOT EXISTS bridge_last_error text;

CREATE INDEX IF NOT EXISTS idx_stores_bridge_status ON public.stores(bridge_status);

-- Drop legacy Cloudflare columns
ALTER TABLE public.stores
  DROP COLUMN IF EXISTS cloudflare_worker_url,
  DROP COLUMN IF EXISTS cloudflare_worker_code,
  DROP COLUMN IF EXISTS washer_url,
  DROP COLUMN IF EXISTS shadow_api_url;