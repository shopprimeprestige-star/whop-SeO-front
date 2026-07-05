-- Garantisce la colonna bridge_shadow_map sui prodotti (retry idempotente).
alter table public.products
  add column if not exists bridge_shadow_map jsonb not null default '{}'::jsonb;
