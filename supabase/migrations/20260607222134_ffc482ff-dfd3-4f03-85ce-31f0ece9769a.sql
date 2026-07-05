ALTER TABLE public.footer_config
  ADD COLUMN payment_methods_custom jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN couriers_custom jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN shipped_with_logos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN certifications jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.store_stats
  ADD COLUMN cvr_percentage numeric NOT NULL DEFAULT 0,
  ADD COLUMN checkout_launches_24h integer NOT NULL DEFAULT 0;

UPDATE public.store_stats SET store_id = gen_random_uuid() WHERE store_id IS NULL;
ALTER TABLE public.store_stats ALTER COLUMN store_id SET NOT NULL;

ALTER TABLE public.settings
  ADD COLUMN is_public boolean NOT NULL DEFAULT false;

ALTER TABLE public.variant_cache
  ADD COLUMN product_slug text,
  ADD COLUMN store_id uuid,
  ADD COLUMN variant_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN last_used timestamptz;

CREATE INDEX IF NOT EXISTS variant_cache_product_slug_idx ON public.variant_cache(product_slug);
CREATE INDEX IF NOT EXISTS variant_cache_store_id_idx ON public.variant_cache(store_id);