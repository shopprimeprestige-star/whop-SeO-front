-- Add HMAC secret for Sito B sync-product fallback
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS hmac_secret_encrypted text;
