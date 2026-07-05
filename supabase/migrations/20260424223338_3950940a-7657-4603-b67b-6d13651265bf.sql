-- Tracking events with server-side dedup
CREATE TABLE IF NOT EXISTS public.tracking_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id text NOT NULL,
  channel text NOT NULL,
  event_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  response_code integer,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tracking_events_channel_chk CHECK (channel IN ('meta','tiktok'))
);

CREATE UNIQUE INDEX IF NOT EXISTS tracking_events_event_channel_uniq
  ON public.tracking_events (event_id, channel);

CREATE INDEX IF NOT EXISTS tracking_events_status_idx
  ON public.tracking_events (status, created_at);

ALTER TABLE public.tracking_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage tracking_events" ON public.tracking_events;
CREATE POLICY "Admins manage tracking_events"
  ON public.tracking_events
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS tracking_events_set_updated_at ON public.tracking_events;
CREATE TRIGGER tracking_events_set_updated_at
  BEFORE UPDATE ON public.tracking_events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Shopify OAuth columns on stores
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS oauth_state text,
  ADD COLUMN IF NOT EXISTS installed_at timestamptz;

CREATE INDEX IF NOT EXISTS stores_oauth_state_idx
  ON public.stores (oauth_state)
  WHERE oauth_state IS NOT NULL;