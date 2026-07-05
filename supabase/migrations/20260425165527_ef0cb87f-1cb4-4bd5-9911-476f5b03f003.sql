ALTER PUBLICATION supabase_realtime ADD TABLE public.processed_orders;
ALTER TABLE public.processed_orders REPLICA IDENTITY FULL;