-- Isolated fix: waitlist and business_registrations both reject anonymous
-- INSERTs live ("new row violates row-level security policy"), confirmed by
-- a direct API test, even though business_enquiries (created the same way)
-- accepts them fine. This re-asserts the INSERT policy AND the base table
-- grant for both tables — nothing else — so there's no unrelated statement
-- in this paste that could fail and roll the whole thing back.
--
-- Safe to re-run. Run this whole block in one paste in the Supabase SQL
-- editor, then check for a red error message before assuming success.

GRANT INSERT ON waitlist TO anon, authenticated;
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can join the waitlist" ON waitlist;
CREATE POLICY "Anyone can join the waitlist" ON waitlist
  FOR INSERT TO anon, authenticated WITH CHECK (true);

GRANT INSERT ON business_registrations TO anon, authenticated;
ALTER TABLE business_registrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can submit a registration" ON business_registrations;
CREATE POLICY "Anyone can submit a registration" ON business_registrations
  FOR INSERT TO anon, authenticated WITH CHECK (true);
