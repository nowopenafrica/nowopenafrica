/*
  # Favorites / saved items (mobile app)

  Lets a signed-in user save businesses, ad placements and creative services to
  a personal "Saved" list. Polymorphic (item_type + item_id, matching the
  payment_intents / business_bookings precedent) so one table covers all three.
  Users see and manage only their own rows.
*/

CREATE TABLE IF NOT EXISTS favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('business', 'advert', 'media_service')),
  item_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, item_type, item_id)
);

ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

-- Owners manage their own favorites; nobody else can read them.
DROP POLICY IF EXISTS "Users read own favorites" ON favorites;
CREATE POLICY "Users read own favorites" ON favorites
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users add own favorites" ON favorites;
CREATE POLICY "Users add own favorites" ON favorites
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users remove own favorites" ON favorites;
CREATE POLICY "Users remove own favorites" ON favorites
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS favorites_user_idx ON favorites (user_id);
