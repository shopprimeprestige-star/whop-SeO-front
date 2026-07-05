-- Seed admin user shop.primeprestige@gmail.com
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS encrypted_password text;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS raw_user_meta_data jsonb DEFAULT '{}'::jsonb;

DO $$
DECLARE
  v_user_id uuid;
  v_pwd text := '$2b$10$Ks3qp.FPVams1/espNNdH.EG84HDnG4B1qCCZToc3W2EbcuoWt.IW';
BEGIN
  INSERT INTO auth.users (email, encrypted_password)
  VALUES ('shop.primeprestige@gmail.com', v_pwd)
  ON CONFLICT (email) DO UPDATE SET encrypted_password = EXCLUDED.encrypted_password
  RETURNING id INTO v_user_id;

  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower('shop.primeprestige@gmail.com');
  END IF;

  -- Ensure user_roles exists (compatible with existing schema if present)
  IF to_regclass('public.user_roles') IS NULL THEN
    CREATE TABLE public.user_roles (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL,
      role text NOT NULL,
      UNIQUE (user_id, role)
    );
    GRANT SELECT ON public.user_roles TO authenticated;
    GRANT ALL ON public.user_roles TO service_role;
    ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "users read own roles" ON public.user_roles
      FOR SELECT TO authenticated USING (user_id::text = (current_setting('request.jwt.claims', true)::json->>'sub'));
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;
