-- >>> 20260424203744_6129da3d-47c9-4f55-89d2-fef3fed81516.sql
-- =========================================================================
-- ROLES SYSTEM (separate table — never store roles on profiles!)
-- =========================================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'analyst', 'support');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can read their own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- updated_at trigger helper
-- =========================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================================================
-- CATEGORIES
-- =========================================================================
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  image_url TEXT,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_categories_updated BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Categories are publicly readable"
  ON public.categories FOR SELECT USING (true);
CREATE POLICY "Admins manage categories"
  ON public.categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- PRODUCTS
-- =========================================================================
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description_short TEXT,
  description_long TEXT,
  price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  compare_price DECIMAL(10,2) CHECK (compare_price IS NULL OR compare_price >= 0),
  cost_price DECIMAL(10,2),
  sku TEXT,
  images JSONB NOT NULL DEFAULT '[]',
  variants JSONB NOT NULL DEFAULT '[]',
  quantity_breaks JSONB NOT NULL DEFAULT '[]',
  shopify_handle TEXT NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  tags JSONB NOT NULL DEFAULT '[]',
  page_builder_data JSONB NOT NULL DEFAULT '{}',
  seo_title TEXT,
  seo_description TEXT,
  og_image TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','archived')),
  ab_test_id UUID,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_products_status ON public.products(status);
CREATE INDEX idx_products_category ON public.products(category_id);

CREATE POLICY "Active products are publicly readable"
  ON public.products FOR SELECT
  USING (status = 'active' OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage products"
  ON public.products FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- STORES (Shopify configs — credentials encrypted server-side)
-- =========================================================================
CREATE TABLE public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_domain TEXT NOT NULL UNIQUE CHECK (shop_domain LIKE '%.myshopify.com'),
  display_name TEXT,
  client_id TEXT,
  client_secret_encrypted TEXT,
  access_token_encrypted TEXT,
  oauth_scopes TEXT NOT NULL DEFAULT 'read_products,read_orders,write_orders',
  webhook_secret_encrypted TEXT,
  cloudflare_worker_url TEXT NOT NULL,
  hmac_secret_encrypted TEXT,
  rotation_threshold DECIMAL(10,2) NOT NULL DEFAULT 847.00,
  custom_threshold DECIMAL(10,2),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_online BOOLEAN NOT NULL DEFAULT true,
  is_current BOOLEAN NOT NULL DEFAULT false,
  last_offline TIMESTAMPTZ,
  offline_reason TEXT,
  last_online TIMESTAMPTZ,
  token_status TEXT NOT NULL DEFAULT 'valid' CHECK (token_status IN ('valid','expired','unauthorized')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_stores_updated BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE UNIQUE INDEX idx_stores_one_current ON public.stores(is_current) WHERE is_current = true;

CREATE POLICY "Admins manage stores"
  ON public.stores FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- STORE STATS
-- =========================================================================
CREATE TABLE public.store_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  shopify_daily_orders INTEGER NOT NULL DEFAULT 0,
  shopify_daily_revenue DECIMAL(12,2) NOT NULL DEFAULT 0,
  shopify_total_orders INTEGER NOT NULL DEFAULT 0,
  shopify_total_revenue DECIMAL(12,2) NOT NULL DEFAULT 0,
  checkout_launches_24h INTEGER NOT NULL DEFAULT 0,
  cvr_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  api_calls_today INTEGER NOT NULL DEFAULT 0,
  last_rate_limit_hit TIMESTAMPTZ,
  last_sync TIMESTAMPTZ,
  last_order TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, date)
);

ALTER TABLE public.store_stats ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_store_stats_updated BEFORE UPDATE ON public.store_stats
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_store_stats_store_date ON public.store_stats(store_id, date DESC);

CREATE POLICY "Admins read store stats"
  ON public.store_stats FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage store stats"
  ON public.store_stats FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- ROTATION LOG
-- =========================================================================
CREATE TABLE public.rotation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  to_store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  reason TEXT,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('threshold_exceeded','store_offline','manual','background_sync','checkout_retry')),
  from_revenue DECIMAL(12,2),
  to_revenue DECIMAL(12,2),
  from_threshold DECIMAL(12,2),
  attempts INTEGER NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rotation_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_rotation_log_created ON public.rotation_log(created_at DESC);

CREATE POLICY "Admins read rotation log"
  ON public.rotation_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage rotation log"
  ON public.rotation_log FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- VARIANT CACHE (permanent — never expires)
-- =========================================================================
CREATE TABLE public.variant_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT NOT NULL UNIQUE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_slug TEXT NOT NULL,
  variant_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.variant_cache ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_variant_cache_store_slug ON public.variant_cache(store_id, product_slug);

CREATE POLICY "Admins manage variant cache"
  ON public.variant_cache FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- SESSIONS (anonymous behavior tracking)
-- =========================================================================
CREATE TABLE public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL UNIQUE,
  visitor_id TEXT,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  referrer TEXT,
  landing_page TEXT,
  device_type TEXT,
  browser TEXT,
  country TEXT,
  events JSONB NOT NULL DEFAULT '[]',
  time_on_page INTEGER NOT NULL DEFAULT 0,
  scroll_depth INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_sessions_visitor ON public.sessions(visitor_id);
CREATE INDEX idx_sessions_created ON public.sessions(created_at DESC);

-- Anonymous tracking: anyone can insert/update their own session
CREATE POLICY "Anyone can create sessions"
  ON public.sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update sessions by session_id"
  ON public.sessions FOR UPDATE USING (true);
CREATE POLICY "Admins read all sessions"
  ON public.sessions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete sessions"
  ON public.sessions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- CUSTOMERS (CRM — populated by Shopify webhooks)
-- =========================================================================
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  phone TEXT,
  first_name TEXT,
  last_name TEXT,
  shopify_customer_ids JSONB NOT NULL DEFAULT '{}',
  ltv DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_orders INTEGER NOT NULL DEFAULT 0,
  aov DECIMAL(12,2) NOT NULL DEFAULT 0,
  segment TEXT NOT NULL DEFAULT 'new' CHECK (segment IN ('new','loyal','vip','at_risk','lost')),
  first_utm JSONB,
  last_utm JSONB,
  tags JSONB NOT NULL DEFAULT '[]',
  notes JSONB NOT NULL DEFAULT '[]',
  first_purchase TIMESTAMPTZ,
  last_purchase TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_customers_email ON public.customers(email);
CREATE INDEX idx_customers_segment ON public.customers(segment);

CREATE POLICY "Admins manage customers"
  ON public.customers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- AB TESTS (Phase 2, schema ready)
-- =========================================================================
CREATE TABLE public.ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  variant_a JSONB NOT NULL DEFAULT '{}',
  variant_b JSONB NOT NULL DEFAULT '{}',
  traffic_split INTEGER NOT NULL DEFAULT 50 CHECK (traffic_split BETWEEN 1 AND 99),
  impressions_a INTEGER NOT NULL DEFAULT 0,
  impressions_b INTEGER NOT NULL DEFAULT 0,
  checkouts_a INTEGER NOT NULL DEFAULT 0,
  checkouts_b INTEGER NOT NULL DEFAULT 0,
  conversions_a INTEGER NOT NULL DEFAULT 0,
  conversions_b INTEGER NOT NULL DEFAULT 0,
  revenue_a DECIMAL(12,2) NOT NULL DEFAULT 0,
  revenue_b DECIMAL(12,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  winner TEXT CHECK (winner IN ('a','b','none')),
  confidence_level DECIMAL(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ab_tests ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_ab_tests_updated BEFORE UPDATE ON public.ab_tests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Admins manage ab_tests"
  ON public.ab_tests FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- UTM CAMPAIGNS
-- =========================================================================
CREATE TABLE public.utm_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  generated_url TEXT,
  clicks INTEGER NOT NULL DEFAULT 0,
  checkouts INTEGER NOT NULL DEFAULT 0,
  orders INTEGER NOT NULL DEFAULT 0,
  revenue DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.utm_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage utm_campaigns"
  ON public.utm_campaigns FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- SETTINGS
-- =========================================================================
CREATE TABLE public.settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Public settings are readable"
  ON public.settings FOR SELECT USING (is_public = true);
CREATE POLICY "Admins manage settings"
  ON public.settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.settings (key, value, is_public) VALUES
  ('global_rotation_threshold', '847.00'::jsonb, false),
  ('enable_rotation', 'true'::jsonb, false),
  ('api_version', '"2025-01"'::jsonb, false),
  ('rotation_random_variance', '20'::jsonb, false),
  ('no_rotation_hours_start', '1'::jsonb, false),
  ('no_rotation_hours_end', '7'::jsonb, false),
  ('weekend_threshold_multiplier', '1.5'::jsonb, false),
  ('meta_pixel_id', '""'::jsonb, true),
  ('meta_access_token', '""'::jsonb, false),
  ('tiktok_pixel_id', '""'::jsonb, true),
  ('tiktok_access_token', '""'::jsonb, false),
  ('store_name', '"Happy Scam"'::jsonb, true),
  ('store_currency', '"EUR"'::jsonb, true);

-- =========================================================================
-- INTEGRATIONS
-- =========================================================================
CREATE TABLE public.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT false,
  last_sync TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_integrations_updated BEFORE UPDATE ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Admins manage integrations"
  ON public.integrations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- TEAM MEMBERS (profile data — roles are in user_roles)
-- =========================================================================
CREATE TABLE public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  avatar_url TEXT,
  permissions JSONB NOT NULL DEFAULT '{}',
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_team_members_updated BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Users can read their own team profile"
  ON public.team_members FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Admins manage team members"
  ON public.team_members FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================================================
-- AUTO-CREATE team_member on signup + grant first user admin role
-- =========================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count INTEGER;
BEGIN
  INSERT INTO public.team_members (user_id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (email) DO UPDATE SET user_id = EXCLUDED.user_id;

  -- First user becomes admin automatically
  SELECT COUNT(*) INTO user_count FROM public.user_roles WHERE role = 'admin';
  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
-- >>> 20260424203803_13d892a1-315e-4ad0-9a63-08aa8c612169.sql
-- Fix function search_path
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Tighten sessions RLS: anonymous tracking is OK but with shape constraints
DROP POLICY IF EXISTS "Anyone can create sessions" ON public.sessions;
DROP POLICY IF EXISTS "Anyone can update sessions by session_id" ON public.sessions;

CREATE POLICY "Public can insert valid sessions"
  ON public.sessions FOR INSERT
  WITH CHECK (
    session_id IS NOT NULL
    AND length(session_id) BETWEEN 8 AND 128
    AND (visitor_id IS NULL OR length(visitor_id) <= 128)
    AND (utm_source IS NULL OR length(utm_source) <= 128)
    AND (utm_medium IS NULL OR length(utm_medium) <= 128)
    AND (utm_campaign IS NULL OR length(utm_campaign) <= 256)
    AND (utm_content IS NULL OR length(utm_content) <= 256)
    AND (utm_term IS NULL OR length(utm_term) <= 256)
    AND (referrer IS NULL OR length(referrer) <= 2048)
    AND (landing_page IS NULL OR length(landing_page) <= 2048)
  );

CREATE POLICY "Public can update sessions with valid shape"
  ON public.sessions FOR UPDATE
  USING (true)
  WITH CHECK (
    session_id IS NOT NULL
    AND length(session_id) BETWEEN 8 AND 128
    AND time_on_page >= 0
    AND scroll_depth BETWEEN 0 AND 100
  );
-- >>> 20260424210626_b2f4e24c-3bea-4d2b-b944-272c083835a5.sql
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
-- >>> 20260424212532_ff22d9c5-fa34-46b1-89a6-9637cb4b64ea.sql
CREATE TABLE IF NOT EXISTS public.ab_test_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ab_test_id uuid NOT NULL,
  variant text NOT NULL CHECK (variant IN ('A','B')),
  event_type text NOT NULL CHECK (event_type IN ('impression','checkout','conversion')),
  visitor_id text,
  value numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ab_test_events_test ON public.ab_test_events(ab_test_id, variant, event_type);

ALTER TABLE public.ab_test_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can insert ab events"
  ON public.ab_test_events
  FOR INSERT
  TO public
  WITH CHECK (
    ab_test_id IS NOT NULL
    AND (visitor_id IS NULL OR length(visitor_id) <= 128)
    AND value >= 0
  );

CREATE POLICY "Admins read ab events"
  ON public.ab_test_events
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage ab events"
  ON public.ab_test_events
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
-- >>> 20260424223338_3950940a-7657-4603-b67b-6d13651265bf.sql
-- Tracking events with server-side dedup
CREATE TABLE IF NOT EXISTS public.tracking_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id text NOT NULL,
  channel text NOT NULL,
  event_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  response_code integer,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tracking_events_channel_chk CHECK (channel IN ('meta','tiktok'))
);

CREATE UNIQUE INDEX IF NOT EXISTS tracking_events_event_channel_uniq
  ON public.tracking_events (event_id, channel);

CREATE INDEX IF NOT EXISTS tracking_events_status_idx
  ON public.tracking_events (status, created_at);

ALTER TABLE public.tracking_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage tracking_events" ON public.tracking_events;
CREATE POLICY "Admins manage tracking_events"
  ON public.tracking_events
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS tracking_events_set_updated_at ON public.tracking_events;
CREATE TRIGGER tracking_events_set_updated_at
  BEFORE UPDATE ON public.tracking_events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Shopify OAuth columns on stores
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS oauth_state text,
  ADD COLUMN IF NOT EXISTS installed_at timestamptz;

CREATE INDEX IF NOT EXISTS stores_oauth_state_idx
  ON public.stores (oauth_state)
  WHERE oauth_state IS NOT NULL;
-- >>> 20260424225240_c1b65450-b3a9-46d7-a424-df23cee55f01.sql
CREATE TABLE IF NOT EXISTS public.shopify_oauth_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NULL,
  shop_domain TEXT NOT NULL,
  function_name TEXT NOT NULL,
  phase TEXT NOT NULL,
  redirect_uri TEXT NULL,
  authorize_url TEXT NULL,
  http_status INTEGER NULL,
  status TEXT NOT NULL DEFAULT 'info',
  error_message TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.shopify_oauth_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage shopify oauth logs"
ON public.shopify_oauth_logs
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_shopify_oauth_logs_store_created
ON public.shopify_oauth_logs (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shopify_oauth_logs_shop_created
ON public.shopify_oauth_logs (shop_domain, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_shopify_oauth_logs_function_created
ON public.shopify_oauth_logs (function_name, created_at DESC);
-- >>> 20260424225646_748616b9-96e9-48f0-9d86-c9e6fe783c1b.sql
ALTER TABLE public.stores
ADD COLUMN IF NOT EXISTS app_return_url TEXT NULL;
-- >>> 20260424234453_99b63504-9286-41c8-841d-ef12874b4387.sql
ALTER TABLE public.stores
  DROP CONSTRAINT IF EXISTS stores_token_status_check;

ALTER TABLE public.stores
  ADD CONSTRAINT stores_token_status_check
  CHECK (token_status IN ('valid', 'expired', 'unauthorized', 'pending', 'revoked'));

CREATE TABLE IF NOT EXISTS public.store_operation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NULL,
  shop_domain text NOT NULL,
  operation text NOT NULL DEFAULT 'store_save',
  correlation_id text NOT NULL,
  payload_hash text NOT NULL,
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  http_status integer NULL,
  status text NOT NULL DEFAULT 'info' CHECK (status IN ('info', 'success', 'error', 'retry')),
  error_message text NULL,
  attempt integer NOT NULL DEFAULT 1,
  duration_ms integer NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_operation_logs_store_id_created_at
  ON public.store_operation_logs (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_store_operation_logs_correlation_id
  ON public.store_operation_logs (correlation_id);

ALTER TABLE public.store_operation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage store operation logs" ON public.store_operation_logs;
CREATE POLICY "Admins manage store operation logs"
  ON public.store_operation_logs
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
-- >>> 20260424234535_cdda7ec5-446a-4c0c-a005-1bc1ad6312ff.sql
ALTER TABLE public.store_operation_logs
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
-- >>> 20260425013400_84c0b85d-981b-4671-9512-7da4a98cbfe7.sql
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
-- >>> 20260425014434_3c03f8bc-ee1b-41ea-9a1e-0a981c25c192.sql
-- Enable realtime for live UI updates
ALTER TABLE public.stores REPLICA IDENTITY FULL;
ALTER TABLE public.store_stats REPLICA IDENTITY FULL;
ALTER TABLE public.webhook_events REPLICA IDENTITY FULL;
ALTER TABLE public.system_logs REPLICA IDENTITY FULL;
ALTER TABLE public.rotation_log REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stores;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.store_stats;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.webhook_events;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.system_logs;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rotation_log;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END$$;

-- Seed global rotation/proxy/webhook settings (idempotent)
INSERT INTO public.settings (key, value, is_public)
VALUES (
  'global_config',
  jsonb_build_object(
    'default_rotation_threshold', 847,
    'default_cap_amount', 580,
    'default_cap_window_days', 1,
    'webhook_silent_minutes', 5,
    'fallback_poll_interval_minutes', 10,
    'circuit_breaker_threshold', 5,
    'circuit_breaker_cooldown_minutes', 15,
    'global_proxy_enabled', false,
    'global_proxy_type', 'http',
    'global_proxy_host', null,
    'global_proxy_port', null,
    'global_proxy_username', null,
    'global_proxy_password_encrypted', null
  ),
  false
)
ON CONFLICT (key) DO NOTHING;
-- >>> 20260425023116_e1768146-2e35-4e99-a166-dfa031150eef.sql
-- Add write_products to default scopes and flag existing stores for re-auth
ALTER TABLE public.stores 
  ALTER COLUMN oauth_scopes SET DEFAULT 'read_products,write_products,read_orders,write_orders,read_customers,read_draft_orders,write_draft_orders,write_webhooks';

UPDATE public.stores
SET 
  oauth_scopes = CASE 
    WHEN oauth_scopes IS NULL OR oauth_scopes = '' THEN 'read_products,write_products,read_orders,write_orders,read_customers,read_draft_orders,write_draft_orders,write_webhooks'
    WHEN oauth_scopes NOT LIKE '%write_products%' THEN oauth_scopes || ',write_products'
    ELSE oauth_scopes
  END,
  needs_reauth = CASE 
    WHEN oauth_scopes IS NULL OR oauth_scopes NOT LIKE '%write_products%' THEN true
    ELSE needs_reauth
  END;
-- >>> 20260425025539_7c6d2ecc-000f-4dd4-bf84-c2261b0cb03d.sql
-- =========================================================================
-- 1) COMPANY INFO (dati aziendali centralizzati)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.company_info (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL DEFAULT 'My Company',
  legal_name text,
  vat_number text,
  tax_code text,
  rea_number text,
  address_line1 text,
  address_line2 text,
  city text,
  postal_code text,
  province text,
  country text DEFAULT 'IT',
  contact_email text,
  support_email text,
  contact_phone text,
  whatsapp text,
  business_hours text,
  couriers jsonb NOT NULL DEFAULT '[]'::jsonb,
  shipping_times jsonb NOT NULL DEFAULT '[]'::jsonb,
  return_window_days integer NOT NULL DEFAULT 30,
  free_shipping_threshold numeric DEFAULT 0,
  social_links jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_info ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read company_info"
  ON public.company_info FOR SELECT TO public USING (true);

CREATE POLICY "Admins manage company_info"
  ON public.company_info FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_company_info_updated_at
  BEFORE UPDATE ON public.company_info
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.company_info (company_name, contact_email, country)
SELECT 'HappyScam', 'support@happyscam.com', 'IT'
WHERE NOT EXISTS (SELECT 1 FROM public.company_info);

-- =========================================================================
-- 2) LEGAL PAGES (template fisso con placeholder)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.legal_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  body_markdown text NOT NULL DEFAULT '',
  is_published boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.legal_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read published legal pages"
  ON public.legal_pages FOR SELECT TO public
  USING (is_published = true OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage legal pages"
  ON public.legal_pages FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_legal_pages_updated_at
  BEFORE UPDATE ON public.legal_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.legal_pages (slug, title, body_markdown) VALUES
  ('privacy', 'Privacy Policy', E'# Privacy Policy\n\nLa presente informativa descrive le modalità di gestione dei dati personali raccolti da **{{company_name}}** ({{legal_name}}), con sede in {{address_line1}}, {{postal_code}} {{city}} ({{province}}), {{country}} — P.IVA {{vat_number}}.\n\n## Titolare del trattamento\n{{company_name}} — email: {{contact_email}}\n\n## Tipologie di dati raccolti\n- Dati di contatto (nome, cognome, email, telefono)\n- Dati di pagamento (gestiti da provider terzi PCI-DSS compliant)\n- Dati di navigazione (cookie tecnici e analitici)\n\n## Finalità del trattamento\n1. Evasione degli ordini\n2. Assistenza clienti\n3. Adempimenti fiscali e contabili\n4. Marketing (previo consenso)\n\n## Diritti dell\\\'interessato\nPuoi esercitare i diritti previsti dal GDPR scrivendo a {{contact_email}}.\n\n## Modifiche\nQuesta policy può essere aggiornata. Ultima revisione: data odierna.\n'),
  ('terms', 'Termini e Condizioni', E'# Termini e Condizioni di Vendita\n\nI presenti termini regolano i contratti di vendita stipulati tramite il sito gestito da **{{company_name}}** ({{legal_name}}) — P.IVA {{vat_number}}, sede in {{address_line1}}, {{postal_code}} {{city}}.\n\n## 1. Oggetto\nVendita a distanza di prodotti tramite sito web.\n\n## 2. Prezzi\nI prezzi sono espressi in Euro e includono IVA quando dovuta.\n\n## 3. Ordini\nL\\\'ordine si perfeziona con la conferma via email.\n\n## 4. Pagamenti\nAccettiamo i principali circuiti europei (Visa, Mastercard, American Express, PayPal, Apple Pay, Google Pay).\n\n## 5. Diritto di recesso\nIl Cliente ha diritto di recedere entro {{return_window_days}} giorni dal ricevimento, ai sensi del D.Lgs. 206/2005.\n\n## 6. Garanzie\nGaranzia legale di conformità di 24 mesi.\n\n## 7. Foro competente\nPer le controversie è competente il foro del consumatore.\n\nContatti: {{contact_email}} — {{contact_phone}}\n'),
  ('refunds', 'Politica di Rimborso', E'# Politica di Rimborso\n\n**{{company_name}}** garantisce il diritto di recesso entro **{{return_window_days}} giorni** dalla consegna.\n\n## Come richiedere un rimborso\n1. Invia una email a {{contact_email}} indicando numero d\\\'ordine e motivo\n2. Riceverai le istruzioni per la spedizione di reso\n3. Una volta ricevuto e verificato il prodotto, il rimborso verrà accreditato sul metodo di pagamento originale entro 14 giorni\n\n## Condizioni\n- Il prodotto deve essere integro e nella confezione originale\n- Sono esclusi prodotti personalizzati o sigillati aperti\n\n## Spese di reso\nLe spese di spedizione di reso sono a carico del cliente, salvo difetti del prodotto.\n\nPer assistenza: {{support_email}}\n'),
  ('shipping', 'Tempi e Modalità di Spedizione', E'# Spedizioni\n\n**{{company_name}}** spedisce in tutta Europa tramite corrieri espresso selezionati.\n\n## Tempi di consegna\n{{shipping_times_block}}\n\n## Corrieri utilizzati\n{{couriers_block}}\n\n## Tracking\nRiceverai email con link di tracciamento entro 24h dalla spedizione.\n\n## Spedizione gratuita\nSpedizione gratuita per ordini superiori a {{free_shipping_threshold}} €.\n\nContatti: {{contact_email}}\n')
ON CONFLICT (slug) DO NOTHING;

-- =========================================================================
-- 3) SITE BRANDING (logo, header, banner, horizon)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.site_branding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name text NOT NULL DEFAULT 'My Store',
  logo_url text,
  logo_dark_url text,
  favicon_url text,
  header_tagline text,
  top_banner_enabled boolean NOT NULL DEFAULT false,
  top_banner_text text DEFAULT '🚚 Spedizione gratuita su tutti gli ordini',
  top_banner_link text,
  top_banner_bg text DEFAULT '#0a0a0a',
  top_banner_fg text DEFAULT '#ffffff',
  horizon_enabled boolean NOT NULL DEFAULT true,
  horizon_text text DEFAULT 'Pagamenti sicuri • Reso 30 giorni • Spedizione tracciata',
  horizon_logos jsonb NOT NULL DEFAULT '[]'::jsonb,
  primary_color text DEFAULT '#0a0a0a',
  accent_color text DEFAULT '#3b82f6',
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.site_branding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read site branding"
  ON public.site_branding FOR SELECT TO public USING (true);

CREATE POLICY "Admins manage site branding"
  ON public.site_branding FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_site_branding_updated_at
  BEFORE UPDATE ON public.site_branding
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.site_branding (store_name)
SELECT 'HappyScam' WHERE NOT EXISTS (SELECT 1 FROM public.site_branding);

-- =========================================================================
-- 4) HOME SECTIONS (contenuti home page)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.home_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT true,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.home_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read enabled home sections"
  ON public.home_sections FOR SELECT TO public
  USING (enabled = true OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage home sections"
  ON public.home_sections FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_home_sections_updated_at
  BEFORE UPDATE ON public.home_sections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.home_sections (section_key, sort_order, data) VALUES
  ('hero', 0, '{"logo_enabled":true,"logo_url":null,"title":"Next-gen shopping experience","subtitle":"Prodotti selezionati. Spedizione veloce. Garanzia 30 giorni.","cta_label":"Esplora il catalogo","cta_link":"/shop","bg_image_enabled":true,"bg_image_url":null,"bg_overlay_opacity":0.5}'::jsonb),
  ('features', 1, '{"items":[{"icon":"truck","title":"Spedizione gratuita","desc":"Su tutti gli ordini sopra i 50€"},{"icon":"shield","title":"Pagamenti sicuri","desc":"SSL e 3D Secure"},{"icon":"refresh","title":"30 giorni di reso","desc":"Soddisfatti o rimborsati"},{"icon":"headphones","title":"Supporto dedicato","desc":"Risposta entro 24h"}]}'::jsonb),
  ('featured_products', 2, '{"title":"I più venduti","subtitle":"Scopri le scelte preferite dai nostri clienti","limit":8}'::jsonb),
  ('cta_band', 3, '{"title":"Pronto per fare il tuo ordine?","subtitle":"Iscriviti alla newsletter e ricevi il 10% di sconto","cta_label":"Iscriviti","cta_link":"/shop"}'::jsonb)
ON CONFLICT (section_key) DO NOTHING;

-- =========================================================================
-- 5) FOOTER CONFIG (badge + payment logos)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.footer_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  badges jsonb NOT NULL DEFAULT '[]'::jsonb,
  payment_methods jsonb NOT NULL DEFAULT '[]'::jsonb,
  newsletter_enabled boolean NOT NULL DEFAULT true,
  newsletter_title text DEFAULT 'Iscriviti alla newsletter',
  newsletter_subtitle text DEFAULT 'Sconti esclusivi e novità in anteprima',
  copyright_text text,
  links jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.footer_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read footer config"
  ON public.footer_config FOR SELECT TO public USING (true);

CREATE POLICY "Admins manage footer config"
  ON public.footer_config FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_footer_config_updated_at
  BEFORE UPDATE ON public.footer_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.footer_config (badges, payment_methods)
SELECT
  '[{"icon":"truck","title":"Spedizione gratuita","desc":"Su ordini superiori a 50€"},{"icon":"refresh","title":"Reso 30 giorni","desc":"Soddisfatti o rimborsati"},{"icon":"shield","title":"Pagamenti sicuri SSL","desc":"Crittografia 256-bit e 3D Secure"},{"icon":"award","title":"Garanzia ufficiale","desc":"Prodotti 100% originali"}]'::jsonb,
  '["visa","mastercard","amex","paypal","applepay","googlepay","klarna","sepa"]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.footer_config);

-- =========================================================================
-- 6) SHOPIFY VARIANT MAP (cache permanente)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.shopify_variant_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  product_id uuid NOT NULL,
  local_variant_key text NOT NULL,
  shopify_product_id text NOT NULL,
  shopify_variant_id text NOT NULL,
  shopify_handle text,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, product_id, local_variant_key)
);

CREATE INDEX IF NOT EXISTS idx_variant_map_store_product
  ON public.shopify_variant_map (store_id, product_id);
CREATE INDEX IF NOT EXISTS idx_variant_map_shopify_product
  ON public.shopify_variant_map (store_id, shopify_product_id);

ALTER TABLE public.shopify_variant_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage shopify variant map"
  ON public.shopify_variant_map FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- =========================================================================
-- 7) PRODUCTS: nuove colonne per sync
-- =========================================================================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS shopify_synced boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shopify_target_stores jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS shopify_title_override text,
  ADD COLUMN IF NOT EXISTS last_shopify_sync_at timestamptz;

-- =========================================================================
-- 8) SETTINGS: defaults sync
-- =========================================================================
INSERT INTO public.settings (key, value, is_public)
VALUES (
  'shopify_sync_defaults',
  '{"default_title_template":"{{product_name}}","default_slug_strategy":"product_slug","skip_existing":true,"target_mode":"all"}'::jsonb,
  false
)
ON CONFLICT (key) DO NOTHING;

-- >>> 20260425040443_9467d63a-7978-48dc-bd22-e93308f195a8.sql

-- Tabella per tracciare bot bloccati
CREATE TABLE IF NOT EXISTS public.bot_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  ip text,
  user_agent text,
  reason text NOT NULL,
  bot_name text,
  path text,
  country text
);

ALTER TABLE public.bot_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage bot_blocks"
ON public.bot_blocks FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Public can insert bot_blocks"
ON public.bot_blocks FOR INSERT TO public
WITH CHECK (
  reason IS NOT NULL AND length(reason) <= 128
  AND (ip IS NULL OR length(ip) <= 64)
  AND (user_agent IS NULL OR length(user_agent) <= 1024)
  AND (bot_name IS NULL OR length(bot_name) <= 64)
  AND (path IS NULL OR length(path) <= 512)
);

CREATE INDEX IF NOT EXISTS idx_bot_blocks_created_at ON public.bot_blocks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_blocks_bot_name ON public.bot_blocks(bot_name);

-- Colonne aggiuntive su sessions per LP Performance
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS bounce boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pages_path jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS clicks integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_mobile boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS converted boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_sessions_product_id ON public.sessions(product_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON public.sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON public.sessions(session_id);

-- >>> 20260425051140_655b1e22-64ff-4dc6-8378-3e93e5f83ff2.sql
-- Aggiorna il default della colonna
ALTER TABLE public.stores
  ALTER COLUMN oauth_scopes SET DEFAULT 'read_products,write_products,read_orders,write_orders,read_customers,read_draft_orders,write_draft_orders,write_webhook_subscriptions';

-- Sostituisce lo scope obsoleto sugli store esistenti
UPDATE public.stores
SET oauth_scopes = REPLACE(oauth_scopes, 'write_webhooks', 'write_webhook_subscriptions')
WHERE oauth_scopes LIKE '%write_webhooks%'
  AND oauth_scopes NOT LIKE '%write_webhook_subscriptions%';
-- >>> 20260425051407_b056d0d7-d18b-4732-b90a-10de5780638c.sql
ALTER TABLE public.stores
  ALTER COLUMN oauth_scopes SET DEFAULT 'read_products,write_products,read_orders,write_orders,read_customers,read_draft_orders,write_draft_orders,write_webhooks';

UPDATE public.stores
SET oauth_scopes = REPLACE(oauth_scopes, 'write_webhook_subscriptions', 'write_webhooks')
WHERE oauth_scopes LIKE '%write_webhook_subscriptions%';
-- >>> 20260425051627_3edba6f2-64b8-490a-b4eb-7d47c2f5b1f7.sql
ALTER TABLE public.stores
  ALTER COLUMN oauth_scopes SET DEFAULT 'read_products,write_products,read_orders,write_orders,read_customers,read_draft_orders,write_draft_orders';

UPDATE public.stores
SET oauth_scopes = regexp_replace(oauth_scopes, ',?write_webhooks', '', 'g')
WHERE oauth_scopes LIKE '%write_webhooks%';
-- >>> 20260425061940_9b54a9c2-6794-457c-b22b-657567631f14.sql
ALTER TABLE public.stores 
  ADD COLUMN IF NOT EXISTS shadow_checkout_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shadow_api_url text,
  ADD COLUMN IF NOT EXISTS washer_url text;
-- >>> 20260425070422_e8b96956-2221-434d-83b8-46abbea3ba00.sql
CREATE TABLE IF NOT EXISTS public.shadow_checkout_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL UNIQUE,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  shop_domain text,
  shadow_api_url text,
  washer_url text,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  stage text NOT NULL DEFAULT 'initiated',
  status text NOT NULL DEFAULT 'pending',
  http_status integer,
  invoice_url text,
  draft_order_id text,
  shopify_order_id text,
  error_message text,
  worker_response jsonb,
  duration_ms integer,
  user_agent text,
  visitor_id text,
  session_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shadow_checkout_log_created_at_idx
  ON public.shadow_checkout_log (created_at DESC);
CREATE INDEX IF NOT EXISTS shadow_checkout_log_request_id_idx
  ON public.shadow_checkout_log (request_id);
CREATE INDEX IF NOT EXISTS shadow_checkout_log_store_id_idx
  ON public.shadow_checkout_log (store_id);

ALTER TABLE public.shadow_checkout_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can insert shadow checkout log"
  ON public.shadow_checkout_log
  FOR INSERT
  TO public
  WITH CHECK (
    request_id IS NOT NULL
    AND length(request_id) BETWEEN 8 AND 128
    AND (visitor_id IS NULL OR length(visitor_id) <= 128)
    AND (session_id IS NULL OR length(session_id) <= 128)
    AND (user_agent IS NULL OR length(user_agent) <= 1024)
  );

CREATE POLICY "Public can update shadow checkout log by request_id"
  ON public.shadow_checkout_log
  FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (
    request_id IS NOT NULL
    AND length(request_id) BETWEEN 8 AND 128
  );

CREATE POLICY "Admins read shadow checkout log"
  ON public.shadow_checkout_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage shadow checkout log"
  ON public.shadow_checkout_log
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS shadow_checkout_log_set_updated_at ON public.shadow_checkout_log;
CREATE TRIGGER shadow_checkout_log_set_updated_at
  BEFORE UPDATE ON public.shadow_checkout_log
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
-- >>> 20260425123836_a4dc40e9-3efc-4439-a5ae-23d03dd3b59b.sql
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
-- >>> 20260425132252_21fc8872-367b-4f02-be2e-070addae3fa7.sql
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
-- >>> 20260425165527_ef0cb87f-1cb4-4bd5-9911-476f5b03f003.sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.processed_orders;
ALTER TABLE public.processed_orders REPLICA IDENTITY FULL;
-- >>> 20260425172140_bffcce3c-e27a-447b-aa16-6baef6dde692.sql
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS checkout_image_url TEXT;
-- >>> 20260426000018_e03f653b-308c-4c61-84b7-38de3ec7f261.sql
DO $$
DECLARE
  sid uuid := '4f980e40-08e4-44d4-9efd-c24860151178';
  daily_rev numeric;
  daily_ord int;
  life_rev numeric;
  life_ord int;
BEGIN
  SELECT COALESCE(SUM(amount),0), COUNT(*) INTO daily_rev, daily_ord
  FROM processed_orders
  WHERE store_id = sid
    AND processed_at >= CURRENT_DATE
    AND status NOT IN ('cancelled','refunded');

  SELECT COALESCE(SUM(amount),0), COUNT(*) INTO life_rev, life_ord
  FROM processed_orders
  WHERE store_id = sid
    AND status NOT IN ('cancelled','refunded');

  UPDATE stores SET cap_window_revenue = daily_rev WHERE id = sid;

  IF EXISTS (SELECT 1 FROM store_stats WHERE store_id = sid AND date = CURRENT_DATE) THEN
    UPDATE store_stats SET
      shopify_daily_orders = daily_ord,
      shopify_daily_revenue = daily_rev,
      shopify_total_orders = life_ord,
      shopify_total_revenue = life_rev,
      last_sync = now()
    WHERE store_id = sid AND date = CURRENT_DATE;
  ELSE
    INSERT INTO store_stats (store_id, date, shopify_daily_orders, shopify_daily_revenue, shopify_total_orders, shopify_total_revenue, last_sync)
    VALUES (sid, CURRENT_DATE, daily_ord, daily_rev, life_ord, life_rev, now());
  END IF;
END $$;
-- >>> 20260426004809_c7ae99f0-b9d0-4576-a107-0148a77e6cd9.sql
ALTER TABLE public.tracking_events
  ADD CONSTRAINT tracking_events_event_id_channel_key UNIQUE (event_id, channel);
-- >>> 20260426010222_ac759d36-a9a7-41a4-97ef-9e7227840275.sql
ALTER TABLE public.footer_config
  ADD COLUMN IF NOT EXISTS payment_methods_custom jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS couriers_custom jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS certifications jsonb NOT NULL DEFAULT '[]'::jsonb;
-- >>> 20260426011437_9739e3a9-7e37-4edd-b36c-7c20bebaafc1.sql
-- Create public bucket for brand assets (logos, payment, courier)
INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-assets', 'brand-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Public read
CREATE POLICY "Public read brand-assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'brand-assets');

-- Admin write/update/delete
CREATE POLICY "Admins upload brand-assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'brand-assets' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update brand-assets"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'brand-assets' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete brand-assets"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'brand-assets' AND has_role(auth.uid(), 'admin'::app_role));
-- >>> 20260426022104_375e9b6a-ddea-4b96-87ea-c3c501f2a2f8.sql
-- Tabella per cachare traduzioni di tutti i contenuti dinamici (prodotti, pagine legali, footer, ecc.)
CREATE TABLE IF NOT EXISTS public.translations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL,        -- 'product' | 'legal_page' | 'footer' | 'branding' | 'category' | 'company'
  entity_id TEXT NOT NULL,          -- uuid o slug o key
  field TEXT NOT NULL,              -- es. 'name', 'description_short', 'description_long', 'body_markdown', 'title', 'variant_label', 'break_label'
  lang TEXT NOT NULL,               -- 'en' | 'de' | 'fr' | 'es' | 'pt' | 'nl'
  value TEXT NOT NULL,              -- testo tradotto
  source_hash TEXT NOT NULL,        -- hash del contenuto sorgente per invalidare automaticamente
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, field, lang)
);

CREATE INDEX IF NOT EXISTS idx_translations_lookup
  ON public.translations (entity_type, entity_id, lang);

ALTER TABLE public.translations ENABLE ROW LEVEL SECURITY;

-- Pubblicamente leggibili (sono testi mostrati nel sito)
CREATE POLICY "Translations are publicly readable"
  ON public.translations FOR SELECT
  USING (true);

-- Solo admin gestiscono (la rigenerazione passa via service role / server function)
CREATE POLICY "Admins manage translations"
  ON public.translations FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_translations_updated_at
  BEFORE UPDATE ON public.translations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
-- >>> 20260426214711_ac1640ea-40dc-456f-bf3a-6398123762f8.sql
ALTER TABLE public.footer_config 
  ADD COLUMN IF NOT EXISTS shipped_with_logos jsonb NOT NULL DEFAULT '[]'::jsonb;
-- >>> 20260426221945_9725412d-9e9f-43cb-b2d9-74e2b1df74a2.sql
-- Sostituisce i contenuti delle pagine legali esistenti con versioni generiche senza placeholder
UPDATE public.legal_pages SET title = 'Privacy Policy', body_markdown = $$# Privacy Policy

La presente Privacy Policy descrive le modalità con cui vengono trattati i dati personali degli utenti che visitano questo sito o effettuano acquisti.

## Titolare del trattamento
Il titolare del trattamento è la società che gestisce questo sito, contattabile tramite l'apposita sezione dedicata sul sito.

## Dati raccolti
Raccogliamo solo i dati strettamente necessari per: evadere gli ordini, fornire assistenza clienti, migliorare il servizio e — previo consenso — per finalità di marketing.

## Finalità e base giuridica
I dati vengono trattati per dare esecuzione al contratto di acquisto, per adempiere a obblighi di legge (es. fiscali) e, se hai prestato il consenso, per inviarti comunicazioni promozionali.

## Conservazione
I dati relativi agli ordini sono conservati per il tempo previsto dalla normativa fiscale. I dati di marketing finché non revochi il consenso.

## Diritti dell'interessato
Puoi richiedere in qualsiasi momento accesso, rettifica, cancellazione, limitazione e portabilità dei tuoi dati, oltre a opporti al trattamento, scrivendo all'indirizzo di contatto indicato sul sito.

## Cookie
Per maggiori informazioni consulta la Cookie Policy.$$ WHERE slug='privacy';

UPDATE public.legal_pages SET title = 'Termini e Condizioni', body_markdown = $$# Termini e Condizioni

Gli acquisti effettuati su questo sito sono regolati dai presenti termini e condizioni.

## Oggetto
Il sito vende prodotti al consumatore finale tramite ordini online.

## Prezzi e pagamenti
Tutti i prezzi sono espressi nella valuta indicata e includono l'IVA quando applicabile. Sono accettati i metodi di pagamento indicati in fase di checkout.

## Spedizione
I tempi di consegna stimati sono indicati in fase d'ordine. Eventuali ritardi causati dal corriere non sono imputabili al venditore.

## Diritto di recesso
Il consumatore ha diritto di recedere dal contratto entro 30 giorni dalla consegna, senza necessità di motivazione, nei limiti previsti dalla normativa vigente.

## Garanzia
I prodotti sono coperti dalla garanzia legale di conformità prevista dal Codice del Consumo.

## Foro competente
Per qualsiasi controversia si applica la normativa europea a tutela del consumatore.$$ WHERE slug='terms';

UPDATE public.legal_pages SET title = 'Spedizioni', body_markdown = $$# Spedizioni

Spediamo gli ordini con corrieri tracciati in tutta Europa.

## Tempi di consegna
- 24-48h per la maggior parte delle destinazioni
- 3-5 giorni lavorativi per le aree più remote

## Costi
La spedizione è gratuita oltre la soglia indicata in fase di checkout. Sotto tale soglia viene applicato un contributo spese.

## Tracking
Una volta spedito, riceverai via email il codice di tracciamento per seguire la consegna in tempo reale.$$ WHERE slug='shipping';

UPDATE public.legal_pages SET title = 'Resi e Rimborsi', body_markdown = $$# Resi e Rimborsi

Hai a disposizione 30 giorni dalla consegna per restituire i prodotti acquistati.

## Come effettuare il reso
1. Contattaci tramite l'area dedicata sul sito indicando il numero d'ordine
2. Riceverai le istruzioni per la spedizione di reso
3. Spedisci il prodotto integro nella confezione originale

## Rimborsi
Il rimborso viene elaborato entro 14 giorni dalla ricezione del reso, sullo stesso metodo di pagamento utilizzato per l'acquisto.

## Prodotti non rimborsabili
Articoli personalizzati, sigillati per ragioni igieniche se aperti, e prodotti danneggiati per uso improprio.$$ WHERE slug='refunds';

-- Inserisce Cookie Policy se non presente
INSERT INTO public.legal_pages (slug, title, body_markdown, is_published)
SELECT 'cookies', 'Cookie Policy', $$# Cookie Policy

Questo sito utilizza cookie per garantire il corretto funzionamento e migliorare l'esperienza di navigazione.

## Tipologie di cookie
- **Tecnici**: necessari al funzionamento del sito (carrello, sessione, preferenze)
- **Analitici**: utilizzati in forma aggregata per misurare l'utilizzo del sito
- **Marketing**: solo previo consenso, per personalizzare comunicazioni e offerte

## Gestione del consenso
Puoi modificare le tue preferenze in qualsiasi momento dal banner cookie o dalle impostazioni del browser.

## Cookie di terze parti
Alcuni servizi (es. analytics, social media, pagamenti) impostano cookie di terze parti soggetti alle rispettive privacy policy.$$, true
WHERE NOT EXISTS (SELECT 1 FROM public.legal_pages WHERE slug='cookies');

-- Cancella le traduzioni cachate per le pagine legali (verranno rigenerate al prossimo run di traduzioni)
DELETE FROM public.translations WHERE entity_type='legal_page';
-- >>> 20260426225926_854b9cbf-875d-4ef7-bf4f-dd7d0e40fbf2.sql
-- Ensure pg_cron is enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Function: reset cap_window_revenue at Rome midnight (handles DST automatically)
CREATE OR REPLACE FUNCTION public.reset_daily_cap_windows()
RETURNS TABLE(reset_count integer, rome_day date) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rome_now timestamptz := now() AT TIME ZONE 'Europe/Rome';
  v_rome_midnight_utc timestamptz;
  v_count integer := 0;
BEGIN
  -- Today's midnight in Rome, expressed as a UTC timestamptz
  v_rome_midnight_utc := (date_trunc('day', (now() AT TIME ZONE 'Europe/Rome')) AT TIME ZONE 'Europe/Rome');

  -- Reset every store whose cap_window_start is older than today's Rome midnight
  -- (i.e. their 24h window started before the current Rome day)
  UPDATE public.stores
     SET cap_window_revenue = 0,
         cap_window_start   = v_rome_midnight_utc,
         updated_at         = now()
   WHERE cap_window_start IS NULL
      OR cap_window_start < v_rome_midnight_utc;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN QUERY SELECT v_count, (v_rome_now)::date;
END;
$$;

-- Allow service role / authenticated admin to invoke explicitly if needed
REVOKE ALL ON FUNCTION public.reset_daily_cap_windows() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_daily_cap_windows() TO postgres, service_role;

-- Run an initial alignment immediately
SELECT public.reset_daily_cap_windows();

-- Remove any previous schedule with the same name, then schedule every 5 minutes
DO $$
BEGIN
  PERFORM cron.unschedule('reset-daily-cap-windows-rome');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'reset-daily-cap-windows-rome',
  '*/5 * * * *',
  $$ SELECT public.reset_daily_cap_windows(); $$
);
-- >>> 20260427234816_2b10f8a8-a5e4-421a-9987-8b141bcb7df8.sql
-- Disable automatic daily reset of cap_window_revenue (Stores & Bridge stats)
DO $$
BEGIN
  PERFORM cron.unschedule('reset-daily-cap-windows-rome');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Drop the function so it can't be called accidentally
DROP FUNCTION IF EXISTS public.reset_daily_cap_windows();
-- >>> 20260429100746_58ae644c-7f64-4b71-ac02-66ca2944d3fa.sql
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS subtitle text,
  ADD COLUMN IF NOT EXISTS description_html text,
  ADD COLUMN IF NOT EXISTS trust_badge_text text;

ALTER TABLE public.footer_config
  ADD COLUMN IF NOT EXISTS footer_description text;
-- >>> 20260429104215_658a9e72-5010-4905-bef4-0862700b18dd.sql
ALTER TABLE public.footer_config 
  ADD COLUMN IF NOT EXISTS courier_logo_height_mobile integer DEFAULT 32,
  ADD COLUMN IF NOT EXISTS courier_logo_height_desktop integer DEFAULT 24;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS shipping_returns_html text;
-- >>> 20260429111857_192ff32a-ba5c-4900-9fe6-7a5e69ba10da.sql
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS bullets jsonb NOT NULL DEFAULT '[]'::jsonb;
-- >>> 20260429112215_cc1d01d3-88ce-4174-9824-5f87944d1180.sql
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_fit text DEFAULT 'contain';
-- >>> 20260429123310_2eaa8836-4410-4349-9e7d-1bff39691bcf.sql
-- Toggle badges per prodotto
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS show_discount_badge BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_trending_badge BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trending_badge_label TEXT;

-- Note: la struttura `variants` (jsonb) viene estesa logicamente per supportare:
--   { name, price, ..., swatch_type: 'text'|'color'|'image', swatch_value: string }
-- Nessuna nuova colonna necessaria, è jsonb libero.
-- >>> 20260429231815_c5f27445-a8e2-4a74-86be-be8327dbaa5e.sql
-- Aggiungi campi OG / SEO al branding per condivisione social
ALTER TABLE public.site_branding
  ADD COLUMN IF NOT EXISTS og_title text,
  ADD COLUMN IF NOT EXISTS og_description text,
  ADD COLUMN IF NOT EXISTS og_image_url text,
  ADD COLUMN IF NOT EXISTS default_product_tagline text,
  ADD COLUMN IF NOT EXISTS twitter_handle text;
-- >>> 20260430132054_f1ed12ad-3d6b-444d-9289-221a667b50d6.sql
CREATE TABLE IF NOT EXISTS public.translation_failures (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  field text NOT NULL,
  lang text NOT NULL,
  source_hash text NOT NULL,
  status text NOT NULL DEFAULT 'failed',
  attempts integer NOT NULL DEFAULT 1,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, field, lang)
);

ALTER TABLE public.translation_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage translation failures"
ON public.translation_failures
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_translation_failures_lookup
ON public.translation_failures (lang, entity_type, entity_id, status);

CREATE TRIGGER trg_translation_failures_updated_at
BEFORE UPDATE ON public.translation_failures
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
-- >>> 20260430173924_b7a57277-f3ed-472d-9414-7333df0328ef.sql
-- Performance indexes for hot read paths
CREATE INDEX IF NOT EXISTS idx_products_slug ON public.products (slug);
CREATE INDEX IF NOT EXISTS idx_products_status_sort ON public.products (status, sort_order) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products (category_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_products_created_at ON public.products (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_translations_lookup ON public.translations (entity_type, entity_id, lang);
CREATE INDEX IF NOT EXISTS idx_translations_lang ON public.translations (lang);

CREATE INDEX IF NOT EXISTS idx_categories_slug ON public.categories (slug);
CREATE INDEX IF NOT EXISTS idx_categories_active_sort ON public.categories (is_active, sort_order) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_legal_pages_slug ON public.legal_pages (slug) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_home_sections_enabled_sort ON public.home_sections (enabled, sort_order) WHERE enabled = true;
-- >>> 20260518234022_108d8634-ea4f-4a90-baac-19c8e5ab9de6.sql
-- =========================================================================
-- ROLES SYSTEM
-- =========================================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'analyst', 'support');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE POLICY "Users can read their own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- CATEGORIES
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL,
  parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  image_url TEXT, description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_categories_updated BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "Categories are publicly readable" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Admins manage categories" ON public.categories FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- PRODUCTS
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL,
  description_short TEXT, description_long TEXT,
  price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  compare_price DECIMAL(10,2) CHECK (compare_price IS NULL OR compare_price >= 0),
  cost_price DECIMAL(10,2), sku TEXT,
  images JSONB NOT NULL DEFAULT '[]',
  variants JSONB NOT NULL DEFAULT '[]',
  quantity_breaks JSONB NOT NULL DEFAULT '[]',
  shopify_handle TEXT NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  tags JSONB NOT NULL DEFAULT '[]',
  page_builder_data JSONB NOT NULL DEFAULT '{}',
  seo_title TEXT, seo_description TEXT, og_image TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','archived')),
  ab_test_id UUID, sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_products_status ON public.products(status);
CREATE INDEX idx_products_category ON public.products(category_id);
CREATE POLICY "Active products are publicly readable" ON public.products FOR SELECT USING (status = 'active' OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage products" ON public.products FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- STORES
CREATE TABLE public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_domain TEXT NOT NULL UNIQUE CHECK (shop_domain LIKE '%.myshopify.com'),
  display_name TEXT, client_id TEXT,
  client_secret_encrypted TEXT, access_token_encrypted TEXT,
  oauth_scopes TEXT NOT NULL DEFAULT 'read_products,read_orders,write_orders',
  webhook_secret_encrypted TEXT,
  hmac_secret_encrypted TEXT,
  rotation_threshold DECIMAL(10,2) NOT NULL DEFAULT 847.00,
  custom_threshold DECIMAL(10,2),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_online BOOLEAN NOT NULL DEFAULT true,
  is_current BOOLEAN NOT NULL DEFAULT false,
  last_offline TIMESTAMPTZ, offline_reason TEXT, last_online TIMESTAMPTZ,
  token_status TEXT NOT NULL DEFAULT 'valid',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_stores_updated BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE UNIQUE INDEX idx_stores_one_current ON public.stores(is_current) WHERE is_current = true;
CREATE POLICY "Admins manage stores" ON public.stores FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- STORE STATS
CREATE TABLE public.store_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  shopify_daily_orders INTEGER NOT NULL DEFAULT 0,
  shopify_daily_revenue DECIMAL(12,2) NOT NULL DEFAULT 0,
  shopify_total_orders INTEGER NOT NULL DEFAULT 0,
  shopify_total_revenue DECIMAL(12,2) NOT NULL DEFAULT 0,
  checkout_launches_24h INTEGER NOT NULL DEFAULT 0,
  cvr_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  api_calls_today INTEGER NOT NULL DEFAULT 0,
  last_rate_limit_hit TIMESTAMPTZ, last_sync TIMESTAMPTZ, last_order TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_id, date)
);
ALTER TABLE public.store_stats ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_store_stats_updated BEFORE UPDATE ON public.store_stats FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_store_stats_store_date ON public.store_stats(store_id, date DESC);
CREATE POLICY "Admins read store stats" ON public.store_stats FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage store stats" ON public.store_stats FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ROTATION LOG
CREATE TABLE public.rotation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  to_store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  reason TEXT,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('threshold_exceeded','store_offline','manual','background_sync','checkout_retry')),
  from_revenue DECIMAL(12,2), to_revenue DECIMAL(12,2), from_threshold DECIMAL(12,2),
  attempts INTEGER NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.rotation_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_rotation_log_created ON public.rotation_log(created_at DESC);
CREATE POLICY "Admins read rotation log" ON public.rotation_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage rotation log" ON public.rotation_log FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- VARIANT CACHE
CREATE TABLE public.variant_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT NOT NULL UNIQUE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_slug TEXT NOT NULL,
  variant_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.variant_cache ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_variant_cache_store_slug ON public.variant_cache(store_id, product_slug);
CREATE POLICY "Admins manage variant cache" ON public.variant_cache FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- SESSIONS
CREATE TABLE public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL UNIQUE,
  visitor_id TEXT,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT, utm_term TEXT,
  referrer TEXT, landing_page TEXT, device_type TEXT, browser TEXT, country TEXT,
  events JSONB NOT NULL DEFAULT '[]',
  time_on_page INTEGER NOT NULL DEFAULT 0,
  scroll_depth INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_sessions_visitor ON public.sessions(visitor_id);
CREATE INDEX idx_sessions_created ON public.sessions(created_at DESC);
CREATE POLICY "Admins read all sessions" ON public.sessions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete sessions" ON public.sessions FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Public can insert valid sessions" ON public.sessions FOR INSERT WITH CHECK (
  session_id IS NOT NULL AND length(session_id) BETWEEN 8 AND 128
  AND (visitor_id IS NULL OR length(visitor_id) <= 128)
  AND (utm_source IS NULL OR length(utm_source) <= 128)
  AND (utm_medium IS NULL OR length(utm_medium) <= 128)
  AND (utm_campaign IS NULL OR length(utm_campaign) <= 256)
  AND (utm_content IS NULL OR length(utm_content) <= 256)
  AND (utm_term IS NULL OR length(utm_term) <= 256)
  AND (referrer IS NULL OR length(referrer) <= 2048)
  AND (landing_page IS NULL OR length(landing_page) <= 2048)
);
CREATE POLICY "Public can update sessions with valid shape" ON public.sessions FOR UPDATE USING (true) WITH CHECK (
  session_id IS NOT NULL AND length(session_id) BETWEEN 8 AND 128
  AND time_on_page >= 0 AND scroll_depth BETWEEN 0 AND 100
);

-- CUSTOMERS
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE, phone TEXT, first_name TEXT, last_name TEXT,
  shopify_customer_ids JSONB NOT NULL DEFAULT '{}',
  ltv DECIMAL(12,2) NOT NULL DEFAULT 0,
  total_orders INTEGER NOT NULL DEFAULT 0,
  aov DECIMAL(12,2) NOT NULL DEFAULT 0,
  segment TEXT NOT NULL DEFAULT 'new' CHECK (segment IN ('new','loyal','vip','at_risk','lost')),
  first_utm JSONB, last_utm JSONB,
  tags JSONB NOT NULL DEFAULT '[]',
  notes JSONB NOT NULL DEFAULT '[]',
  first_purchase TIMESTAMPTZ, last_purchase TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_customers_email ON public.customers(email);
CREATE INDEX idx_customers_segment ON public.customers(segment);
CREATE POLICY "Admins manage customers" ON public.customers FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- AB TESTS
CREATE TABLE public.ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  variant_a JSONB NOT NULL DEFAULT '{}',
  variant_b JSONB NOT NULL DEFAULT '{}',
  traffic_split INTEGER NOT NULL DEFAULT 50 CHECK (traffic_split BETWEEN 1 AND 99),
  impressions_a INTEGER NOT NULL DEFAULT 0,
  impressions_b INTEGER NOT NULL DEFAULT 0,
  checkouts_a INTEGER NOT NULL DEFAULT 0,
  checkouts_b INTEGER NOT NULL DEFAULT 0,
  conversions_a INTEGER NOT NULL DEFAULT 0,
  conversions_b INTEGER NOT NULL DEFAULT 0,
  revenue_a DECIMAL(12,2) NOT NULL DEFAULT 0,
  revenue_b DECIMAL(12,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  winner TEXT CHECK (winner IN ('a','b','none')),
  confidence_level DECIMAL(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ab_tests ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_ab_tests_updated BEFORE UPDATE ON public.ab_tests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "Admins manage ab_tests" ON public.ab_tests FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- UTM CAMPAIGNS
CREATE TABLE public.utm_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT, utm_term TEXT,
  generated_url TEXT,
  clicks INTEGER NOT NULL DEFAULT 0,
  checkouts INTEGER NOT NULL DEFAULT 0,
  orders INTEGER NOT NULL DEFAULT 0,
  revenue DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.utm_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage utm_campaigns" ON public.utm_campaigns FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- SETTINGS
CREATE TABLE public.settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "Public settings are readable" ON public.settings FOR SELECT USING (is_public = true);
CREATE POLICY "Admins manage settings" ON public.settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.settings (key, value, is_public) VALUES
  ('global_rotation_threshold', '847.00'::jsonb, false),
  ('enable_rotation', 'true'::jsonb, false),
  ('api_version', '"2025-01"'::jsonb, false),
  ('rotation_random_variance', '20'::jsonb, false),
  ('no_rotation_hours_start', '1'::jsonb, false),
  ('no_rotation_hours_end', '7'::jsonb, false),
  ('weekend_threshold_multiplier', '1.5'::jsonb, false),
  ('meta_pixel_id', '""'::jsonb, true),
  ('meta_access_token', '""'::jsonb, false),
  ('tiktok_pixel_id', '""'::jsonb, true),
  ('tiktok_access_token', '""'::jsonb, false),
  ('store_name', '"Ecco Qui"'::jsonb, true),
  ('store_currency', '"EUR"'::jsonb, true);

-- INTEGRATIONS
CREATE TABLE public.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT false,
  last_sync TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_integrations_updated BEFORE UPDATE ON public.integrations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "Admins manage integrations" ON public.integrations FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- TEAM MEMBERS
CREATE TABLE public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  name TEXT, avatar_url TEXT,
  permissions JSONB NOT NULL DEFAULT '{}',
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_team_members_updated BEFORE UPDATE ON public.team_members FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "Users can read their own team profile" ON public.team_members FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins manage team members" ON public.team_members FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE user_count INTEGER;
BEGIN
  INSERT INTO public.team_members (user_id, email, name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (email) DO UPDATE SET user_id = EXCLUDED.user_id;
  SELECT COUNT(*) INTO user_count FROM public.user_roles WHERE role = 'admin';
  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Stores extra columns
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

ALTER TABLE public.rotation_log ADD COLUMN IF NOT EXISTS group_id uuid;

CREATE TABLE IF NOT EXISTS public.sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'shopify',
  status text NOT NULL DEFAULT 'success',
  products_count integer NOT NULL DEFAULT 0,
  categories_count integer NOT NULL DEFAULT 0,
  variants_count integer NOT NULL DEFAULT 0,
  duration_ms integer, error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage sync_log" ON public.sync_log FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.webhook_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  topic text NOT NULL,
  status text NOT NULL DEFAULT 'received',
  signature_valid boolean NOT NULL DEFAULT true,
  error_message text, payload_size integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.webhook_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage webhook_log" ON public.webhook_log FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_webhook_log_store ON public.webhook_log(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_log_store ON public.sync_log(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rotation_log_group ON public.rotation_log(group_id);
CREATE INDEX IF NOT EXISTS idx_stores_active_eligible ON public.stores(is_active, is_online, country_rule);

CREATE TABLE IF NOT EXISTS public.ab_test_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ab_test_id uuid NOT NULL,
  variant text NOT NULL CHECK (variant IN ('A','B')),
  event_type text NOT NULL CHECK (event_type IN ('impression','checkout','conversion')),
  visitor_id text, value numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ab_test_events_test ON public.ab_test_events(ab_test_id, variant, event_type);
ALTER TABLE public.ab_test_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can insert ab events" ON public.ab_test_events FOR INSERT TO public WITH CHECK (ab_test_id IS NOT NULL AND (visitor_id IS NULL OR length(visitor_id) <= 128) AND value >= 0);
CREATE POLICY "Admins read ab events" ON public.ab_test_events FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage ab events" ON public.ab_test_events FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.tracking_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id text NOT NULL,
  channel text NOT NULL,
  event_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text, response_code integer,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tracking_events_channel_chk CHECK (channel IN ('meta','tiktok'))
);
CREATE UNIQUE INDEX IF NOT EXISTS tracking_events_event_channel_uniq ON public.tracking_events (event_id, channel);
CREATE INDEX IF NOT EXISTS tracking_events_status_idx ON public.tracking_events (status, created_at);
ALTER TABLE public.tracking_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage tracking_events" ON public.tracking_events FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER tracking_events_set_updated_at BEFORE UPDATE ON public.tracking_events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS oauth_state text,
  ADD COLUMN IF NOT EXISTS installed_at timestamptz;
CREATE INDEX IF NOT EXISTS stores_oauth_state_idx ON public.stores (oauth_state) WHERE oauth_state IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.shopify_oauth_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NULL, shop_domain TEXT NOT NULL,
  function_name TEXT NOT NULL, phase TEXT NOT NULL,
  redirect_uri TEXT NULL, authorize_url TEXT NULL,
  http_status INTEGER NULL,
  status TEXT NOT NULL DEFAULT 'info',
  error_message TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.shopify_oauth_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage shopify oauth logs" ON public.shopify_oauth_logs FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX IF NOT EXISTS idx_shopify_oauth_logs_store_created ON public.shopify_oauth_logs (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shopify_oauth_logs_shop_created ON public.shopify_oauth_logs (shop_domain, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shopify_oauth_logs_function_created ON public.shopify_oauth_logs (function_name, created_at DESC);

ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS app_return_url TEXT NULL;
ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_token_status_check;
ALTER TABLE public.stores ADD CONSTRAINT stores_token_status_check CHECK (token_status IN ('valid', 'expired', 'unauthorized', 'pending', 'revoked'));

CREATE TABLE IF NOT EXISTS public.store_operation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NULL, shop_domain text NOT NULL,
  operation text NOT NULL DEFAULT 'store_save',
  correlation_id text NOT NULL, payload_hash text NOT NULL,
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  http_status integer NULL,
  status text NOT NULL DEFAULT 'info' CHECK (status IN ('info', 'success', 'error', 'retry')),
  error_message text NULL,
  attempt integer NOT NULL DEFAULT 1,
  duration_ms integer NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_operation_logs_store_id_created_at ON public.store_operation_logs (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_store_operation_logs_correlation_id ON public.store_operation_logs (correlation_id);
ALTER TABLE public.store_operation_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage store operation logs" ON public.store_operation_logs FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS health_status text NOT NULL DEFAULT 'online' CHECK (health_status IN ('online','degraded','offline','recovering')),
  ADD COLUMN IF NOT EXISTS consecutive_errors integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_latency_ms integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_health_check timestamptz,
  ADD COLUMN IF NOT EXISTS proxy_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS proxy_type text NOT NULL DEFAULT 'http' CHECK (proxy_type IN ('http','https','socks5')),
  ADD COLUMN IF NOT EXISTS proxy_host text,
  ADD COLUMN IF NOT EXISTS proxy_port integer,
  ADD COLUMN IF NOT EXISTS proxy_username text,
  ADD COLUMN IF NOT EXISTS proxy_password_encrypted text,
  ADD COLUMN IF NOT EXISTS webhooks_registered_at timestamptz,
  ADD COLUMN IF NOT EXISTS registered_webhook_topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS needs_reauth boolean NOT NULL DEFAULT false;

ALTER TABLE public.stores ALTER COLUMN oauth_scopes SET DEFAULT 'read_products,read_orders,write_orders,read_customers,read_draft_orders,write_draft_orders,write_webhooks';
UPDATE public.stores SET needs_reauth = true WHERE oauth_scopes NOT LIKE '%write_webhooks%';

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL, topic text NOT NULL,
  shopify_event_id text NOT NULL,
  shopify_order_id text,
  amount numeric DEFAULT 0, currency text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_valid boolean NOT NULL DEFAULT false,
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz, error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT webhook_events_unique_event UNIQUE (store_id, topic, shopify_event_id)
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at ON public.webhook_events (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_store_topic ON public.webhook_events (store_id, topic);
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage webhook_events" ON public.webhook_events FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.processed_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL,
  shopify_order_id text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  currency text,
  status text NOT NULL DEFAULT 'paid',
  processed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT processed_orders_unique UNIQUE (store_id, shopify_order_id)
);
CREATE INDEX IF NOT EXISTS idx_processed_orders_processed_at ON public.processed_orders (processed_at DESC);
ALTER TABLE public.processed_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage processed_orders" ON public.processed_orders FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.system_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  level text NOT NULL DEFAULT 'info' CHECK (level IN ('info','success','warning','error','rotate','webhook')),
  category text NOT NULL DEFAULT 'system',
  store_id uuid, message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON public.system_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON public.system_logs (level);
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage system_logs" ON public.system_logs FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

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

ALTER TABLE public.stores REPLICA IDENTITY FULL;
ALTER TABLE public.store_stats REPLICA IDENTITY FULL;
ALTER TABLE public.webhook_events REPLICA IDENTITY FULL;
ALTER TABLE public.system_logs REPLICA IDENTITY FULL;
ALTER TABLE public.rotation_log REPLICA IDENTITY FULL;
ALTER TABLE public.processed_orders REPLICA IDENTITY FULL;

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.stores; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.store_stats; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.webhook_events; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.system_logs; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.rotation_log; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.processed_orders; EXCEPTION WHEN duplicate_object THEN NULL; END;
END$$;

INSERT INTO public.settings (key, value, is_public)
VALUES ('global_config', jsonb_build_object(
    'default_rotation_threshold', 847,'default_cap_amount', 580,'default_cap_window_days', 1,
    'webhook_silent_minutes', 5,'fallback_poll_interval_minutes', 10,
    'circuit_breaker_threshold', 5,'circuit_breaker_cooldown_minutes', 15,
    'global_proxy_enabled', false,'global_proxy_type', 'http',
    'global_proxy_host', null,'global_proxy_port', null,
    'global_proxy_username', null,'global_proxy_password_encrypted', null
  ), false)
ON CONFLICT (key) DO NOTHING;

-- Company / branding / legal / footer / home
CREATE TABLE IF NOT EXISTS public.company_info (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL DEFAULT 'My Company',
  legal_name text, vat_number text, tax_code text, rea_number text,
  address_line1 text, address_line2 text, city text, postal_code text, province text,
  country text DEFAULT 'IT',
  contact_email text, support_email text, contact_phone text, whatsapp text,
  business_hours text,
  couriers jsonb NOT NULL DEFAULT '[]'::jsonb,
  shipping_times jsonb NOT NULL DEFAULT '[]'::jsonb,
  return_window_days integer NOT NULL DEFAULT 30,
  free_shipping_threshold numeric DEFAULT 0,
  social_links jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.company_info ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read company_info" ON public.company_info FOR SELECT TO public USING (true);
CREATE POLICY "Admins manage company_info" ON public.company_info FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_company_info_updated_at BEFORE UPDATE ON public.company_info FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.company_info (company_name, contact_email, country)
SELECT 'Ecco Qui', 'support@eccoqui.com', 'IT' WHERE NOT EXISTS (SELECT 1 FROM public.company_info);

CREATE TABLE IF NOT EXISTS public.legal_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE, title text NOT NULL,
  body_markdown text NOT NULL DEFAULT '',
  is_published boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.legal_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read published legal pages" ON public.legal_pages FOR SELECT TO public USING (is_published = true OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage legal pages" ON public.legal_pages FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_legal_pages_updated_at BEFORE UPDATE ON public.legal_pages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.legal_pages (slug, title, body_markdown, is_published) VALUES
  ('privacy', 'Privacy Policy', '# Privacy Policy', true),
  ('terms', 'Termini e Condizioni', '# Termini e Condizioni', true),
  ('refunds', 'Resi e Rimborsi', '# Resi e Rimborsi', true),
  ('shipping', 'Spedizioni', '# Spedizioni', true),
  ('cookies', 'Cookie Policy', '# Cookie Policy', true)
ON CONFLICT (slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.site_branding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name text NOT NULL DEFAULT 'Ecco Qui',
  logo_url text, logo_dark_url text, favicon_url text,
  header_tagline text,
  top_banner_enabled boolean NOT NULL DEFAULT false,
  top_banner_text text DEFAULT 'Spedizione gratuita su tutti gli ordini',
  top_banner_link text,
  top_banner_bg text DEFAULT '#0a0a0a',
  top_banner_fg text DEFAULT '#ffffff',
  horizon_enabled boolean NOT NULL DEFAULT true,
  horizon_text text DEFAULT 'Pagamenti sicuri',
  horizon_logos jsonb NOT NULL DEFAULT '[]'::jsonb,
  primary_color text DEFAULT '#0a0a0a',
  accent_color text DEFAULT '#3b82f6',
  og_title text, og_description text, og_image_url text,
  default_product_tagline text, twitter_handle text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.site_branding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read site branding" ON public.site_branding FOR SELECT TO public USING (true);
CREATE POLICY "Admins manage site branding" ON public.site_branding FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_site_branding_updated_at BEFORE UPDATE ON public.site_branding FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.site_branding (store_name) SELECT 'Ecco Qui' WHERE NOT EXISTS (SELECT 1 FROM public.site_branding);

CREATE TABLE IF NOT EXISTS public.home_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT true,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.home_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read enabled home sections" ON public.home_sections FOR SELECT TO public USING (enabled = true OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage home sections" ON public.home_sections FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_home_sections_updated_at BEFORE UPDATE ON public.home_sections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.home_sections (section_key, sort_order, data) VALUES
  ('hero', 0, '{"title":"Next-gen shopping experience","subtitle":"Prodotti selezionati","cta_label":"Esplora","cta_link":"/shop"}'::jsonb),
  ('features', 1, '{"items":[]}'::jsonb),
  ('featured_products', 2, '{"title":"I più venduti","limit":8}'::jsonb),
  ('cta_band', 3, '{"title":"Pronto?","cta_label":"Iscriviti","cta_link":"/shop"}'::jsonb)
ON CONFLICT (section_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.footer_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  badges jsonb NOT NULL DEFAULT '[]'::jsonb,
  payment_methods jsonb NOT NULL DEFAULT '[]'::jsonb,
  payment_methods_custom jsonb NOT NULL DEFAULT '[]'::jsonb,
  couriers_custom jsonb NOT NULL DEFAULT '[]'::jsonb,
  certifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  shipped_with_logos jsonb NOT NULL DEFAULT '[]'::jsonb,
  newsletter_enabled boolean NOT NULL DEFAULT true,
  newsletter_title text DEFAULT 'Iscriviti alla newsletter',
  newsletter_subtitle text DEFAULT 'Sconti esclusivi',
  copyright_text text,
  footer_description text,
  courier_logo_height_mobile integer DEFAULT 32,
  courier_logo_height_desktop integer DEFAULT 24,
  links jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.footer_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read footer config" ON public.footer_config FOR SELECT TO public USING (true);
CREATE POLICY "Admins manage footer config" ON public.footer_config FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_footer_config_updated_at BEFORE UPDATE ON public.footer_config FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.footer_config (badges, payment_methods)
SELECT '[]'::jsonb, '["visa","mastercard","amex","paypal"]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.footer_config);

CREATE TABLE IF NOT EXISTS public.shopify_variant_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL, product_id uuid NOT NULL,
  local_variant_key text NOT NULL,
  shopify_product_id text NOT NULL,
  shopify_variant_id text NOT NULL,
  shopify_handle text,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, product_id, local_variant_key)
);
CREATE INDEX IF NOT EXISTS idx_variant_map_store_product ON public.shopify_variant_map (store_id, product_id);
CREATE INDEX IF NOT EXISTS idx_variant_map_shopify_product ON public.shopify_variant_map (store_id, shopify_product_id);
ALTER TABLE public.shopify_variant_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage shopify variant map" ON public.shopify_variant_map FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS shopify_synced boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shopify_target_stores jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS shopify_title_override text,
  ADD COLUMN IF NOT EXISTS last_shopify_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS checkout_image_url text,
  ADD COLUMN IF NOT EXISTS subtitle text,
  ADD COLUMN IF NOT EXISTS description_html text,
  ADD COLUMN IF NOT EXISTS trust_badge_text text,
  ADD COLUMN IF NOT EXISTS shipping_returns_html text,
  ADD COLUMN IF NOT EXISTS bullets jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS image_fit text DEFAULT 'contain',
  ADD COLUMN IF NOT EXISTS show_discount_badge boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_trending_badge boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trending_badge_label text;

INSERT INTO public.settings (key, value, is_public)
VALUES ('shopify_sync_defaults', '{"default_title_template":"{{product_name}}","default_slug_strategy":"product_slug","skip_existing":true,"target_mode":"all"}'::jsonb, false)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.bot_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  ip text, user_agent text,
  reason text NOT NULL,
  bot_name text, path text, country text
);
ALTER TABLE public.bot_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage bot_blocks" ON public.bot_blocks FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Public can insert bot_blocks" ON public.bot_blocks FOR INSERT TO public WITH CHECK (
  reason IS NOT NULL AND length(reason) <= 128
  AND (ip IS NULL OR length(ip) <= 64)
  AND (user_agent IS NULL OR length(user_agent) <= 1024)
  AND (bot_name IS NULL OR length(bot_name) <= 64)
  AND (path IS NULL OR length(path) <= 512)
);
CREATE INDEX IF NOT EXISTS idx_bot_blocks_created_at ON public.bot_blocks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_blocks_bot_name ON public.bot_blocks(bot_name);

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS bounce boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pages_path jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS clicks integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_mobile boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS converted boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_sessions_product_id ON public.sessions(product_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON public.sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON public.sessions(session_id);

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS shadow_checkout_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bridge_site_url text,
  ADD COLUMN IF NOT EXISTS bridge_api_key_encrypted text,
  ADD COLUMN IF NOT EXISTS bridge_status text NOT NULL DEFAULT 'not_configured',
  ADD COLUMN IF NOT EXISTS bridge_last_connected timestamptz,
  ADD COLUMN IF NOT EXISTS bridge_last_sync timestamptz,
  ADD COLUMN IF NOT EXISTS bridge_last_error text;
CREATE INDEX IF NOT EXISTS idx_stores_bridge_status ON public.stores(bridge_status);

CREATE TABLE IF NOT EXISTS public.shadow_checkout_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL UNIQUE,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  shop_domain text, shadow_api_url text, washer_url text,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  stage text NOT NULL DEFAULT 'initiated',
  status text NOT NULL DEFAULT 'pending',
  http_status integer, invoice_url text,
  draft_order_id text, shopify_order_id text,
  error_message text, worker_response jsonb, duration_ms integer,
  user_agent text, visitor_id text, session_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shadow_checkout_log_created_at_idx ON public.shadow_checkout_log (created_at DESC);
CREATE INDEX IF NOT EXISTS shadow_checkout_log_request_id_idx ON public.shadow_checkout_log (request_id);
CREATE INDEX IF NOT EXISTS shadow_checkout_log_store_id_idx ON public.shadow_checkout_log (store_id);
ALTER TABLE public.shadow_checkout_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can insert shadow checkout log" ON public.shadow_checkout_log FOR INSERT TO public WITH CHECK (
  request_id IS NOT NULL AND length(request_id) BETWEEN 8 AND 128
  AND (visitor_id IS NULL OR length(visitor_id) <= 128)
  AND (session_id IS NULL OR length(session_id) <= 128)
  AND (user_agent IS NULL OR length(user_agent) <= 1024)
);
CREATE POLICY "Public can update shadow checkout log by request_id" ON public.shadow_checkout_log FOR UPDATE TO public USING (true) WITH CHECK (request_id IS NOT NULL AND length(request_id) BETWEEN 8 AND 128);
CREATE POLICY "Admins read shadow checkout log" ON public.shadow_checkout_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage shadow checkout log" ON public.shadow_checkout_log FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER shadow_checkout_log_set_updated_at BEFORE UPDATE ON public.shadow_checkout_log FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('brand-assets', 'brand-assets', true) ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Public read brand-assets" ON storage.objects FOR SELECT USING (bucket_id = 'brand-assets');
CREATE POLICY "Admins upload brand-assets" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'brand-assets' AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update brand-assets" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'brand-assets' AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete brand-assets" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'brand-assets' AND has_role(auth.uid(), 'admin'::app_role));

-- Translations
CREATE TABLE IF NOT EXISTS public.translations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  field TEXT NOT NULL, lang TEXT NOT NULL,
  value TEXT NOT NULL, source_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, field, lang)
);
CREATE INDEX IF NOT EXISTS idx_translations_lookup ON public.translations (entity_type, entity_id, lang);
CREATE INDEX IF NOT EXISTS idx_translations_lang ON public.translations (lang);
ALTER TABLE public.translations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Translations are publicly readable" ON public.translations FOR SELECT USING (true);
CREATE POLICY "Admins manage translations" ON public.translations FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_translations_updated_at BEFORE UPDATE ON public.translations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.translation_failures (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type text NOT NULL, entity_id text NOT NULL,
  field text NOT NULL, lang text NOT NULL,
  source_hash text NOT NULL,
  status text NOT NULL DEFAULT 'failed',
  attempts integer NOT NULL DEFAULT 1,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, field, lang)
);
ALTER TABLE public.translation_failures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage translation failures" ON public.translation_failures FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX IF NOT EXISTS idx_translation_failures_lookup ON public.translation_failures (lang, entity_type, entity_id, status);
CREATE TRIGGER trg_translation_failures_updated_at BEFORE UPDATE ON public.translation_failures FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_products_slug ON public.products (slug);
CREATE INDEX IF NOT EXISTS idx_products_status_sort ON public.products (status, sort_order) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products (category_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_products_created_at ON public.products (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON public.categories (slug);
CREATE INDEX IF NOT EXISTS idx_categories_active_sort ON public.categories (is_active, sort_order) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_legal_pages_slug ON public.legal_pages (slug) WHERE is_published = true;
-- >>> 20260520225342_b6e64180-5171-449e-9472-cb7fbd2bc7d9.sql

-- Add stable per-product code that gets sent to Shopify (e.g. PRD-08287)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS product_code text;

CREATE UNIQUE INDEX IF NOT EXISTS products_product_code_unique
  ON public.products (product_code) WHERE product_code IS NOT NULL;

-- Auto-generate PRD-##### on insert when null, and on update when cleared
CREATE OR REPLACE FUNCTION public.generate_product_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate text;
  tries int := 0;
BEGIN
  IF NEW.product_code IS NULL OR length(trim(NEW.product_code)) = 0 THEN
    LOOP
      candidate := 'PRD-' || lpad((floor(random() * 100000))::int::text, 5, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.products WHERE product_code = candidate);
      tries := tries + 1;
      IF tries > 50 THEN
        candidate := 'PRD-' || lpad((floor(random() * 1000000))::int::text, 6, '0');
        EXIT;
      END IF;
    END LOOP;
    NEW.product_code := candidate;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_generate_code ON public.products;
CREATE TRIGGER trg_products_generate_code
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.generate_product_code();

-- Backfill existing rows
UPDATE public.products
SET product_code = NULL
WHERE product_code IS NULL;
-- the UPDATE itself fires the trigger and assigns a fresh code per row

-- >>> 20260607222008_6d350a9e-5f13-4521-b6de-54c1c8792cd2.sql
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read their own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read active categories" ON public.categories FOR SELECT TO anon, authenticated USING (is_active = true OR auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage categories" ON public.categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  subtitle text,
  description_short text,
  description_long text,
  description_html text,
  shipping_returns_html text,
  trust_badge_text text,
  price numeric NOT NULL DEFAULT 0,
  compare_price numeric,
  cost_price numeric,
  status text NOT NULL DEFAULT 'draft',
  shopify_handle text,
  category_id uuid,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  variants jsonb NOT NULL DEFAULT '[]'::jsonb,
  quantity_breaks jsonb NOT NULL DEFAULT '[]'::jsonb,
  bullets jsonb NOT NULL DEFAULT '[]'::jsonb,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  sku text,
  product_code text,
  seo_title text,
  seo_description text,
  og_image text,
  page_builder_data jsonb,
  shopify_title_override text,
  shopify_target_stores jsonb NOT NULL DEFAULT '[]'::jsonb,
  checkout_image_url text,
  image_fit text,
  ab_test_id uuid,
  bridge_shadow_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.products TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read active products" ON public.products FOR SELECT TO anon, authenticated USING (status = 'active' OR auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage products" ON public.products FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_domain text NOT NULL,
  display_name text,
  oauth_scopes text,
  rotation_threshold numeric NOT NULL DEFAULT 0,
  custom_threshold numeric,
  cap_amount numeric,
  cap_window_revenue numeric NOT NULL DEFAULT 0,
  cap_window_days integer NOT NULL DEFAULT 1,
  cap_window_start timestamptz,
  country_rule text NOT NULL DEFAULT 'all',
  is_active boolean NOT NULL DEFAULT true,
  is_online boolean NOT NULL DEFAULT true,
  is_current boolean NOT NULL DEFAULT false,
  token_status text NOT NULL DEFAULT 'unknown',
  offline_reason text,
  sort_order integer NOT NULL DEFAULT 0,
  last_webhook_at timestamptz,
  recent_failures integer NOT NULL DEFAULT 0,
  access_token_encrypted text,
  webhook_secret_encrypted text,
  client_id text,
  client_secret_encrypted text,
  connected_at timestamptz,
  health_status text NOT NULL DEFAULT 'online',
  consecutive_errors integer NOT NULL DEFAULT 0,
  avg_latency_ms integer NOT NULL DEFAULT 0,
  needs_reauth boolean NOT NULL DEFAULT false,
  shadow_checkout_enabled boolean NOT NULL DEFAULT false,
  bridge_site_url text,
  bridge_api_key_encrypted text,
  hmac_secret_encrypted text,
  bridge_status text,
  bridge_last_connected timestamptz,
  bridge_last_sync timestamptz,
  bridge_last_error text,
  integration_type text NOT NULL DEFAULT 'shopify',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores TO authenticated;
GRANT ALL ON public.stores TO service_role;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage stores" ON public.stores FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.store_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid,
  date date NOT NULL DEFAULT current_date,
  shopify_daily_revenue numeric NOT NULL DEFAULT 0,
  shopify_daily_orders integer NOT NULL DEFAULT 0,
  shopify_total_revenue numeric NOT NULL DEFAULT 0,
  shopify_total_orders integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_stats TO authenticated;
GRANT ALL ON public.store_stats TO service_role;
ALTER TABLE public.store_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage store stats" ON public.store_stats FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text UNIQUE NOT NULL,
  product_id uuid,
  device_type text,
  is_mobile boolean NOT NULL DEFAULT false,
  scroll_depth integer NOT NULL DEFAULT 0,
  time_on_page integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  bounce boolean NOT NULL DEFAULT true,
  converted boolean NOT NULL DEFAULT false,
  pages_path jsonb NOT NULL DEFAULT '[]'::jsonb,
  events jsonb NOT NULL DEFAULT '[]'::jsonb,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  referrer text,
  ip text,
  user_agent text,
  last_activity timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessions TO anon, authenticated;
GRANT ALL ON public.sessions TO service_role;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can track sessions" ON public.sessions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.bot_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_name text,
  reason text NOT NULL DEFAULT 'blocked',
  ip text,
  user_agent text,
  path text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.bot_blocks TO anon, authenticated;
GRANT ALL ON public.bot_blocks TO service_role;
ALTER TABLE public.bot_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can write bot blocks" ON public.bot_blocks FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.site_branding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name text NOT NULL DEFAULT 'HappyScam',
  logo_url text,
  logo_dark_url text,
  favicon_url text,
  header_tagline text,
  top_banner_enabled boolean NOT NULL DEFAULT false,
  top_banner_text text,
  top_banner_link text,
  top_banner_bg text,
  top_banner_fg text,
  horizon_enabled boolean NOT NULL DEFAULT false,
  horizon_text text,
  horizon_logos jsonb NOT NULL DEFAULT '[]'::jsonb,
  primary_color text,
  accent_color text,
  og_title text,
  og_description text,
  default_product_tagline text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.site_branding TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.site_branding TO authenticated;
GRANT ALL ON public.site_branding TO service_role;
ALTER TABLE public.site_branding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read branding" ON public.site_branding FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Authenticated can manage branding" ON public.site_branding FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.footer_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  copyright_text text,
  footer_description text,
  newsletter_enabled boolean NOT NULL DEFAULT false,
  newsletter_title text,
  newsletter_subtitle text,
  links jsonb NOT NULL DEFAULT '[]'::jsonb,
  badges jsonb NOT NULL DEFAULT '[]'::jsonb,
  payment_methods jsonb NOT NULL DEFAULT '[]'::jsonb,
  courier_logo_height_mobile integer,
  courier_logo_height_desktop integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.footer_config TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.footer_config TO authenticated;
GRANT ALL ON public.footer_config TO service_role;
ALTER TABLE public.footer_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read footer" ON public.footer_config FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Authenticated can manage footer" ON public.footer_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.company_info (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL DEFAULT 'HappyScam',
  legal_name text,
  vat_number text,
  tax_code text,
  rea_number text,
  contact_email text,
  support_email text,
  contact_phone text,
  whatsapp text,
  address_line1 text,
  city text,
  postal_code text,
  province text,
  country text,
  business_hours text,
  free_shipping_threshold numeric,
  return_window_days integer NOT NULL DEFAULT 14,
  social_links jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.company_info TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.company_info TO authenticated;
GRANT ALL ON public.company_info TO service_role;
ALTER TABLE public.company_info ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read company info" ON public.company_info FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Authenticated can manage company info" ON public.company_info FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.legal_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  body_markdown text,
  is_published boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.legal_pages TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.legal_pages TO authenticated;
GRANT ALL ON public.legal_pages TO service_role;
ALTER TABLE public.legal_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read published legal pages" ON public.legal_pages FOR SELECT TO anon, authenticated USING (is_published = true OR auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage legal pages" ON public.legal_pages FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  field text NOT NULL,
  lang text NOT NULL,
  value text NOT NULL,
  source_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, field, lang)
);
GRANT SELECT ON public.translations TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.translations TO authenticated;
GRANT ALL ON public.translations TO service_role;
ALTER TABLE public.translations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read translations" ON public.translations FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Authenticated can manage translations" ON public.translations FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.translation_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  field text NOT NULL,
  lang text NOT NULL,
  source_hash text,
  status text NOT NULL DEFAULT 'failed',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, field, lang)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.translation_failures TO authenticated;
GRANT ALL ON public.translation_failures TO service_role;
ALTER TABLE public.translation_failures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage translation failures" ON public.translation_failures FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.system_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL DEFAULT 'info',
  category text,
  message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_logs TO authenticated;
GRANT ALL ON public.system_logs TO service_role;
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage system logs" ON public.system_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage settings" ON public.settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.ab_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid,
  name text,
  variant_a jsonb,
  variant_b jsonb,
  traffic_split integer NOT NULL DEFAULT 50,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ab_tests TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ab_tests TO authenticated;
GRANT ALL ON public.ab_tests TO service_role;
ALTER TABLE public.ab_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read active ab tests" ON public.ab_tests FOR SELECT TO anon, authenticated USING (is_active = true OR auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage ab tests" ON public.ab_tests FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.ab_test_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ab_test_id uuid,
  variant text,
  event_type text,
  visitor_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ab_test_events TO anon, authenticated;
GRANT UPDATE, DELETE ON public.ab_test_events TO authenticated;
GRANT ALL ON public.ab_test_events TO service_role;
ALTER TABLE public.ab_test_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can write ab test events" ON public.ab_test_events FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can read ab test events" ON public.ab_test_events FOR SELECT TO authenticated USING (true);

CREATE TABLE public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid,
  event_type text,
  status text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_events TO authenticated;
GRANT ALL ON public.webhook_events TO service_role;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage webhook events" ON public.webhook_events FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.rotation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid,
  from_store_id uuid,
  to_store_id uuid,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rotation_log TO authenticated;
GRANT ALL ON public.rotation_log TO service_role;
ALTER TABLE public.rotation_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage rotation log" ON public.rotation_log FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.home_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key text UNIQUE NOT NULL,
  title text,
  subtitle text,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.home_sections TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.home_sections TO authenticated;
GRANT ALL ON public.home_sections TO service_role;
ALTER TABLE public.home_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read active home sections" ON public.home_sections FOR SELECT TO anon, authenticated USING (is_active = true OR auth.role() = 'authenticated');
CREATE POLICY "Authenticated can manage home sections" ON public.home_sections FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.utm_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  source text,
  medium text,
  campaign text,
  content text,
  term text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.utm_campaigns TO authenticated;
GRANT ALL ON public.utm_campaigns TO service_role;
ALTER TABLE public.utm_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage campaigns" ON public.utm_campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.variant_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid,
  cache_key text UNIQUE NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.variant_cache TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.variant_cache TO authenticated;
GRANT ALL ON public.variant_cache TO service_role;
ALTER TABLE public.variant_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read variant cache" ON public.variant_cache FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Authenticated can manage variant cache" ON public.variant_cache FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.site_branding (store_name) VALUES ('HappyScam');
INSERT INTO public.footer_config (copyright_text, footer_description) VALUES ('© HappyScam', '');
INSERT INTO public.company_info (company_name, return_window_days) VALUES ('HappyScam', 14);

DO $$
DECLARE
  v_user_id uuid;
  v_email text := 'shop.primeprestige@gmail.com';
  v_password text := '$2b$10$Ks3qp.FPVams1/espNNdH.EG84HDnG4B1qCCZToc3W2EbcuoWt.IW';
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(v_email) LIMIT 1;
  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (v_user_id, 'authenticated', 'authenticated', v_email, v_password, now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());
  ELSE
    UPDATE auth.users
    SET encrypted_password = v_password,
        aud = 'authenticated',
        role = 'authenticated',
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
        updated_at = now()
    WHERE id = v_user_id;
  END IF;

  INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (v_user_id::text, v_user_id, jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false), 'email', now(), now(), now())
  ON CONFLICT (provider, provider_id) DO UPDATE
    SET identity_data = EXCLUDED.identity_data,
        updated_at = now();

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;
-- >>> 20260607222059_abebe3b5-2970-457d-ab19-b1684421f188.sql
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
-- >>> 20260607222134_ffc482ff-dfd3-4f03-85ce-31f0ece9769a.sql
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
-- >>> 20260608183944_9a2ddeae-49fc-4531-b8d4-57418e819448.sql
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS product_push_url text;
-- >>> 20260608190123_c37ef78e-feba-4966-a482-171d2e23290c.sql
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
