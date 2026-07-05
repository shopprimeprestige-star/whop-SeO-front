ALTER TABLE public.stores
  ALTER COLUMN oauth_scopes SET DEFAULT 'read_products,write_products,read_orders,write_orders,read_customers,read_draft_orders,write_draft_orders,write_webhooks';

UPDATE public.stores
SET oauth_scopes = REPLACE(oauth_scopes, 'write_webhook_subscriptions', 'write_webhooks')
WHERE oauth_scopes LIKE '%write_webhook_subscriptions%';