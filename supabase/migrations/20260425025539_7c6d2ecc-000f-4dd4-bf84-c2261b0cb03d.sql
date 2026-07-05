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
