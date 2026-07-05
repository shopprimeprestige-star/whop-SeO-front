-- Fix function search_path
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Tighten sessions RLS: anonymous tracking is OK but with shape constraints
DROP POLICY IF EXISTS "Anyone can create sessions" ON public.sessions;
DROP POLICY IF EXISTS "Anyone can update sessions by session_id" ON public.sessions;

CREATE POLICY "Public can insert valid sessions"
  ON public.sessions FOR INSERT
  WITH CHECK (
    session_id IS NOT NULL
    AND length(session_id) BETWEEN 8 AND 128
    AND (visitor_id IS NULL OR length(visitor_id) <= 128)
    AND (utm_source IS NULL OR length(utm_source) <= 128)
    AND (utm_medium IS NULL OR length(utm_medium) <= 128)
    AND (utm_campaign IS NULL OR length(utm_campaign) <= 256)
    AND (utm_content IS NULL OR length(utm_content) <= 256)
    AND (utm_term IS NULL OR length(utm_term) <= 256)
    AND (referrer IS NULL OR length(referrer) <= 2048)
    AND (landing_page IS NULL OR length(landing_page) <= 2048)
  );

CREATE POLICY "Public can update sessions with valid shape"
  ON public.sessions FOR UPDATE
  USING (true)
  WITH CHECK (
    session_id IS NOT NULL
    AND length(session_id) BETWEEN 8 AND 128
    AND time_on_page >= 0
    AND scroll_depth BETWEEN 0 AND 100
  );