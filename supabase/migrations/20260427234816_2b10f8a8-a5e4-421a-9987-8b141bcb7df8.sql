-- Disable automatic daily reset of cap_window_revenue (Stores & Bridge stats)
DO $$
BEGIN
  PERFORM cron.unschedule('reset-daily-cap-windows-rome');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Drop the function so it can't be called accidentally
DROP FUNCTION IF EXISTS public.reset_daily_cap_windows();