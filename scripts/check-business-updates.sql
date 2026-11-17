-- Behaviour checks for Business Updates
-- (supabase/migrations/20261110010000_business_updates.sql and
--  supabase/migrations/20261110020000_business_update_alerts_reports.sql).
--
-- ONE transaction that ALWAYS rolls back: every throwaway row below (bodies
-- "zz-updates-check") is discarded, so nothing is persisted. There is no
-- commit in this file and src/test/businessUpdatesCheckSql.test.ts keeps it
-- that way. Run it through scripts/check-business-updates.mjs: with
-- --dry-run it runs both migrations first inside the same rolled-back
-- transaction, so it works before the apply too.
--
-- Fixtures: an existing listable business whose owner is not an admin, two
-- other existing non-admin users made support and marketing members (rolled
-- back), an existing admin, and a stranger who is a random uuid. No auth.users
-- rows are created, so no signup trigger can send anything.
--
-- Roles: the connection is postgres (no JWT), which the guards let through
-- by design; that is how past publish times are set up. Web callers are
-- simulated with SET LOCAL ROLE plus request.jwt.claims; auth.role() and
-- auth.uid() read those claims. now() is fixed for the whole transaction,
-- which makes the 24-hour boundary exact.
--
-- check 25 disables the alert trigger for a moment, inside this transaction,
-- to set up a scheduled update that went live with no alert. ALTER TABLE ...
-- DISABLE TRIGGER takes a SHARE ROW EXCLUSIVE lock: reads continue, but
-- writes to business_updates wait until the rollback, which is seconds.

BEGIN;

SELECT set_config('chk.passed', '', true);

CREATE FUNCTION pg_temp.chk_pass(p_name text)
RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM set_config('chk.passed', current_setting('chk.passed') || p_name || ',', true);
  RAISE NOTICE 'ok: %', p_name;
END
$f$;

-- Become a web caller. Call as postgres; return with RESET ROLE and cleared claims.
CREATE FUNCTION pg_temp.chk_as(p_role text, p_sub uuid)
RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM set_config('request.jwt.claims',
    CASE WHEN p_sub IS NULL THEN json_build_object('role', p_role)::text
         ELSE json_build_object('role', p_role, 'sub', p_sub)::text END, true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);
END
$f$;

CREATE FUNCTION pg_temp.id(p_key text)
RETURNS uuid LANGUAGE sql AS $f$
  SELECT current_setting('chk.' || p_key)::uuid;
$f$;

-- An update on the fixture business, written as postgres so any time is allowed.
CREATE FUNCTION pg_temp.chk_update(p_published timestamptz, p_type text DEFAULT 'announcement',
                                   p_notify boolean DEFAULT false)
RETURNS uuid LANGUAGE sql AS $f$
  INSERT INTO public.business_updates (business_id, type, body, published_at, notify_keepers)
  VALUES (current_setting('chk.biz')::uuid, p_type, 'zz-updates-check', p_published, p_notify)
  RETURNING id;
$f$;

CREATE FUNCTION pg_temp.chk_path(p_update uuid, p_file text)
RETURNS text LANGUAGE sql AS $f$
  SELECT current_setting('chk.biz') || '/' || p_update::text || '/' || p_file;
$f$;

CREATE FUNCTION pg_temp.chk_media(p_update uuid, p_file text)
RETURNS text LANGUAGE sql AS $f$
  INSERT INTO public.business_update_media (update_id, business_id, kind, storage_path)
  VALUES (p_update, current_setting('chk.biz')::uuid, 'image', pg_temp.chk_path(p_update, p_file))
  RETURNING storage_path;
$f$;

-- Fixtures ------------------------------------------------------------------
DO $$
DECLARE
  v_biz uuid; v_owner uuid; v_support uuid; v_marketing uuid; v_admin uuid; v_other uuid;
BEGIN
  SELECT b.id, b.user_id INTO v_biz, v_owner
  FROM public.businesses b JOIN public.users u ON u.id = b.user_id
  WHERE u.role <> 'admin' AND b.is_listable
  ORDER BY b.id LIMIT 1;
  ASSERT v_biz IS NOT NULL, 'setup: no listable business with a non-admin owner';

  SELECT u.id INTO v_support FROM public.users u
  WHERE u.role <> 'admin' AND u.id <> v_owner AND EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id)
  ORDER BY u.id LIMIT 1;
  SELECT u.id INTO v_marketing FROM public.users u
  WHERE u.role <> 'admin' AND u.id NOT IN (v_owner, v_support) AND EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id)
  ORDER BY u.id LIMIT 1;
  SELECT u.id INTO v_admin FROM public.users u
  WHERE u.role = 'admin' AND EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id)
  ORDER BY u.id LIMIT 1;
  SELECT b.id INTO v_other FROM public.businesses b WHERE b.id <> v_biz ORDER BY b.id LIMIT 1;
  ASSERT v_support IS NOT NULL AND v_marketing IS NOT NULL AND v_admin IS NOT NULL AND v_other IS NOT NULL,
    'setup: not enough existing users or businesses for the fixtures';

  INSERT INTO public.business_members (business_id, user_id, role, status)
  VALUES (v_biz, v_support, 'support', 'active'), (v_biz, v_marketing, 'marketing', 'active')
  ON CONFLICT (business_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active';

  PERFORM set_config('chk.biz', v_biz::text, true);
  PERFORM set_config('chk.owner', v_owner::text, true);
  PERFORM set_config('chk.support', v_support::text, true);
  PERFORM set_config('chk.marketing', v_marketing::text, true);
  PERFORM set_config('chk.admin', v_admin::text, true);
  PERFORM set_config('chk.other', v_other::text, true);
  PERFORM set_config('chk.stranger', gen_random_uuid()::text, true);
END $$;

-- 1 -------------------------------------------------------------------------
DO $$
DECLARE v_u uuid := pg_temp.chk_update(now() - interval '1 hour'); v_n int;
BEGIN
  PERFORM pg_temp.chk_as('anon', NULL);
  SELECT count(*) INTO v_n FROM public.business_updates WHERE id = v_u;
  RESET ROLE; PERFORM set_config('request.jwt.claims', '', true);
  ASSERT v_n = 1, 'anon_sees_active: anon cannot see a live update';
  PERFORM pg_temp.chk_pass('anon_sees_active');
END $$;

-- 2 -------------------------------------------------------------------------
DO $$
DECLARE
  v_gone uuid := pg_temp.chk_update(now() - interval '24 hours');
  v_last uuid := pg_temp.chk_update(now() - interval '24 hours' + interval '1 second');
  v_gone_n int; v_last_n int;
BEGIN
  PERFORM pg_temp.chk_as('anon', NULL);
  SELECT count(*) INTO v_gone_n FROM public.business_updates WHERE id = v_gone;
  SELECT count(*) INTO v_last_n FROM public.business_updates WHERE id = v_last;
  RESET ROLE; PERFORM set_config('request.jwt.claims', '', true);
  ASSERT v_gone_n = 0, 'boundary_24h_is_exclusive: an update is still public at exactly 24 hours';
  ASSERT v_last_n = 1, 'boundary_24h_is_exclusive: an update vanished one second before 24 hours';
  PERFORM pg_temp.chk_pass('boundary_24h_is_exclusive');
END $$;

-- 3, 4 -----------------------------------------------------------------------
DO $$
DECLARE
  v_draft uuid := pg_temp.chk_update(NULL);
  v_sched uuid := pg_temp.chk_update(now() + interval '1 hour');
  v_old   uuid := pg_temp.chk_update(now() - interval '25 hours');
  v_early uuid := pg_temp.chk_update(now() - interval '1 hour');
  v_hid   uuid := pg_temp.chk_update(now() - interval '1 hour');
  v_ids   uuid[];
  v_anon int; v_owner int;
BEGIN
  UPDATE public.business_updates SET ended_at = now() WHERE id = v_early;
  UPDATE public.business_updates SET moderation_status = 'hidden' WHERE id = v_hid;
  v_ids := ARRAY[v_draft, v_sched, v_old, v_early, v_hid];

  PERFORM pg_temp.chk_as('anon', NULL);
  SELECT count(*) INTO v_anon FROM public.business_updates WHERE id = ANY (v_ids);
  RESET ROLE; PERFORM set_config('request.jwt.claims', '', true);
  ASSERT v_anon = 0, format('anon_blind_to_draft_scheduled_ended_hidden: anon sees %s of 5', v_anon);
  PERFORM pg_temp.chk_pass('anon_blind_to_draft_scheduled_ended_hidden');

  PERFORM pg_temp.chk_as('authenticated', pg_temp.id('owner'));
  SELECT count(*) INTO v_owner FROM public.business_updates WHERE id = ANY (v_ids);
  RESET ROLE; PERFORM set_config('request.jwt.claims', '', true);
  ASSERT v_owner = 5, format('owner_sees_archive: owner sees %s of 5', v_owner);
  PERFORM pg_temp.chk_pass('owner_sees_archive');
END $$;

-- 5 -------------------------------------------------------------------------
DO $$
DECLARE v_biz uuid := pg_temp.id('biz'); v_raised boolean := false;
BEGIN
  PERFORM pg_temp.chk_as('authenticated', pg_temp.id('stranger'));
  BEGIN
    INSERT INTO public.business_updates (business_id, type, body, published_at)
    VALUES (v_biz, 'announcement', 'zz-updates-check', now());
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  RESET ROLE; PERFORM set_config('request.jwt.claims', '', true);
  ASSERT v_raised, 'stranger_cannot_insert: a stranger posted an update for someone else''s business';
  PERFORM pg_temp.chk_pass('stranger_cannot_insert');
END $$;

-- 6, 7 -----------------------------------------------------------------------
DO $$
DECLARE
  v_biz uuid := pg_temp.id('biz');
  v_draft uuid := pg_temp.chk_update(NULL);
  v_raised boolean := false; v_changed int; v_deleted int; v_seen int;
BEGIN
  PERFORM pg_temp.chk_as('authenticated', pg_temp.id('support'));
  BEGIN
    INSERT INTO public.business_updates (business_id, type, body, published_at)
    VALUES (v_biz, 'announcement', 'zz-updates-check', now());
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  UPDATE public.business_updates SET published_at = now() WHERE id = v_draft;
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  DELETE FROM public.business_updates WHERE id = v_draft;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  SELECT count(*) INTO v_seen FROM public.business_updates WHERE id = v_draft;
  RESET ROLE; PERFORM set_config('request.jwt.claims', '', true);

  ASSERT v_raised, 'support_member_cannot_publish: a support member inserted an update';
  ASSERT v_changed = 0, 'support_member_cannot_publish: a support member published a draft';
  ASSERT v_deleted = 0, 'support_member_cannot_publish: a support member deleted an update';
  PERFORM pg_temp.chk_pass('support_member_cannot_publish');

  ASSERT v_seen = 1, 'support_member_reads_archive: a support member cannot read the drafts';
  PERFORM pg_temp.chk_pass('support_member_reads_archive');
END $$;

-- 8, 28 ----------------------------------------------------------------------
DO $$
DECLARE
  v_biz uuid := pg_temp.id('biz');
  v_marketing uuid := pg_temp.id('marketing');
  v_owner uuid := pg_temp.id('owner');
  v_admin uuid := pg_temp.id('admin');
  v_author uuid; v_author2 uuid;
BEGIN
  PERFORM pg_temp.chk_as('authenticated', v_marketing);
  INSERT INTO public.business_updates (business_id, type, body, published_at, notify_keepers)
  VALUES (v_biz, 'new_product', 'zz-updates-check', now(), false)
  RETURNING author_id INTO v_author;
  RESET ROLE; PERFORM set_config('request.jwt.claims', '', true);
  ASSERT v_author = v_marketing, 'marketing_member_can_publish: the update was not written as the marketing member';
  PERFORM pg_temp.chk_pass('marketing_member_can_publish');

  PERFORM pg_temp.chk_as('authenticated', v_owner);
  INSERT INTO public.business_updates (business_id, type, body, published_at, notify_keepers, author_id)
  VALUES (v_biz, 'announcement', 'zz-updates-check', now(), false, v_admin)
  RETURNING author_id INTO v_author2;
  RESET ROLE; PERFORM set_config('request.jwt.claims', '', true);
  ASSERT v_author2 = v_owner, 'author_forced_to_caller: a client chose someone else as the author';
  PERFORM pg_temp.chk_pass('author_forced_to_caller');
END $$;

-- 9, 10, 11 ------------------------------------------------------------------
DO $$
DECLARE
  v_owner uuid := pg_temp.id('owner');
  v_live uuid := pg_temp.chk_update(now() - interval '1 hour');
  v_republish boolean := false; v_edit boolean := false; v_clear boolean := false;
  v_ended timestamptz;
BEGIN
  PERFORM pg_temp.chk_as('authenticated', v_owner);
  BEGIN
    UPDATE public.business_updates SET published_at = now() WHERE id = v_live;
  EXCEPTION WHEN raise_exception THEN v_republish := true;
  END;
  BEGIN
    UPDATE public.business_updates SET body = 'zz-updates-check edited' WHERE id = v_live;
  EXCEPTION WHEN raise_exception THEN v_edit := true;
  END;
  UPDATE public.business_updates SET ended_at = now() WHERE id = v_live;
  BEGIN
    UPDATE public.business_updates SET ended_at = NULL WHERE id = v_live;
  EXCEPTION WHEN raise_exception THEN v_clear := true;
  END;
  RESET ROLE; PERFORM set_config('request.jwt.claims', '', true);

  ASSERT v_republish, 'published_at_locked_after_live: a live update was re-published';
  PERFORM pg_temp.chk_pass('published_at_locked_after_live');
  ASSERT v_edit, 'live_update_text_locked: a live update was edited';
  PERFORM pg_temp.chk_pass('live_update_text_locked');
  SELECT ended_at INTO v_ended FROM public.business_updates WHERE id = v_live;
  ASSERT v_ended IS NOT NULL, 'ended_at_cannot_be_cleared: the owner could not end the update';
  ASSERT v_clear, 'ended_at_cannot_be_cleared: an ended update was restarted';
  PERFORM pg_temp.chk_pass('ended_at_cannot_be_cleared');
END $$;

-- 12, 13, 14 -----------------------------------------------------------------
DO $$
DECLARE
  v_owner uuid := pg_temp.id('owner');
  v_admin uuid := pg_temp.id('admin');
  v_hid  uuid := pg_temp.chk_update(now() - interval '1 hour');
  v_live uuid := pg_temp.chk_update(now() - interval '1 hour');
  v_status text; v_by uuid; v_anon int; v_del boolean := false;
BEGIN
  UPDATE public.business_updates SET moderation_status = 'hidden' WHERE id = v_hid;

  PERFORM pg_temp.chk_as('authenticated', v_owner);
  UPDATE public.business_updates SET moderation_status = 'ok' WHERE id = v_hid;
  BEGIN
    DELETE FROM public.business_updates WHERE id = v_hid;
  EXCEPTION WHEN raise_exception THEN v_del := true;
  END;
  RESET ROLE; PERFORM set_config('request.jwt.claims', '', true);
  SELECT moderation_status INTO v_status FROM public.business_updates WHERE id = v_hid;
  ASSERT v_status = 'hidden', 'owner_cannot_unhide: the owner un-hid a moderated update';
  PERFORM pg_temp.chk_pass('owner_cannot_unhide');
  ASSERT v_del AND EXISTS (SELECT 1 FROM public.business_updates WHERE id = v_hid),
    'owner_cannot_delete_hidden: the owner deleted a hidden update';
  PERFORM pg_temp.chk_pass('owner_cannot_delete_hidden');

  PERFORM pg_temp.chk_as('authenticated', v_admin);
  UPDATE public.business_updates SET moderation_status = 'hidden', moderation_note = 'zz-updates-check'
  WHERE id = v_live;
  RESET ROLE; PERFORM set_config('request.jwt.claims', '', true);
  SELECT moderated_by INTO v_by FROM public.business_updates WHERE id = v_live;
  PERFORM pg_temp.chk_as('anon', NULL);
  SELECT count(*) INTO v_anon FROM public.business_updates WHERE id = v_live;
  RESET ROLE; PERFORM set_config('request.jwt.claims', '', true);
  ASSERT v_by = v_admin, 'admin_hide_removes_public: moderated_by was not the admin';
  ASSERT v_anon = 0, 'admin_hide_removes_public: a hidden update is still public';
  PERFORM pg_temp.chk_pass('admin_hide_removes_public');
END $$;

-- 15, 16, 17 -----------------------------------------------------------------
DO $$
DECLARE
  v_biz uuid := pg_temp.id('biz');
  v_owner uuid := pg_temp.id('owner');
  v_mine uuid; v_theirs uuid;
  v_far boolean := false; v_near uuid;
  v_empty boolean := false; v_empty_draft uuid;
  v_no_offer boolean := false; v_wrong_offer boolean := false; v_offer_update uuid;
BEGIN
  -- Inactive, so trg_keep_offer stays quiet.
  INSERT INTO public.business_offers (business_id, title, active) VALUES (v_biz, 'zz-updates-check', false)
  RETURNING id INTO v_mine;
  INSERT INTO public.business_offers (business_id, title, active) VALUES (pg_temp.id('other'), 'zz-updates-check', false)
  RETURNING id INTO v_theirs;

  PERFORM pg_temp.chk_as('authenticated', v_owner);
  BEGIN
    INSERT INTO public.business_updates (business_id, type, body, published_at, notify_keepers)
    VALUES (v_biz, 'announcement', 'zz-updates-check', now() + interval '15 days', false);
  EXCEPTION WHEN raise_exception THEN v_far := true;
  END;
  INSERT INTO public.business_updates (business_id, type, body, published_at, notify_keepers)
  VALUES (v_biz, 'announcement', 'zz-updates-check', now() + interval '13 days', false)
  RETURNING id INTO v_near;

  BEGIN
    INSERT INTO public.business_updates (business_id, type, published_at, notify_keepers)
    VALUES (v_biz, 'announcement', now(), false);
  EXCEPTION WHEN raise_exception THEN v_empty := true;
  END;
  INSERT INTO public.business_updates (business_id, type) VALUES (v_biz, 'announcement')
  RETURNING id INTO v_empty_draft;

  BEGIN
    INSERT INTO public.business_updates (business_id, type, body, published_at, notify_keepers)
    VALUES (v_biz, 'offer', 'zz-updates-check', now(), false);
  EXCEPTION WHEN raise_exception THEN v_no_offer := true;
  END;
  BEGIN
    INSERT INTO public.business_updates (business_id, type, body, published_at, notify_keepers, offer_id)
    VALUES (v_biz, 'offer', 'zz-updates-check', now(), false, v_theirs);
  EXCEPTION WHEN raise_exception THEN v_wrong_offer := true;
  END;
  INSERT INTO public.business_updates (business_id, type, body, published_at, notify_keepers, offer_id)
  VALUES (v_biz, 'offer', 'zz-updates-check', now(), false, v_mine)
  RETURNING id INTO v_offer_update;
  RESET ROLE; PERFORM set_config('request.jwt.claims', '', true);

  ASSERT v_far, 'schedule_limit_14_days: an update was scheduled 15 days ahead';
  ASSERT v_near IS NOT NULL, 'schedule_limit_14_days: 13 days ahead was refused';
  PERFORM pg_temp.chk_pass('schedule_limit_14_days');
  ASSERT v_empty, 'empty_update_refused: an empty update was published';
  ASSERT v_empty_draft IS NOT NULL, 'empty_update_refused: an empty draft was refused';
  PERFORM pg_temp.chk_pass('empty_update_refused');
  ASSERT v_no_offer, 'offer_needs_own_offer: an offer update went live with no offer';
  ASSERT v_wrong_offer, 'offer_needs_own_offer: an offer update used another business''s offer';
  ASSERT v_offer_update IS NOT NULL, 'offer_needs_own_offer: an offer update with its own offer was refused';
  PERFORM pg_temp.chk_pass('offer_needs_own_offer');
END $$;

-- 18, 19, 20 -----------------------------------------------------------------
DO $$
DECLARE
  v_owner uuid := pg_temp.id('owner');
  v_biz uuid := pg_temp.id('biz');
  v_draft uuid := pg_temp.chk_update(NULL);
  v_live uuid := pg_temp.chk_update(now() - interval '1 hour');
  v_path text;
  v_cap boolean := false; v_locked boolean := false; v_bad boolean := false;
BEGIN
  FOR i IN 1..10 LOOP PERFORM pg_temp.chk_media(v_draft, 'p' || i || '.webp'); END LOOP;
  BEGIN
    PERFORM pg_temp.chk_media(v_draft, 'p11.webp');
  EXCEPTION WHEN raise_exception THEN v_cap := true;
  END;
  ASSERT v_cap, 'media_cap_10: an eleventh photo was accepted';
  PERFORM pg_temp.chk_pass('media_cap_10');

  v_path := pg_temp.chk_path(v_live, 'late.webp');
  PERFORM pg_temp.chk_as('authenticated', v_owner);
  BEGIN
    INSERT INTO public.business_update_media (update_id, business_id, kind, storage_path)
    VALUES (v_live, v_biz, 'image', v_path);
  EXCEPTION WHEN raise_exception THEN v_locked := true;
  END;
  RESET ROLE; PERFORM set_config('request.jwt.claims', '', true);
  ASSERT v_locked, 'media_locked_when_live: a photo was added to a live update';
  PERFORM pg_temp.chk_pass('media_locked_when_live');

  BEGIN
    INSERT INTO public.business_update_media (update_id, business_id, kind, storage_path)
    VALUES (v_draft, v_biz, 'image', pg_temp.id('other')::text || '/' || v_draft::text || '/x.webp');
  EXCEPTION WHEN raise_exception THEN v_bad := true;
  END;
  ASSERT v_bad, 'media_path_must_match: a media row pointed into another business''s folder';
  PERFORM pg_temp.chk_pass('media_path_must_match');
END $$;

-- 21, 22, 23 -----------------------------------------------------------------
DO $$
DECLARE
  v_owner uuid := pg_temp.id('owner');
  v_support uuid := pg_temp.id('support');
  v_biz uuid := pg_temp.id('biz');
  v_active uuid := pg_temp.chk_update(NULL);
  v_ended uuid := pg_temp.chk_update(NULL);
  v_active_path text; v_ended_path text; v_good_path text;
  v_anon_active int := 0; v_anon_ended int := 0; v_member int := 0;
  v_bad boolean := false; v_good boolean := false;
BEGIN
  v_active_path := pg_temp.chk_media(v_active, 'a.webp');
  v_ended_path  := pg_temp.chk_media(v_ended, 'e.webp');
  UPDATE public.business_updates SET published_at = now() - interval '1 hour' WHERE id = v_active;
  UPDATE public.business_updates SET published_at = now() - interval '25 hours' WHERE id = v_ended;
  INSERT INTO storage.objects (bucket_id, name) VALUES
    ('business-updates', v_active_path), ('business-updates', v_ended_path);

  PERFORM pg_temp.chk_as('anon', NULL);
  BEGIN
    SELECT count(*) INTO v_anon_active FROM storage.objects WHERE bucket_id = 'business-updates' AND name = v_active_path;
    SELECT count(*) INTO v_anon_ended  FROM storage.objects WHERE bucket_id = 'business-updates' AND name = v_ended_path;
  EXCEPTION WHEN insufficient_privilege THEN v_anon_active := -1;
  END;
  RESET ROLE; PERFORM set_config('request.jwt.claims', '', true);
  ASSERT v_anon_active = 1, format('anon_cannot_read_ended_media: anon cannot read live media (got %s), so the check proves nothing', v_anon_active);
  ASSERT v_anon_ended = 0, 'anon_cannot_read_ended_media: anon can read media of an ended update';
  PERFORM pg_temp.chk_pass('anon_cannot_read_ended_media');

  PERFORM pg_temp.chk_as('authenticated', v_support);
  SELECT count(*) INTO v_member FROM storage.objects WHERE bucket_id = 'business-updates' AND name = v_ended_path;
  RESET ROLE; PERFORM set_config('request.jwt.claims', '', true);
  ASSERT v_member = 1, 'member_reads_archive_media: a member cannot read their archived media';
  PERFORM pg_temp.chk_pass('member_reads_archive_media');

  ASSERT public.update_path_business('not-a-uuid/x.jpg') IS NULL, 'bad_path_refused: a malformed path parsed as a business';
  v_good_path := pg_temp.chk_path(pg_temp.chk_update(NULL), 'ok.webp');
  PERFORM pg_temp.chk_as('authenticated', v_owner);
  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('business-updates', 'not-a-uuid/x.jpg');
  EXCEPTION WHEN insufficient_privilege THEN v_bad := true;
  END;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('business-updates', v_good_path);
    v_good := true;
  EXCEPTION WHEN insufficient_privilege THEN v_good := false;
  END;
  RESET ROLE; PERFORM set_config('request.jwt.claims', '', true);
  ASSERT v_bad, 'bad_path_refused: an upload with a malformed path was accepted';
  ASSERT v_good, 'bad_path_refused: the owner cannot upload to their own folder, so the check proves nothing';
  PERFORM pg_temp.chk_pass('bad_path_refused');
END $$;

-- 24, 25 ---------------------------------------------------------------------
DO $$
DECLARE
  v_now uuid := pg_temp.chk_update(now() - interval '1 minute', 'announcement', true);
  v_due uuid; v_ended uuid; v_sent int;
BEGIN
  ASSERT (SELECT notified_at FROM public.business_updates WHERE id = v_now) IS NOT NULL,
    'alert_sets_notified_at: a live update with alerts on was not marked as sent';
  PERFORM pg_temp.chk_pass('alert_sets_notified_at');

  ALTER TABLE public.business_updates DISABLE TRIGGER trg_bu_20_alert;
  v_due   := pg_temp.chk_update(now() - interval '10 minutes', 'announcement', true);
  v_ended := pg_temp.chk_update(now() - interval '10 minutes', 'announcement', true);
  UPDATE public.business_updates SET ended_at = now() WHERE id = v_ended;
  ALTER TABLE public.business_updates ENABLE TRIGGER trg_bu_20_alert;
  ASSERT (SELECT notified_at FROM public.business_updates WHERE id = v_due) IS NULL,
    'dispatch_sends_due_scheduled: setup failed, the due update was already sent';

  v_sent := public.dispatch_scheduled_update_alerts();
  ASSERT v_sent >= 1, 'dispatch_sends_due_scheduled: the dispatcher sent nothing';
  ASSERT (SELECT notified_at FROM public.business_updates WHERE id = v_due) IS NOT NULL,
    'dispatch_sends_due_scheduled: the due update was not sent';
  ASSERT (SELECT notified_at FROM public.business_updates WHERE id = v_ended) IS NULL,
    'dispatch_sends_due_scheduled: an ended update was sent';
  PERFORM pg_temp.chk_pass('dispatch_sends_due_scheduled');
END $$;

-- 26, 27 ---------------------------------------------------------------------
DO $$
DECLARE
  v_owner uuid := pg_temp.id('owner');
  v_live uuid := pg_temp.chk_update(now() - interval '1 hour');
  v_old  uuid := pg_temp.chk_update(now() - interval '25 hours');
  v_old_refused boolean := false; v_owner_sees int;
BEGIN
  PERFORM pg_temp.chk_as('anon', NULL);
  INSERT INTO public.business_update_reports (update_id, reason, detail, status)
  VALUES (v_live, 'spam', 'zz-updates-check', 'actioned');
  BEGIN
    INSERT INTO public.business_update_reports (update_id, reason) VALUES (v_old, 'spam');
  EXCEPTION WHEN insufficient_privilege THEN v_old_refused := true;
  END;
  RESET ROLE; PERFORM set_config('request.jwt.claims', '', true);

  ASSERT (SELECT count(*) FROM public.business_update_reports
          WHERE update_id = v_live AND business_id = pg_temp.id('biz') AND status = 'open') = 1,
    'report_insert_anon_ok: the anonymous report was not filed as open against the right business';
  ASSERT v_old_refused, 'report_insert_anon_ok: a report on an ended update was accepted';
  PERFORM pg_temp.chk_pass('report_insert_anon_ok');

  PERFORM pg_temp.chk_as('authenticated', v_owner);
  SELECT count(*) INTO v_owner_sees FROM public.business_update_reports WHERE update_id = v_live;
  RESET ROLE; PERFORM set_config('request.jwt.claims', '', true);
  ASSERT v_owner_sees = 0, 'report_hidden_from_owner: the business can read reports about itself';
  PERFORM pg_temp.chk_pass('report_hidden_from_owner');
END $$;

-- 29 (fix pass) ---------------------------------------------------------------
-- Deleting an offer releases the updates that announced it. The FK's SET NULL
-- runs in the owner's session, so the guard must let it through.
DO $$
DECLARE
  v_owner uuid := pg_temp.id('owner');
  v_offer uuid; v_live uuid; v_sched uuid; v_ok boolean := true; v_err text;
BEGIN
  INSERT INTO public.business_offers (business_id, title, active)
  VALUES (pg_temp.id('biz'), 'zz-updates-check', false) RETURNING id INTO v_offer;
  INSERT INTO public.business_updates (business_id, type, body, published_at, notify_keepers, offer_id)
  VALUES (pg_temp.id('biz'), 'offer', 'zz-updates-check', now() - interval '30 hours', false, v_offer)
  RETURNING id INTO v_live;
  INSERT INTO public.business_updates (business_id, type, body, published_at, notify_keepers, offer_id)
  VALUES (pg_temp.id('biz'), 'offer', 'zz-updates-check', now() + interval '1 day', false, v_offer)
  RETURNING id INTO v_sched;

  PERFORM pg_temp.chk_as('authenticated', v_owner);
  BEGIN
    DELETE FROM public.business_offers WHERE id = v_offer;
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM;
  END;
  RESET ROLE; PERFORM set_config('request.jwt.claims', '', true);

  ASSERT v_ok, format('offer_delete_releases_updates: the owner could not delete an announced offer (%s)', v_err);
  ASSERT NOT EXISTS (SELECT 1 FROM public.business_offers WHERE id = v_offer),
    'offer_delete_releases_updates: the offer was not deleted';
  ASSERT (SELECT offer_id FROM public.business_updates WHERE id = v_live) IS NULL
     AND (SELECT offer_id FROM public.business_updates WHERE id = v_sched) IS NULL,
    'offer_delete_releases_updates: updates still point at the deleted offer';
  PERFORM pg_temp.chk_pass('offer_delete_releases_updates');
END $$;

-- 30 (fix pass) ---------------------------------------------------------------
-- Files can only be written while their update is a draft or scheduled, never
-- into a folder with no update behind it, and a hidden update's files stay.
DO $$
DECLARE
  v_owner uuid := pg_temp.id('owner');
  v_biz uuid := pg_temp.id('biz');
  v_live uuid := pg_temp.chk_update(now() - interval '1 hour');
  v_hid  uuid := pg_temp.chk_update(now() - interval '1 hour');
  v_old  uuid := pg_temp.chk_update(now() - interval '25 hours');
  v_live_path text; v_hid_path text; v_old_path text; v_ghost_path text;
  v_live_refused boolean := false; v_ghost_refused boolean := false;
  v_hid_deleted int; v_old_deleted int;
BEGIN
  v_live_path  := pg_temp.chk_path(v_live, 'swap.webp');
  v_hid_path   := pg_temp.chk_path(v_hid, 'evidence.webp');
  v_old_path   := pg_temp.chk_path(v_old, 'old.webp');
  v_ghost_path := v_biz::text || '/' || gen_random_uuid()::text || '/ghost.webp';
  UPDATE public.business_updates SET moderation_status = 'hidden' WHERE id = v_hid;
  INSERT INTO storage.objects (bucket_id, name) VALUES
    ('business-updates', v_hid_path), ('business-updates', v_old_path);

  PERFORM pg_temp.chk_as('authenticated', v_owner);
  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('business-updates', v_live_path);
  EXCEPTION WHEN insufficient_privilege THEN v_live_refused := true;
  END;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('business-updates', v_ghost_path);
  EXCEPTION WHEN insufficient_privilege THEN v_ghost_refused := true;
  END;
  -- storage.protect_delete refuses every direct SQL delete (only the Storage
  -- API may delete), so the delete policy is checked through the function it
  -- calls, as the same caller.
  v_hid_deleted := CASE WHEN public.update_storage_writable(v_hid_path, true) THEN 1 ELSE 0 END;
  v_old_deleted := CASE WHEN public.update_storage_writable(v_old_path, true) THEN 1 ELSE 0 END;
  RESET ROLE; PERFORM set_config('request.jwt.claims', '', true);

  ASSERT v_live_refused, 'storage_locked_after_live: a file was written into a live update';
  ASSERT v_ghost_refused, 'storage_locked_after_live: a file was written into a folder with no update';
  ASSERT v_hid_deleted = 0, 'storage_locked_after_live: a hidden update''s file was deleted';
  ASSERT v_old_deleted = 1, 'storage_locked_after_live: an ended update''s file could not be cleaned up';
  PERFORM pg_temp.chk_pass('storage_locked_after_live');
END $$;

-- 31 (fix pass) ---------------------------------------------------------------
-- Turning alerts on after the 24 hours must not notify anyone.
DO $$
DECLARE
  v_owner uuid := pg_temp.id('owner');
  v_old uuid := pg_temp.chk_update(now() - interval '25 hours');
BEGIN
  PERFORM pg_temp.chk_as('authenticated', v_owner);
  UPDATE public.business_updates SET notify_keepers = true WHERE id = v_old;
  RESET ROLE; PERFORM set_config('request.jwt.claims', '', true);
  ASSERT (SELECT notified_at FROM public.business_updates WHERE id = v_old) IS NULL,
    'no_alert_after_expiry: an expired update sent a keeper alert';
  PERFORM pg_temp.chk_pass('no_alert_after_expiry');
END $$;

-- 32 (fix pass) ---------------------------------------------------------------
-- A live update keeps its id and creation time, so links already sent work.
DO $$
DECLARE
  v_owner uuid := pg_temp.id('owner');
  v_live uuid := pg_temp.chk_update(now() - interval '1 hour');
  v_created timestamptz;
BEGIN
  SELECT created_at INTO v_created FROM public.business_updates WHERE id = v_live;
  PERFORM pg_temp.chk_as('authenticated', v_owner);
  UPDATE public.business_updates SET id = gen_random_uuid(), created_at = now() - interval '9 days'
  WHERE id = v_live;
  RESET ROLE; PERFORM set_config('request.jwt.claims', '', true);
  ASSERT EXISTS (SELECT 1 FROM public.business_updates WHERE id = v_live AND created_at = v_created),
    'identity_locked: a client changed an update''s id or creation time';
  PERFORM pg_temp.chk_pass('identity_locked');
END $$;

-- 33 (phase 2) ----------------------------------------------------------------
-- publish_business_update stamps the server's now(), and only for someone who
-- may post for the business (20261112010000).
DO $$
DECLARE
  v_owner uuid := pg_temp.id('owner');
  v_draft uuid := pg_temp.chk_update(NULL);
  v_refused boolean := false;
  v_at timestamptz;
BEGIN
  PERFORM pg_temp.chk_as('authenticated', pg_temp.id('stranger'));
  BEGIN
    PERFORM public.publish_business_update(v_draft, NULL);
  EXCEPTION WHEN insufficient_privilege THEN v_refused := true;
  END;
  RESET ROLE; PERFORM set_config('request.jwt.claims', '', true);

  PERFORM pg_temp.chk_as('authenticated', v_owner);
  PERFORM public.publish_business_update(v_draft, NULL);
  RESET ROLE; PERFORM set_config('request.jwt.claims', '', true);

  SELECT published_at INTO v_at FROM public.business_updates WHERE id = v_draft;
  ASSERT v_refused, 'publish_uses_server_clock: a stranger published someone else''s update';
  ASSERT v_at = now(), format('publish_uses_server_clock: published_at was %s, not the server''s now()', v_at);
  PERFORM pg_temp.chk_pass('publish_uses_server_clock');
END $$;

-- 34, 35 (phase 5) -------------------------------------------------------------
-- business_update_stats: distinct sessions per update, the owner's own visits
-- left out, and nothing at all for anyone who is not the owner (invoker rights).
DO $$
DECLARE
  v_owner uuid := pg_temp.id('owner');
  v_biz uuid := pg_temp.id('biz');
  v_u uuid := pg_temp.chk_update(now() - interval '1 hour');
  v_people int; v_cta int; v_stranger_rows int;
BEGIN
  INSERT INTO public.analytics_events (name, props, user_id, business_id, session_id, path) VALUES
    ('update_viewed', jsonb_build_object('update_id', v_u::text), NULL, v_biz, 'zz-s1', '/zz'),
    ('update_viewed', jsonb_build_object('update_id', v_u::text), NULL, v_biz, 'zz-s1', '/zz'),
    ('update_viewed', jsonb_build_object('update_id', v_u::text), NULL, v_biz, 'zz-s2', '/zz'),
    ('update_viewed', jsonb_build_object('update_id', v_u::text), v_owner, v_biz, 'zz-owner', '/zz'),
    ('update_cta_clicked', jsonb_build_object('update_id', v_u::text), NULL, v_biz, 'zz-s2', '/zz');

  PERFORM pg_temp.chk_as('authenticated', v_owner);
  SELECT people, cta_taps INTO v_people, v_cta FROM public.business_update_stats(v_biz) WHERE update_id = v_u;
  RESET ROLE; PERFORM set_config('request.jwt.claims', '', true);
  ASSERT v_people = 2, format('stats_exclude_owner: expected 2 people (two sessions, owner left out), got %s', v_people);
  ASSERT v_cta = 1, format('stats_exclude_owner: expected 1 button tap, got %s', v_cta);
  PERFORM pg_temp.chk_pass('stats_exclude_owner');

  PERFORM pg_temp.chk_as('authenticated', pg_temp.id('stranger'));
  SELECT count(*) INTO v_stranger_rows FROM public.business_update_stats(v_biz);
  RESET ROLE; PERFORM set_config('request.jwt.claims', '', true);
  ASSERT v_stranger_rows = 0, format('stats_owner_only: a stranger read %s rows of another business''s counts', v_stranger_rows);
  PERFORM pg_temp.chk_pass('stats_owner_only');
END $$;

-- 36, 37 (phase 5 fix pass) -------------------------------------------------------
-- The owner's whole session is left out (signed-out events in it too), and so are
-- sessions of the business's own team.
DO $$
DECLARE
  v_owner uuid := pg_temp.id('owner');
  v_support uuid := pg_temp.id('support');
  v_biz uuid := pg_temp.id('biz');
  v_u uuid := pg_temp.chk_update(now() - interval '1 hour');
  v_people int;
BEGIN
  INSERT INTO public.analytics_events (name, props, user_id, business_id, session_id, path) VALUES
    -- The owner, signed in for one event and not for the next, in one session.
    ('business_viewed', '{}'::jsonb, v_owner, v_biz, 'zz-own', '/zz'),
    ('update_viewed', jsonb_build_object('update_id', v_u::text), NULL, v_biz, 'zz-own', '/zz'),
    -- A team member (support role, from the fixtures).
    ('update_viewed', jsonb_build_object('update_id', v_u::text), v_support, v_biz, 'zz-team', '/zz'),
    -- One real visitor.
    ('update_viewed', jsonb_build_object('update_id', v_u::text), NULL, v_biz, 'zz-visitor', '/zz');

  PERFORM pg_temp.chk_as('authenticated', v_owner);
  SELECT people INTO v_people FROM public.business_update_stats(v_biz) WHERE update_id = v_u;
  RESET ROLE; PERFORM set_config('request.jwt.claims', '', true);
  ASSERT v_people = 1, format('stats_exclude_own_sessions: expected 1 visitor, got %s', v_people);
  PERFORM pg_temp.chk_pass('stats_exclude_own_sessions');
END $$;

-- Unhiding never sends a keeper alert, now or later from the scheduler: an update
-- hidden before its alert went out stays quiet when it comes back.
DO $$
DECLARE
  v_admin uuid := pg_temp.id('admin');
  v_u uuid;
  v_notified timestamptz;
  v_sent int;
  v_before int;
BEGIN
  INSERT INTO public.business_updates (business_id, type, body, published_at, notify_keepers, moderation_status)
  VALUES (pg_temp.id('biz'), 'announcement', 'zz-updates-check', now() - interval '1 hour', true, 'hidden')
  RETURNING id INTO v_u;
  ASSERT (SELECT notified_at FROM public.business_updates WHERE id = v_u) IS NULL,
    'unhide_sends_no_alert: setup failed, a hidden update was alerted';
  -- Earlier checks in this transaction also sent alerts at the same now(), so
  -- the unhide is judged by what it adds, not by what is there.
  SELECT count(*) INTO v_before FROM public.keep_sends WHERE business_id = pg_temp.id('biz');

  PERFORM pg_temp.chk_as('authenticated', v_admin);
  UPDATE public.business_updates SET moderation_status = 'ok', moderation_note = NULL WHERE id = v_u;
  RESET ROLE; PERFORM set_config('request.jwt.claims', '', true);

  SELECT count(*) - v_before INTO v_sent FROM public.keep_sends WHERE business_id = pg_temp.id('biz');
  SELECT notified_at INTO v_notified FROM public.business_updates WHERE id = v_u;
  ASSERT v_sent = 0, 'unhide_sends_no_alert: unhiding sent a keeper alert';
  ASSERT v_notified IS NOT NULL, 'unhide_sends_no_alert: notified_at left empty, so the scheduler would alert later';
  PERFORM pg_temp.chk_pass('unhide_sends_no_alert');
END $$;

-- Summary row (visible even when the client drops NOTICEs), then discard it all.
SELECT string_agg(name, ', ') AS checks_passed, count(*) AS n_passed
  FROM unnest(string_to_array(rtrim(current_setting('chk.passed'), ','), ',')) AS name;

ROLLBACK;
