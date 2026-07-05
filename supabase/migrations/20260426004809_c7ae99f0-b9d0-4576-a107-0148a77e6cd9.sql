ALTER TABLE public.tracking_events
  ADD CONSTRAINT tracking_events_event_id_channel_key UNIQUE (event_id, channel);