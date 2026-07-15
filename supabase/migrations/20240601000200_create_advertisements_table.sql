/*
  # Create advertisements table (consolidated)

  This replaces the three conflicting historical definitions
  (advertisements / advert / adverts). Columns cover everything the app
  touches: AdvertForm writes title, description, category, location,
  budget, duration, pricing, dimensions, traffic_density, status,
  image_url, user_id, business_id; public pages also read type,
  price_per_day, available_until and awards.

  Note: user_id and business_id are text (not uuid FKs) because the seed
  placements use placeholder ids like 'user_1' / 'business_1'. Owner RLS
  compares against auth.uid() cast to text, so real accounts still only
  manage their own rows.
*/

CREATE TABLE IF NOT EXISTS advertisements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  type text,
  category text,
  location text,
  price_per_day numeric,
  budget numeric,
  duration integer,
  pricing numeric,
  traffic_density text,
  dimensions text,
  available_until timestamptz,
  awards text,
  status text DEFAULT 'active',
  image_url text,
  user_id text,
  business_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Reconcile with any pre-existing variant of the table
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS price_per_day numeric;
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS budget numeric;
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS duration integer;
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS pricing numeric;
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS traffic_density text;
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS dimensions text;
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS available_until timestamptz;
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS awards text;
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS business_id text;
ALTER TABLE advertisements ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE advertisements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view advertisements" ON advertisements;
DROP POLICY IF EXISTS "Public can view advertisements" ON advertisements;
CREATE POLICY "Public can view advertisements" ON advertisements
  FOR SELECT USING (true);

-- user_id may be text or uuid depending on which historical schema created
-- the table, so both sides are cast to text.
DROP POLICY IF EXISTS "Authenticated users can insert advertisements" ON advertisements;
DROP POLICY IF EXISTS "Owners can insert advertisements" ON advertisements;
CREATE POLICY "Owners can insert advertisements" ON advertisements
  FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "Authenticated users can update their own advertisements" ON advertisements;
DROP POLICY IF EXISTS "Owners can update advertisements" ON advertisements;
CREATE POLICY "Owners can update advertisements" ON advertisements
  FOR UPDATE TO authenticated USING (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "Authenticated users can delete their own advertisements" ON advertisements;
DROP POLICY IF EXISTS "Owners can delete advertisements" ON advertisements;
CREATE POLICY "Owners can delete advertisements" ON advertisements
  FOR DELETE TO authenticated USING (auth.uid()::text = user_id::text);
