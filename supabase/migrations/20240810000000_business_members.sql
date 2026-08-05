/*
  # Team roles & RBAC (security increment 2)

  Lets a business owner invite teammates with a role, and gives those teammates
  scoped access to the business's content.

  1. `business_members` — one row per (business, user). role is one of the
     BUSINESS_ROLES in src/data/roles.ts; status is 'active' or 'invited'.

  2. Helper functions (SECURITY DEFINER so they read membership without
     tripping RLS / recursion):
     - `is_business_member(biz)` → true for the owner, any active member, or an admin.
     - `has_business_role(biz, roles[])` → owner/admin, or an active member whose role is in the list.

  3. RLS is ADDITIVE — existing "owner manages X" policies are untouched; we add
     parallel "member manages X" policies. Permissive policies are OR'd, so
     owners keep working exactly as before and members gain access.
*/

CREATE TABLE IF NOT EXISTS public.business_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_email text,
  role          text NOT NULL DEFAULT 'staff',
  status        text NOT NULL DEFAULT 'active',
  created_at    timestamptz DEFAULT now(),
  UNIQUE (business_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_business_members_user ON public.business_members (user_id, status);
CREATE INDEX IF NOT EXISTS idx_business_members_biz  ON public.business_members (business_id);

ALTER TABLE public.business_members ENABLE ROW LEVEL SECURITY;

-- Owner (or admin) manages the team; members can see their own membership row.
DROP POLICY IF EXISTS "Owners manage team" ON public.business_members;
CREATE POLICY "Owners manage team" ON public.business_members
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND (b.user_id::text = auth.uid()::text OR public.is_admin())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = business_id AND (b.user_id::text = auth.uid()::text OR public.is_admin())));

DROP POLICY IF EXISTS "Members read own membership" ON public.business_members;
CREATE POLICY "Members read own membership" ON public.business_members
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Helpers -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_business_member(biz uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = biz AND b.user_id::text = auth.uid()::text)
    OR EXISTS (SELECT 1 FROM public.business_members m WHERE m.business_id = biz AND m.user_id = auth.uid() AND m.status = 'active')
    OR public.is_admin();
$$;

CREATE OR REPLACE FUNCTION public.has_business_role(biz uuid, roles text[])
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = biz AND b.user_id::text = auth.uid()::text)
    OR EXISTS (SELECT 1 FROM public.business_members m WHERE m.business_id = biz AND m.user_id = auth.uid() AND m.status = 'active' AND m.role = ANY(roles))
    OR public.is_admin();
$$;

-- Invite RPC: owners can't read other users' rows under RLS, so this
-- SECURITY DEFINER function looks up the invitee by email and adds them —
-- but only if the caller owns the business. Returns a status string.
CREATE OR REPLACE FUNCTION public.invite_business_member(biz uuid, member_email text, member_role text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target uuid; owns boolean; owner_id uuid;
BEGIN
  SELECT b.user_id INTO owner_id FROM public.businesses b WHERE b.id = biz;
  owns := (owner_id::text = auth.uid()::text) OR public.is_admin();
  IF NOT owns THEN RETURN 'forbidden'; END IF;
  SELECT id INTO target FROM public.users WHERE lower(email) = lower(trim(member_email)) LIMIT 1;
  IF target IS NULL THEN RETURN 'no_user'; END IF;
  IF target = owner_id THEN RETURN 'is_owner'; END IF;
  INSERT INTO public.business_members (business_id, user_id, invited_email, role, status)
  VALUES (biz, target, lower(trim(member_email)), member_role, 'active')
  ON CONFLICT (business_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active', invited_email = EXCLUDED.invited_email;
  RETURN 'added';
END;
$$;

-- Additive "member" policies on the content tables a team manages ------------
DROP POLICY IF EXISTS "Members manage business services" ON public.business_services;
CREATE POLICY "Members manage business services" ON public.business_services
  FOR ALL TO authenticated
  USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));

DROP POLICY IF EXISTS "Members manage business products" ON public.business_products;
CREATE POLICY "Members manage business products" ON public.business_products
  FOR ALL TO authenticated
  USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));

DROP POLICY IF EXISTS "Members manage business gallery" ON public.business_gallery;
CREATE POLICY "Members manage business gallery" ON public.business_gallery
  FOR ALL TO authenticated
  USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));

DROP POLICY IF EXISTS "Members manage business bookings" ON public.business_bookings;
CREATE POLICY "Members manage business bookings" ON public.business_bookings
  FOR ALL TO authenticated
  USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));
