-- Behaviour checks for the partner portal migrations
-- (supabase/migrations/20261111010000_partner_portal.sql and its follow-up
-- 20261111030000_partner_portal_fixes.sql: checks 19 to 23 need both).
--
-- ONE transaction that ALWAYS rolls back: every throwaway row below (named
-- "zz-portal-check ...", including the throwaway auth users and businesses) is
-- discarded, so nothing is persisted. There is no commit in this file and a
-- test (src/test/partnerPortalCheckSql.test.ts) keeps it that way.
--
-- Run it only AFTER the migration is applied, through
-- scripts/check-partner-portal.mjs. Each check is a DO block that ASSERTs; the
-- first failure aborts the transaction with its check name in the message.
-- A passing check prints "ok: <check name>".
--
-- Roles: the connection is the owner (no JWT), which the trust guards let
-- through. Web callers are simulated with SET LOCAL ROLE plus
-- request.jwt.claims; auth.role() and auth.uid() read those claims. The
-- throwaway users are real auth.users rows (inside the transaction) because
-- businesses.user_id, business_members.user_id and notifications.user_id all
-- reference auth.users. Their welcome-pack trigger only queues an HTTP call
-- inside this transaction, which the rollback discards.
--
-- Every role switch is followed by RESET ROLE before any assertion reads a
-- table, so assertions always read as the owner.

BEGIN;

SELECT set_config('chk.passed', '', false);

-- Throwaway-row helpers, living in pg_temp so they vanish with the session.

-- A throwaway account (auth.users, and the public.users profile the signup
-- trigger creates). An admin needs the role set under a service_role claim:
-- the role-escalation guard silently reverts any other caller.
CREATE FUNCTION pg_temp.chk_user(p_label text, p_admin boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE
  v_id    uuid := gen_random_uuid();
  v_email text := 'zz-portal-check-' || p_label || '-' || substr(md5(random()::text), 1, 8) || '@example.invalid';
BEGIN
  INSERT INTO auth.users (id, aud, role, email, created_at, updated_at)
  VALUES (v_id, 'authenticated', 'authenticated', v_email, now(), now());
  INSERT INTO public.users (id, email, role)
  VALUES (v_id, v_email, 'business')
  ON CONFLICT (id) DO NOTHING;
  IF p_admin THEN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    UPDATE public.users SET role = 'admin' WHERE id = v_id;
    PERFORM set_config('request.jwt.claims', '', true);
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_id AND role = 'admin') THEN
      RAISE EXCEPTION 'setup: could not make the throwaway admin';
    END IF;
  END IF;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v_id;
END;
$f$;

-- A business owned by p_user (is_business_member accepts businesses.user_id).
CREATE FUNCTION pg_temp.chk_business(p_label text, p_user uuid)
RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.businesses (name, category, user_id)
  VALUES ('zz-portal-check ' || p_label, 'Advertising', p_user)
  RETURNING id INTO v_id;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v_id;
END;
$f$;

-- A media owner for that business, created directly (the owner connection
-- may), verified or not. enable_media_owner has its own check.
CREATE FUNCTION pg_temp.chk_owner(p_label text, p_business uuid, p_verified boolean DEFAULT false)
RETURNS uuid LANGUAGE sql AS $f$
  INSERT INTO public.media_owners (name, business_id, verification, verification_note)
  VALUES ('zz-portal-check ' || p_label, p_business,
          CASE WHEN p_verified THEN 'verified' ELSE 'unverified' END,
          CASE WHEN p_verified THEN 'zz-portal-check documents' END)
  RETURNING id;
$f$;

-- A placement with no owner (an imported listing), for claims.
CREATE FUNCTION pg_temp.chk_advert(p_label text, p_category text DEFAULT 'Billboard')
RETURNS uuid LANGUAGE sql AS $f$
  INSERT INTO public.advertisements (title, type, category, location, pricing)
  VALUES ('zz-portal-check ' || p_label, p_category, p_category, 'Nowhere, Nigeria', 100)
  RETURNING id;
$f$;

CREATE FUNCTION pg_temp.chk_claims(p_user uuid)
RETURNS text LANGUAGE sql AS $f$
  SELECT json_build_object('role', 'authenticated', 'sub', p_user::text,
                           'email', 'zz-portal-check@example.invalid')::text;
$f$;

-- Valid owner_create_placement input.
CREATE FUNCTION pg_temp.chk_payload(p_label text)
RETURNS jsonb LANGUAGE sql AS $f$
  SELECT jsonb_build_object(
    'category', 'Billboard',
    'title', 'zz-portal-check ' || p_label,
    'city', 'Lagos',
    'country_code', 'NG',
    'currency', 'NGN',
    'rate_amount', 100000,
    'rate_period', 'month',
    'pricing', 65,
    'site_address', 'zz-portal-check landmark',
    'image_url', 'https://example.invalid/zz-portal-check.jpg');
$f$;

-- Create a placement through owner_create_placement as p_user (a signed-in,
-- non-admin member), then go back to the owner connection with no JWT.
CREATE FUNCTION pg_temp.chk_create_as(p_user uuid, p_owner uuid, p_label text, p_extra jsonb DEFAULT '{}')
RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE
  v_p      jsonb := pg_temp.chk_payload(p_label) || p_extra;
  v_claims text := pg_temp.chk_claims(p_user);
  v_id     uuid;
BEGIN
  PERFORM set_config('request.jwt.claims', v_claims, true);
  SET LOCAL ROLE authenticated;
  v_id := public.owner_create_placement(p_owner, v_p);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN v_id;
END;
$f$;

-- The business day, Lagos, never the UTC date.
CREATE FUNCTION pg_temp.chk_today()
RETURNS date LANGUAGE sql AS $f$
  SELECT (now() AT TIME ZONE 'Africa/Lagos')::date;
$f$;

CREATE FUNCTION pg_temp.chk_pass(p_name text)
RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM set_config('chk.passed', current_setting('chk.passed', true) || p_name || ',', false);
  RAISE NOTICE 'ok: %', p_name;
END;
$f$;

-- 1 ---------------------------------------------------------------------
-- Turning Media owner mode on twice returns the same owner and writes one row.
DO $$
DECLARE
  v_user     uuid := pg_temp.chk_user('enable member');
  v_stranger uuid := pg_temp.chk_user('enable stranger');
  v_business uuid;
  v_claims   text;
  v_first    uuid;
  v_second   uuid;
  v_msg      text;
  v_state    text;
BEGIN
  v_business := pg_temp.chk_business('enable business', v_user);
  v_claims := pg_temp.chk_claims(v_user);

  PERFORM set_config('request.jwt.claims', v_claims, true);
  SET LOCAL ROLE authenticated;
  v_first := public.enable_media_owner(v_business);
  v_second := public.enable_media_owner(v_business);
  RESET ROLE;

  ASSERT v_first IS NOT NULL AND v_first = v_second,
    'enable_is_idempotent: the second call returned a different owner';
  ASSERT (SELECT count(*) FROM public.media_owners WHERE business_id = v_business) = 1,
    'enable_is_idempotent: more than one media owner for one business';
  ASSERT (SELECT name FROM public.media_owners WHERE id = v_first) = 'zz-portal-check enable business',
    'enable_is_idempotent: the owner name is not the business name';
  ASSERT (SELECT verification FROM public.media_owners WHERE id = v_first) <> 'verified',
    'enable_is_idempotent: a new owner started out verified';
  ASSERT (SELECT count(*) FROM public.audit_log
           WHERE action = 'media_owner.enabled' AND entity_id = v_first::text) = 1,
    'enable_is_idempotent: expected exactly one media_owner.enabled audit row';

  -- Someone who is not a member of the business is refused.
  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_stranger), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.enable_media_owner(v_business);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    v_state := SQLSTATE;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  ASSERT v_state = '42501', 'enable_is_idempotent: a non-member could turn the mode on (state ' || coalesce(v_state, 'none') || ')';
  PERFORM pg_temp.chk_pass('enable_is_idempotent');
END $$;

-- 2 ---------------------------------------------------------------------
-- An owner whose documents nobody has verified lists into the review queue.
DO $$
DECLARE
  v_user     uuid := pg_temp.chk_user('unverified member');
  v_business uuid;
  v_owner    uuid;
  v_advert   uuid;
BEGIN
  v_business := pg_temp.chk_business('unverified business', v_user);
  v_owner := pg_temp.chk_owner('unverified owner', v_business, false);
  v_advert := pg_temp.chk_create_as(v_user, v_owner, 'unverified listing');

  ASSERT (SELECT lifecycle FROM public.advertisements WHERE id = v_advert) = 'pending_review',
    'unverified_owner_creates_pending_review: an unverified owner did not land in pending_review';
  ASSERT (SELECT owner_id FROM public.advertisements WHERE id = v_advert) = v_owner,
    'unverified_owner_creates_pending_review: the placement is not linked to the owner';
  ASSERT (SELECT owner_role FROM public.advertisements WHERE id = v_advert) = 'owner',
    'unverified_owner_creates_pending_review: owner_role is not owner';
  ASSERT (SELECT provenance FROM public.advertisements WHERE id = v_advert) = 'owner_submitted',
    'unverified_owner_creates_pending_review: provenance is not owner_submitted';
  PERFORM pg_temp.chk_pass('unverified_owner_creates_pending_review');
END $$;

-- 3 ---------------------------------------------------------------------
-- A verified owner lists straight to partner_verified.
DO $$
DECLARE
  v_user     uuid := pg_temp.chk_user('verified member');
  v_business uuid;
  v_owner    uuid;
  v_advert   uuid;
BEGIN
  v_business := pg_temp.chk_business('verified business', v_user);
  v_owner := pg_temp.chk_owner('verified owner', v_business, true);
  v_advert := pg_temp.chk_create_as(v_user, v_owner, 'verified listing');

  ASSERT (SELECT lifecycle FROM public.advertisements WHERE id = v_advert) = 'partner_verified',
    'verified_owner_creates_partner_verified: a verified owner did not land in partner_verified';
  ASSERT (SELECT owner_id FROM public.advertisements WHERE id = v_advert) = v_owner,
    'verified_owner_creates_partner_verified: the placement is not linked to the owner';
  ASSERT EXISTS (SELECT 1 FROM public.placement_trust WHERE advert_id = v_advert AND trust_label = 'partner_verified'),
    'verified_owner_creates_partner_verified: the placement is not public as partner_verified';
  PERFORM pg_temp.chk_pass('verified_owner_creates_partner_verified');
END $$;

-- 4 ---------------------------------------------------------------------
-- Verifying an owner promotes its partner_supplied placements and leaves the
-- ones still waiting for review in the queue.
DO $$
DECLARE
  v_user     uuid := pg_temp.chk_user('promote member');
  v_business uuid;
  v_owner    uuid;
  v_pending  uuid;
  v_supplied uuid;
BEGIN
  v_business := pg_temp.chk_business('promote business', v_user);
  v_owner := pg_temp.chk_owner('promote owner', v_business, false);
  v_pending := pg_temp.chk_create_as(v_user, v_owner, 'promote pending');
  v_supplied := pg_temp.chk_create_as(v_user, v_owner, 'promote supplied');

  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM public.admin_review_placement(v_supplied, true, 'zz-portal-check approved');
  ASSERT (SELECT lifecycle FROM public.advertisements WHERE id = v_supplied) = 'partner_supplied',
    'verify_promotes_supplied_not_pending: setup failed, the approved placement is not partner_supplied';
  ASSERT (SELECT lifecycle FROM public.advertisements WHERE id = v_pending) = 'pending_review',
    'verify_promotes_supplied_not_pending: setup failed, the other placement left pending_review';

  UPDATE public.media_owners
     SET verification = 'verified', verification_note = 'zz-portal-check documents'
   WHERE id = v_owner;

  ASSERT (SELECT lifecycle FROM public.advertisements WHERE id = v_supplied) = 'partner_verified',
    'verify_promotes_supplied_not_pending: the partner_supplied placement was not promoted';
  ASSERT (SELECT lifecycle FROM public.advertisements WHERE id = v_pending) = 'pending_review',
    'verify_promotes_supplied_not_pending: a pending_review placement was promoted past the admin queue';
  ASSERT EXISTS (
    SELECT 1 FROM public.audit_log
     WHERE action = 'placement.lifecycle' AND entity_id = v_supplied::text
       AND detail ->> 'from' = 'partner_supplied' AND detail ->> 'to' = 'partner_verified'
  ), 'verify_promotes_supplied_not_pending: no audit row for the promotion';
  PERFORM pg_temp.chk_pass('verify_promotes_supplied_not_pending');
END $$;

-- 5 ---------------------------------------------------------------------
-- A signed-in non-admin cannot set lifecycle or owner by a direct write, on
-- an unowned row they hold by user_id, on an owned row, or on an insert.
DO $$
DECLARE
  v_member   uuid := pg_temp.chk_user('lifecycle member');
  v_legacy   uuid := pg_temp.chk_user('lifecycle legacy');
  v_business uuid;
  v_owner    uuid;
  v_owned    uuid;
  v_unowned  uuid;
  v_raised   boolean;
  v_n        integer;
BEGIN
  v_business := pg_temp.chk_business('lifecycle business', v_member);
  v_owner := pg_temp.chk_owner('lifecycle owner', v_business, true);
  v_owned := pg_temp.chk_create_as(v_member, v_owner, 'lifecycle owned');
  v_unowned := pg_temp.chk_advert('lifecycle unowned');
  UPDATE public.advertisements SET user_id = v_legacy WHERE id = v_unowned;

  -- (a) the holder of an unowned row cannot set its lifecycle.
  v_raised := false;
  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_legacy), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.advertisements SET lifecycle = 'partner_verified' WHERE id = v_unowned;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_raised := true;
  END;
  RESET ROLE;
  ASSERT v_raised OR v_n = 0, 'owner_cannot_set_lifecycle_directly: a user_id holder set lifecycle directly';
  ASSERT (SELECT lifecycle FROM public.advertisements WHERE id = v_unowned) = 'imported',
    'owner_cannot_set_lifecycle_directly: the unowned row changed lifecycle';

  -- (b) nor can they link an owner to it.
  v_raised := false;
  v_n := NULL;
  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_legacy), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.advertisements SET owner_id = v_owner, owner_role = 'owner' WHERE id = v_unowned;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_raised := true;
  END;
  RESET ROLE;
  ASSERT v_raised OR v_n = 0, 'owner_cannot_set_lifecycle_directly: a user_id holder linked an owner directly';
  ASSERT (SELECT owner_id FROM public.advertisements WHERE id = v_unowned) IS NULL,
    'owner_cannot_set_lifecycle_directly: the unowned row gained an owner';

  -- (c) a member of the owner cannot write the owned row directly either:
  -- owned rows change only through the owner functions.
  v_raised := false;
  v_n := NULL;
  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_member), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.advertisements SET lifecycle = 'archived' WHERE id = v_owned;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_raised := true;
  END;
  RESET ROLE;
  ASSERT v_raised OR v_n = 0, 'owner_cannot_set_lifecycle_directly: a member changed an owned row directly';
  ASSERT (SELECT lifecycle FROM public.advertisements WHERE id = v_owned) = 'partner_verified',
    'owner_cannot_set_lifecycle_directly: the owned row changed lifecycle';

  -- (d) nor can they insert a row that already claims an owner and a lifecycle.
  v_raised := false;
  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_member), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.advertisements (title, type, category, location, pricing, owner_id, owner_role, lifecycle)
    VALUES ('zz-portal-check direct insert', 'Billboard', 'Billboard', 'Lagos, Nigeria', 100, v_owner, 'owner', 'partner_verified');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_raised := true;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  ASSERT v_raised, 'owner_cannot_set_lifecycle_directly: a member inserted an owned partner_verified row directly';
  ASSERT NOT EXISTS (SELECT 1 FROM public.advertisements WHERE title = 'zz-portal-check direct insert'),
    'owner_cannot_set_lifecycle_directly: the direct insert left a row behind';
  PERFORM pg_temp.chk_pass('owner_cannot_set_lifecycle_directly');
END $$;

-- 6 ---------------------------------------------------------------------
-- A user_id match alone does not let someone edit an owned placement: not
-- through owner_update_placement, and not through a direct write.
DO $$
DECLARE
  v_member   uuid := pg_temp.chk_user('edit member');
  v_other    uuid := pg_temp.chk_user('edit other');
  v_business uuid;
  v_owner    uuid;
  v_owned    uuid;
  v_msg      text;
  v_state    text;
  v_n        integer;
  v_raised   boolean := false;
BEGIN
  v_business := pg_temp.chk_business('edit business', v_member);
  v_owner := pg_temp.chk_owner('edit owner', v_business, true);
  v_owned := pg_temp.chk_create_as(v_member, v_owner, 'edit owned');
  UPDATE public.advertisements SET user_id = v_other WHERE id = v_owned;

  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_other), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.owner_update_placement(v_owned, '{"title":"zz-portal-check hijacked"}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    v_state := SQLSTATE;
  END;
  RESET ROLE;
  ASSERT v_state = '42501', 'user_id_alone_cannot_edit_owned: owner_update_placement let a non-member edit (state ' || coalesce(v_state, 'none') || ')';

  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_other), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.advertisements SET title = 'zz-portal-check hijacked' WHERE id = v_owned;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  ASSERT v_raised OR v_n = 0, 'user_id_alone_cannot_edit_owned: a direct UPDATE by the user_id holder changed the owned row';
  ASSERT (SELECT title FROM public.advertisements WHERE id = v_owned) = 'zz-portal-check edit owned',
    'user_id_alone_cannot_edit_owned: the title changed';
  PERFORM pg_temp.chk_pass('user_id_alone_cannot_edit_owned');
END $$;

-- 7 ---------------------------------------------------------------------
-- owner_update_placement changes only the section 5 fields, refuses any other
-- key outright, and keeps the pricing source honest.
DO $$
DECLARE
  v_member   uuid := pg_temp.chk_user('update member');
  v_business uuid;
  v_owner    uuid;
  v_advert   uuid;
  v_msg      text;
  v_state    text;
  v_key      text;
BEGIN
  v_business := pg_temp.chk_business('update business', v_member);
  v_owner := pg_temp.chk_owner('update owner', v_business, true);
  v_advert := pg_temp.chk_create_as(v_member, v_owner, 'update listing');

  -- Allowed fields: accepted.
  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_member), true);
  SET LOCAL ROLE authenticated;
  PERFORM public.owner_update_placement(v_advert,
    '{"title":"zz-portal-check renamed","rate_amount":250000,"city":"Abuja"}'::jsonb);
  RESET ROLE;
  ASSERT (SELECT title FROM public.advertisements WHERE id = v_advert) = 'zz-portal-check renamed',
    'owner_update_only_allowed_fields: an allowed field was not saved';
  ASSERT (SELECT rate_amount FROM public.advertisements WHERE id = v_advert) = 250000,
    'owner_update_only_allowed_fields: the rate was not saved';
  ASSERT (SELECT location FROM public.advertisements WHERE id = v_advert) = 'Abuja, Nigeria',
    'owner_update_only_allowed_fields: location was not recomposed as City, Country';
  ASSERT (SELECT lifecycle FROM public.advertisements WHERE id = v_advert) = 'partner_verified',
    'owner_update_only_allowed_fields: an edit changed the lifecycle';
  ASSERT (SELECT as_of FROM public.placement_field_source WHERE advert_id = v_advert AND field = 'pricing') = pg_temp.chk_today(),
    'owner_update_only_allowed_fields: the pricing source is not dated today (Lagos)';
  ASSERT EXISTS (SELECT 1 FROM public.audit_log WHERE action = 'placement.owner_price' AND entity_id = v_advert::text),
    'owner_update_only_allowed_fields: the price change was not audited';

  -- Any other key is refused, and a refused call changes nothing, even the
  -- allowed fields sent alongside it.
  FOREACH v_key IN ARRAY ARRAY['lifecycle', 'owner_id', 'owner_role', 'user_id', 'provenance', 'status'] LOOP
    v_msg := NULL;
    v_state := NULL;
    PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_member), true);
    SET LOCAL ROLE authenticated;
    BEGIN
      PERFORM public.owner_update_placement(v_advert,
        jsonb_build_object('title', 'zz-portal-check sneaky', v_key, 'x'));
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
      v_state := SQLSTATE;
    END;
    RESET ROLE;
    ASSERT v_state = '42501' AND v_msg LIKE '%' || v_key || '%',
      'owner_update_only_allowed_fields: the key ' || v_key || ' was not refused (state ' || coalesce(v_state, 'none') || ')';
    ASSERT (SELECT title FROM public.advertisements WHERE id = v_advert) = 'zz-portal-check renamed',
      'owner_update_only_allowed_fields: a refused call still changed the title (key ' || v_key || ')';
  END LOOP;
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM pg_temp.chk_pass('owner_update_only_allowed_fields');
END $$;

-- 8 ---------------------------------------------------------------------
-- An availability confirmation made through the portal names the placement's
-- own owner, and only that owner's members can make one.
DO $$
DECLARE
  v_member   uuid := pg_temp.chk_user('avail member');
  v_stranger uuid := pg_temp.chk_user('avail stranger');
  v_business uuid;
  v_owner    uuid;
  v_advert   uuid;
  v_unowned  uuid := pg_temp.chk_advert('avail unowned');
  v_conf     uuid;
  v_state    text;
BEGIN
  v_business := pg_temp.chk_business('avail business', v_member);
  v_owner := pg_temp.chk_owner('avail owner', v_business, true);
  v_advert := pg_temp.chk_create_as(v_member, v_owner, 'avail listing');

  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_member), true);
  SET LOCAL ROLE authenticated;
  v_conf := public.owner_record_availability(v_advert, 'available', pg_temp.chk_today(), pg_temp.chk_today() + 30);
  RESET ROLE;

  ASSERT (SELECT confirmed_by_owner FROM public.placement_availability WHERE id = v_conf) = v_owner,
    'owner_availability_names_owner: the confirmation does not name the placement''s owner';
  ASSERT (SELECT method FROM public.placement_availability WHERE id = v_conf) = 'portal',
    'owner_availability_names_owner: the method is not portal';
  ASSERT (SELECT confirmed_by_name FROM public.placement_trust WHERE advert_id = v_advert) = 'zz-portal-check avail owner',
    'owner_availability_names_owner: the public view does not name the owner';
  ASSERT (SELECT availability FROM public.placement_trust WHERE advert_id = v_advert) = 'confirmed_available',
    'owner_availability_names_owner: the placement does not read confirmed_available';

  -- A non-member is refused.
  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_stranger), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.owner_record_availability(v_advert, 'booked', pg_temp.chk_today(), pg_temp.chk_today() + 5);
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  RESET ROLE;
  ASSERT v_state = '42501', 'owner_availability_names_owner: a non-member confirmed availability (state ' || coalesce(v_state, 'none') || ')';

  -- A placement with no owner has nobody to confirm for it.
  v_state := NULL;
  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_member), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.owner_record_availability(v_unowned, 'available', pg_temp.chk_today(), NULL);
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  ASSERT v_state = '42501', 'owner_availability_names_owner: availability was recorded on an unowned placement (state ' || coalesce(v_state, 'none') || ')';
  ASSERT (SELECT count(*) FROM public.placement_availability WHERE advert_id = v_advert) = 1,
    'owner_availability_names_owner: a refused call still left a confirmation';
  PERFORM pg_temp.chk_pass('owner_availability_names_owner');
END $$;

-- 9 ---------------------------------------------------------------------
-- Two owners cannot both have a pending claim on one placement; the second
-- waits for the first decision.
DO $$
DECLARE
  v_user_a   uuid := pg_temp.chk_user('claim member a');
  v_user_b   uuid := pg_temp.chk_user('claim member b');
  v_owner_a  uuid;
  v_owner_b  uuid;
  v_advert   uuid := pg_temp.chk_advert('claim target');
  v_claim_a  uuid;
  v_claim_b  uuid;
  v_msg      text;
  v_state    text;
BEGIN
  v_owner_a := pg_temp.chk_owner('claim owner a', pg_temp.chk_business('claim business a', v_user_a), false);
  v_owner_b := pg_temp.chk_owner('claim owner b', pg_temp.chk_business('claim business b', v_user_b), false);

  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_user_a), true);
  SET LOCAL ROLE authenticated;
  v_claim_a := public.owner_claim_placement(v_advert, v_owner_a, 'owner', 'zz-portal-check we own this site', NULL);
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_user_b), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.owner_claim_placement(v_advert, v_owner_b, 'owner', 'zz-portal-check we also own it', NULL);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    v_state := SQLSTATE;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  ASSERT v_state = '23505', 'one_pending_claim_per_advert: a second pending claim was accepted (state ' || coalesce(v_state, 'none') || ')';
  ASSERT v_msg ILIKE '%already waiting%', 'one_pending_claim_per_advert: the refusal is not in plain words: ' || coalesce(v_msg, 'none');
  ASSERT (SELECT count(*) FROM public.placement_claims WHERE advert_id = v_advert AND status = 'pending') = 1,
    'one_pending_claim_per_advert: more than one pending claim for one placement';

  -- Once the first is decided, the second owner may file.
  PERFORM public.admin_decide_claim(v_claim_a, false, 'zz-portal-check not enough evidence');
  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_user_b), true);
  SET LOCAL ROLE authenticated;
  v_claim_b := public.owner_claim_placement(v_advert, v_owner_b, 'owner', 'zz-portal-check second try', NULL);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  ASSERT v_claim_b IS NOT NULL, 'one_pending_claim_per_advert: the second owner could not file after the first was decided';
  PERFORM pg_temp.chk_pass('one_pending_claim_per_advert');
END $$;

-- 10 --------------------------------------------------------------------
-- An authorised representative must attach the owner's signed letter, inside
-- their own owner's folder; members cannot write claims directly.
DO $$
DECLARE
  v_user   uuid := pg_temp.chk_user('rep member');
  v_owner  uuid;
  v_advert uuid := pg_temp.chk_advert('rep target');
  v_other_advert uuid := pg_temp.chk_advert('rep direct target');
  v_claims text;
  v_msg    text;
  v_state  text;
  v_claim  uuid;
  v_raised boolean := false;
BEGIN
  v_owner := pg_temp.chk_owner('rep owner', pg_temp.chk_business('rep business', v_user), false);
  v_claims := pg_temp.chk_claims(v_user);

  -- No document.
  PERFORM set_config('request.jwt.claims', v_claims, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.owner_claim_placement(v_advert, v_owner, 'authorised_representative', 'zz-portal-check we manage it', NULL);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    v_state := SQLSTATE;
  END;
  RESET ROLE;
  ASSERT v_state = '22023' AND v_msg ILIKE '%authorisation letter%',
    'representative_claim_needs_document: a representative claim without a document was accepted (' || coalesce(v_state, 'none') || ')';

  -- A document in somebody else's folder.
  v_state := NULL;
  PERFORM set_config('request.jwt.claims', v_claims, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.owner_claim_placement(v_advert, v_owner, 'authorised_representative', 'zz-portal-check we manage it',
      'media-owners/' || gen_random_uuid()::text || '/letter.pdf');
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  RESET ROLE;
  ASSERT v_state = '23514', 'representative_claim_needs_document: a document outside the owner''s folder was accepted (' || coalesce(v_state, 'none') || ')';
  ASSERT NOT EXISTS (SELECT 1 FROM public.placement_claims WHERE advert_id = v_advert),
    'representative_claim_needs_document: a refused claim left a row behind';

  -- A document in the owner's own folder.
  PERFORM set_config('request.jwt.claims', v_claims, true);
  SET LOCAL ROLE authenticated;
  v_claim := public.owner_claim_placement(v_advert, v_owner, 'authorised_representative', 'zz-portal-check we manage it',
    'media-owners/' || v_owner::text || '/letter.pdf');
  RESET ROLE;
  ASSERT v_claim IS NOT NULL, 'representative_claim_needs_document: a representative claim with its letter was refused';

  -- Members file only through the function: a direct insert is refused.
  PERFORM set_config('request.jwt.claims', v_claims, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.placement_claims (advert_id, owner_id, role, statement)
    VALUES (v_other_advert, v_owner, 'owner', 'zz-portal-check direct');
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  ASSERT v_raised, 'representative_claim_needs_document: a member inserted a claim directly';
  PERFORM pg_temp.chk_pass('representative_claim_needs_document');
END $$;

-- 11 --------------------------------------------------------------------
-- An admin approving a claim links the owner with the claim's role and sets
-- the lifecycle from the owner's verification. A non-admin cannot decide.
DO $$
DECLARE
  v_admin       uuid := pg_temp.chk_user('decide admin', true);
  v_user_v      uuid := pg_temp.chk_user('decide member verified');
  v_user_u      uuid := pg_temp.chk_user('decide member unverified');
  v_owner_v     uuid;
  v_owner_u     uuid;
  v_advert_v    uuid := pg_temp.chk_advert('decide target verified');
  v_advert_u    uuid := pg_temp.chk_advert('decide target unverified');
  v_claim_v     uuid;
  v_claim_u     uuid;
  v_state       text;
BEGIN
  v_owner_v := pg_temp.chk_owner('decide owner verified', pg_temp.chk_business('decide business verified', v_user_v), true);
  v_owner_u := pg_temp.chk_owner('decide owner unverified', pg_temp.chk_business('decide business unverified', v_user_u), false);

  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_user_v), true);
  SET LOCAL ROLE authenticated;
  v_claim_v := public.owner_claim_placement(v_advert_v, v_owner_v, 'authorised_representative', 'zz-portal-check we manage it',
    'media-owners/' || v_owner_v::text || '/letter.pdf');
  -- A member cannot approve their own claim.
  BEGIN
    PERFORM public.admin_decide_claim(v_claim_v, true, 'zz-portal-check self approval');
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  RESET ROLE;
  ASSERT v_state = '42501', 'admin_claim_approval_links_owner: a member approved a claim (state ' || coalesce(v_state, 'none') || ')';
  ASSERT (SELECT owner_id FROM public.advertisements WHERE id = v_advert_v) IS NULL,
    'admin_claim_approval_links_owner: a refused approval still linked the owner';

  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_user_u), true);
  SET LOCAL ROLE authenticated;
  v_claim_u := public.owner_claim_placement(v_advert_u, v_owner_u, 'owner', 'zz-portal-check this is ours', NULL);
  RESET ROLE;

  -- The admin decides both.
  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_admin), true);
  SET LOCAL ROLE authenticated;
  PERFORM public.admin_decide_claim(v_claim_v, true, 'zz-portal-check letter checked');
  PERFORM public.admin_decide_claim(v_claim_u, true, NULL);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  ASSERT (SELECT owner_id FROM public.advertisements WHERE id = v_advert_v) = v_owner_v,
    'admin_claim_approval_links_owner: the verified owner was not linked';
  ASSERT (SELECT owner_role FROM public.advertisements WHERE id = v_advert_v) = 'authorised_representative',
    'admin_claim_approval_links_owner: the claim''s role was not carried over';
  ASSERT (SELECT lifecycle FROM public.advertisements WHERE id = v_advert_v) = 'partner_verified',
    'admin_claim_approval_links_owner: a verified owner''s claim did not land in partner_verified';
  ASSERT (SELECT owner_id FROM public.advertisements WHERE id = v_advert_u) = v_owner_u,
    'admin_claim_approval_links_owner: the unverified owner was not linked';
  ASSERT (SELECT lifecycle FROM public.advertisements WHERE id = v_advert_u) = 'partner_supplied',
    'admin_claim_approval_links_owner: an unverified owner''s claim did not land in partner_supplied';
  ASSERT (SELECT status FROM public.placement_claims WHERE id = v_claim_v) = 'approved'
     AND (SELECT decided_by FROM public.placement_claims WHERE id = v_claim_v) = v_admin
     AND (SELECT decided_at FROM public.placement_claims WHERE id = v_claim_v) IS NOT NULL,
    'admin_claim_approval_links_owner: the claim row does not record who approved it';
  ASSERT EXISTS (
    SELECT 1 FROM public.audit_log
     WHERE action = 'placement.claim_decision' AND entity_id = v_advert_v::text
       AND (detail ->> 'approved')::boolean AND detail ->> 'reason' = 'zz-portal-check letter checked'
  ), 'admin_claim_approval_links_owner: no claim_decision audit row carrying the reason';
  ASSERT EXISTS (
    SELECT 1 FROM public.audit_log
     WHERE action = 'placement.owner_link' AND entity_id = v_advert_v::text
       AND detail ->> 'to_owner' = v_owner_v::text
  ), 'admin_claim_approval_links_owner: no owner_link audit row';
  PERFORM pg_temp.chk_pass('admin_claim_approval_links_owner');
END $$;

-- 12 --------------------------------------------------------------------
-- Rejecting a placement needs a reason; approving does not. A non-admin is
-- refused either way, and a placement not waiting for review is refused.
DO $$
DECLARE
  v_admin    uuid := pg_temp.chk_user('review admin', true);
  v_member   uuid := pg_temp.chk_user('review member');
  v_owner    uuid;
  v_reject   uuid;
  v_approve  uuid;
  v_msg      text;
  v_state    text;
BEGIN
  v_owner := pg_temp.chk_owner('review owner', pg_temp.chk_business('review business', v_member), false);
  v_reject := pg_temp.chk_create_as(v_member, v_owner, 'review reject');
  v_approve := pg_temp.chk_create_as(v_member, v_owner, 'review approve');

  -- The owner's own member cannot review.
  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_member), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.admin_review_placement(v_approve, true, 'zz-portal-check self review');
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  RESET ROLE;
  ASSERT v_state = '42501', 'admin_review_reject_needs_reason: a member reviewed their own placement (state ' || coalesce(v_state, 'none') || ')';

  -- The admin: a blank or missing reason on reject is refused.
  v_state := NULL;
  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_admin), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.admin_review_placement(v_reject, false, '   ');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    v_state := SQLSTATE;
  END;
  RESET ROLE;
  ASSERT v_state = '22023' AND v_msg ILIKE '%reason%',
    'admin_review_reject_needs_reason: a rejection with a blank reason was accepted (' || coalesce(v_state, 'none') || ')';
  v_state := NULL;
  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_admin), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.admin_review_placement(v_reject, false, NULL);
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  RESET ROLE;
  ASSERT v_state = '22023', 'admin_review_reject_needs_reason: a rejection with no reason was accepted (' || coalesce(v_state, 'none') || ')';
  ASSERT (SELECT lifecycle FROM public.advertisements WHERE id = v_reject) = 'pending_review',
    'admin_review_reject_needs_reason: a refused rejection still changed the lifecycle';

  -- With a reason it works, and the reason is audited.
  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_admin), true);
  SET LOCAL ROLE authenticated;
  PERFORM public.admin_review_placement(v_reject, false, 'zz-portal-check photo is not the site');
  PERFORM public.admin_review_placement(v_approve, true, NULL);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  ASSERT (SELECT lifecycle FROM public.advertisements WHERE id = v_reject) = 'rejected',
    'admin_review_reject_needs_reason: the rejection did not apply';
  ASSERT (SELECT detail ->> 'reason' FROM public.audit_log
           WHERE action = 'placement.lifecycle' AND entity_id = v_reject::text AND detail ->> 'to' = 'rejected')
         = 'zz-portal-check photo is not the site',
    'admin_review_reject_needs_reason: the audit row does not carry the reason';
  ASSERT (SELECT lifecycle FROM public.advertisements WHERE id = v_approve) = 'partner_supplied',
    'admin_review_reject_needs_reason: the approval did not land in partner_supplied';

  -- Already decided: not waiting for review any more.
  v_state := NULL;
  BEGIN
    PERFORM public.admin_review_placement(v_reject, true, NULL);
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  ASSERT v_state = '22023', 'admin_review_reject_needs_reason: a decided placement was reviewed again (' || coalesce(v_state, 'none') || ')';
  PERFORM pg_temp.chk_pass('admin_review_reject_needs_reason');
END $$;

-- 13 --------------------------------------------------------------------
-- A pending_review placement is not public: not in placement_trust, and its
-- owner is not in media_owners_public, for anon too. Approval lists both.
DO $$
DECLARE
  v_member   uuid := pg_temp.chk_user('hidden member');
  v_owner    uuid;
  v_advert   uuid;
  v_n_trust  integer;
  v_n_owner  integer;
BEGIN
  v_owner := pg_temp.chk_owner('hidden owner', pg_temp.chk_business('hidden business', v_member), false);
  v_advert := pg_temp.chk_create_as(v_member, v_owner, 'hidden listing');

  ASSERT (SELECT lifecycle FROM public.advertisements WHERE id = v_advert) = 'pending_review',
    'pending_review_hidden_from_trust_view: setup failed, the placement is not pending_review';
  ASSERT NOT EXISTS (SELECT 1 FROM public.placement_trust WHERE advert_id = v_advert),
    'pending_review_hidden_from_trust_view: a pending_review placement is in placement_trust';
  ASSERT NOT EXISTS (SELECT 1 FROM public.media_owners_public WHERE id = v_owner),
    'pending_review_hidden_from_trust_view: an owner with only pending placements is in media_owners_public';

  SET LOCAL ROLE anon;
  SELECT count(*) INTO v_n_trust FROM public.placement_trust WHERE advert_id = v_advert;
  SELECT count(*) INTO v_n_owner FROM public.media_owners_public WHERE id = v_owner;
  RESET ROLE;
  ASSERT v_n_trust = 0, 'pending_review_hidden_from_trust_view: anon can see a pending_review placement in placement_trust';
  ASSERT v_n_owner = 0, 'pending_review_hidden_from_trust_view: anon can see a pending-only owner in media_owners_public';

  PERFORM public.admin_review_placement(v_advert, true, 'zz-portal-check approved');
  ASSERT EXISTS (SELECT 1 FROM public.placement_trust WHERE advert_id = v_advert AND trust_label = 'partner_supplied'),
    'pending_review_hidden_from_trust_view: the approved placement is not listed as partner_supplied';
  ASSERT EXISTS (SELECT 1 FROM public.media_owners_public WHERE id = v_owner),
    'pending_review_hidden_from_trust_view: the owner of an approved placement is not listed';
  PERFORM pg_temp.chk_pass('pending_review_hidden_from_trust_view');
END $$;

-- 14 --------------------------------------------------------------------
-- Documents, claims and imports: private rows exist first, so a count of 0
-- under anon means "cannot see", not "nothing there". A privilege error also
-- counts as unreadable. A signed-in stranger sees none; a member sees theirs.
DO $$
DECLARE
  v_member   uuid := pg_temp.chk_user('private member');
  v_stranger uuid := pg_temp.chk_user('private stranger');
  v_owner    uuid;
  v_advert   uuid := pg_temp.chk_advert('private target');
  v_docs     integer := 0;
  v_claims   integer := 0;
  v_imports  integer := 0;
BEGIN
  v_owner := pg_temp.chk_owner('private owner', pg_temp.chk_business('private business', v_member), false);
  INSERT INTO public.media_owner_documents (owner_id, kind, storage_path)
  VALUES (v_owner, 'registration', 'media-owners/' || v_owner::text || '/zz-portal-check.pdf');
  INSERT INTO public.placement_claims (advert_id, owner_id, role, statement)
  VALUES (v_advert, v_owner, 'owner', 'zz-portal-check statement');
  INSERT INTO public.placement_imports (owner_id, file_name)
  VALUES (v_owner, 'zz-portal-check.csv');
  ASSERT (SELECT count(*) FROM public.media_owner_documents WHERE owner_id = v_owner) = 1
     AND (SELECT count(*) FROM public.placement_claims WHERE owner_id = v_owner) = 1
     AND (SELECT count(*) FROM public.placement_imports WHERE owner_id = v_owner) = 1,
    'anon_cannot_read_documents_claims_imports: setup failed, the private rows are not there';

  -- anon
  SET LOCAL ROLE anon;
  BEGIN
    SELECT count(*) INTO v_docs FROM public.media_owner_documents;
  EXCEPTION WHEN insufficient_privilege THEN v_docs := 0;
  END;
  BEGIN
    SELECT count(*) INTO v_claims FROM public.placement_claims;
  EXCEPTION WHEN insufficient_privilege THEN v_claims := 0;
  END;
  BEGIN
    SELECT count(*) INTO v_imports FROM public.placement_imports;
  EXCEPTION WHEN insufficient_privilege THEN v_imports := 0;
  END;
  RESET ROLE;
  ASSERT v_docs = 0, 'anon_cannot_read_documents_claims_imports: anon can read media_owner_documents';
  ASSERT v_claims = 0, 'anon_cannot_read_documents_claims_imports: anon can read placement_claims';
  ASSERT v_imports = 0, 'anon_cannot_read_documents_claims_imports: anon can read placement_imports';

  -- a signed-in user who is not a member of the owner's business
  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_stranger), true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_docs FROM public.media_owner_documents WHERE owner_id = v_owner;
  SELECT count(*) INTO v_claims FROM public.placement_claims WHERE owner_id = v_owner;
  SELECT count(*) INTO v_imports FROM public.placement_imports WHERE owner_id = v_owner;
  RESET ROLE;
  ASSERT v_docs = 0 AND v_claims = 0 AND v_imports = 0,
    'anon_cannot_read_documents_claims_imports: a non-member can read another owner''s rows';

  -- the member reads their own (so the zeros above mean the policy, not an empty table)
  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_member), true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_docs FROM public.media_owner_documents WHERE owner_id = v_owner;
  SELECT count(*) INTO v_claims FROM public.placement_claims WHERE owner_id = v_owner;
  SELECT count(*) INTO v_imports FROM public.placement_imports WHERE owner_id = v_owner;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  ASSERT v_docs = 1 AND v_claims = 1 AND v_imports = 1,
    'anon_cannot_read_documents_claims_imports: a member cannot read their own rows';
  PERFORM pg_temp.chk_pass('anon_cannot_read_documents_claims_imports');
END $$;

-- 15 --------------------------------------------------------------------
-- The expiry dispatcher sends one notice per member per confirmation, however
-- often it runs. A business owner who is also a members row counts once.
-- The dispatcher is global; everything it touches here is rolled back.
DO $$
DECLARE
  v_owner_user  uuid := pg_temp.chk_user('expiry business owner');
  v_staff_user  uuid := pg_temp.chk_user('expiry staff');
  v_business    uuid;
  v_owner       uuid;
  v_advert      uuid;
  v_conf        uuid;
  v_first       integer;
  v_second      integer;
  v_state       text;
BEGIN
  v_business := pg_temp.chk_business('expiry business', v_owner_user);
  v_owner := pg_temp.chk_owner('expiry owner', v_business, true);
  INSERT INTO public.business_members (business_id, user_id, role, status)
  VALUES (v_business, v_owner_user, 'owner', 'active'),
         (v_business, v_staff_user, 'staff', 'active');
  v_advert := pg_temp.chk_create_as(v_owner_user, v_owner, 'expiry listing');

  -- 28 days old on a 30 day Billboard window: lapses in about 2 days, inside
  -- the 3 day notice window.
  INSERT INTO public.placement_availability (advert_id, status, method, confirmed_at, valid_until, period_from)
  VALUES (v_advert, 'available', 'admin', now() - interval '28 days', now(), pg_temp.chk_today() - 28)
  RETURNING id INTO v_conf;
  ASSERT (SELECT valid_until FROM public.placement_availability WHERE id = v_conf) > now()
     AND (SELECT valid_until FROM public.placement_availability WHERE id = v_conf) <= now() + interval '3 days',
    'expiry_notice_once: setup failed, the confirmation does not lapse within 3 days';

  PERFORM set_config('request.jwt.claims', '', true);
  v_first := public.dispatch_confirmation_expiry_notices();
  v_second := public.dispatch_confirmation_expiry_notices();
  ASSERT v_first >= 1, 'expiry_notice_once: the first run sent nothing';

  ASSERT (SELECT count(*) FROM public.notifications
           WHERE user_id = v_owner_user AND type = 'placement_confirmation_expiring') = 1,
    'expiry_notice_once: the business owner did not get exactly one notice';
  ASSERT (SELECT count(*) FROM public.notifications
           WHERE user_id = v_staff_user AND type = 'placement_confirmation_expiring') = 1,
    'expiry_notice_once: the staff member did not get exactly one notice';
  ASSERT (SELECT notified_at FROM public.placement_availability WHERE id = v_conf) IS NOT NULL,
    'expiry_notice_once: the confirmation was not marked notified';

  -- A web caller cannot trigger it.
  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_owner_user), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.dispatch_confirmation_expiry_notices();
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  ASSERT v_state = '42501', 'expiry_notice_once: a signed-in user ran the dispatcher (state ' || coalesce(v_state, 'none') || ')';
  PERFORM pg_temp.chk_pass('expiry_notice_once');
END $$;

-- 16 --------------------------------------------------------------------
-- A stock photo is not a photo of the site, in image_url or in media_urls.
DO $$
DECLARE
  v_member   uuid := pg_temp.chk_user('stock member');
  v_owner    uuid;
  v_claims   text;
  v_msg      text;
  v_state    text;
  v_p        jsonb;
BEGIN
  v_owner := pg_temp.chk_owner('stock owner', pg_temp.chk_business('stock business', v_member), true);
  v_claims := pg_temp.chk_claims(v_member);

  v_p := pg_temp.chk_payload('stock cover') || '{"image_url":"https://images.pexels.com/photos/1/zz-portal-check.jpeg"}'::jsonb;
  PERFORM set_config('request.jwt.claims', v_claims, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.owner_create_placement(v_owner, v_p);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    v_state := SQLSTATE;
  END;
  RESET ROLE;
  ASSERT v_state = '22023' AND v_msg ILIKE '%photo of the actual site%',
    'stock_photo_refused: a pexels image_url was accepted (' || coalesce(v_state, 'none') || ')';

  v_state := NULL;
  v_p := pg_temp.chk_payload('stock gallery') || '{"media_urls":["https://example.invalid/ok.jpg","https://images.unsplash.com/photo-1/zz-portal-check.jpg"]}'::jsonb;
  PERFORM set_config('request.jwt.claims', v_claims, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.owner_create_placement(v_owner, v_p);
  EXCEPTION WHEN OTHERS THEN
    v_state := SQLSTATE;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  ASSERT v_state = '22023', 'stock_photo_refused: a stock photo in media_urls was accepted (' || coalesce(v_state, 'none') || ')';
  ASSERT NOT EXISTS (SELECT 1 FROM public.advertisements WHERE title IN ('zz-portal-check stock cover', 'zz-portal-check stock gallery')),
    'stock_photo_refused: a refused placement left a row behind';
  PERFORM pg_temp.chk_pass('stock_photo_refused');
END $$;

-- 17 (review) ------------------------------------------------------------
-- End to end: a non-admin member of a business with a verified owner lists a
-- placement. The row carries owner_id and no user_id, the lifecycle comes
-- from the owner's verification, location is "City, Country", and the owner's
-- price is on record as partner supplied.
DO $$
DECLARE
  v_member   uuid := pg_temp.chk_user('e2e member');
  v_business uuid;
  v_owner    uuid;
  v_advert   uuid;
BEGIN
  v_business := pg_temp.chk_business('e2e business', v_member);
  v_owner := pg_temp.chk_owner('e2e owner', v_business, true);
  v_advert := pg_temp.chk_create_as(v_member, v_owner, 'e2e listing');

  ASSERT v_advert IS NOT NULL AND EXISTS (SELECT 1 FROM public.advertisements WHERE id = v_advert),
    'owner_create_end_to_end: no placement row was created';
  ASSERT (SELECT owner_id FROM public.advertisements WHERE id = v_advert) = v_owner,
    'owner_create_end_to_end: owner_id is not the owner';
  ASSERT (SELECT user_id FROM public.advertisements WHERE id = v_advert) IS NULL,
    'owner_create_end_to_end: user_id is not NULL';
  ASSERT (SELECT lifecycle FROM public.advertisements WHERE id = v_advert) = 'partner_verified',
    'owner_create_end_to_end: lifecycle is not partner_verified';
  ASSERT (SELECT location FROM public.advertisements WHERE id = v_advert) = 'Lagos, Nigeria',
    'owner_create_end_to_end: location is not City, Country';
  ASSERT (SELECT country_code FROM public.advertisements WHERE id = v_advert) = 'NG',
    'owner_create_end_to_end: country_code is not NG';
  ASSERT (SELECT business_id::text FROM public.advertisements WHERE id = v_advert) = v_business::text,
    'owner_create_end_to_end: business_id is not the business';
  ASSERT EXISTS (
    SELECT 1 FROM public.placement_field_source
     WHERE advert_id = v_advert AND field = 'pricing' AND basis = 'partner_supplied'
  ), 'owner_create_end_to_end: no partner_supplied pricing source row';
  ASSERT EXISTS (
    SELECT 1 FROM public.audit_log
     WHERE action = 'placement.lifecycle' AND entity_id = v_advert::text
       AND detail ->> 'to' = 'partner_verified' AND detail ->> 'via' = 'owner_portal'
  ), 'owner_create_end_to_end: the listing was not audited as an owner portal action';
  PERFORM pg_temp.chk_pass('owner_create_end_to_end');
END $$;

-- 18 (review) ------------------------------------------------------------
-- Even with user_id set to a test user, a direct UPDATE of the price and a
-- direct DELETE each affect 0 rows on an owned placement. A control on an
-- unowned row held by the same user proves the grant and the policy are live,
-- so the zeros mean the owner_id IS NULL narrowing, not a missing privilege.
DO $$
DECLARE
  v_member    uuid := pg_temp.chk_user('userid member');
  v_holder    uuid := pg_temp.chk_user('userid holder');
  v_who       uuid;
  v_business  uuid;
  v_owner     uuid;
  v_owned     uuid;
  v_control   uuid := pg_temp.chk_advert('userid control');
  v_before    numeric;
  v_n         integer;
  v_raised    boolean;
BEGIN
  v_business := pg_temp.chk_business('userid business', v_member);
  v_owner := pg_temp.chk_owner('userid owner', v_business, true);
  v_owned := pg_temp.chk_create_as(v_member, v_owner, 'userid owned');
  UPDATE public.advertisements SET user_id = v_holder WHERE id = v_control;

  -- Control: the legacy path still works on an unowned row.
  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_holder), true);
  SET LOCAL ROLE authenticated;
  UPDATE public.advertisements SET pricing = 101 WHERE id = v_control;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  ASSERT v_n = 1, 'user_id_alone_cannot_update_or_delete_owned: control failed, the user_id holder cannot update an unowned row (rows ' || v_n || ')';

  SELECT pricing INTO v_before FROM public.advertisements WHERE id = v_owned;

  -- The owned row, first with a stranger as user_id, then with a member.
  FOREACH v_who IN ARRAY ARRAY[v_holder, v_member] LOOP
    UPDATE public.advertisements SET user_id = v_who WHERE id = v_owned;

    v_raised := false;
    v_n := NULL;
    PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_who), true);
    SET LOCAL ROLE authenticated;
    BEGIN
      UPDATE public.advertisements SET pricing = 1 WHERE id = v_owned;
      GET DIAGNOSTICS v_n = ROW_COUNT;
    EXCEPTION WHEN insufficient_privilege OR check_violation THEN
      v_raised := true;
    END;
    RESET ROLE;
    ASSERT v_raised OR v_n = 0, 'user_id_alone_cannot_update_or_delete_owned: a direct UPDATE of price changed the owned row';

    v_raised := false;
    v_n := NULL;
    PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_who), true);
    SET LOCAL ROLE authenticated;
    BEGIN
      DELETE FROM public.advertisements WHERE id = v_owned;
      GET DIAGNOSTICS v_n = ROW_COUNT;
    EXCEPTION WHEN insufficient_privilege THEN
      v_raised := true;
    END;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
    ASSERT v_raised OR v_n = 0, 'user_id_alone_cannot_update_or_delete_owned: a direct DELETE removed the owned row';

    ASSERT EXISTS (SELECT 1 FROM public.advertisements WHERE id = v_owned),
      'user_id_alone_cannot_update_or_delete_owned: the owned row is gone';
    ASSERT (SELECT pricing FROM public.advertisements WHERE id = v_owned) = v_before,
      'user_id_alone_cannot_update_or_delete_owned: the owned row''s price changed';
    ASSERT (SELECT lifecycle FROM public.advertisements WHERE id = v_owned) = 'partner_verified'
       AND (SELECT owner_id FROM public.advertisements WHERE id = v_owned) = v_owner,
      'user_id_alone_cannot_update_or_delete_owned: the owned row changed';
  END LOOP;
  PERFORM pg_temp.chk_pass('user_id_alone_cannot_update_or_delete_owned');
END $$;

-- 19 (final review, 20261111030000) ---------------------------------------
-- I1: approval reads the owner's verification at the moment of approval. An
-- owner verified while a placement waited in the queue gets partner_verified
-- on approval; an owner still unverified gets partner_supplied.
DO $$
DECLARE
  v_admin      uuid := pg_temp.chk_user('approve admin', true);
  v_member     uuid := pg_temp.chk_user('approve member');
  v_other      uuid := pg_temp.chk_user('approve other member');
  v_owner      uuid;
  v_unverified uuid;
  v_queued     uuid;
  v_control    uuid;
BEGIN
  v_owner := pg_temp.chk_owner('approve owner', pg_temp.chk_business('approve business', v_member), false);
  v_unverified := pg_temp.chk_owner('approve unverified owner', pg_temp.chk_business('approve other business', v_other), false);
  v_queued := pg_temp.chk_create_as(v_member, v_owner, 'approve queued');
  v_control := pg_temp.chk_create_as(v_other, v_unverified, 'approve control');

  UPDATE public.media_owners
     SET verification = 'verified', verification_note = 'zz-portal-check documents'
   WHERE id = v_owner;
  ASSERT (SELECT lifecycle FROM public.advertisements WHERE id = v_queued) = 'pending_review',
    'admin_approve_uses_current_verification: setup failed, verifying the owner moved the queued placement';

  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_admin), true);
  SET LOCAL ROLE authenticated;
  PERFORM public.admin_review_placement(v_queued, true, NULL);
  PERFORM public.admin_review_placement(v_control, true, NULL);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  ASSERT (SELECT lifecycle FROM public.advertisements WHERE id = v_queued) = 'partner_verified',
    'admin_approve_uses_current_verification: a verified owner''s placement was not approved to partner_verified';
  ASSERT (SELECT lifecycle FROM public.advertisements WHERE id = v_control) = 'partner_supplied',
    'admin_approve_uses_current_verification: an unverified owner''s placement was not approved to partner_supplied';
  ASSERT (SELECT count(*) FROM public.audit_log
           WHERE action = 'placement.lifecycle' AND entity_id = v_queued::text
             AND detail ->> 'from' = 'pending_review' AND detail ->> 'to' = 'partner_verified') = 1,
    'admin_approve_uses_current_verification: the approval is not one audit row';
  PERFORM pg_temp.chk_pass('admin_approve_uses_current_verification');
END $$;

-- 20 (final review, 20261111030000) ---------------------------------------
-- I3: once an admin rejects the owner, its members can neither edit its
-- placements nor confirm their availability, and a refused call changes
-- nothing.
DO $$
DECLARE
  v_admin    uuid := pg_temp.chk_user('rejected admin', true);
  v_member   uuid := pg_temp.chk_user('rejected member');
  v_owner    uuid;
  v_advert   uuid;
  v_msg      text;
  v_state    text;
BEGIN
  v_owner := pg_temp.chk_owner('rejected owner', pg_temp.chk_business('rejected business', v_member), true);
  v_advert := pg_temp.chk_create_as(v_member, v_owner, 'rejected listing');

  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_admin), true);
  SET LOCAL ROLE authenticated;
  PERFORM public.admin_reject_owner(v_owner, 'zz-portal-check documents do not match');
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  ASSERT (SELECT verification FROM public.media_owners WHERE id = v_owner) = 'rejected',
    'rejected_owner_cannot_edit_or_confirm: setup failed, the owner is not rejected';

  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_member), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.owner_update_placement(v_advert, '{"title":"zz-portal-check after rejection","rate_amount":1}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    v_state := SQLSTATE;
  END;
  RESET ROLE;
  ASSERT v_state = '42501' AND v_msg LIKE '%not approved%',
    'rejected_owner_cannot_edit_or_confirm: a rejected owner edited a placement (' || coalesce(v_state, 'none') || ')';
  ASSERT (SELECT title FROM public.advertisements WHERE id = v_advert) = 'zz-portal-check rejected listing',
    'rejected_owner_cannot_edit_or_confirm: a refused edit still changed the title';

  v_msg := NULL;
  v_state := NULL;
  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_member), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.owner_record_availability(v_advert, 'available', pg_temp.chk_today(), pg_temp.chk_today() + 7);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    v_state := SQLSTATE;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  ASSERT v_state = '42501' AND v_msg LIKE '%not approved%',
    'rejected_owner_cannot_edit_or_confirm: a rejected owner confirmed availability (' || coalesce(v_state, 'none') || ')';
  ASSERT NOT EXISTS (SELECT 1 FROM public.placement_availability WHERE advert_id = v_advert),
    'rejected_owner_cannot_edit_or_confirm: a refused confirmation left a row';
  PERFORM pg_temp.chk_pass('rejected_owner_cannot_edit_or_confirm');
END $$;

-- 21 (final review, 20261111030000) ---------------------------------------
-- M4: after a rejection the documents already turned down are not enough to
-- resubmit; one uploaded after the rejection is. now() is fixed for the whole
-- transaction, so the dates are set explicitly: the old documents a day
-- before the rejection, the new one a minute after.
DO $$
DECLARE
  v_admin    uuid := pg_temp.chk_user('resubmit admin', true);
  v_member   uuid := pg_temp.chk_user('resubmit member');
  v_owner    uuid;
  v_msg      text;
  v_state    text;
BEGIN
  v_owner := pg_temp.chk_owner('resubmit owner', pg_temp.chk_business('resubmit business', v_member), false);
  INSERT INTO public.media_owner_documents (owner_id, kind, storage_path, uploaded_at)
  VALUES (v_owner, 'registration', 'media-owners/' || v_owner::text || '/zz-portal-check-reg.pdf', now() - interval '1 day'),
         (v_owner, 'rate_card', 'media-owners/' || v_owner::text || '/zz-portal-check-rate.pdf', now() - interval '1 day');

  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_admin), true);
  SET LOCAL ROLE authenticated;
  PERFORM public.admin_reject_owner(v_owner, 'zz-portal-check registration is expired');
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_member), true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.submit_owner_verification(v_owner);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    v_state := SQLSTATE;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  ASSERT v_state = '22023' AND v_msg = 'Upload a new document before resubmitting.',
    'resubmit_needs_new_document: the rejected documents were accepted again (' || coalesce(v_state, 'none') || ')';
  ASSERT (SELECT verification FROM public.media_owners WHERE id = v_owner) = 'rejected',
    'resubmit_needs_new_document: a refused resubmission changed the verification';

  INSERT INTO public.media_owner_documents (owner_id, kind, storage_path, uploaded_at)
  VALUES (v_owner, 'registration', 'media-owners/' || v_owner::text || '/zz-portal-check-reg-2.pdf', now() + interval '1 minute');
  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_member), true);
  SET LOCAL ROLE authenticated;
  PERFORM public.submit_owner_verification(v_owner);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  ASSERT (SELECT verification FROM public.media_owners WHERE id = v_owner) = 'documents_submitted',
    'resubmit_needs_new_document: a new document did not allow the resubmission';
  PERFORM pg_temp.chk_pass('resubmit_needs_new_document');
END $$;

-- 22 (final review, 20261111030000) ---------------------------------------
-- M16: clearing the price leaves no pricing source row (none describing a
-- price that is not there); the change is still audited, and a new price
-- writes the row again, dated today.
DO $$
DECLARE
  v_member   uuid := pg_temp.chk_user('clear member');
  v_owner    uuid;
  v_advert   uuid;
BEGIN
  v_owner := pg_temp.chk_owner('clear owner', pg_temp.chk_business('clear business', v_member), true);
  v_advert := pg_temp.chk_create_as(v_member, v_owner, 'clear listing');
  ASSERT EXISTS (SELECT 1 FROM public.placement_field_source WHERE advert_id = v_advert AND field = 'pricing'),
    'cleared_price_has_no_source: setup failed, the priced listing has no pricing source';

  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_member), true);
  SET LOCAL ROLE authenticated;
  PERFORM public.owner_update_placement(v_advert, '{"rate_amount":null,"pricing":""}'::jsonb);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  ASSERT (SELECT rate_amount IS NULL AND pricing IS NULL FROM public.advertisements WHERE id = v_advert),
    'cleared_price_has_no_source: setup failed, the price was not cleared';
  ASSERT NOT EXISTS (SELECT 1 FROM public.placement_field_source WHERE advert_id = v_advert AND field = 'pricing'),
    'cleared_price_has_no_source: a cleared price still has a pricing source row';
  ASSERT EXISTS (SELECT 1 FROM public.audit_log
                  WHERE action = 'placement.owner_price' AND entity_id = v_advert::text
                    AND detail -> 'to' ->> 'rate_amount' IS NULL),
    'cleared_price_has_no_source: clearing the price was not audited';

  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_member), true);
  SET LOCAL ROLE authenticated;
  PERFORM public.owner_update_placement(v_advert, '{"rate_amount":90000,"pricing":58}'::jsonb);
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  ASSERT (SELECT as_of FROM public.placement_field_source
           WHERE advert_id = v_advert AND field = 'pricing' AND basis = 'partner_supplied') = pg_temp.chk_today(),
    'cleared_price_has_no_source: a new price did not write a pricing source dated today';
  PERFORM pg_temp.chk_pass('cleared_price_has_no_source');
END $$;

-- 23 (ruling on the final review, 20261111030000) ------------------------
-- An admin cannot approve a queued placement once its owner's verification
-- was rejected, as with claims; rejecting that placement still works.
DO $$
DECLARE
  v_admin    uuid := pg_temp.chk_user('refuse admin', true);
  v_member   uuid := pg_temp.chk_user('refuse member');
  v_owner    uuid;
  v_queued   uuid;
  v_msg      text;
  v_state    text;
BEGIN
  v_owner := pg_temp.chk_owner('refuse owner', pg_temp.chk_business('refuse business', v_member), false);
  v_queued := pg_temp.chk_create_as(v_member, v_owner, 'refuse queued');

  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_admin), true);
  SET LOCAL ROLE authenticated;
  PERFORM public.admin_reject_owner(v_owner, 'zz-portal-check documents do not match');
  BEGIN
    PERFORM public.admin_review_placement(v_queued, true, NULL);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    v_state := SQLSTATE;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  ASSERT v_state = '22023' AND v_msg = 'This owner was not approved. Reject the placement instead.',
    'approve_refused_for_rejected_owner: a rejected owner''s placement was approved (' || coalesce(v_state, 'none') || ')';
  ASSERT (SELECT lifecycle FROM public.advertisements WHERE id = v_queued) = 'pending_review',
    'approve_refused_for_rejected_owner: a refused approval changed the lifecycle';

  PERFORM set_config('request.jwt.claims', pg_temp.chk_claims(v_admin), true);
  SET LOCAL ROLE authenticated;
  PERFORM public.admin_review_placement(v_queued, false, 'zz-portal-check owner not approved');
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  ASSERT (SELECT lifecycle FROM public.advertisements WHERE id = v_queued) = 'rejected',
    'approve_refused_for_rejected_owner: rejecting the placement did not work';
  PERFORM pg_temp.chk_pass('approve_refused_for_rejected_owner');
END $$;

-- Every check ran: 16 from the brief, the 2 the Task 1 review required,
-- the 4 the final review required and the 1 its ruling added
-- (20261111030000_partner_portal_fixes.sql).
DO $$
BEGIN
  ASSERT cardinality(string_to_array(rtrim(current_setting('chk.passed'), ','), ',')) = 23,
    'summary: expected 23 passing checks, got '
    || cardinality(string_to_array(rtrim(current_setting('chk.passed'), ','), ','));
END $$;

-- Summary rows (visible even when the client drops NOTICEs). The second shows
-- what the rollback below is about to discard: nothing named zz-portal-check
-- survives it.
-- One SELECT, not two: the CLI returns only the last result set, so the pass
-- list and the discard counts must travel in the same row.
SELECT (SELECT string_agg(name, ', ')
          FROM unnest(string_to_array(rtrim(current_setting('chk.passed'), ','), ',')) AS name) AS checks_passed,
       (SELECT count(*)
          FROM unnest(string_to_array(rtrim(current_setting('chk.passed'), ','), ',')) AS name) AS n_passed,
       (SELECT count(*) FROM public.advertisements WHERE title LIKE 'zz-portal-check%') AS zz_placements_discarded,
       (SELECT count(*) FROM public.media_owners WHERE name LIKE 'zz-portal-check%') AS zz_owners_discarded,
       (SELECT count(*) FROM public.businesses WHERE name LIKE 'zz-portal-check%') AS zz_businesses_discarded,
       (SELECT count(*) FROM auth.users WHERE email LIKE 'zz-portal-check-%') AS zz_users_discarded;

ROLLBACK;
