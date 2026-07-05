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