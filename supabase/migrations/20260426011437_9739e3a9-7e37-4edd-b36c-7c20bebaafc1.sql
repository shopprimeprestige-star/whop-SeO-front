-- Create public bucket for brand assets (logos, payment, courier)
INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-assets', 'brand-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Public read
CREATE POLICY "Public read brand-assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'brand-assets');

-- Admin write/update/delete
CREATE POLICY "Admins upload brand-assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'brand-assets' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update brand-assets"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'brand-assets' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete brand-assets"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'brand-assets' AND has_role(auth.uid(), 'admin'::app_role));