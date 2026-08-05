/*
  # Business registrations (Digital Forms lead capture)

  The /digital-forms page collects full business registrations from the
  public (no account needed, like the waitlist). Submissions land here for
  the team to review and convert into real `businesses` rows.

  Security: anyone can INSERT; only admins can read/manage.
*/

CREATE TABLE IF NOT EXISTS business_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  location text NOT NULL,
  phone text,
  email text,
  website text,
  services text,
  service_details text,
  products text,
  product_details text,
  pricing text,
  duration text,
  dimensions text,
  image_url text,
  social_media jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'new',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE business_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can submit a registration" ON business_registrations;
CREATE POLICY "Anyone can submit a registration" ON business_registrations
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view registrations" ON business_registrations;
CREATE POLICY "Admins can view registrations" ON business_registrations
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage registrations" ON business_registrations;
CREATE POLICY "Admins can manage registrations" ON business_registrations
  FOR UPDATE TO authenticated USING (public.is_admin());
