ALTER TABLE public.stores
ADD COLUMN IF NOT EXISTS app_return_url TEXT NULL;