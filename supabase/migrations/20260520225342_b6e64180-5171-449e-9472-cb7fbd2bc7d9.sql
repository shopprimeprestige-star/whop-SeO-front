
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
