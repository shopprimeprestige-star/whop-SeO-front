-- ============================================================
-- STORES: stato a 4 livelli, proxy per-store, metriche
-- ============================================================
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS health_status text NOT NULL DEFAULT 'online'
    CHECK (health_status IN ('online','degraded','offline','recovering')),
  ADD COLUMN IF NOT EXISTS consecutive_errors integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_latency_ms integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_health_check timestamp with time zone,
  -- proxy per-store
  ADD COLUMN IF NOT EXISTS proxy_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS proxy_type text NOT NULL DEFAULT 'http'
    CHECK (proxy_type IN ('http','https','socks5')),
  ADD COLUMN IF NOT EXISTS proxy_host text,
  ADD COLUMN IF NOT EXISTS proxy_port integer,
  ADD COLUMN IF NOT EXISTS proxy_username text,
  ADD COLUMN IF NOT EXISTS proxy_password_encrypted text,
  -- webhook auto-registration tracking
  ADD COLUMN IF NOT EXISTS webhooks_registered_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS registered_webhook_topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS needs_reauth boolean NOT NULL DEFAULT false;

-- Aggiorna scope di default per nuovi store (esistenti devono ri-fare OAuth)
ALTER TABLE public.stores
  ALTER COLUMN oauth_scopes SET DEFAULT 'read_products,read_orders,write_orders,read_customers,read_draft_orders,write_draft_orders,write_webhooks';

-- Marca store esistenti come "needs_reauth" se non hanno write_webhooks
UPDATE public.stores
   SET needs_reauth = true
 WHERE oauth_scopes NOT LIKE '%write_webhooks%';

-- ============================================================
-- WEBHOOK_EVENTS: idempotenza per evento Shopify
-- ============================================================
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL,
  topic text NOT NULL,
  shopify_event_id text NOT NULL,            -- header X-Shopify-Webhook-Id o order id
  shopify_order_id text,
  amount numeric DEFAULT 0,
  currency text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_valid boolean NOT NULL DEFAULT false,
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamp with time zone,
  error_message text,
  received_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT webhook_events_unique_event UNIQUE (store_id, topic, shopify_event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at
  ON public.webhook_events (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_store_topic
  ON public.webhook_events (store_id, topic);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage webhook_events"
  ON public.webhook_events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- PROCESSED_ORDERS: dedup ordini per non sommare 2 volte
-- ============================================================
CREATE TABLE IF NOT EXISTS public.processed_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL,
  shopify_order_id text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  currency text,
  status text NOT NULL DEFAULT 'paid',     -- paid | cancelled | refunded
  processed_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT processed_orders_unique UNIQUE (store_id, shopify_order_id)
);

CREATE INDEX IF NOT EXISTS idx_processed_orders_processed_at
  ON public.processed_orders (processed_at DESC);

ALTER TABLE public.processed_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage processed_orders"
  ON public.processed_orders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- SYSTEM_LOGS: log unificato per UI Logs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.system_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  level text NOT NULL DEFAULT 'info'
    CHECK (level IN ('info','success','warning','error','rotate','webhook')),
  category text NOT NULL DEFAULT 'system',
  store_id uuid,
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_logs_created_at
  ON public.system_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_level
  ON public.system_logs (level);

ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage system_logs"
  ON public.system_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- store_stats: assicura unique (store_id, date) per upsert
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'store_stats_store_date_unique'
  ) THEN
    BEGIN
      ALTER TABLE public.store_stats
        ADD CONSTRAINT store_stats_store_date_unique UNIQUE (store_id, date);
    EXCEPTION WHEN duplicate_table THEN NULL;
    END;
  END IF;
END $$;

-- ============================================================
-- Settings di default per il nuovo motore di rotazione/circuit breaker
-- ============================================================
INSERT INTO public.settings (key, value, is_public) VALUES
  ('rotation_algorithm', '"weighted"'::jsonb, false),
  ('rotation_jitter_pct', '15'::jsonb, false),
  ('circuit_breaker_enabled', 'true'::jsonb, false),
  ('circuit_breaker_threshold', '3'::jsonb, false),
  ('webhook_fallback_polling_enabled', 'true'::jsonb, false),
  ('webhook_silence_minutes', '5'::jsonb, false),
  ('max_retry_attempts', '3'::jsonb, false),
  ('api_timeout_ms', '8000'::jsonb, false),
  ('rate_limit_pause_threshold_pct', '70'::jsonb, false),
  ('proxy_global_enabled', 'false'::jsonb, false),
  ('proxy_global_type', '"http"'::jsonb, false),
  ('proxy_global_host', '""'::jsonb, false),
  ('proxy_global_port', '0'::jsonb, false),
  ('proxy_global_username', '""'::jsonb, false),
  ('proxy_global_password', '""'::jsonb, false)
ON CONFLICT (key) DO NOTHING;