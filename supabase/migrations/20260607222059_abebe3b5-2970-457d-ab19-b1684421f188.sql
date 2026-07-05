ALTER TABLE public.stores
  ADD COLUMN last_ping_at timestamptz,
  ADD COLUMN last_health_check timestamptz,
  ADD COLUMN last_offline timestamptz,
  ADD COLUMN last_online timestamptz,
  ADD COLUMN proxy_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN proxy_type text NOT NULL DEFAULT 'none',
  ADD COLUMN proxy_host text,
  ADD COLUMN proxy_port integer,
  ADD COLUMN registered_webhook_topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN webhooks_registered_at timestamptz;

ALTER TABLE public.rotation_log
  ADD COLUMN trigger_type text NOT NULL DEFAULT 'manual',
  ADD COLUMN from_revenue numeric,
  ADD COLUMN to_revenue numeric;

ALTER TABLE public.webhook_events
  ADD COLUMN topic text NOT NULL DEFAULT '',
  ADD COLUMN signature_valid boolean NOT NULL DEFAULT true,
  ADD COLUMN processed boolean NOT NULL DEFAULT false,
  ADD COLUMN amount numeric,
  ADD COLUMN currency text,
  ADD COLUMN received_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN error_message text;

ALTER TABLE public.products
  ADD COLUMN sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN show_discount_badge boolean NOT NULL DEFAULT true,
  ADD COLUMN show_trending_badge boolean NOT NULL DEFAULT false,
  ADD COLUMN trending_badge_label text;

ALTER TABLE public.sessions
  ADD COLUMN visitor_id text,
  ADD COLUMN landing_page text,
  ADD COLUMN browser text,
  ADD COLUMN utm_content text,
  ADD COLUMN utm_term text;

ALTER TABLE public.ab_tests
  ADD COLUMN impressions_a integer NOT NULL DEFAULT 0,
  ADD COLUMN impressions_b integer NOT NULL DEFAULT 0,
  ADD COLUMN checkouts_a integer NOT NULL DEFAULT 0,
  ADD COLUMN checkouts_b integer NOT NULL DEFAULT 0,
  ADD COLUMN conversions_a integer NOT NULL DEFAULT 0,
  ADD COLUMN conversions_b integer NOT NULL DEFAULT 0,
  ADD COLUMN revenue_a numeric NOT NULL DEFAULT 0,
  ADD COLUMN revenue_b numeric NOT NULL DEFAULT 0,
  ADD COLUMN winner text,
  ADD COLUMN confidence_level numeric NOT NULL DEFAULT 0;

ALTER TABLE public.ab_test_events
  ADD COLUMN value numeric;

ALTER TABLE public.site_branding
  ADD COLUMN og_image_url text,
  ADD COLUMN twitter_handle text;

ALTER TABLE public.utm_campaigns
  ADD COLUMN utm_source text,
  ADD COLUMN utm_medium text,
  ADD COLUMN utm_campaign text,
  ADD COLUMN utm_content text,
  ADD COLUMN utm_term text,
  ADD COLUMN generated_url text,
  ADD COLUMN clicks integer NOT NULL DEFAULT 0,
  ADD COLUMN checkouts integer NOT NULL DEFAULT 0,
  ADD COLUMN orders integer NOT NULL DEFAULT 0,
  ADD COLUMN revenue numeric NOT NULL DEFAULT 0;

ALTER TABLE public.home_sections
  ADD COLUMN enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN data jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.home_sections SET enabled = is_active, data = content WHERE data = '{}'::jsonb;

UPDATE public.system_logs SET category = COALESCE(category, ''), message = COALESCE(message, '') WHERE category IS NULL OR message IS NULL;
ALTER TABLE public.system_logs
  ADD COLUMN store_id uuid,
  ALTER COLUMN category SET NOT NULL,
  ALTER COLUMN category SET DEFAULT '',
  ALTER COLUMN message SET NOT NULL,
  ALTER COLUMN message SET DEFAULT '';