-- Enable realtime for live UI updates
ALTER TABLE public.stores REPLICA IDENTITY FULL;
ALTER TABLE public.store_stats REPLICA IDENTITY FULL;
ALTER TABLE public.webhook_events REPLICA IDENTITY FULL;
ALTER TABLE public.system_logs REPLICA IDENTITY FULL;
ALTER TABLE public.rotation_log REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stores;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.store_stats;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.webhook_events;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.system_logs;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rotation_log;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END$$;

-- Seed global rotation/proxy/webhook settings (idempotent)
INSERT INTO public.settings (key, value, is_public)
VALUES (
  'global_config',
  jsonb_build_object(
    'default_rotation_threshold', 847,
    'default_cap_amount', 580,
    'default_cap_window_days', 1,
    'webhook_silent_minutes', 5,
    'fallback_poll_interval_minutes', 10,
    'circuit_breaker_threshold', 5,
    'circuit_breaker_cooldown_minutes', 15,
    'global_proxy_enabled', false,
    'global_proxy_type', 'http',
    'global_proxy_host', null,
    'global_proxy_port', null,
    'global_proxy_username', null,
    'global_proxy_password_encrypted', null
  ),
  false
)
ON CONFLICT (key) DO NOTHING;