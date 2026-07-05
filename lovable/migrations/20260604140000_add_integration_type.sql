-- Add integration_type to stores: 'shopify' (default) or 'native_bridge'
-- 'native_bridge' = checkout nativo del Sito Ponte (Sito B), niente Shopify diretto.
-- Usa le stesse colonne bridge_* / API bridge-* di Shopify.

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS integration_type text NOT NULL DEFAULT 'shopify';

ALTER TABLE public.stores
  DROP CONSTRAINT IF EXISTS stores_integration_type_check;

ALTER TABLE public.stores
  ADD CONSTRAINT stores_integration_type_check
  CHECK (integration_type IN ('shopify', 'native_bridge'));
