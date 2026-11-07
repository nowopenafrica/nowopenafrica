-- Behaviour checks for the placement trust migration
-- (supabase/migrations/20261109010000_placement_trust.sql) and its view
-- follow-up (supabase/migrations/20261109020000_placement_trust_v2.sql).
-- Checks 13 to 17 test the v2 view: run the file only after BOTH are applied.
--
-- ONE transaction that ALWAYS rolls back: every throwaway row below (named
-- "zz-trust-check ...") is discarded, so nothing is persisted. There is no
-- commit in this file and a test (src/test/placementTrustCheckSql.test.ts)
-- keeps it that way.
--
-- Run it only AFTER the migration is applied, through
-- scripts/check-placement-trust.mjs. Each check is a DO block that ASSERTs; the
-- first failure aborts the transaction with its check name in the message.
-- A passing check prints "ok: <check name>".
--
-- Roles: the connection is the owner (no JWT), which the trust guards let
-- through. Web callers are simulated with SET LOCAL ROLE plus
-- request.jwt.claims; auth.role() and auth.uid() read those claims.

BEGIN;

SELECT set_config('chk.passed', '', false);

-- Throwaway-row helpers, living in pg_temp so they vanish with the session.
CREATE FUNCTION pg_temp.chk_advert(p_label text, p_category text DEFAULT 'Billboard')
RETURNS uuid LANGUAGE sql AS $f$
  INSERT INTO public.advertisements (title, type, category, location, pricing)
  VALUES ('zz-trust-check ' || p_label, p_category, p_category, 'Nowhere, Nigeria', 100)
  RETURNING id;
$f$;

CREATE FUNCTION pg_temp.chk_owner(p_label text, p_verified boolean DEFAULT false)
RETURNS uuid LANGUAGE sql AS $f$
  INSERT INTO public.media_owners (name, verification, verification_note)
  VALUES ('zz-trust-check ' || p_label,
          CASE WHEN p_verified THEN 'verified' ELSE 'unverified' END,
          CASE WHEN p_verified THEN 'zz-trust-check documents' END)
  RETURNING id;
$f$;

-- The business day, as the v2 view reads it: Lagos, never the UTC date.
CREATE FUNCTION pg_temp.chk_today()
RETURNS date LANGUAGE sql AS $f$
  SELECT (now() AT TIME ZONE 'Africa/Lagos')::date;
$f$;

-- A confirmation dated p_days_ago days back, its period starting that same
-- Lagos day (as the admin form always sends a from-date; the v2 view does not
-- read an available row with no period_from as available now). valid_until
-- is supplied only because the column is NOT NULL: the stamp trigger
-- overwrites it.
CREATE FUNCTION pg_temp.chk_confirm(p_advert uuid, p_status text, p_days_ago integer)
RETURNS void LANGUAGE sql AS $f$
  INSERT INTO public.placement_availability (advert_id, status, method, confirmed_at, valid_until, period_from)
  VALUES (p_advert, p_status, 'admin', now() - make_interval(days => p_days_ago), now(),
          ((now() - make_interval(days => p_days_ago)) AT TIME ZONE 'Africa/Lagos')::date);
$f$;

-- A confirmation made yesterday for a period given in days from today
-- (negative = past; a NULL p_from or p_to leaves that end open), optionally
-- attributed to an owner.
CREATE FUNCTION pg_temp.chk_confirm_period(
  p_advert uuid, p_status text, p_from integer, p_to integer,
  p_owner uuid DEFAULT NULL, p_method text DEFAULT 'admin')
RETURNS void LANGUAGE sql AS $f$
  INSERT INTO public.placement_availability
    (advert_id, status, method, confirmed_at, valid_until, period_from, period_to, confirmed_by_owner)
  VALUES (p_advert, p_status, p_method, now() - interval '1 day', now(),
          pg_temp.chk_today() + p_from, pg_temp.chk_today() + p_to, p_owner);
$f$;

CREATE FUNCTION pg_temp.chk_pass(p_name text)
RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM set_config('chk.passed', current_setting('chk.passed', true) || p_name || ',', false);
  RAISE NOTICE 'ok: %', p_name;
END;
$f$;

-- 1 ---------------------------------------------------------------------
DO $$
DECLARE
  v_owner  uuid := pg_temp.chk_owner('owner unverified');
  v_advert uuid := pg_temp.chk_advert('pv requires owner');
  v_raised boolean := false;
BEGIN
  UPDATE public.advertisements SET owner_id = v_owner, owner_role = 'owner' WHERE id = v_advert;
  BEGIN
    UPDATE public.advertisements SET lifecycle = 'partner_verified' WHERE id = v_advert;
  EXCEPTION WHEN check_violation THEN
    v_raised := true;
  END;
  ASSERT v_raised,
    'partner_verified_requires_verified_owner: partner_verified was accepted with an unverified owner';
  ASSERT (SELECT lifecycle FROM public.advertisements WHERE id = v_advert) = 'imported',
    'partner_verified_requires_verified_owner: lifecycle changed despite the refusal';
  PERFORM pg_temp.chk_pass('partner_verified_requires_verified_owner');
END $$;

-- 2 ---------------------------------------------------------------------
DO $$
DECLARE
  v_owner  uuid := pg_temp.chk_owner('owner downgrade', true);
  v_advert uuid := pg_temp.chk_advert('downgrade');
BEGIN
  UPDATE public.advertisements SET owner_id = v_owner, owner_role = 'owner' WHERE id = v_advert;
  UPDATE public.advertisements SET lifecycle = 'partner_verified' WHERE id = v_advert;
  ASSERT (SELECT lifecycle FROM public.advertisements WHERE id = v_advert) = 'partner_verified',
    'owner_unverify_downgrades: setup failed, placement did not reach partner_verified with a verified owner';

  UPDATE public.media_owners SET verification = 'unverified' WHERE id = v_owner;

  ASSERT (SELECT lifecycle FROM public.advertisements WHERE id = v_advert) = 'partner_supplied',
    'owner_unverify_downgrades: placement was not downgraded to partner_supplied';
  ASSERT EXISTS (
    SELECT 1 FROM public.audit_log
     WHERE action = 'placement.lifecycle'
       AND entity_id = v_advert::text
       AND detail ->> 'from' = 'partner_verified'
       AND detail ->> 'to' = 'partner_supplied'
  ), 'owner_unverify_downgrades: no audit_log row for the downgrade';
  ASSERT EXISTS (
    SELECT 1 FROM public.audit_log
     WHERE action = 'media_owner.verification' AND entity_id = v_owner::text
  ), 'owner_unverify_downgrades: no audit_log row for the owner verification change';
  PERFORM pg_temp.chk_pass('owner_unverify_downgrades');
END $$;

-- 3 ---------------------------------------------------------------------
DO $$
DECLARE
  v_old   uuid := pg_temp.chk_advert('billboard 31d', 'Billboard');
  v_fresh uuid := pg_temp.chk_advert('billboard 29d', 'Billboard');
BEGIN
  PERFORM pg_temp.chk_confirm(v_old, 'available', 31);
  PERFORM pg_temp.chk_confirm(v_fresh, 'available', 29);
  ASSERT (SELECT availability FROM public.placement_trust WHERE advert_id = v_old) = 'requires_confirmation',
    'expired_confirmation_requires_confirmation: a 31-day-old Billboard confirmation still reads as confirmed';
  ASSERT (SELECT availability FROM public.placement_trust WHERE advert_id = v_fresh) = 'confirmed_available',
    'expired_confirmation_requires_confirmation: a 29-day-old Billboard confirmation does not read confirmed_available';
  PERFORM pg_temp.chk_pass('expired_confirmation_requires_confirmation');
END $$;

-- 4 ---------------------------------------------------------------------
DO $$
DECLARE
  v_old   uuid := pg_temp.chk_advert('digital 15d', 'Digital Screen');
  v_fresh uuid := pg_temp.chk_advert('digital 13d', 'Digital Screen');
BEGIN
  PERFORM pg_temp.chk_confirm(v_old, 'available', 15);
  PERFORM pg_temp.chk_confirm(v_fresh, 'available', 13);
  ASSERT (SELECT availability FROM public.placement_trust WHERE advert_id = v_old) = 'requires_confirmation',
    'digital_window_is_14_days: a 15-day-old Digital Screen confirmation still reads as confirmed';
  ASSERT (SELECT availability FROM public.placement_trust WHERE advert_id = v_fresh) = 'confirmed_available',
    'digital_window_is_14_days: a 13-day-old Digital Screen confirmation does not read confirmed_available';
  PERFORM pg_temp.chk_pass('digital_window_is_14_days');
END $$;

-- 5 ---------------------------------------------------------------------
-- The brief named "Stadium", but the migration (like ADVERT_CATEGORY_GROUPS)
-- puts Stadium in the 30-day outdoor group. A category no group knows is what
-- exercises the 7-day fallback, so the check uses one, and also pins Stadium.
DO $$
DECLARE
  v_fresh uuid := pg_temp.chk_advert('unknown 6d', 'zz-trust-check unknown medium');
  v_old   uuid := pg_temp.chk_advert('unknown 8d', 'zz-trust-check unknown medium');
BEGIN
  ASSERT public.placement_medium_group('zz-trust-check unknown medium') IS NULL,
    'unknown_medium_uses_7_days: the fake category unexpectedly maps to a group';
  ASSERT public.placement_medium_group('Stadium') = 'outdoor',
    'unknown_medium_uses_7_days: Stadium no longer maps to the outdoor group';
  PERFORM pg_temp.chk_confirm(v_fresh, 'available', 6);
  PERFORM pg_temp.chk_confirm(v_old, 'available', 8);
  ASSERT (SELECT availability FROM public.placement_trust WHERE advert_id = v_fresh) = 'confirmed_available',
    'unknown_medium_uses_7_days: a 6-day-old confirmation on an unknown medium is not confirmed_available';
  ASSERT (SELECT availability FROM public.placement_trust WHERE advert_id = v_old) = 'requires_confirmation',
    'unknown_medium_uses_7_days: an 8-day-old confirmation on an unknown medium still reads as confirmed';
  PERFORM pg_temp.chk_pass('unknown_medium_uses_7_days');
END $$;

-- 6 ---------------------------------------------------------------------
DO $$
DECLARE
  v_advert uuid := pg_temp.chk_advert('latest wins');
BEGIN
  PERFORM pg_temp.chk_confirm(v_advert, 'available', 5);
  PERFORM pg_temp.chk_confirm(v_advert, 'booked', 1);
  ASSERT (SELECT availability FROM public.placement_trust WHERE advert_id = v_advert) = 'booked',
    'latest_confirmation_wins: the newer booked confirmation did not win over the older available one';
  PERFORM pg_temp.chk_pass('latest_confirmation_wins');
END $$;

-- 7 ---------------------------------------------------------------------
DO $$
DECLARE
  v_kept     uuid := pg_temp.chk_advert('listed sibling');
  v_archived uuid := pg_temp.chk_advert('archived');
BEGIN
  UPDATE public.advertisements SET lifecycle = 'archived' WHERE id = v_archived;
  ASSERT NOT EXISTS (SELECT 1 FROM public.placement_trust WHERE advert_id = v_archived),
    'archived_hidden: an archived placement is still in placement_trust';
  ASSERT EXISTS (SELECT 1 FROM public.placement_trust WHERE advert_id = v_kept),
    'archived_hidden: the non-archived sibling is missing from placement_trust';
  PERFORM pg_temp.chk_pass('archived_hidden');
END $$;

-- 8 ---------------------------------------------------------------------
-- Private rows exist first, so a count of 0 under anon means "cannot see",
-- not "nothing there". A privilege error also counts as unreadable.
DO $$
DECLARE
  v_owner  uuid := pg_temp.chk_owner('anon owner');
  v_advert uuid := pg_temp.chk_advert('anon');
  v_n_contacts integer;
  v_n_sources  integer;
  v_n_avail    integer;
  v_n_trust    integer;
BEGIN
  INSERT INTO public.media_owner_contacts (owner_id, kind, value, source_url, found_at)
  VALUES (v_owner, 'email', 'zz-trust-check@example.invalid', 'https://example.invalid/zz-trust-check', now());
  INSERT INTO public.placement_field_source (advert_id, field, basis, source_label)
  VALUES (v_advert, 'dimensions', 'source_listed', 'zz-trust-check source');
  PERFORM pg_temp.chk_confirm(v_advert, 'available', 1);

  ASSERT (SELECT count(*) FROM public.media_owner_contacts) > 0
     AND (SELECT count(*) FROM public.placement_field_source) > 0
     AND (SELECT count(*) FROM public.placement_availability) > 0,
    'anon_cannot_read_private: setup failed, the private tables are empty for the owner connection';

  SET LOCAL ROLE anon;
  BEGIN
    SELECT count(*) INTO v_n_contacts FROM public.media_owner_contacts;
  EXCEPTION WHEN insufficient_privilege THEN v_n_contacts := 0;
  END;
  BEGIN
    SELECT count(*) INTO v_n_sources FROM public.placement_field_source;
  EXCEPTION WHEN insufficient_privilege THEN v_n_sources := 0;
  END;
  BEGIN
    SELECT count(*) INTO v_n_avail FROM public.placement_availability;
  EXCEPTION WHEN insufficient_privilege THEN v_n_avail := 0;
  END;
  SELECT count(*) INTO v_n_trust FROM public.placement_trust WHERE advert_id = v_advert;
  RESET ROLE;

  ASSERT v_n_contacts = 0, 'anon_cannot_read_private: anon can read media_owner_contacts';
  ASSERT v_n_sources = 0, 'anon_cannot_read_private: anon can read placement_field_source';
  ASSERT v_n_avail = 0, 'anon_cannot_read_private: anon can read placement_availability';
  ASSERT v_n_trust = 1, 'anon_cannot_read_private: anon cannot read placement_trust';
  PERFORM pg_temp.chk_pass('anon_cannot_read_private');
END $$;

-- 9 ---------------------------------------------------------------------
DO $$
DECLARE
  v_advert uuid := pg_temp.chk_advert('audience');
  v_raised boolean := false;
BEGIN
  BEGIN
    UPDATE public.advertisements SET audience_note = 'zz-trust-check audience' WHERE id = v_advert;
  EXCEPTION WHEN check_violation THEN
    v_raised := true;
  END;
  ASSERT v_raised,
    'audience_needs_partner_source: audience_note was accepted without a partner audience source';

  -- A source_listed audience row is still not enough.
  INSERT INTO public.placement_field_source (advert_id, field, basis, source_label)
  VALUES (v_advert, 'audience', 'source_listed', 'zz-trust-check listed');
  v_raised := false;
  BEGIN
    UPDATE public.advertisements SET audience_note = 'zz-trust-check audience' WHERE id = v_advert;
  EXCEPTION WHEN check_violation THEN
    v_raised := true;
  END;
  ASSERT v_raised,
    'audience_needs_partner_source: audience_note was accepted with only a source_listed audience source';

  UPDATE public.placement_field_source SET basis = 'partner_supplied'
   WHERE advert_id = v_advert AND field = 'audience';
  UPDATE public.advertisements SET audience_note = 'zz-trust-check audience' WHERE id = v_advert;
  ASSERT (SELECT audience_note FROM public.advertisements WHERE id = v_advert) = 'zz-trust-check audience',
    'audience_needs_partner_source: audience_note was refused even with a partner_supplied source';
  PERFORM pg_temp.chk_pass('audience_needs_partner_source');
END $$;

-- 10 --------------------------------------------------------------------
-- Against the real rows that existed before this script: none of the
-- throwaway rows count, and the number is read, not hardcoded.
DO $$
DECLARE
  v_total integer;
BEGIN
  SELECT count(*) INTO v_total
    FROM public.advertisements WHERE title NOT LIKE 'zz-trust-check %';
  ASSERT v_total > 0, 'the_97_are_honest: no pre-existing placements found';

  ASSERT (SELECT count(*) FROM public.advertisements
           WHERE title NOT LIKE 'zz-trust-check %' AND lifecycle IS DISTINCT FROM 'imported') = 0,
    'the_97_are_honest: a pre-existing placement is not lifecycle imported';
  ASSERT (SELECT count(*) FROM public.advertisements
           WHERE title NOT LIKE 'zz-trust-check %' AND country_code IS NULL) = 0,
    'the_97_are_honest: a pre-existing placement has no country_code';
  ASSERT (SELECT count(*) FROM public.advertisements
           WHERE title NOT LIKE 'zz-trust-check %' AND rights_holder IS NOT NULL) = 0,
    'the_97_are_honest: rights_holder was set on a pre-existing placement';
  ASSERT (SELECT count(*) FROM public.placement_trust t
            JOIN public.advertisements a ON a.id = t.advert_id
           WHERE a.title NOT LIKE 'zz-trust-check %') = v_total,
    'the_97_are_honest: a pre-existing placement is missing from placement_trust';
  ASSERT (SELECT count(*) FROM public.placement_trust t
            JOIN public.advertisements a ON a.id = t.advert_id
           WHERE a.title NOT LIKE 'zz-trust-check %'
             AND t.trust_label = 'source_listed'
             AND t.availability = 'requires_confirmation') = v_total,
    'the_97_are_honest: a pre-existing placement is not source_listed / requires_confirmation';
  PERFORM pg_temp.chk_pass('the_97_are_honest');
END $$;

-- 11 (extra) -------------------------------------------------------------
-- A signed-in non-admin cannot change lifecycle, and the admin RPC refuses them.
DO $$
DECLARE
  v_advert uuid := pg_temp.chk_advert('non admin');
  v_raised boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"role":"authenticated","sub":"00000000-0000-0000-0000-00000000c0de"}', true);
  BEGIN
    UPDATE public.advertisements SET lifecycle = 'partner_supplied' WHERE id = v_advert;
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'non_admin_cannot_change_lifecycle: a non-admin changed lifecycle directly';

  v_raised := false;
  BEGIN
    PERFORM public.set_placement_lifecycle(v_advert, 'rejected', 'zz-trust-check');
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'non_admin_cannot_change_lifecycle: a non-admin used set_placement_lifecycle';
  PERFORM set_config('request.jwt.claims', '', true);

  ASSERT (SELECT lifecycle FROM public.advertisements WHERE id = v_advert) = 'imported',
    'non_admin_cannot_change_lifecycle: lifecycle changed despite the refusals';
  PERFORM pg_temp.chk_pass('non_admin_cannot_change_lifecycle');
END $$;

-- 12 (extra) -------------------------------------------------------------
-- The RPC needs a reason, and writes exactly one audit row carrying it.
DO $$
DECLARE
  v_advert uuid := pg_temp.chk_advert('rpc reason');
  v_raised boolean := false;
BEGIN
  BEGIN
    PERFORM public.set_placement_lifecycle(v_advert, 'rejected', '  ');
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'set_lifecycle_records_reason: a blank reason was accepted';

  PERFORM public.set_placement_lifecycle(v_advert, 'rejected', 'zz-trust-check reason');
  ASSERT (SELECT lifecycle FROM public.advertisements WHERE id = v_advert) = 'rejected',
    'set_lifecycle_records_reason: lifecycle was not changed';
  ASSERT (SELECT count(*) FROM public.audit_log
           WHERE action = 'placement.lifecycle' AND entity_id = v_advert::text) = 1,
    'set_lifecycle_records_reason: expected exactly one placement.lifecycle audit row';
  ASSERT (SELECT detail ->> 'reason' FROM public.audit_log
           WHERE action = 'placement.lifecycle' AND entity_id = v_advert::text) = 'zz-trust-check reason',
    'set_lifecycle_records_reason: the audit row does not carry the reason';
  PERFORM pg_temp.chk_pass('set_lifecycle_records_reason');
END $$;

-- 13 (v2, I1) ----------------------------------------------------------------
-- "confirmed ... by" names only the owner the confirmation names. An admin
-- check on a linked placement names nobody; owner_name still shows the owner.
DO $$
DECLARE
  v_owner uuid := pg_temp.chk_owner('owner named');
  v_admin uuid := pg_temp.chk_advert('admin check on linked');
  v_by    uuid := pg_temp.chk_advert('owner confirmed');
BEGIN
  UPDATE public.advertisements SET owner_id = v_owner, owner_role = 'owner' WHERE id IN (v_admin, v_by);
  PERFORM pg_temp.chk_confirm_period(v_admin, 'available', -1, NULL, NULL, 'admin');
  PERFORM pg_temp.chk_confirm_period(v_by, 'available', -1, NULL, v_owner, 'email');

  ASSERT (SELECT availability FROM public.placement_trust WHERE advert_id = v_admin) = 'confirmed_available',
    'confirmed_by_names_the_confirming_owner: setup failed, the admin check is not confirmed_available';
  ASSERT (SELECT confirmed_by_name FROM public.placement_trust WHERE advert_id = v_admin) IS NULL,
    'confirmed_by_names_the_confirming_owner: an admin check is attributed to the linked owner';
  ASSERT (SELECT confirmation_method FROM public.placement_trust WHERE advert_id = v_admin) = 'admin',
    'confirmed_by_names_the_confirming_owner: confirmation_method is not admin for the admin check';
  ASSERT (SELECT owner_name FROM public.placement_trust WHERE advert_id = v_admin) = 'zz-trust-check owner named',
    'confirmed_by_names_the_confirming_owner: owner_name no longer shows the linked owner';
  ASSERT (SELECT confirmed_by_name FROM public.placement_trust WHERE advert_id = v_by) = 'zz-trust-check owner named',
    'confirmed_by_names_the_confirming_owner: an owner confirmation does not name that owner';
  ASSERT (SELECT confirmation_method FROM public.placement_trust WHERE advert_id = v_by) = 'email',
    'confirmed_by_names_the_confirming_owner: confirmation_method is not email for the owner confirmation';
  PERFORM pg_temp.chk_pass('confirmed_by_names_the_confirming_owner');
END $$;

-- 14 (v2, I2) ----------------------------------------------------------------
-- An available period that starts later is available_from, never available
-- now; one that started is confirmed_available; one with no from-date is not
-- claimed.
DO $$
DECLARE
  v_future uuid := pg_temp.chk_advert('available later');
  v_now    uuid := pg_temp.chk_advert('available now');
  v_open   uuid := pg_temp.chk_advert('available no from');
BEGIN
  PERFORM pg_temp.chk_confirm_period(v_future, 'available', 10, 20);
  PERFORM pg_temp.chk_confirm_period(v_now, 'available', 0, NULL);
  PERFORM pg_temp.chk_confirm_period(v_open, 'available', NULL, NULL);

  ASSERT (SELECT availability FROM public.placement_trust WHERE advert_id = v_future) = 'available_from',
    'future_period_is_available_from: a period starting in 10 days does not read available_from';
  ASSERT (SELECT period_from FROM public.placement_trust WHERE advert_id = v_future) = pg_temp.chk_today() + 10,
    'future_period_is_available_from: period_from is not exposed for the future period';
  ASSERT (SELECT availability_confirmed_at FROM public.placement_trust WHERE advert_id = v_future) IS NOT NULL,
    'future_period_is_available_from: the confirmation date is missing for the future period';
  ASSERT (SELECT availability FROM public.placement_trust WHERE advert_id = v_now) = 'confirmed_available',
    'future_period_is_available_from: a period starting today (Lagos) is not confirmed_available';
  ASSERT (SELECT availability FROM public.placement_trust WHERE advert_id = v_open) = 'requires_confirmation',
    'future_period_is_available_from: an available row with no from-date is claimed';
  PERFORM pg_temp.chk_pass('future_period_is_available_from');
END $$;

-- 15 (v2, I2) ----------------------------------------------------------------
-- A period that has ended no longer stands, whatever its status, and shows
-- none of its detail. One ending today (Lagos) still stands.
DO $$
DECLARE
  v_avail_past  uuid := pg_temp.chk_advert('available ended');
  v_booked_past uuid := pg_temp.chk_advert('booked ended');
  v_booked_now  uuid := pg_temp.chk_advert('booked running');
  v_booked_last uuid := pg_temp.chk_advert('booked ends today');
BEGIN
  PERFORM pg_temp.chk_confirm_period(v_avail_past, 'available', -10, -1);
  PERFORM pg_temp.chk_confirm_period(v_booked_past, 'booked', -10, -1);
  PERFORM pg_temp.chk_confirm_period(v_booked_now, 'booked', -10, 5);
  PERFORM pg_temp.chk_confirm_period(v_booked_last, 'booked', -10, 0);

  ASSERT (SELECT availability FROM public.placement_trust WHERE advert_id = v_avail_past) = 'requires_confirmation',
    'lapsed_period_requires_confirmation: an available period that ended yesterday still stands';
  ASSERT (SELECT availability FROM public.placement_trust WHERE advert_id = v_booked_past) = 'requires_confirmation',
    'lapsed_period_requires_confirmation: a booking that ended yesterday still reads booked';
  ASSERT (SELECT period_to IS NULL AND availability_confirmed_at IS NULL AND confirmation_method IS NULL
            FROM public.placement_trust WHERE advert_id = v_booked_past),
    'lapsed_period_requires_confirmation: an ended booking still shows its dates or method';
  ASSERT (SELECT availability FROM public.placement_trust WHERE advert_id = v_booked_now) = 'booked',
    'lapsed_period_requires_confirmation: a running booking does not read booked';
  ASSERT (SELECT availability FROM public.placement_trust WHERE advert_id = v_booked_last) = 'booked',
    'lapsed_period_requires_confirmation: a booking ending today (Lagos) no longer reads booked';
  PERFORM pg_temp.chk_pass('lapsed_period_requires_confirmation');
END $$;

-- 16 (v2, M7) ----------------------------------------------------------------
-- A rejected owner is never named publicly, as media_owners_public already
-- does; the placement itself stays listed.
DO $$
DECLARE
  v_owner  uuid := pg_temp.chk_owner('owner to reject');
  v_advert uuid := pg_temp.chk_advert('rejected owner');
BEGIN
  UPDATE public.media_owners SET website = 'https://example.invalid/zz-trust-check' WHERE id = v_owner;
  UPDATE public.advertisements SET owner_id = v_owner, owner_role = 'owner' WHERE id = v_advert;
  PERFORM pg_temp.chk_confirm_period(v_advert, 'available', -1, NULL, v_owner, 'email');
  ASSERT (SELECT owner_name IS NOT NULL AND owner_website IS NOT NULL AND confirmed_by_name IS NOT NULL
            FROM public.placement_trust WHERE advert_id = v_advert),
    'rejected_owner_name_hidden: setup failed, the owner is not named before rejection';

  UPDATE public.media_owners SET verification = 'rejected' WHERE id = v_owner;

  ASSERT (SELECT owner_name IS NULL AND owner_website IS NULL AND confirmed_by_name IS NULL
            FROM public.placement_trust WHERE advert_id = v_advert),
    'rejected_owner_name_hidden: a rejected owner is still named in placement_trust';
  ASSERT EXISTS (SELECT 1 FROM public.placement_trust WHERE advert_id = v_advert),
    'rejected_owner_name_hidden: the placement itself disappeared from placement_trust';
  PERFORM pg_temp.chk_pass('rejected_owner_name_hidden');
END $$;

-- 17 (v2, M6) ----------------------------------------------------------------
-- No pricing source row, no basis: the price is only "indicative".
DO $$
DECLARE
  v_advert uuid := pg_temp.chk_advert('no pricing source');
BEGIN
  ASSERT (SELECT price_basis FROM public.placement_trust WHERE advert_id = v_advert) IS NULL,
    'price_basis_null_without_source: a priced row with no pricing source still claims a basis';
  INSERT INTO public.placement_field_source (advert_id, field, basis, source_label)
  VALUES (v_advert, 'pricing', 'source_listed', 'zz-trust-check rate card');
  ASSERT (SELECT price_basis FROM public.placement_trust WHERE advert_id = v_advert) = 'source_listed',
    'price_basis_null_without_source: a pricing source row is not reflected in price_basis';
  PERFORM pg_temp.chk_pass('price_basis_null_without_source');
END $$;

-- Summary row (visible even when the client drops NOTICEs), then discard it all.
SELECT string_agg(name, ', ') AS checks_passed, count(*) AS n_passed
  FROM unnest(string_to_array(rtrim(current_setting('chk.passed'), ','), ',')) AS name;

ROLLBACK;
