-- Add write_products to default scopes and flag existing stores for re-auth
ALTER TABLE public.stores 
  ALTER COLUMN oauth_scopes SET DEFAULT 'read_products,write_products,read_orders,write_orders,read_customers,read_draft_orders,write_draft_orders,write_webhooks';

UPDATE public.stores
SET 
  oauth_scopes = CASE 
    WHEN oauth_scopes IS NULL OR oauth_scopes = '' THEN 'read_products,write_products,read_orders,write_orders,read_customers,read_draft_orders,write_draft_orders,write_webhooks'
    WHEN oauth_scopes NOT LIKE '%write_products%' THEN oauth_scopes || ',write_products'
    ELSE oauth_scopes
  END,
  needs_reauth = CASE 
    WHEN oauth_scopes IS NULL OR oauth_scopes NOT LIKE '%write_products%' THEN true
    ELSE needs_reauth
  END;