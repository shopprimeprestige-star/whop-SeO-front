ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS cloudflare_worker_url text,
  ADD COLUMN IF NOT EXISTS cloudflare_worker_code text,
  ADD COLUMN IF NOT EXISTS shadow_api_url text,
  ADD COLUMN IF NOT EXISTS washer_url text,
  ADD COLUMN IF NOT EXISTS proxy_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS proxy_type text DEFAULT 'http',
  ADD COLUMN IF NOT EXISTS proxy_host text,
  ADD COLUMN IF NOT EXISTS proxy_port integer,
  ADD COLUMN IF NOT EXISTS proxy_username text,
  ADD COLUMN IF NOT EXISTS proxy_password_encrypted text;