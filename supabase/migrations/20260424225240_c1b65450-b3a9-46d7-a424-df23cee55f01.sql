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