/*
  # Create media_services table

  Columns match what MediaForm writes (title, description, service_type,
  pricing, image_url, portfolio_url, rating, user_id) plus the display
  fields the public pages read (pricing_model, delivery_time,
  clients_served, review_count, thumbnail_url, category, reach, status).

  Security: public read; owners manage their own rows.
*/

CREATE TABLE IF NOT EXISTS media_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  service_type text NOT NULL,
  pricing numeric,
  pricing_model text,
  delivery_time text,
  clients_served integer,
  review_count integer,
  equipment text,
  additional_info text,
  portfolio_url text,
  image_url text,
  thumbnail_url text,
  category text,
  reach integer,
  rating numeric DEFAULT 0,
  status text DEFAULT 'open',
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Reconcile with a pre-existing table missing newer columns
ALTER TABLE media_services ADD COLUMN IF NOT EXISTS pricing_model text;
ALTER TABLE media_services ADD COLUMN IF NOT EXISTS delivery_time text;
ALTER TABLE media_services ADD COLUMN IF NOT EXISTS clients_served integer;
ALTER TABLE media_services ADD COLUMN IF NOT EXISTS review_count integer;
ALTER TABLE media_services ADD COLUMN IF NOT EXISTS equipment text;
ALTER TABLE media_services ADD COLUMN IF NOT EXISTS additional_info text;
ALTER TABLE media_services ADD COLUMN IF NOT EXISTS portfolio_url text;
ALTER TABLE media_services ADD COLUMN IF NOT EXISTS thumbnail_url text;
ALTER TABLE media_services ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE media_services ADD COLUMN IF NOT EXISTS reach integer;
ALTER TABLE media_services ADD COLUMN IF NOT EXISTS status text DEFAULT 'open';
ALTER TABLE media_services ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE media_services ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE media_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view media services" ON media_services;
DROP POLICY IF EXISTS "Public can view media services" ON media_services;
CREATE POLICY "Public can view media services" ON media_services
  FOR SELECT USING (true);

-- Cast both sides to text so this works whether user_id is uuid or text
DROP POLICY IF EXISTS "Owners can insert media services" ON media_services;
CREATE POLICY "Owners can insert media services" ON media_services
  FOR INSERT TO authenticated WITH CHECK (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "Owners can update media services" ON media_services;
CREATE POLICY "Owners can update media services" ON media_services
  FOR UPDATE TO authenticated USING (auth.uid()::text = user_id::text);

DROP POLICY IF EXISTS "Owners can delete media services" ON media_services;
CREATE POLICY "Owners can delete media services" ON media_services
  FOR DELETE TO authenticated USING (auth.uid()::text = user_id::text);
