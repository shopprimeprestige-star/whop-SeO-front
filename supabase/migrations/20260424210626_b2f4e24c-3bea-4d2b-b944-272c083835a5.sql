-- Stores: CAP window + health
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS display_id text,
  ADD COLUMN IF NOT EXISTS cap_amount numeric DEFAULT 580,
  ADD COLUMN IF NOT EXISTS cap_window_days integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cap_window_start timestamptz,
  ADD COLUMN IF NOT EXISTS cap_window_revenue numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS country_rule text NOT NULL DEFAULT 'ALL',
  ADD COLUMN IF NOT EXISTS shop_currency text NOT NULL DEFAULT 'EUR',
  ADD COLUMN IF NOT EXISTS last_webhook_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_ping_at timestamptz,
  ADD COLUMN IF NOT EXISTS recent_failures integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS connected_at timestamptz NOT NULL DEFAULT now();

-- Rotation log: group_id to bundle a single "execute now" run
ALTER TABLE public.rotation_log
  ADD COLUMN IF NOT EXISTS group_id uuid;

-- Sync log
CREATE TABLE IF NOT EXISTS public.sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'shopify',
  status text NOT NULL DEFAULT 'success',
  products_count integer NOT NULL DEFAULT 0,
  categories_count integer NOT NULL DEFAULT 0,
  variants_count integer NOT NULL DEFAULT 0,
  duration_ms integer,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage sync_log" ON public.sync_log;
CREATE POLICY "Admins manage sync_log" ON public.sync_log
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Webhook log
CREATE TABLE IF NOT EXISTS public.webhook_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  topic text NOT NULL,
  status text NOT NULL DEFAULT 'received',
  signature_valid boolean NOT NULL DEFAULT true,
  error_message text,
  payload_size integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.webhook_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage webhook_log" ON public.webhook_log;
CREATE POLICY "Admins manage webhook_log" ON public.webhook_log
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_webhook_log_store ON public.webhook_log(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_log_store ON public.sync_log(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rotation_log_group ON public.rotation_log(group_id);
CREATE INDEX IF NOT EXISTS idx_stores_active_eligible ON public.stores(is_active, is_online, country_rule);