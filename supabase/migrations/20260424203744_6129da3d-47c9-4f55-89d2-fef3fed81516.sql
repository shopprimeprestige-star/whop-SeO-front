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