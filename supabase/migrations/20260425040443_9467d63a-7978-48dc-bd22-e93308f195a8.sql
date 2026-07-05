
-- Tabella per tracciare bot bloccati
CREATE TABLE IF NOT EXISTS public.bot_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  ip text,
  user_agent text,
  reason text NOT NULL,
  bot_name text,
  path text,
  country text
);

ALTER TABLE public.bot_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage bot_blocks"
ON public.bot_blocks FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Public can insert bot_blocks"
ON public.bot_blocks FOR INSERT TO public
WITH CHECK (
  reason IS NOT NULL AND length(reason) <= 128
  AND (ip IS NULL OR length(ip) <= 64)
  AND (user_agent IS NULL OR length(user_agent) <= 1024)
  AND (bot_name IS NULL OR length(bot_name) <= 64)
  AND (path IS NULL OR length(path) <= 512)
);

CREATE INDEX IF NOT EXISTS idx_bot_blocks_created_at ON public.bot_blocks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_blocks_bot_name ON public.bot_blocks(bot_name);

-- Colonne aggiuntive su sessions per LP Performance
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS bounce boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pages_path jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS clicks integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_mobile boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS converted boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_sessions_product_id ON public.sessions(product_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON public.sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON public.sessions(session_id);
