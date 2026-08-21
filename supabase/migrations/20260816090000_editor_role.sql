/*
  # Add the `editor` role

  A content role: the homepage banner, hero videos and listing content. NOT
  accounts, payments, verification, personal data, or deletion.

  Three things are required for the role to be real rather than cosmetic:

    1. The CHECK constraint from 20240818000000_role_escalation_guard.sql bounds
       users.role to ('business','media_service','admin'). Without widening it,
       the Users panel dropdown simply fails on save.

    2. is_editor()/is_staff() helpers, SECURITY DEFINER for the same reason
       is_admin() is: a policy runs as the caller, so an inline lookup against
       public.users is filtered by that table's own RLS and silently returns
       false. (Learned the hard way on site_settings.)

    3. Actual permissions. The Admin Console hides tabs an editor may not use,
       but hiding is not enforcing — every privileged table is already
       `USING (is_admin())`, so an editor calling the API directly gets nothing.
       That default-deny is what makes the role safe. The one thing they must be
       able to WRITE is the hero banner, granted below.

  Deliberately NOT changed:

    - handle_new_user() keeps its allowlist of business / media_service, so a
      signup carrying {"role":"editor"} still lands as 'business'. Editor is
      granted by an admin, never claimed at registration — the same rule that
      already applies to admin.

    - guard_user_role_column() already freezes role for anyone who is not the
      service role or an admin, so an editor cannot promote themselves or
      anyone else. It needs no change; is_admin() stays the gate.

  NOTE ON HERO VIDEOS: the `hero-videos` storage bucket has no policy in this
  repo (only business-images does), so upload/delete there is governed by
  whatever is configured in the Supabase dashboard. If editors cannot upload a
  hero video, that bucket's policy is why, and it needs the same is_staff()
  treatment applied there.
*/

-- 1. Widen the role constraint ------------------------------------------------
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IS NULL OR role IN ('business', 'media_service', 'editor', 'admin')) NOT VALID;

-- 2. Helpers ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_editor()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'editor'
  );
$$;

-- Admin OR editor. Use this for anything an editor is meant to reach; keep
-- is_admin() for everything else so the default stays deny.
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role IN ('admin', 'editor')
  );
$$;

-- 3. The one write an editor gains: the homepage banner -----------------------
-- site_settings may not exist yet on a project that has not run the previous
-- migration, so this is guarded rather than assumed.
DO $$
BEGIN
  IF to_regclass('public.site_settings') IS NOT NULL THEN
    DROP POLICY IF EXISTS "site_settings_admin_write" ON public.site_settings;
    DROP POLICY IF EXISTS "site_settings_staff_write" ON public.site_settings;
    CREATE POLICY "site_settings_staff_write"
      ON public.site_settings FOR ALL
      TO authenticated
      USING (public.is_staff())
      WITH CHECK (public.is_staff());
  END IF;
END $$;

-- After applying, confirm who holds staff roles:
--   SELECT id, email, role FROM public.users WHERE role IN ('admin','editor');
