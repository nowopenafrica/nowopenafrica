-- The `business_curator` role: a businesses-only console role.
--
-- Mirrors 20260913020000 (editor) but narrower on purpose: a curator can read
-- the Businesses tab, create unclaimed, admin-curated listings and edit
-- unclaimed ones until an owner claims them. That is the entire remit.
--
-- WHAT CHANGES
--
--   1. Role allowlist: 'business_curator' is added to the users_role_check
--      constraint alongside the existing five roles.
--
--   2. is_curator(): a SECURITY DEFINER helper, same pattern as is_editor().
--
--   3. RLS on businesses, deliberately ADDITIVE: curators get their own
--      SELECT/INSERT/UPDATE policies while admin and editor retain exactly what
--      they had. `is_staff()` is NOT widened, so this role does NOT inherit the
--      site_settings write that editors hold — homepage and page content stay
--      out of the remit. No DELETE policy: deletion remains admin-only.
--
--   4. A moderation guard trigger, identical to the editor's: even on an
--      unclaimed row the column freeze applies, because verification, trust,
--      lifecycle, removal, ownership and provenance are trust claims to the
--      public, claimed or not. Availability columns stay editable (same
--      reasoning as the editor migration).
--
-- WHY NOT just reuse `editor`: the editor role also owns the homepage banner,
-- hero videos, pages and adverts. This role exists as the example of "a role
-- that can add and edit businesses and nothing else" — a reviewer who is handed
-- it should be unable to do anything that is not business listings.
--
-- Re-runnable: every policy, trigger and function is DROP … IF EXISTS /
-- CREATE OR REPLACE, and the constraint is DROP/ADD guarded.

-- 1. Widen the role allowlist --------------------------------------------------
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IS NULL OR role IN ('business', 'media_service', 'personal', 'business_curator', 'editor', 'admin')) NOT VALID;

-- 2. Curator helper ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_curator()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'business_curator'
  );
$$;

-- 3. RLS on businesses (additive) -----------------------------------------------

-- Curators need to SEE the tab, not just write to it — the businesses tab
-- lists everything. Permissive, so it ORs with the existing public policy.
DROP POLICY IF EXISTS "Curators can read all businesses" ON public.businesses;
CREATE POLICY "Curators can read all businesses" ON public.businesses
  FOR SELECT TO authenticated
  USING (public.is_curator());

-- Same shape the editor may create: an unclaimed, admin-curated listing with
-- no owner. Every other INSERT stays admin/editor-only.
DROP POLICY IF EXISTS "Curators can create unclaimed businesses" ON public.businesses;
CREATE POLICY "Curators can create unclaimed businesses" ON public.businesses
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_curator()
    AND user_id IS NULL
    AND claim_status = 'unclaimed'
    AND data_status = 'admin_curated'
  );

-- Update unclaimed rows, and never make one claimed. USING filters old rows;
-- WITH CHECK constrains the result, so editing a claimed or pending row gets a
-- clean 42501 from RLS.
DROP POLICY IF EXISTS "Curators can edit unclaimed businesses" ON public.businesses;
CREATE POLICY "Curators can edit unclaimed businesses" ON public.businesses
  FOR UPDATE TO authenticated
  USING (public.is_curator())
  WITH CHECK (
    public.is_curator()
    AND user_id IS NULL
    AND claim_status = 'unclaimed'
  );

-- 4. Curators must not touch moderation columns --------------------------------
-- RLS decides WHICH rows; this decides WHICH columns, with the same freeze the
-- editor gets. A curator may fix a phone number; a verified badge, a lifecycle
-- change, a removal decision or a provenance field is a trust claim to the
-- public — unclaimed or not.

CREATE OR REPLACE FUNCTION public.guard_curator_business_moderation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $fn$
BEGIN
  IF NOT public.is_curator() THEN
    RETURN NEW;
  END IF;

  IF (
    NEW.verified, NEW.email_verified, NEW.phone_verified, NEW.id_verified,
    NEW.registration_verified, NEW.address_verified, NEW.documents_reviewed,
    NEW.onsite_verified, NEW.verification_tier, NEW.trust_score,
    NEW.verification_status, NEW.lifecycle_status, NEW.profile_state,
    NEW.last_verified_at, NEW.data_status, NEW.data_confidence,
    NEW.user_id, NEW.claim_status, NEW.claimed_at,
    NEW.removal_status, NEW.removal_requested_at, NEW.removal_requested_by,
    NEW.removal_reason, NEW.removal_resolved_at,
    NEW.source_name, NEW.source_url, NEW.source_record_id, NEW.source_license,
    NEW.source_imported_at, NEW.source_last_checked_at, NEW.external_id
  ) IS DISTINCT FROM (
    OLD.verified, OLD.email_verified, OLD.phone_verified, OLD.id_verified,
    OLD.registration_verified, OLD.address_verified, OLD.documents_reviewed,
    OLD.onsite_verified, OLD.verification_tier, OLD.trust_score,
    OLD.verification_status, OLD.lifecycle_status, OLD.profile_state,
    OLD.last_verified_at, OLD.data_status, OLD.data_confidence,
    OLD.user_id, OLD.claim_status, OLD.claimed_at,
    OLD.removal_status, OLD.removal_requested_at, OLD.removal_requested_by,
    OLD.removal_reason, OLD.removal_resolved_at,
    OLD.source_name, OLD.source_url, OLD.source_record_id, OLD.source_license,
    OLD.source_imported_at, OLD.source_last_checked_at, OLD.external_id
  ) THEN
    RAISE EXCEPTION
      'Business moderation fields are admin-only.'
      USING errcode = '42501',
            hint = 'Verification, lifecycle, removal, ownership and provenance are not editable by a business curator.';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS guard_curator_business_moderation ON public.businesses;
CREATE TRIGGER guard_curator_business_moderation
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.guard_curator_business_moderation();

-- After applying, grant the role (only an admin can, and only from the Users
-- panel or here):
--   UPDATE public.users SET role = 'business_curator'
--   WHERE email = 'them@example.com';