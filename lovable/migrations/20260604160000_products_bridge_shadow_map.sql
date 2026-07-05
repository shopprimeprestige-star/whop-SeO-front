-- Mapping prodotto Sito A -> prodotto shadow su Sito B (per ogni store ponte)
alter table public.products
  add column if not exists bridge_shadow_map jsonb not null default '{}'::jsonb;
