-- Toggle badges per prodotto
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS show_discount_badge BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_trending_badge BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trending_badge_label TEXT;

-- Note: la struttura `variants` (jsonb) viene estesa logicamente per supportare:
--   { name, price, ..., swatch_type: 'text'|'color'|'image', swatch_value: string }
-- Nessuna nuova colonna necessaria, è jsonb libero.