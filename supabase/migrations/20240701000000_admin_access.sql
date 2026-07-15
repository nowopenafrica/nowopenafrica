/*
  # Admin access

  1. Helper
    - `is_admin()` — SECURITY DEFINER check against users.role, safe to use
      inside RLS policies (bypasses RLS on the users table itself, so it
      cannot recurse).

  2. Policies
    - Admins can read, update, and delete every row in users, businesses,
      advertisements, and media_services (and insert content rows).

  3. Promoting an admin
    - There is intentionally no self-service path to become admin. Run:
        UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
      from the Supabase SQL editor.
*/

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- users ---------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view all profiles" ON users;
CREATE POLICY "Admins can view all profiles" ON users
  FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "Admins can update all profiles" ON users;
CREATE POLICY "Admins can update all profiles" ON users
  FOR UPDATE TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "Admins can delete profiles" ON users;
CREATE POLICY "Admins can delete profiles" ON users
  FOR DELETE TO authenticated USING (is_admin());

-- businesses ----------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage businesses" ON businesses;
CREATE POLICY "Admins can manage businesses" ON businesses
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- advertisements ------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage advertisements" ON advertisements;
CREATE POLICY "Admins can manage advertisements" ON advertisements
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- media_services ------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage media services" ON media_services;
CREATE POLICY "Admins can manage media services" ON media_services
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
