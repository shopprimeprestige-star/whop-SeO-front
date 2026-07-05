-- Ensure pg_cron is enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Function: reset cap_window_revenue at Rome midnight (handles DST automatically)
CREATE OR REPLACE FUNCTION public.reset_daily_cap_windows()
RETURNS TABLE(reset_count integer, rome_day date) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rome_now timestamptz := now() AT TIME ZONE 'Europe/Rome';
  v_rome_midnight_utc timestamptz;
  v_count integer := 0;
BEGIN
  -- Today's midnight in Rome, expressed as a UTC timestamptz
  v_rome_midnight_utc := (date_trunc('day', (now() AT TIME ZONE 'Europe/Rome')) AT TIME ZONE 'Europe/Rome');

  -- Reset every store whose cap_window_start is older than today's Rome midnight
  -- (i.e. their 24h window started before the current Rome day)
  UPDATE public.stores
     SET cap_window_revenue = 0,
         cap_window_start   = v_rome_midnight_utc,
         updated_at         = now()
   WHERE cap_window_start IS NULL
      OR cap_window_start < v_rome_midnight_utc;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN QUERY SELECT v_count, (v_rome_now)::date;
END;
$$;

-- Allow service role / authenticated admin to invoke explicitly if needed
REVOKE ALL ON FUNCTION public.reset_daily_cap_windows() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_daily_cap_windows() TO postgres, service_role;

-- Run an initial alignment immediately
SELECT public.reset_daily_cap_windows();

-- Remove any previous schedule with the same name, then schedule every 5 minutes
DO $$
BEGIN
  PERFORM cron.unschedule('reset-daily-cap-windows-rome');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'reset-daily-cap-windows-rome',
  '*/5 * * * *',
  $$ SELECT public.reset_daily_cap_windows(); $$
);