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