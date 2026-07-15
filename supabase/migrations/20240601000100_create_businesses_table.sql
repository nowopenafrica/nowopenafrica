/*
  # Create businesses table

  Columns match what the dashboard BusinessForm reads/writes:
  name, description, category, location, phone, website, email,
  image_url, rating, status, user_id (owner).

  Security: public read; owners manage their own rows.
*/

CREATE TABLE IF NOT EXISTS businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text NOT NULL,
  location text,
  phone text,
  website text,
  email text,
  rating numeric DEFAULT 0,
  image_url text,
  status text DEFAULT 'open',
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Reconcile with a pre-existing table missing newer columns
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view businesses" ON businesses;
DROP POLICY IF EXISTS "Public can view businesses" ON businesses;
CREATE POLICY "Public can view businesses" ON businesses
  FOR SELECT USING (true);

-- Cast both sides to text so this works whether user_id is uuid or text
DROP POLICY IF EXISTS "Owners can insert businesses" ON businesses;
CREATE POLICY "Owners can insert businesses" ON businesses
  FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "Owners can update businesses" ON businesses;
CREATE POLICY "Owners can update businesses" ON businesses
  FOR UPDATE TO authenticated USING (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "Owners can delete businesses" ON businesses;
CREATE POLICY "Owners can delete businesses" ON businesses
  FOR DELETE TO authenticated USING (auth.uid()::text = user_id::text);
