-- Behaviour checks for the design asset library
-- (supabase/migrations/20261114010000_design_asset_library.sql).
--
-- ONE transaction that ALWAYS rolls back: every throwaway row below (titles
-- and paths "zz-asset-check") is discarded, so nothing is persisted. There is
-- no commit in this file. Run it through scripts/check-design-assets.mjs:
-- with --dry-run it runs the migration first inside the same rolled-back
-- transaction, so it works before the apply too.
--
-- Fixtures: an existing admin (staff) and an existing user who is neither
-- admin nor editor, both read from public.users. No auth.users rows are
-- created, so no signup trigger can send anything.
--
-- Roles: the connection is postgres, the table owner, so RLS does not apply
-- to it; constraint checks are made that way. Web callers are simulated with
-- SET LOCAL ROLE plus request.jwt.claims; auth.role() and auth.uid() read
-- those claims. Each check is a DO block that ASSERTs; the first failure
-- aborts the transaction with its check name in the message. A passing check
-- prints "ok: <check name>".

BEGIN;

SELECT set_config('chk.passed', '', true);

CREATE FUNCTION pg_temp.chk_pass(p_name text)
RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM set_config('chk.passed', current_setting('chk.passed') || p_name || ',', true);
  RAISE NOTICE 'ok: %', p_name;
END
$f$;

-- Become a web caller. Call as postgres; return with pg_temp.chk_back().
CREATE FUNCTION pg_temp.chk_as(p_role text, p_sub uuid)
RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_sub IS NULL THEN json_build_object('role', p_role)::text
         ELSE json_build_object('role', p_role, 'sub', p_sub)::text END, true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);
END
$f$;

CREATE FUNCTION pg_temp.chk_back()
RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
END
$f$;

CREATE FUNCTION pg_temp.id(p_key text)
RETURNS uuid LANGUAGE sql AS $f$
  SELECT current_setting('chk.' || p_key)::uuid;
$f$;

CREATE FUNCTION pg_temp.chk_sha()
RETURNS text LANGUAGE sql AS $f$
  SELECT encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex');
$f$;

-- A throwaway asset written as postgres, with evidence and a retrieval date,
-- so it may be approved unless a check removes them.
CREATE FUNCTION pg_temp.chk_asset(p_label text, p_status text DEFAULT 'draft',
                                  p_licence text DEFAULT 'pexels', p_tags text[] DEFAULT '{}')
RETURNS uuid LANGUAGE sql AS $f$
  INSERT INTO public.design_assets
    (kind, title, tags, bytes, mime, storage_path, sha256, source_name, licence_key,
     licence_evidence_path, retrieved_at, status)
  VALUES ('photo', 'zz-asset-check ' || p_label, p_tags, 1000, 'image/webp',
          'zz-asset-check/' || gen_random_uuid() || '.webp', pg_temp.chk_sha(),
          'zz-asset-check', p_licence, 'zz-asset-check/evidence.json', now(), p_status)
  RETURNING id;
$f$;

-- Fixtures ------------------------------------------------------------------
DO $$
DECLARE
  v_staff uuid; v_user uuid;
BEGIN
  SELECT u.id INTO v_staff FROM public.users u
  WHERE u.role = 'admin' AND EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id)
  ORDER BY u.id LIMIT 1;
  SELECT u.id INTO v_user FROM public.users u
  WHERE u.role NOT IN ('admin', 'editor') AND EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id)
  ORDER BY u.id LIMIT 1;
  ASSERT v_staff IS NOT NULL AND v_user IS NOT NULL, 'setup: no existing admin or non-staff user';
  PERFORM set_config('chk.staff', v_staff::text, true);
  PERFORM set_config('chk.user', v_user::text, true);
END $$;

-- 1 -------------------------------------------------------------------------
-- anon (and a signed-in non-staff user) read an approved row, never a draft.
DO $$
DECLARE
  v_approved uuid := pg_temp.chk_asset('approved', 'approved');
  v_draft    uuid := pg_temp.chk_asset('draft');
  v_review   uuid := pg_temp.chk_asset('in review', 'in_review');
  v_a int; v_d int; v_u_a int; v_u_d int; v_s int;
BEGIN
  PERFORM pg_temp.chk_as('anon', NULL);
  SELECT count(*) FILTER (WHERE id = v_approved), count(*) FILTER (WHERE id IN (v_draft, v_review))
    INTO v_a, v_d FROM public.design_assets WHERE id IN (v_approved, v_draft, v_review);
  PERFORM pg_temp.chk_back();

  PERFORM pg_temp.chk_as('authenticated', pg_temp.id('user'));
  SELECT count(*) FILTER (WHERE id = v_approved), count(*) FILTER (WHERE id IN (v_draft, v_review))
    INTO v_u_a, v_u_d FROM public.design_assets WHERE id IN (v_approved, v_draft, v_review);
  PERFORM pg_temp.chk_back();

  PERFORM pg_temp.chk_as('authenticated', pg_temp.id('staff'));
  SELECT count(*) INTO v_s FROM public.design_assets WHERE id IN (v_approved, v_draft, v_review);
  PERFORM pg_temp.chk_back();

  ASSERT v_a = 1, 'anon_reads_approved_not_draft: anon cannot read an approved asset';
  ASSERT v_d = 0, 'anon_reads_approved_not_draft: anon can read a draft or in_review asset';
  ASSERT v_u_a = 1 AND v_u_d = 0, 'anon_reads_approved_not_draft: a non-staff user sees the wrong rows';
  ASSERT v_s = 3, 'anon_reads_approved_not_draft: staff cannot read drafts, so the check proves nothing';
  PERFORM pg_temp.chk_pass('anon_reads_approved_not_draft');
END $$;

-- 2 -------------------------------------------------------------------------
-- A signed-in non-staff user cannot insert, update or delete; neither can anon.
DO $$
DECLARE
  v_row uuid := pg_temp.chk_asset('non staff target', 'approved');
  v_ins boolean := false; v_anon boolean := false; v_lic boolean := false;
  v_title text; v_left int;
BEGIN
  PERFORM pg_temp.chk_as('authenticated', pg_temp.id('user'));
  BEGIN
    INSERT INTO public.design_assets (kind, title, bytes, mime, storage_path, sha256, source_name, licence_key)
    VALUES ('photo', 'zz-asset-check non staff', 1, 'image/png', 'zz-asset-check/ns.png',
            pg_temp.chk_sha(), 'zz-asset-check', 'pexels');
  EXCEPTION WHEN insufficient_privilege THEN v_ins := true;
  END;
  BEGIN
    INSERT INTO public.design_asset_licences (key, name, commercial_use, modification, attribution_required,
      standalone_resale, template_embedding, print_use)
    VALUES ('zz-asset-check', 'zz', true, true, false, true, true, true);
  EXCEPTION WHEN insufficient_privilege THEN v_lic := true;
  END;
  UPDATE public.design_assets SET title = 'zz-asset-check hijacked' WHERE id = v_row;
  DELETE FROM public.design_assets WHERE id = v_row;
  PERFORM pg_temp.chk_back();

  PERFORM pg_temp.chk_as('anon', NULL);
  BEGIN
    INSERT INTO public.design_assets (kind, title, bytes, mime, storage_path, sha256, source_name, licence_key)
    VALUES ('photo', 'zz-asset-check anon', 1, 'image/png', 'zz-asset-check/an.png',
            pg_temp.chk_sha(), 'zz-asset-check', 'pexels');
  EXCEPTION WHEN insufficient_privilege THEN v_anon := true;
  END;
  PERFORM pg_temp.chk_back();

  SELECT title INTO v_title FROM public.design_assets WHERE id = v_row;
  SELECT count(*) INTO v_left FROM public.design_assets WHERE id = v_row;
  ASSERT v_ins, 'non_staff_insert_fails: a non-staff user inserted a design asset';
  ASSERT v_lic, 'non_staff_insert_fails: a non-staff user inserted a licence';
  ASSERT v_anon, 'non_staff_insert_fails: anon inserted a design asset';
  ASSERT v_left = 1, 'non_staff_insert_fails: a non-staff user deleted a design asset';
  ASSERT v_title = 'zz-asset-check non staff target', 'non_staff_insert_fails: a non-staff user updated a design asset';
  PERFORM pg_temp.chk_pass('non_staff_insert_fails');
END $$;

-- 3 -------------------------------------------------------------------------
-- Approval needs licence evidence AND a retrieval date.
DO $$
DECLARE
  v_row uuid := pg_temp.chk_asset('no evidence');
  v_no_ev boolean := false; v_no_date boolean := false;
BEGIN
  UPDATE public.design_assets SET licence_evidence_path = NULL WHERE id = v_row;
  BEGIN
    UPDATE public.design_assets SET status = 'approved' WHERE id = v_row;
  EXCEPTION WHEN check_violation THEN v_no_ev := true;
  END;
  UPDATE public.design_assets SET licence_evidence_path = 'zz-asset-check/e.json', retrieved_at = NULL WHERE id = v_row;
  BEGIN
    UPDATE public.design_assets SET status = 'approved' WHERE id = v_row;
  EXCEPTION WHEN check_violation THEN v_no_date := true;
  END;
  ASSERT v_no_ev, 'approve_without_evidence_fails: approved with no licence evidence';
  ASSERT v_no_date, 'approve_without_evidence_fails: approved with no retrieval date';
  ASSERT (SELECT status FROM public.design_assets WHERE id = v_row) = 'draft',
    'approve_without_evidence_fails: status changed despite the refusal';
  -- Staff approving with both present succeeds and is stamped.
  UPDATE public.design_assets SET retrieved_at = now() WHERE id = v_row;
  PERFORM pg_temp.chk_as('authenticated', pg_temp.id('staff'));
  UPDATE public.design_assets SET status = 'approved' WHERE id = v_row;
  PERFORM pg_temp.chk_back();
  ASSERT (SELECT status = 'approved' AND reviewed_by = pg_temp.id('staff') AND reviewed_at IS NOT NULL
            FROM public.design_assets WHERE id = v_row),
    'approve_without_evidence_fails: a staff approval with evidence did not stick or was not stamped';
  PERFORM pg_temp.chk_pass('approve_without_evidence_fails');
END $$;

-- 4 -------------------------------------------------------------------------
DO $$
DECLARE
  v_row uuid := pg_temp.chk_asset('brands');
  v_raised boolean := false;
BEGIN
  UPDATE public.design_assets SET contains_brands = true WHERE id = v_row;
  BEGIN
    UPDATE public.design_assets SET status = 'approved' WHERE id = v_row;
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'contains_brands_never_approved: an asset with brands was approved';
  PERFORM pg_temp.chk_pass('contains_brands_never_approved');
END $$;

-- 5 -------------------------------------------------------------------------
-- People without a release: only under a licence that permits it (pexels),
-- and only with the no-endorsement tag. A release on file lifts the rule.
DO $$
DECLARE
  v_untagged uuid := pg_temp.chk_asset('people untagged');
  v_tagged   uuid := pg_temp.chk_asset('people tagged', 'draft', 'pexels', ARRAY['no-endorsement']);
  v_cc0      uuid := pg_temp.chk_asset('people cc0', 'draft', 'cc0', ARRAY['no-endorsement']);
  v_release  uuid := pg_temp.chk_asset('people released', 'draft', 'cc0');
  v_untagged_raised boolean := false; v_cc0_raised boolean := false;
BEGIN
  UPDATE public.design_assets SET contains_people = true WHERE id IN (v_untagged, v_tagged, v_cc0, v_release);
  UPDATE public.design_assets SET release_on_file = true WHERE id = v_release;

  BEGIN
    UPDATE public.design_assets SET status = 'approved' WHERE id = v_untagged;
  EXCEPTION WHEN check_violation THEN v_untagged_raised := true;
  END;
  UPDATE public.design_assets SET status = 'approved' WHERE id = v_tagged;
  BEGIN
    UPDATE public.design_assets SET status = 'approved' WHERE id = v_cc0;
  EXCEPTION WHEN check_violation THEN v_cc0_raised := true;
  END;
  UPDATE public.design_assets SET status = 'approved' WHERE id = v_release;

  ASSERT v_untagged_raised, 'people_need_no_endorsement_tag: people without a release approved under pexels with no tag';
  ASSERT (SELECT status FROM public.design_assets WHERE id = v_tagged) = 'approved',
    'people_need_no_endorsement_tag: a tagged pexels asset with people could not be approved';
  ASSERT v_cc0_raised, 'people_need_no_endorsement_tag: people without a release approved under cc0, which does not permit it';
  ASSERT (SELECT status FROM public.design_assets WHERE id = v_release) = 'approved',
    'people_need_no_endorsement_tag: people with a release on file could not be approved';
  PERFORM pg_temp.chk_pass('people_need_no_endorsement_tag');
END $$;

-- 6 -------------------------------------------------------------------------
DO $$
DECLARE
  v_row uuid := pg_temp.chk_asset('sha original');
  v_raised boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.design_assets (kind, title, bytes, mime, storage_path, sha256, source_name, licence_key)
    SELECT 'photo', 'zz-asset-check sha copy', 1, 'image/png', 'zz-asset-check/copy.png', sha256, 'zz-asset-check', 'pexels'
      FROM public.design_assets WHERE id = v_row;
  EXCEPTION WHEN unique_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'duplicate_sha256_fails: a second row with the same sha256 was accepted';
  PERFORM pg_temp.chk_pass('duplicate_sha256_fails');
END $$;

-- 7 -------------------------------------------------------------------------
DO $$
DECLARE
  v_row uuid := pg_temp.chk_asset('retire', 'approved');
  v_none boolean := false; v_blank boolean := false;
BEGIN
  BEGIN
    UPDATE public.design_assets SET status = 'retired' WHERE id = v_row;
  EXCEPTION WHEN check_violation THEN v_none := true;
  END;
  BEGIN
    UPDATE public.design_assets SET status = 'retired', retired_reason = '   ' WHERE id = v_row;
  EXCEPTION WHEN check_violation THEN v_blank := true;
  END;
  ASSERT v_none, 'retire_without_reason_fails: retired with no reason';
  ASSERT v_blank, 'retire_without_reason_fails: retired with a blank reason';
  UPDATE public.design_assets SET status = 'retired', retired_reason = 'zz-asset-check reason' WHERE id = v_row;
  ASSERT (SELECT status FROM public.design_assets WHERE id = v_row) = 'retired',
    'retire_without_reason_fails: retiring with a reason did not stick';
  PERFORM pg_temp.chk_pass('retire_without_reason_fails');
END $$;

-- 8 -------------------------------------------------------------------------
DO $$
DECLARE
  v_raised boolean := false;
BEGIN
  BEGIN
    PERFORM pg_temp.chk_asset('freepik', 'draft', 'freepik');
  EXCEPTION WHEN foreign_key_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'unknown_licence_fails: an asset was recorded under a licence with no row';
  ASSERT (SELECT count(*) FROM public.design_asset_licences) >= 12,
    'unknown_licence_fails: the seeded licences are missing';
  PERFORM pg_temp.chk_pass('unknown_licence_fails');
END $$;

-- 9 -------------------------------------------------------------------------
-- Search finds an approved row by tag, not a draft, for anon and for staff.
DO $$
DECLARE
  v_approved uuid := pg_temp.chk_asset('search approved', 'approved', 'pexels', ARRAY['zzassetchecktag']);
  v_draft    uuid := pg_temp.chk_asset('search draft', 'draft', 'pexels', ARRAY['zzassetchecktag']);
  v_anon uuid[]; v_staff uuid[];
BEGIN
  PERFORM pg_temp.chk_as('anon', NULL);
  SELECT array_agg(s.id) INTO v_anon FROM public.search_design_assets('zzassetchecktag') s;
  PERFORM pg_temp.chk_back();
  PERFORM pg_temp.chk_as('authenticated', pg_temp.id('staff'));
  SELECT array_agg(s.id) INTO v_staff FROM public.search_design_assets('zzassetchecktag', 'photo') s;
  PERFORM pg_temp.chk_back();
  ASSERT v_anon = ARRAY[v_approved], format('search_finds_approved_not_draft: anon search returned %s', v_anon);
  ASSERT v_staff = ARRAY[v_approved], format('search_finds_approved_not_draft: staff search returned %s', v_staff);
  PERFORM pg_temp.chk_pass('search_finds_approved_not_draft');
END $$;

-- 10 ------------------------------------------------------------------------
-- Five equal-rank rows paged two at a time: every row exactly once, in id
-- order, and the same pages on a second pass.
DO $$
DECLARE
  v_expected uuid[]; v_pass1 uuid[] := '{}'; v_pass2 uuid[] := '{}'; v_page uuid[]; i int;
BEGIN
  FOR i IN 1..5 LOOP
    PERFORM pg_temp.chk_asset('page ' || i, 'approved', 'pexels', ARRAY['zzassetpagetag']);
  END LOOP;
  SELECT array_agg(id ORDER BY id) INTO v_expected FROM public.design_assets WHERE 'zzassetpagetag' = ANY (tags);

  PERFORM pg_temp.chk_as('anon', NULL);
  FOR i IN 0..2 LOOP
    SELECT coalesce(array_agg(s.id), '{}') INTO v_page
      FROM public.search_design_assets('zzassetpagetag', NULL, NULL, NULL, NULL, NULL, 2, i * 2) s;
    ASSERT cardinality(v_page) = CASE WHEN i < 2 THEN 2 ELSE 1 END,
      format('paging_is_stable: page %s had %s rows', i, cardinality(v_page));
    v_pass1 := v_pass1 || v_page;
  END LOOP;
  FOR i IN 0..2 LOOP
    SELECT coalesce(array_agg(s.id), '{}') INTO v_page
      FROM public.search_design_assets('zzassetpagetag', NULL, NULL, NULL, NULL, NULL, 2, i * 2) s;
    v_pass2 := v_pass2 || v_page;
  END LOOP;
  PERFORM pg_temp.chk_back();

  ASSERT cardinality(v_expected) = 5, 'paging_is_stable: setup failed, not five rows';
  ASSERT v_pass1 = v_expected, format('paging_is_stable: pages %s are not the rows in id order %s', v_pass1, v_expected);
  ASSERT v_pass2 = v_pass1, 'paging_is_stable: a second pass returned different pages';
  PERFORM pg_temp.chk_pass('paging_is_stable');
END $$;

-- 11 ------------------------------------------------------------------------
-- anon (and a non-staff user) cannot list or read the intake bucket, even with
-- the exact path; staff can read intake.
DO $$
DECLARE
  v_intake text := 'zz-asset-check/' || gen_random_uuid() || '.png';
  -- (The public library bucket is covered by check 18.)
  v_anon_list int; v_anon_exact int; v_user int; v_staff int;
BEGIN
  INSERT INTO storage.objects (bucket_id, name) VALUES
    ('design-assets-intake', v_intake);

  PERFORM pg_temp.chk_as('anon', NULL);
  SELECT count(*) INTO v_anon_list FROM storage.objects WHERE bucket_id = 'design-assets-intake';
  SELECT count(*) INTO v_anon_exact FROM storage.objects WHERE name = v_intake;
  PERFORM pg_temp.chk_back();

  PERFORM pg_temp.chk_as('authenticated', pg_temp.id('user'));
  SELECT count(*) INTO v_user FROM storage.objects WHERE bucket_id = 'design-assets-intake';
  PERFORM pg_temp.chk_back();

  PERFORM pg_temp.chk_as('authenticated', pg_temp.id('staff'));
  SELECT count(*) INTO v_staff FROM storage.objects WHERE bucket_id = 'design-assets-intake' AND name = v_intake;
  PERFORM pg_temp.chk_back();

  ASSERT v_anon_list = 0 AND v_anon_exact = 0, 'anon_cannot_list_intake: anon can see intake objects';
  ASSERT v_user = 0, 'anon_cannot_list_intake: a non-staff user can see intake objects';
  ASSERT v_staff = 1, 'anon_cannot_list_intake: staff cannot read intake, so the check proves nothing';
  ASSERT (SELECT public = false FROM storage.buckets WHERE id = 'design-assets-intake'),
    'anon_cannot_list_intake: the intake bucket is public';
  PERFORM pg_temp.chk_pass('anon_cannot_list_intake');
END $$;

-- 12 ------------------------------------------------------------------------
-- An .exe is refused at both levels SQL can see: the storage policy refuses the
-- extension, even for staff; the bucket's allowed_mime_types (which the
-- storage API enforces on the upload's content type) excludes executables and
-- is not NULL (NULL would allow every type). A .png from staff is accepted, so
-- the refusal is about the type, not the caller.
DO $$
DECLARE
  v_exe boolean := false; v_user_png boolean := false;
  v_mimes text[]; v_limit bigint;
BEGIN
  PERFORM pg_temp.chk_as('authenticated', pg_temp.id('staff'));
  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('design-assets-intake', 'zz-asset-check/' || gen_random_uuid() || '.exe');
  EXCEPTION WHEN insufficient_privilege THEN v_exe := true;
  END;
  INSERT INTO storage.objects (bucket_id, name) VALUES ('design-assets-intake', 'zz-asset-check/' || gen_random_uuid() || '.png');
  PERFORM pg_temp.chk_back();

  PERFORM pg_temp.chk_as('authenticated', pg_temp.id('user'));
  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('design-assets-intake', 'zz-asset-check/' || gen_random_uuid() || '.png');
  EXCEPTION WHEN insufficient_privilege THEN v_user_png := true;
  END;
  PERFORM pg_temp.chk_back();

  SELECT allowed_mime_types, file_size_limit INTO v_mimes, v_limit
    FROM storage.buckets WHERE id = 'design-assets-intake';

  ASSERT v_exe, 'exe_upload_refused: staff stored an .exe in intake';
  ASSERT v_user_png, 'exe_upload_refused: a non-staff user uploaded to intake';
  ASSERT v_mimes IS NOT NULL, 'exe_upload_refused: intake allows every type (allowed_mime_types is NULL)';
  ASSERT NOT (v_mimes && ARRAY['application/x-msdownload', 'application/x-msdos-program',
                               'application/vnd.microsoft.portable-executable', 'application/octet-stream']),
    format('exe_upload_refused: intake allows an executable type: %s', v_mimes);
  ASSERT v_mimes <@ ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
     AND cardinality(v_mimes) = 4,
    format('exe_upload_refused: intake types are not exactly the four allowed: %s', v_mimes);
  ASSERT v_limit = 26214400, format('exe_upload_refused: intake size limit is %s, not 25 MB', v_limit);
  PERFORM pg_temp.chk_pass('exe_upload_refused');
END $$;

-- 13 ------------------------------------------------------------------------
-- A licence cannot stop permitting people without a release while an approved
-- asset relies on it; once nothing relies on it, it can.
DO $$
DECLARE
  v_row uuid := pg_temp.chk_asset('licence reliance', 'draft', 'pixabay', ARRAY['no-endorsement']);
  v_raised boolean := false;
BEGIN
  UPDATE public.design_assets SET contains_people = true WHERE id = v_row;
  UPDATE public.design_assets SET status = 'approved' WHERE id = v_row;
  BEGIN
    UPDATE public.design_asset_licences SET permits_people_without_release = false WHERE key = 'pixabay';
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'licence_people_flag_frozen_while_relied_on: the flag was switched off under an approved asset';
  ASSERT (SELECT permits_people_without_release FROM public.design_asset_licences WHERE key = 'pixabay'),
    'licence_people_flag_frozen_while_relied_on: the flag changed despite the refusal';
  UPDATE public.design_assets SET status = 'retired', retired_reason = 'zz-asset-check' WHERE id = v_row;
  -- Only provable when no real approved asset relies on pixabay (true before
  -- any intake); otherwise the refusal above is the whole check.
  IF NOT EXISTS (SELECT 1 FROM public.design_assets
                  WHERE licence_key = 'pixabay' AND status = 'approved' AND contains_people AND NOT release_on_file) THEN
    UPDATE public.design_asset_licences SET permits_people_without_release = false WHERE key = 'pixabay';
    ASSERT NOT (SELECT permits_people_without_release FROM public.design_asset_licences WHERE key = 'pixabay'),
      'licence_people_flag_frozen_while_relied_on: the flag could not be switched off with nothing relying on it';
  END IF;
  PERFORM pg_temp.chk_pass('licence_people_flag_frozen_while_relied_on');
END $$;

-- 14 ------------------------------------------------------------------------
DO $$
DECLARE
  v_row uuid := pg_temp.chk_asset('svg');
  v_raised boolean := false;
BEGIN
  UPDATE public.design_assets SET mime = 'image/svg+xml',
         storage_path = 'zz-asset-check/' || gen_random_uuid() || '.svg' WHERE id = v_row;
  BEGIN
    UPDATE public.design_assets SET status = 'approved' WHERE id = v_row;
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'svg_needs_sanitising: an unsanitised SVG was approved';
  UPDATE public.design_assets SET sanitised_at = now() WHERE id = v_row;
  UPDATE public.design_assets SET status = 'approved' WHERE id = v_row;
  ASSERT (SELECT status FROM public.design_assets WHERE id = v_row) = 'approved',
    'svg_needs_sanitising: a sanitised SVG could not be approved';
  PERFORM pg_temp.chk_pass('svg_needs_sanitising');
END $$;

-- 15 ------------------------------------------------------------------------
-- A non-staff user (and anon) cannot upload to the public library bucket;
-- staff can.
DO $$
DECLARE
  v_user boolean := false; v_anon boolean := false;
BEGIN
  PERFORM pg_temp.chk_as('authenticated', pg_temp.id('user'));
  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('design-assets', 'zz-asset-check/' || gen_random_uuid() || '.png');
  EXCEPTION WHEN insufficient_privilege THEN v_user := true;
  END;
  PERFORM pg_temp.chk_back();
  PERFORM pg_temp.chk_as('anon', NULL);
  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('design-assets', 'zz-asset-check/' || gen_random_uuid() || '.png');
  EXCEPTION WHEN insufficient_privilege THEN v_anon := true;
  END;
  PERFORM pg_temp.chk_back();
  PERFORM pg_temp.chk_as('authenticated', pg_temp.id('staff'));
  INSERT INTO storage.objects (bucket_id, name) VALUES ('design-assets', 'zz-asset-check/' || gen_random_uuid() || '.png');
  PERFORM pg_temp.chk_back();
  ASSERT v_user, 'non_staff_cannot_upload_library: a non-staff user uploaded to design-assets';
  ASSERT v_anon, 'non_staff_cannot_upload_library: anon uploaded to design-assets';
  PERFORM pg_temp.chk_pass('non_staff_cannot_upload_library');
END $$;

-- 16 ------------------------------------------------------------------------
-- A non-staff user's UPDATE or DELETE on licences touches nothing.
DO $$
DECLARE
  v_before text; v_after text; v_resale boolean; v_n int;
BEGIN
  SELECT restrictions INTO v_before FROM public.design_asset_licences WHERE key = 'mit';
  PERFORM pg_temp.chk_as('authenticated', pg_temp.id('user'));
  UPDATE public.design_asset_licences SET restrictions = 'zz-asset-check hijacked', standalone_resale = true WHERE key = 'mit';
  DELETE FROM public.design_asset_licences WHERE key = 'mit';
  PERFORM pg_temp.chk_back();
  SELECT count(*) INTO v_n FROM public.design_asset_licences WHERE key = 'mit';
  SELECT restrictions, standalone_resale INTO v_after, v_resale FROM public.design_asset_licences WHERE key = 'mit';
  ASSERT v_n = 1, 'non_staff_cannot_change_licences: a non-staff user deleted a licence';
  ASSERT v_after = v_before AND NOT v_resale, 'non_staff_cannot_change_licences: a non-staff user updated a licence';
  PERFORM pg_temp.chk_pass('non_staff_cannot_change_licences');
END $$;

-- 17 ------------------------------------------------------------------------
-- Mockup surfaces follow their scene: hidden from anon while it is a draft.
DO $$
DECLARE
  v_draft uuid := pg_temp.chk_asset('scene draft');
  v_live  uuid := pg_temp.chk_asset('scene approved', 'approved');
  v_hidden int; v_shown int;
BEGIN
  UPDATE public.design_assets SET kind = 'mockup_scene' WHERE id IN (v_draft, v_live);
  INSERT INTO public.design_mockup_surfaces
    (asset_id, tl_x, tl_y, tr_x, tr_y, br_x, br_y, bl_x, bl_y, ratio, format_keys, label)
  VALUES (v_draft, 0.1, 0.1, 0.9, 0.1, 0.9, 0.9, 0.1, 0.9, 1, ARRAY['square'], 'zz-asset-check draft'),
         (v_live,  0.1, 0.1, 0.9, 0.1, 0.9, 0.9, 0.1, 0.9, 1, ARRAY['square'], 'zz-asset-check live');
  PERFORM pg_temp.chk_as('anon', NULL);
  SELECT count(*) INTO v_hidden FROM public.design_mockup_surfaces WHERE asset_id = v_draft;
  SELECT count(*) INTO v_shown FROM public.design_mockup_surfaces WHERE asset_id = v_live;
  PERFORM pg_temp.chk_back();
  ASSERT v_hidden = 0, 'draft_scene_surfaces_hidden: anon can read surfaces of a draft scene';
  ASSERT v_shown = 1, 'draft_scene_surfaces_hidden: anon cannot read surfaces of an approved scene, so the check proves nothing';
  PERFORM pg_temp.chk_pass('draft_scene_surfaces_hidden');
END $$;

-- 18 ------------------------------------------------------------------------
-- anon cannot list the public library bucket (no SELECT policy). Files are
-- still served by public URL by design: the Storage API serves a public
-- bucket's objects without RLS, which SQL cannot fetch to prove.
DO $$
DECLARE
  v_path text := 'zz-asset-check/' || gen_random_uuid() || '.png';
  v_anon int; v_user int; v_staff int;
BEGIN
  INSERT INTO storage.objects (bucket_id, name) VALUES ('design-assets', v_path);
  PERFORM pg_temp.chk_as('anon', NULL);
  SELECT count(*) INTO v_anon FROM storage.objects WHERE bucket_id = 'design-assets';
  PERFORM pg_temp.chk_back();
  PERFORM pg_temp.chk_as('authenticated', pg_temp.id('user'));
  SELECT count(*) INTO v_user FROM storage.objects WHERE bucket_id = 'design-assets';
  PERFORM pg_temp.chk_back();
  PERFORM pg_temp.chk_as('authenticated', pg_temp.id('staff'));
  SELECT count(*) INTO v_staff FROM storage.objects WHERE bucket_id = 'design-assets' AND name = v_path;
  PERFORM pg_temp.chk_back();
  ASSERT v_anon = 0, 'anon_cannot_list_library: anon can list design-assets';
  ASSERT v_user = 0, 'anon_cannot_list_library: a non-staff user can list design-assets';
  ASSERT v_staff = 1, 'anon_cannot_list_library: staff cannot read design-assets, so the check proves nothing';
  ASSERT (SELECT public FROM storage.buckets WHERE id = 'design-assets'),
    'anon_cannot_list_library: design-assets is not a public bucket, so public URLs would not work';
  PERFORM pg_temp.chk_pass('anon_cannot_list_library');
END $$;

-- 19 ------------------------------------------------------------------------
-- anon never reads staff ids; it still reads the public columns and searches.
DO $$
DECLARE
  v_row uuid := pg_temp.chk_asset('staff ids', 'approved', 'pexels', ARRAY['zzassetidstag']);
  v_creator boolean := false; v_reviewer boolean := false; v_lic boolean := false;
  v_title text; v_found int; v_x uuid;
BEGIN
  PERFORM pg_temp.chk_as('anon', NULL);
  BEGIN
    SELECT created_by INTO v_x FROM public.design_assets WHERE id = v_row;
  EXCEPTION WHEN insufficient_privilege THEN v_creator := true;
  END;
  BEGIN
    SELECT reviewed_by INTO v_x FROM public.design_assets WHERE id = v_row;
  EXCEPTION WHEN insufficient_privilege THEN v_reviewer := true;
  END;
  BEGIN
    SELECT reviewed_by INTO v_x FROM public.design_asset_licences WHERE key = 'pexels';
  EXCEPTION WHEN insufficient_privilege THEN v_lic := true;
  END;
  SELECT title INTO v_title FROM public.design_assets WHERE id = v_row;
  SELECT count(*) INTO v_found FROM public.search_design_assets('zzassetidstag') s WHERE s.id = v_row;
  PERFORM pg_temp.chk_back();
  ASSERT v_creator AND v_reviewer, 'anon_cannot_read_staff_ids: anon can read created_by or reviewed_by on design_assets';
  ASSERT v_lic, 'anon_cannot_read_staff_ids: anon can read reviewed_by on design_asset_licences';
  ASSERT v_title = 'zz-asset-check staff ids', 'anon_cannot_read_staff_ids: anon cannot read the public columns';
  ASSERT v_found = 1, 'anon_cannot_read_staff_ids: search no longer works for anon';
  PERFORM pg_temp.chk_pass('anon_cannot_read_staff_ids');
END $$;

-- 20 ------------------------------------------------------------------------
-- Review stamps cannot be set by hand: they move only on a change into
-- approved or retired.
DO $$
DECLARE
  v_row uuid := pg_temp.chk_asset('stamps');
  v_at timestamptz;
BEGIN
  UPDATE public.design_assets SET reviewed_by = pg_temp.id('user'), reviewed_at = now() - interval '1 year' WHERE id = v_row;
  ASSERT (SELECT reviewed_by IS NULL AND reviewed_at IS NULL FROM public.design_assets WHERE id = v_row),
    'review_stamps_frozen: a draft took hand-set review stamps';
  PERFORM pg_temp.chk_as('authenticated', pg_temp.id('staff'));
  UPDATE public.design_assets SET status = 'approved' WHERE id = v_row;
  PERFORM pg_temp.chk_back();
  SELECT reviewed_at INTO v_at FROM public.design_assets WHERE id = v_row;
  UPDATE public.design_assets SET title = 'zz-asset-check stamps edited', reviewed_by = pg_temp.id('user'),
         reviewed_at = now() - interval '1 year' WHERE id = v_row;
  ASSERT (SELECT reviewed_by = pg_temp.id('staff') AND reviewed_at = v_at FROM public.design_assets WHERE id = v_row),
    'review_stamps_frozen: an edit without a status change moved the review stamps';
  PERFORM pg_temp.chk_pass('review_stamps_frozen');
END $$;

-- Summary row (visible even when the client drops NOTICEs), then discard it all.
SELECT string_agg(name, ', ') AS checks_passed, count(*) AS n_passed
  FROM unnest(string_to_array(rtrim(current_setting('chk.passed'), ','), ',')) AS name;

ROLLBACK;
