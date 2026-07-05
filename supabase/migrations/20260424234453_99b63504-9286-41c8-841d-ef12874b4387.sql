ALTER TABLE public.stores
  DROP CONSTRAINT IF EXISTS stores_token_status_check;

ALTER TABLE public.stores
  ADD CONSTRAINT stores_token_status_check
  CHECK (token_status IN ('valid', 'expired', 'unauthorized', 'pending', 'revoked'));

CREATE TABLE IF NOT EXISTS public.store_operation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NULL,
  shop_domain text NOT NULL,
  operation text NOT NULL DEFAULT 'store_save',
  correlation_id text NOT NULL,
  payload_hash text NOT NULL,
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  http_status integer NULL,
  status text NOT NULL DEFAULT 'info' CHECK (status IN ('info', 'success', 'error', 'retry')),
  error_message text NULL,
  attempt integer NOT NULL DEFAULT 1,
  duration_ms integer NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_operation_logs_store_id_created_at
  ON public.store_operation_logs (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_store_operation_logs_correlation_id
  ON public.store_operation_logs (correlation_id);

ALTER TABLE public.store_operation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage store operation logs" ON public.store_operation_logs;
CREATE POLICY "Admins manage store operation logs"
  ON public.store_operation_logs
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));