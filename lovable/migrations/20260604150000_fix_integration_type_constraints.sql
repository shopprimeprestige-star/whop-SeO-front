-- Align integration_type allowed values with the app code ('shopify' | 'native_bridge')
-- and relax the shop_domain check so non-Shopify (native bridge) stores can use any domain.

ALTER TABLE public.stores
  DROP CONSTRAINT IF EXISTS stores_integration_type_check;

ALTER TABLE public.stores
  ADD CONSTRAINT stores_integration_type_check
  CHECK (integration_type IN ('shopify', 'native_bridge'));

-- Old check required every shop_domain to end in .myshopify.com.
-- Now: only required when integration_type = 'shopify'.
ALTER TABLE public.stores
  DROP CONSTRAINT IF EXISTS stores_shop_domain_check;

ALTER TABLE public.stores
  ADD CONSTRAINT stores_shop_domain_check
  CHECK (
    integration_type <> 'shopify'
    OR shop_domain LIKE '%.myshopify.com'
  );
