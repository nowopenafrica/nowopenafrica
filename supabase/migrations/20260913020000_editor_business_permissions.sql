-- Editors gain the Businesses console: create and maintain UNCLAIMED listings.
--
-- WHAT CHANGES
--
-- 1. Role allowlist: 'editor' is restored to the users_role_check constraint
--    that 20260829020000_personal_accounts rewrote without it.
--
-- 2. RLS on businesses: staff can read all rows (the tab lists everything);
--    editors can INSERT unclaimed admin-curated rows and UPDATE unclaimed rows.
--    DELETE stays admin-only; admins retain full FOR ALL access.
--
-- 3. A moderation guard trigger: if an editor tries to change any trust,
--    ownership, lifecycle, removal or provenance column — even on an unclaimed
--    row — the database raises immediately.
--
-- DESIGN
--
-- The claim boundary is the whole point. An unclaimed listing is NowOpen's own
-- work, maintained until an owner arrives. The moment it is claimed the page
-- becomes theirs, and neither the console button nor the SQL policy lets an
-- editor through. `canEditBusinessProfile` in permissions.ts matches this.
--
-- Moderation is NEVER editable by an editor: verified, verification_tier,
-- trust_score, lifecycle_status, profile_state, removal_status, data_status,
-- data_confidence, source_*, user_id, claim_status, claimed_at.
--
-- Availability columns are deliberately excluded from the freeze: they are
-- managed by nowopen_default_availability() and content edits that add opening
-- hours legitimately change them. Raising here would break a normal save.
--
-- Generated columns (is_listable, listing_score) cannot be assigned by Postgres
-- at all — including them is harmless but unnecessary.
--
-- Re-runnable: all policies and triggers are DROP … IF EXISTS before CREATE.

-- 1. Fix the role allowlist ---------------------------------------------------
-- 20260816090000 added 'editor'; 20260829020000 rewrote the constraint and
-- dropped it. Restore both 'editor' and 'personal'.

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IS NULL OR role IN ('business', 'media_service', 'personal', 'editor', 'admin')) NOT VALID;

-- 2. Staff can read every row -------------------------------------------------
-- Editors see the full Businesses tab, not just listable rows. Permissive
-- policies OR with the existing public SELECT policy, so non-staff visibility
-- is unchanged.

DROP POLICY IF EXISTS "Staff can read all businesses" ON public.businesses;
CREATE POLICY "Staff can read all businesses" ON public.businesses
  FOR SELECT TO authenticated
  USING (public.is_staff());

-- 3. Editors may create unclaimed, admin-curated listings ----------------------
-- The console's "Add business" flow writes user_id null, claim_status
-- 'unclaimed', data_status 'admin_curated' — the exact shape an editor is
-- trusted to create. Every other INSERT stays admin-only.

DROP POLICY IF EXISTS "Editors can create unclaimed businesses" ON public.businesses;
CREATE POLICY "Editors can create unclaimed businesses" ON public.businesses
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_editor()
    AND user_id IS NULL
    AND claim_status = 'unclaimed'
    AND data_status = 'admin_curated'
  );

-- 4. Editors may update unclaimed rows, and may not make them claimed ----------
-- USING matches old rows (editor identity only — the row-level filter);
-- WITH CHECK constrains the result. An editor editing a claimed or pending
-- row hits a denied new row and gets a clean 42501 from RLS.

DROP POLICY IF EXISTS "Editors can edit unclaimed businesses" ON public.businesses;
CREATE POLICY "Editors can edit unclaimed businesses" ON public.businesses
  FOR UPDATE TO authenticated
  USING (public.is_editor())
  WITH CHECK (
    public.is_editor()
    AND user_id IS NULL
    AND claim_status = 'unclaimed'
  );

-- 5. Editors must not touch moderation columns --------------------------------
-- RLS decides WHICH rows; this decides WHICH columns. An editor can fix a
-- phone number on an unclaimed listing, but a verified badge, a lifecycle
-- change, a removal decision or a provenance field is a trust claim to the
-- public — claimed or not.

CREATE OR REPLACE FUNCTION public.guard_editor_business_moderation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $fn$
BEGIN
  IF NOT public.is_editor() THEN
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
            hint = 'Verification, lifecycle, removal, ownership and provenance are not editable by an editor.';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS guard_editor_business_moderation ON public.businesses;
CREATE TRIGGER guard_editor_business_moderation
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.guard_editor_business_moderation();
