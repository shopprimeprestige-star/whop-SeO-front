ALTER TABLE public.stores
  ALTER COLUMN oauth_scopes SET DEFAULT 'read_products,write_products,read_orders,write_orders,read_customers,read_draft_orders,write_draft_orders';

UPDATE public.stores
SET oauth_scopes = regexp_replace(oauth_scopes, ',?write_webhooks', '', 'g')
WHERE oauth_scopes LIKE '%write_webhooks%';