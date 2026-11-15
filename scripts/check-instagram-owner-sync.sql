-- Behaviour checks for supabase/migrations/20261118010000_instagram_owner_handle_sync.sql.
--
-- Runs against PRODUCTION through scripts/check-instagram-owner-sync.mjs, and
-- is safe there because it can never commit. The runner wraps it in
-- BEGIN ... ROLLBACK and, with --with-migration, puts the migration itself
-- inside the same transaction first: that is the pre-apply dry run.
-- A test (src/test/instagramOwnerSyncCheckSql.test.ts) keeps it free of COMMIT.
--
-- What it touches, all rolled back: the Instagram link of one real claimed
-- business and one real unclaimed business, edited as their owner would edit
-- them, and the rows the trigger writes. The pg_net queue is a table too, so
-- the poke the trigger queues is discarded with everything else and no HTTP
-- call is ever made.
--
-- Each check is a DO block that ASSERTs; the first failure aborts with the
-- check's name. The final SELECT lists what passed.

SELECT set_config('chk.passed', '', false);

CREATE FUNCTION pg_temp.chk_pass(p_name text)
RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM set_config('chk.passed', current_setting('chk.passed', true) || p_name || ',', false);
END $f$;

-- Act as a signed-in user (auth.uid() and auth.role() read these claims).
CREATE FUNCTION pg_temp.chk_as(p_user uuid)
RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
END $f$;

CREATE FUNCTION pg_temp.chk_claimed()
RETURNS uuid LANGUAGE sql AS $f$
  SELECT id FROM public.businesses
  WHERE claim_status = 'claimed' AND user_id IS NOT NULL
  ORDER BY id LIMIT 1;
$f$;

CREATE FUNCTION pg_temp.chk_pending(p_business uuid)
RETURNS bigint LANGUAGE sql AS $f$
  SELECT count(*) FROM public.instagram_sync_requests
  WHERE business_id = p_business AND status = 'pending';
$f$;

CREATE FUNCTION pg_temp.chk_set_ig(p_business uuid, p_value text)
RETURNS void LANGUAGE sql AS $f$
  UPDATE public.businesses
     SET social_links = coalesce(social_links, '{}'::jsonb) || jsonb_build_object('instagram', p_value)
   WHERE id = p_business;
$f$;

-- 1 ---------------------------------------------------------------------------
-- The SQL normaliser agrees with normalizeHandle() on the same cases as
-- src/lib/instagramOwnerSync.test.ts (HANDLE_CASES).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('@Business_Name', 'business_name'),
    ('businessname', 'businessname'),
    ('instagram.com/businessname/', 'businessname'),
    ('https://www.instagram.com/businessname?igsh=abc', 'businessname'),
    ('https://instagram.com/yemzoarts', 'yemzoarts'),
    ('  @dare.koya  ', 'dare.koya'),
    ('https://www.instagram.com/p/ABC123/', NULL),
    ('https://www.instagram.com/reel/XYZ/', NULL),
    ('not a handle!', NULL),
    ('', NULL),
    ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', NULL)
  ) AS t(raw, expected) LOOP
    ASSERT public.instagram_handle_of(r.raw) IS NOT DISTINCT FROM r.expected,
      format('normaliser_parity: %L gave %L, expected %L', r.raw, public.instagram_handle_of(r.raw), r.expected);
  END LOOP;
  ASSERT public.instagram_handle_of(NULL) IS NULL, 'normaliser_parity: null';
  PERFORM pg_temp.chk_pass('normaliser_parity');
END $$;

-- 2 ---------------------------------------------------------------------------
-- The owner of a claimed business sets a new handle: one pending request,
-- with the normalised handle, and a poke queued in pg_net (when the
-- automation secret is configured).
DO $$
DECLARE
  v_b uuid := pg_temp.chk_claimed();
  v_owner uuid;
  v_queue_before bigint;
  v_has_secret boolean;
BEGIN
  ASSERT v_b IS NOT NULL, 'owner_change_queues: no claimed business to test with';
  SELECT user_id INTO v_owner FROM public.businesses WHERE id = v_b;
  DELETE FROM public.instagram_sync_requests WHERE business_id = v_b;
  SELECT count(*) INTO v_queue_before FROM net.http_request_queue;
  SELECT exists (SELECT 1 FROM public.private_config WHERE key = 'automation_secret') INTO v_has_secret;

  PERFORM pg_temp.chk_as(v_owner);
  PERFORM pg_temp.chk_set_ig(v_b, 'https://www.instagram.com/ZZ_Check_Handle/');

  ASSERT pg_temp.chk_pending(v_b) = 1, 'owner_change_queues: expected exactly one pending request';
  ASSERT (SELECT handle FROM public.instagram_sync_requests WHERE business_id = v_b AND status = 'pending')
         = 'zz_check_handle', 'owner_change_queues: handle not normalised';
  IF v_has_secret THEN
    ASSERT (SELECT count(*) FROM net.http_request_queue) = v_queue_before + 1,
      'owner_change_queues: no poke queued in pg_net';
  END IF;
  PERFORM pg_temp.chk_pass('owner_change_queues');
END $$;

-- 3 ---------------------------------------------------------------------------
-- The same account written differently is not a change; a different account
-- replaces the waiting request rather than adding a second one.
DO $$
DECLARE
  v_b uuid := pg_temp.chk_claimed();
BEGIN
  PERFORM pg_temp.chk_set_ig(v_b, '@zz_check_handle');
  ASSERT pg_temp.chk_pending(v_b) = 1, 'reformat_is_no_change: a reformatted link changed the queue';
  ASSERT (SELECT count(*) FROM public.instagram_sync_requests WHERE business_id = v_b) = 1,
    'reformat_is_no_change: a second request was written';

  PERFORM pg_temp.chk_set_ig(v_b, 'zz_check_other');
  ASSERT pg_temp.chk_pending(v_b) = 1, 'new_handle_replaces_pending: more than one pending';
  ASSERT (SELECT handle FROM public.instagram_sync_requests WHERE business_id = v_b AND status = 'pending')
         = 'zz_check_other', 'new_handle_replaces_pending: handle not replaced';
  PERFORM pg_temp.chk_pass('reformat_is_no_change');
  PERFORM pg_temp.chk_pass('new_handle_replaces_pending');
END $$;

-- 4 ---------------------------------------------------------------------------
-- Editing something else, or removing the handle, queues nothing.
DO $$
DECLARE
  v_b uuid := pg_temp.chk_claimed();
BEGIN
  DELETE FROM public.instagram_sync_requests WHERE business_id = v_b;
  UPDATE public.businesses SET tagline = coalesce(tagline, '') || ' ' WHERE id = v_b;
  UPDATE public.businesses SET social_links = social_links - 'instagram' WHERE id = v_b;
  ASSERT (SELECT count(*) FROM public.instagram_sync_requests WHERE business_id = v_b) = 0,
    'other_edits_queue_nothing: a request was written';
  PERFORM pg_temp.chk_pass('other_edits_queue_nothing');
END $$;

-- 5 ---------------------------------------------------------------------------
-- An unclaimed listing changing its handle (an admin edit) queues nothing:
-- the existing rule for unclaimed listings is unchanged.
DO $$
DECLARE
  v_b uuid;
BEGIN
  SELECT id INTO v_b FROM public.businesses
  WHERE user_id IS NULL AND coalesce(claim_status, 'unclaimed') <> 'claimed'
  ORDER BY id LIMIT 1;
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM pg_temp.chk_set_ig(v_b, 'zz_check_unclaimed');
  ASSERT (SELECT count(*) FROM public.instagram_sync_requests WHERE business_id = v_b) = 0,
    'unclaimed_queues_nothing: a request was written for an unclaimed listing';
  PERFORM pg_temp.chk_pass('unclaimed_queues_nothing');
END $$;

-- 6 ---------------------------------------------------------------------------
-- The owner's master switch: sync_enabled = false queues nothing and takes
-- the business out of the pool.
DO $$
DECLARE
  v_b uuid := pg_temp.chk_claimed();
  v_owner uuid;
BEGIN
  SELECT user_id INTO v_owner FROM public.businesses WHERE id = v_b;
  INSERT INTO public.business_sync_preferences (business_id, owner_id, sync_enabled)
  VALUES (v_b, v_owner, false)
  ON CONFLICT (business_id) DO UPDATE SET sync_enabled = false;
  DELETE FROM public.instagram_sync_requests WHERE business_id = v_b;

  PERFORM pg_temp.chk_as(v_owner);
  PERFORM pg_temp.chk_set_ig(v_b, 'zz_check_switched_off');
  ASSERT (SELECT count(*) FROM public.instagram_sync_requests WHERE business_id = v_b) = 0,
    'sync_switch_respected: a request was written with syncing off';
  ASSERT NOT EXISTS (SELECT 1 FROM public.instagram_gallery_refresh_pool() p WHERE p.business_id = v_b),
    'sync_switch_respected: business still in the pool with syncing off';

  UPDATE public.business_sync_preferences SET sync_enabled = true WHERE business_id = v_b;
  PERFORM pg_temp.chk_pass('sync_switch_respected');
END $$;

-- 7 ---------------------------------------------------------------------------
-- The pool reaches past the old 88-business cap, includes claimed businesses
-- that have a handle, and every row has a usable handle.
DO $$
DECLARE
  v_n bigint;
  v_b uuid := pg_temp.chk_claimed();
BEGIN
  SELECT count(*) INTO v_n FROM public.instagram_gallery_refresh_pool();
  ASSERT v_n > 88, format('pool_uncapped: only %s businesses', v_n);
  ASSERT NOT EXISTS (SELECT 1 FROM public.instagram_gallery_refresh_pool() p
                     WHERE public.instagram_handle_of(p.instagram) IS NULL),
    'pool_uncapped: a business without a usable handle';

  PERFORM pg_temp.chk_set_ig(v_b, 'zz_check_pool');
  ASSERT EXISTS (SELECT 1 FROM public.instagram_gallery_refresh_pool() p WHERE p.business_id = v_b),
    'pool_includes_claimed: claimed business with a handle is not in the pool';
  PERFORM set_config('chk.pool', v_n::text, false);
  PERFORM pg_temp.chk_pass('pool_uncapped');
  PERFORM pg_temp.chk_pass('pool_includes_claimed');
END $$;

-- 8 ---------------------------------------------------------------------------
-- RLS: the owner reads their own request and cannot write one; another
-- signed-in user and anon read nothing.
DO $$
DECLARE
  v_b uuid := pg_temp.chk_claimed();
  v_owner uuid;
  v_seen bigint;
  v_denied boolean := false;
BEGIN
  SELECT user_id INTO v_owner FROM public.businesses WHERE id = v_b;
  PERFORM pg_temp.chk_as(v_owner);
  PERFORM pg_temp.chk_set_ig(v_b, 'zz_check_rls');

  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_seen FROM public.instagram_sync_requests WHERE business_id = v_b;
  ASSERT v_seen >= 1, 'owner_reads_own: owner cannot see their request';
  BEGIN
    INSERT INTO public.instagram_sync_requests (business_id, handle) VALUES (v_b, 'zz_check_forged');
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
  END;
  ASSERT v_denied, 'browser_cannot_write: an authenticated insert was allowed';

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_seen FROM public.instagram_sync_requests WHERE business_id = v_b;
  ASSERT v_seen = 0, 'stranger_reads_nothing: another user can see the request';
  RESET ROLE;

  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  SELECT count(*) INTO v_seen FROM public.instagram_sync_requests;
  ASSERT v_seen = 0, 'stranger_reads_nothing: anon can see requests';
  RESET ROLE;

  PERFORM pg_temp.chk_pass('owner_reads_own');
  PERFORM pg_temp.chk_pass('browser_cannot_write');
  PERFORM pg_temp.chk_pass('stranger_reads_nothing');
END $$;

-- 9 ---------------------------------------------------------------------------
-- The pool and the poke are not callable from a browser.
DO $$
BEGIN
  ASSERT NOT has_function_privilege('anon', 'public.instagram_gallery_refresh_pool()', 'execute'),
    'service_only: anon can execute the pool';
  ASSERT NOT has_function_privilege('authenticated', 'public.instagram_gallery_refresh_pool()', 'execute'),
    'service_only: authenticated can execute the pool';
  ASSERT NOT has_function_privilege('authenticated', 'public.poke_instagram_sync()', 'execute'),
    'service_only: authenticated can execute the poke';
  PERFORM pg_temp.chk_pass('service_only');
END $$;

-- Summary row (visible even when the client drops NOTICEs).
SELECT string_agg(name, ', ') AS checks_passed, count(*) AS n_passed,
       current_setting('chk.pool', true) AS pool_size
  FROM unnest(string_to_array(rtrim(current_setting('chk.passed'), ','), ',')) AS name;
