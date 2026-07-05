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