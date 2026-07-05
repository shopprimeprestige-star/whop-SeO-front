-- Aggiorna il default della colonna
ALTER TABLE public.stores
  ALTER COLUMN oauth_scopes SET DEFAULT 'read_products,write_products,read_orders,write_orders,read_customers,read_draft_orders,write_draft_orders,write_webhook_subscriptions';

-- Sostituisce lo scope obsoleto sugli store esistenti
UPDATE public.stores
SET oauth_scopes = REPLACE(oauth_scopes, 'write_webhooks', 'write_webhook_subscriptions')
WHERE oauth_scopes LIKE '%write_webhooks%'
  AND oauth_scopes NOT LIKE '%write_webhook_subscriptions%';