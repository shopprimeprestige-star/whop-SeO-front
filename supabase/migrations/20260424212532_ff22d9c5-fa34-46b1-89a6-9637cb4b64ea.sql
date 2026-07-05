CREATE TABLE IF NOT EXISTS public.ab_test_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ab_test_id uuid NOT NULL,
  variant text NOT NULL CHECK (variant IN ('A','B')),
  event_type text NOT NULL CHECK (event_type IN ('impression','checkout','conversion')),
  visitor_id text,
  value numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ab_test_events_test ON public.ab_test_events(ab_test_id, variant, event_type);

ALTER TABLE public.ab_test_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can insert ab events"
  ON public.ab_test_events
  FOR INSERT
  TO public
  WITH CHECK (
    ab_test_id IS NOT NULL
    AND (visitor_id IS NULL OR length(visitor_id) <= 128)
    AND value >= 0
  );

CREATE POLICY "Admins read ab events"
  ON public.ab_test_events
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage ab events"
  ON public.ab_test_events
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));