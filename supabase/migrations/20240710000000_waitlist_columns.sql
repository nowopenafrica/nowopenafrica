/*
  # Reconcile waitlist columns

  Some projects have an older waitlist table (email/country only) that
  predates the full definition — CREATE TABLE IF NOT EXISTS silently skips
  an existing table, so the newer columns never got added and signups fail
  with "Could not find the 'business_type' column". Add them in place.
*/

ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS business_type text;
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS source text DEFAULT 'website';
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS invited boolean DEFAULT false;

-- Make sure the duplicate-email guard and signup policy exist too
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_unique ON waitlist (lower(email));

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can join the waitlist" ON waitlist;
CREATE POLICY "Anyone can join the waitlist" ON waitlist
  FOR INSERT TO anon, authenticated WITH CHECK (true);
