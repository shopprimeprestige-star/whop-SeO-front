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