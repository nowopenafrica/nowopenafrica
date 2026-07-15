/*
  # Create waitlist table

  Stores launch waitlist signups from the public /waitlist page.

  Security:
  - Anyone (including anonymous visitors) can INSERT — that's the point of a
    public waitlist form. Duplicate emails are rejected by a unique index.
  - Only admins can read, update, or delete entries.
*/

CREATE TABLE IF NOT EXISTS waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  email text NOT NULL,
  business_type text,
  country text,
  source text DEFAULT 'website',
  invited boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_unique ON waitlist (lower(email));

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can join the waitlist" ON waitlist;
CREATE POLICY "Anyone can join the waitlist" ON waitlist
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view waitlist" ON waitlist;
CREATE POLICY "Admins can view waitlist" ON waitlist
  FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "Admins can update waitlist" ON waitlist;
CREATE POLICY "Admins can update waitlist" ON waitlist
  FOR UPDATE TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "Admins can delete waitlist" ON waitlist;
CREATE POLICY "Admins can delete waitlist" ON waitlist
  FOR DELETE TO authenticated USING (is_admin());
