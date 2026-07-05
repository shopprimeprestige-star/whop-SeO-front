ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS lovable_sync_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lovable_sync_url text,
  ADD COLUMN IF NOT EXISTS lovable_sync_api_key_encrypted text,
  ADD COLUMN IF NOT EXISTS lovable_sync_hmac_secret_encrypted text,
  ADD COLUMN IF NOT EXISTS lovable_sync_store_ref text,
  ADD COLUMN IF NOT EXISTS lovable_sync_default_currency text,
  ADD COLUMN IF NOT EXISTS lovable_sync_default_locale text,
  ADD COLUMN IF NOT EXISTS lovable_sync_last_push timestamptz,
  ADD COLUMN IF NOT EXISTS lovable_sync_last_error text,
  ADD COLUMN IF NOT EXISTS lovable_sync_status text;