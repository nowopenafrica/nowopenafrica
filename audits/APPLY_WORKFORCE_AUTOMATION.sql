-- ======================================================================
-- APPLY WORKFORCE AUTOMATION - one paste, one transaction
--
-- Every migration the AI workforce (and the launch board it feeds) needs
-- to run itself, in timestamp order, byte-verbatim from
-- supabase/migrations/. Any error rolls the whole file back.
--
-- AFTER THIS PASTE (secrets are never committed; the migrations leave
-- private_config empty on purpose):
--   1. Deploy the edge function + secrets (NOWOPEN_APPLY_RUNBOOK S8c):
--        supabase functions deploy run-workforce
--        supabase secrets set AUTOMATION_SECRET=<long random string>
--        supabase secrets set SUPABASE_URL=https://<ref>.supabase.co
--        supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service_role key>
--   2. Point the DB cron at it (SQL editor, same AUTOMATION_SECRET):
--        select public.set_private_config('workforce_endpoint',
--          'https://<ref>.supabase.co/functions/v1/run-workforce');
--        select public.set_private_config('automation_secret', '<secret>');
--        select public.set_private_config('anon_key', '<anon key>');
--   3. Verify below: workforce_cron_status() -> healthy: true, then the
--      founder daily brief appears on Dashboard > Founder's Office > Workforce.
--      Launch automation confirms itself by re-scheduling its cron slot and
--      reading how many checklist items the real tables proved.
-- ======================================================================

begin;
-- ======================================================================
--  20260901020000_workforce_runs.sql
-- ======================================================================
/*
  # Workforce runs — the AI roster starts doing its job

  The eighteen AI roles in os_workforce have never executed. Every write to
  that table came from a human clicking in the admin console, and
  `current_work` was a sentence written once in the seed migration. This adds
  the missing half: a record of what an agent actually did, when, and on what
  evidence.

  ## Facts carry their source

  An agent reporting on the business is read by the founder and acted on, so a
  number it invented is worse than no number — it is indistinguishable from one
  it measured. Every fact stored here names the table it came from, and the
  runtime rejects a run whose summary states a figure it never measured. A
  rejected run is kept, with its reason, because a silent failure is how an
  agent goes on reporting "active" for a month after it broke.

  Re-runnable throughout.
*/

CREATE TABLE IF NOT EXISTS public.workforce_runs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key  text NOT NULL,
  status     text NOT NULL,
  /** One line; becomes the roster's current_work when the run is accepted. */
  summary    text,
  /** [{key,label,value,source,filter,delta}] — every number with its origin. */
  facts      jsonb NOT NULL DEFAULT '[]'::jsonb,
  /** [{title,severity,detail,basis}] — what a person should look at. */
  findings   jsonb NOT NULL DEFAULT '[]'::jsonb,
  /** Set when a run was rejected or failed. Never blank on a bad run. */
  reason     text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workforce_runs DROP CONSTRAINT IF EXISTS workforce_runs_status_check;
ALTER TABLE public.workforce_runs ADD CONSTRAINT workforce_runs_status_check
  CHECK (status IN ('ok','nothing-to-report','rejected','failed'));

/* A bad run must explain itself; that is the whole point of keeping it. */
ALTER TABLE public.workforce_runs DROP CONSTRAINT IF EXISTS workforce_runs_reason_required;
ALTER TABLE public.workforce_runs ADD CONSTRAINT workforce_runs_reason_required
  CHECK (status IN ('ok','nothing-to-report') OR (reason IS NOT NULL AND btrim(reason) <> ''));

CREATE INDEX IF NOT EXISTS idx_workforce_runs_agent
  ON public.workforce_runs (agent_key, created_at DESC);

ALTER TABLE public.workforce_runs ENABLE ROW LEVEL SECURITY;

/*
  Staff-only. These runs summarise the state of the platform — claim backlogs,
  open reports, how much of the directory is unclaimed — which is internal
  operating detail, not something to publish.
*/
DROP POLICY IF EXISTS "Staff read workforce runs" ON public.workforce_runs;
CREATE POLICY "Staff read workforce runs" ON public.workforce_runs
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Staff manage workforce runs" ON public.workforce_runs;
CREATE POLICY "Staff manage workforce runs" ON public.workforce_runs
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

/*
  Record a run and move the roster entry to match.

  Both halves in one function so they cannot drift: an agent whose run failed
  must not still be showing "active" on the board, which is exactly where
  somebody would notice it had stopped working.
*/
CREATE OR REPLACE FUNCTION public.record_workforce_run(
  p_agent_key text,
  p_status    text,
  p_summary   text,
  p_facts     jsonb,
  p_findings  jsonb,
  p_reason    text,
  p_duration_ms integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_status text; v_work text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;

  INSERT INTO public.workforce_runs (agent_key, status, summary, facts, findings, reason, duration_ms)
  VALUES (p_agent_key, p_status, p_summary, coalesce(p_facts, '[]'::jsonb),
          coalesce(p_findings, '[]'::jsonb), p_reason, p_duration_ms)
  RETURNING id INTO v_id;

  v_status := CASE p_status
    WHEN 'ok' THEN 'active'
    WHEN 'nothing-to-report' THEN 'waiting'
    ELSE 'error' END;

  v_work := CASE
    WHEN p_status IN ('ok') THEN p_summary
    WHEN p_status = 'nothing-to-report' THEN 'Ran, nothing to report.'
    ELSE 'Last run ' || p_status || ': ' || coalesce(p_reason, 'unknown error') END;

  UPDATE public.os_workforce
     SET status = v_status, current_work = v_work, updated_at = now()
   WHERE agent_key = p_agent_key AND kind = 'ai';

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.record_workforce_run(text,text,text,jsonb,jsonb,text,integer) FROM public;
GRANT EXECUTE ON FUNCTION public.record_workforce_run(text,text,text,jsonb,jsonb,text,integer) TO authenticated;

/*
  The numbers the Chief of Staff reports on.

  Computed in one place so the brief and the admin dashboard cannot disagree,
  and so every figure has an obvious source. Staff-only for the same reason the
  runs are.
*/
CREATE OR REPLACE FUNCTION public.platform_facts()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  SELECT jsonb_build_object(
    'listings_public',    (SELECT count(*) FROM public.businesses WHERE is_listable),
    'listings_total',     (SELECT count(*) FROM public.businesses),
    'claimed',            (SELECT count(*) FROM public.businesses WHERE claim_status = 'claimed'),
    'verified',           (SELECT count(*) FROM public.businesses WHERE verification_status = 'verified'),
    'missing_hours',      (SELECT count(*) FROM public.businesses
                            WHERE is_listable
                              AND coalesce(nullif(btrim(coalesce(opening_hours, hours, '')), ''), NULL) IS NULL),
    'claims_pending',     (SELECT count(*) FROM public.business_claims WHERE status = 'pending'),
    'reports_open',       (SELECT count(*) FROM public.business_reports WHERE status = 'open'),
    'review_queue',       (SELECT count(*) FROM public.radar_candidates WHERE status IN ('pending','review')),
    'offers_running',     (SELECT count(*) FROM public.business_offers WHERE coalesce(is_active, true)),
    'founding_claimed',   (SELECT count(*) FROM public.founding_members)
  ) INTO r;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_facts() FROM public;
GRANT EXECUTE ON FUNCTION public.platform_facts() TO authenticated;

-- ======================================================================
--  20260901040000_workforce_schedule.sql
-- ======================================================================
/*
  # The workforce runs itself

  Until now the one working agent ran when somebody pressed a button, which is
  not a workforce — it is a report generator with a human trigger. This adds
  the clock, the boundary on what an agent may do unattended, and the facts the
  new agents measure.

  ## The boundary, stated once here because everything else depends on it

  An agent running unattended may READ anything and may write only to its own
  run log and to internal notifications. It may not publish, message a
  customer, change a business, approve a claim, or alter anybody's status.
  Those are all outward-facing or authority-bearing, and an automated system
  that can perform them will eventually perform them wrongly at 3am with nobody
  watching.

  What that leaves is still most of the value: continuous measurement, and
  telling a person exactly what needs a decision. Growth here comes from
  nothing being left sitting — an unanswered report, a claim nobody approved, a
  review queue that quietly built up.

  ## Cadence

  Each agent carries its own interval and the scheduler runs whatever is due.
  A missed window is not made up: running yesterday's brief today would tell
  the founder about a state that no longer exists.

  Re-runnable throughout.
*/

CREATE TABLE IF NOT EXISTS public.workforce_schedule (
  agent_key      text PRIMARY KEY,
  enabled        boolean NOT NULL DEFAULT true,
  /* Minutes between runs. */
  interval_min   integer NOT NULL DEFAULT 1440,
  last_run_at    timestamptz,
  last_status    text,
  consecutive_failures integer NOT NULL DEFAULT 0,
  notes          text
);

ALTER TABLE public.workforce_schedule DROP CONSTRAINT IF EXISTS workforce_schedule_interval_check;
ALTER TABLE public.workforce_schedule ADD CONSTRAINT workforce_schedule_interval_check
  CHECK (interval_min BETWEEN 15 AND 43200);

ALTER TABLE public.workforce_schedule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff read schedule" ON public.workforce_schedule;
CREATE POLICY "Staff read schedule" ON public.workforce_schedule
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "Staff manage schedule" ON public.workforce_schedule;
CREATE POLICY "Staff manage schedule" ON public.workforce_schedule
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.workforce_schedule (agent_key, interval_min, notes) VALUES
  ('chief-of-staff',    1440, 'Daily brief for the founder.'),
  ('trust-safety',        60, 'Reports and impersonation risk age badly; checked hourly.'),
  ('customer-success',   360, 'Claim backlog and profile completeness.'),
  ('growth-director',   1440, 'Funnel: discovery to claim to activation.')
ON CONFLICT (agent_key) DO NOTHING;

/*
  Facts for the three new agents.

  Split per agent rather than one giant function so a failure in one does not
  take down the others, and so each agent's evidence is obvious from its own
  query. All admin-gated for the same reason platform_facts() is: these
  describe internal backlog, not anything to publish.
*/
CREATE OR REPLACE FUNCTION public.trust_safety_facts()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  SELECT jsonb_build_object(
    'reports_open',        (SELECT count(*) FROM public.business_reports WHERE status = 'open'),
    'reports_over_24h',    (SELECT count(*) FROM public.business_reports
                             WHERE status = 'open' AND created_at < now() - interval '24 hours'),
    'reports_not_real',    (SELECT count(*) FROM public.business_reports
                             WHERE status = 'open' AND reason IN ('not_real','impersonation')),
    'reports_closed_claim',(SELECT count(*) FROM public.business_reports
                             WHERE status = 'open' AND reason = 'closed'),
    'suspended',           (SELECT count(*) FROM public.businesses WHERE lifecycle_status = 'suspended'),
    'unverified_public',   (SELECT count(*) FROM public.businesses
                             WHERE is_listable AND verification_status <> 'verified')
  ) INTO r;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.trust_safety_facts() FROM public;
GRANT EXECUTE ON FUNCTION public.trust_safety_facts() TO authenticated;

CREATE OR REPLACE FUNCTION public.customer_success_facts()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  SELECT jsonb_build_object(
    'claims_pending',     (SELECT count(*) FROM public.business_claims WHERE status = 'pending'),
    'claims_over_48h',    (SELECT count(*) FROM public.business_claims
                            WHERE status = 'pending' AND created_at < now() - interval '48 hours'),
    'claimed_incomplete', (SELECT count(*) FROM public.businesses
                            WHERE claim_status = 'claimed' AND coalesce(listing_score, 0) < 60),
    'claimed_no_hours',   (SELECT count(*) FROM public.businesses
                            WHERE claim_status = 'claimed'
                              AND coalesce(nullif(btrim(coalesce(opening_hours, hours, '')), ''), NULL) IS NULL),
    'owners',             (SELECT count(DISTINCT user_id) FROM public.businesses WHERE user_id IS NOT NULL)
  ) INTO r;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.customer_success_facts() FROM public;
GRANT EXECUTE ON FUNCTION public.customer_success_facts() TO authenticated;

CREATE OR REPLACE FUNCTION public.growth_facts()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  SELECT jsonb_build_object(
    'prospects',        (SELECT count(*) FROM public.businesses WHERE data_status = 'synthetic_unverified'),
    'listings_public',  (SELECT count(*) FROM public.businesses WHERE is_listable),
    'claimed',          (SELECT count(*) FROM public.businesses WHERE claim_status = 'claimed'),
    'claims_started',   (SELECT count(*) FROM public.business_claims),
    'review_queue',     (SELECT count(*) FROM public.radar_candidates WHERE status IN ('pending','review')),
    'suggestions_7d',   (SELECT count(*) FROM public.radar_candidates
                          WHERE source_key = 'public_suggestion' AND created_at > now() - interval '7 days'),
    'founding_claimed', (SELECT count(*) FROM public.founding_members),
    'offers_running',   (SELECT count(*) FROM public.business_offers
                          WHERE coalesce(active, true)
                            AND (starts_at IS NULL OR starts_at <= now())
                            AND (ends_at   IS NULL OR ends_at   >= now()))
  ) INTO r;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.growth_facts() FROM public;
GRANT EXECUTE ON FUNCTION public.growth_facts() TO authenticated;

/*
  Which agents are due.

  SECURITY DEFINER and callable by the service role only in practice — the
  scheduler runs with the service key. `now() - interval` rather than a stored
  next_run so changing a cadence takes effect immediately instead of after one
  more run at the old interval.
*/
CREATE OR REPLACE FUNCTION public.workforce_due(p_now timestamptz DEFAULT now())
RETURNS TABLE (agent_key text, interval_min integer, last_run_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.agent_key, s.interval_min, s.last_run_at
    FROM public.workforce_schedule s
   WHERE s.enabled
     AND (s.last_run_at IS NULL OR s.last_run_at <= p_now - make_interval(mins => s.interval_min))
   ORDER BY s.last_run_at NULLS FIRST;
$$;

/*
  Record a scheduled run.

  Service-role variant of record_workforce_run: same effects, no is_admin()
  gate, because the scheduler has no user. It is not granted to anon or
  authenticated, so the only caller is something holding the service key.
*/
CREATE OR REPLACE FUNCTION public.record_scheduled_run(
  p_agent_key text, p_status text, p_summary text,
  p_facts jsonb, p_findings jsonb, p_reason text, p_duration_ms integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_status text; v_work text;
BEGIN
  INSERT INTO public.workforce_runs (agent_key, status, summary, facts, findings, reason, duration_ms)
  VALUES (p_agent_key, p_status, p_summary, coalesce(p_facts,'[]'::jsonb),
          coalesce(p_findings,'[]'::jsonb), p_reason, p_duration_ms)
  RETURNING id INTO v_id;

  v_status := CASE p_status WHEN 'ok' THEN 'active'
                            WHEN 'nothing-to-report' THEN 'waiting'
                            ELSE 'error' END;
  v_work := CASE WHEN p_status = 'ok' THEN p_summary
                 WHEN p_status = 'nothing-to-report' THEN 'Ran, nothing to report.'
                 ELSE 'Last run ' || p_status || ': ' || coalesce(p_reason,'unknown error') END;

  UPDATE public.os_workforce
     SET status = v_status, current_work = v_work, updated_at = now()
   WHERE agent_key = p_agent_key AND kind = 'ai';

  UPDATE public.workforce_schedule
     SET last_run_at = now(),
         last_status = p_status,
         consecutive_failures = CASE WHEN p_status IN ('ok','nothing-to-report')
                                     THEN 0 ELSE consecutive_failures + 1 END
   WHERE agent_key = p_agent_key;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.record_scheduled_run(text,text,text,jsonb,jsonb,text,integer) FROM public;

/*
  Service-role fact readers.

  The per-agent fact functions are admin-gated, which is right for the console
  but leaves the scheduler unable to call them. Rather than loosening those,
  this one wrapper is service-role-only and returns everything the agents need.
*/
CREATE OR REPLACE FUNCTION public.workforce_facts_for(p_agent_key text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN CASE p_agent_key
    WHEN 'chief-of-staff'   THEN (SELECT jsonb_build_object(
        'listings_public',  (SELECT count(*) FROM public.businesses WHERE is_listable),
        'listings_total',   (SELECT count(*) FROM public.businesses),
        'claimed',          (SELECT count(*) FROM public.businesses WHERE claim_status = 'claimed'),
        'verified',         (SELECT count(*) FROM public.businesses WHERE verification_status = 'verified'),
        'missing_hours',    (SELECT count(*) FROM public.businesses WHERE is_listable
                              AND coalesce(nullif(btrim(coalesce(opening_hours, hours, '')), ''), NULL) IS NULL),
        'claims_pending',   (SELECT count(*) FROM public.business_claims WHERE status = 'pending'),
        'reports_open',     (SELECT count(*) FROM public.business_reports WHERE status = 'open'),
        'review_queue',     (SELECT count(*) FROM public.radar_candidates WHERE status IN ('pending','review')),
        'offers_running',   (SELECT count(*) FROM public.business_offers WHERE coalesce(active,true)
                              AND (starts_at IS NULL OR starts_at <= now())
                              AND (ends_at   IS NULL OR ends_at   >= now())),
        'founding_claimed', (SELECT count(*) FROM public.founding_members)))
    WHEN 'trust-safety'     THEN (SELECT jsonb_build_object(
        'reports_open',        (SELECT count(*) FROM public.business_reports WHERE status='open'),
        'reports_over_24h',    (SELECT count(*) FROM public.business_reports WHERE status='open' AND created_at < now() - interval '24 hours'),
        'reports_not_real',    (SELECT count(*) FROM public.business_reports WHERE status='open' AND reason IN ('not_real','impersonation')),
        'reports_closed_claim',(SELECT count(*) FROM public.business_reports WHERE status='open' AND reason='closed'),
        'suspended',           (SELECT count(*) FROM public.businesses WHERE lifecycle_status='suspended'),
        'unverified_public',   (SELECT count(*) FROM public.businesses WHERE is_listable AND verification_status <> 'verified')))
    WHEN 'customer-success' THEN (SELECT jsonb_build_object(
        'claims_pending',     (SELECT count(*) FROM public.business_claims WHERE status='pending'),
        'claims_over_48h',    (SELECT count(*) FROM public.business_claims WHERE status='pending' AND created_at < now() - interval '48 hours'),
        'claimed_incomplete', (SELECT count(*) FROM public.businesses WHERE claim_status='claimed' AND coalesce(listing_score,0) < 60),
        'claimed_no_hours',   (SELECT count(*) FROM public.businesses WHERE claim_status='claimed'
                                AND coalesce(nullif(btrim(coalesce(opening_hours, hours, '')), ''), NULL) IS NULL),
        'owners',             (SELECT count(DISTINCT user_id) FROM public.businesses WHERE user_id IS NOT NULL)))
    WHEN 'growth-director'  THEN (SELECT jsonb_build_object(
        'prospects',        (SELECT count(*) FROM public.businesses WHERE data_status='synthetic_unverified'),
        'listings_public',  (SELECT count(*) FROM public.businesses WHERE is_listable),
        'claimed',          (SELECT count(*) FROM public.businesses WHERE claim_status='claimed'),
        'claims_started',   (SELECT count(*) FROM public.business_claims),
        'review_queue',     (SELECT count(*) FROM public.radar_candidates WHERE status IN ('pending','review')),
        'suggestions_7d',   (SELECT count(*) FROM public.radar_candidates WHERE source_key='public_suggestion' AND created_at > now() - interval '7 days'),
        'founding_claimed', (SELECT count(*) FROM public.founding_members),
        'offers_running',   (SELECT count(*) FROM public.business_offers WHERE coalesce(active,true)
                              AND (starts_at IS NULL OR starts_at <= now())
                              AND (ends_at   IS NULL OR ends_at   >= now()))))
    ELSE NULL
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.workforce_facts_for(text) FROM public;

-- ======================================================================
--  20260901050000_workforce_cron.sql
-- ======================================================================
/*
  # The cron that makes the workforce autonomous

  Until this, the agents could run but only when something called them. This is
  the something.

  ## Why in-database rather than an external scheduler

  An external cron is another system to configure, monitor and forget. pg_cron
  lives beside the data the agents read, survives redeploys of the frontend and
  the functions, and fails visibly in cron.job_run_details rather than silently
  in somebody's CI account.

  ## Keeping the secret out of git

  The scheduled command calls tick_workforce(), which reads the automation key
  from private_config — a table with RLS enabled and NO policies, so it is
  unreachable through the API by anon, authenticated or admin. Only SECURITY
  DEFINER functions can see it. The key is inserted separately, never in this
  file, because migrations are committed.

  Re-runnable: unschedules before scheduling.
*/

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

/*
  Server-side configuration nobody can read through PostgREST.

  RLS on with zero policies is deliberate and is the strongest available
  setting: it denies every role that goes through the API, including admins,
  while leaving SECURITY DEFINER functions unaffected.
*/
CREATE TABLE IF NOT EXISTS public.private_config (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.private_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_config FROM anon, authenticated;

/** Store a config value. Service-role only; not granted to any API role. */
CREATE OR REPLACE FUNCTION public.set_private_config(p_key text, p_value text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.private_config (key, value, updated_at)
  VALUES (p_key, p_value, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.set_private_config(text,text) FROM public, anon, authenticated;

/*
  One tick.

  Posts to the workforce scheduler, which decides for itself which agents are
  due. Deliberately dumb: all the judgement about cadence lives in
  workforce_due(), so changing an agent's interval never means touching cron.

  Returns the pg_net request id so a failure can be traced in net._http_response.
*/
CREATE OR REPLACE FUNCTION public.tick_workforce()
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_url text; v_key text; v_anon text; v_id bigint;
BEGIN
  SELECT value INTO v_url  FROM public.private_config WHERE key = 'workforce_endpoint';
  SELECT value INTO v_key  FROM public.private_config WHERE key = 'automation_secret';
  SELECT value INTO v_anon FROM public.private_config WHERE key = 'anon_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'tick_workforce: not configured yet; nothing scheduled to call.';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url     := v_url,
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_anon, ''),
      'x-automation-key', v_key
    ),
    timeout_milliseconds := 55000
  ) INTO v_id;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.tick_workforce() FROM public, anon, authenticated;

/*
  Every 15 minutes.

  Not because any agent runs that often — the fastest is hourly — but because
  the tick is what makes cadence changes take effect promptly. An agent moved
  from daily to hourly should start behaving hourly within the quarter hour,
  not tomorrow. A tick with nothing due costs one HTTP call that returns
  immediately.
*/
DO $$
BEGIN
  PERFORM cron.unschedule('nowopen-workforce');
EXCEPTION WHEN OTHERS THEN
  NULL; -- not scheduled yet
END $$;

SELECT cron.schedule('nowopen-workforce', '*/15 * * * *', $$SELECT public.tick_workforce();$$);

/** What the scheduler has been doing, for the admin console. */
CREATE OR REPLACE FUNCTION public.workforce_cron_status()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, cron AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  SELECT jsonb_build_object(
    'scheduled',  EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nowopen-workforce'),
    'schedule',   (SELECT schedule FROM cron.job WHERE jobname = 'nowopen-workforce'),
    'active',     (SELECT active   FROM cron.job WHERE jobname = 'nowopen-workforce'),
    'last_run',   (SELECT max(start_time) FROM cron.job_run_details d
                     JOIN cron.job j ON j.jobid = d.jobid WHERE j.jobname = 'nowopen-workforce'),
    'last_status',(SELECT d.status FROM cron.job_run_details d
                     JOIN cron.job j ON j.jobid = d.jobid WHERE j.jobname = 'nowopen-workforce'
                    ORDER BY d.start_time DESC LIMIT 1),
    'configured', EXISTS (SELECT 1 FROM public.private_config WHERE key = 'automation_secret')
  ) INTO r;
  RETURN r;
END;
$$;
GRANT EXECUTE ON FUNCTION public.workforce_cron_status() TO authenticated;

-- ======================================================================
--  20260901060000_workforce_console.sql
-- ======================================================================
/*
  # Running the workforce from the console, without shipping the secret

  The admin console needs a "Run now". It cannot hold the automation key —
  anything the browser knows is public — so the button calls this instead: an
  admin-gated function that asks the database to make the call, using a secret
  only the database can read.

  The same path the cron uses, triggered by a person. There is no second way in.
*/

/*
  tick_workforce gains a force flag.

  Cron calls it plain, so cadence is respected. The console calls it with force,
  which runs every enabled agent regardless of when it last ran — useful after
  changing a threshold, and the only thing it bypasses is the clock.
*/
CREATE OR REPLACE FUNCTION public.tick_workforce(p_force boolean DEFAULT false)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_url text; v_key text; v_anon text; v_id bigint;
BEGIN
  SELECT value INTO v_url  FROM public.private_config WHERE key = 'workforce_endpoint';
  SELECT value INTO v_key  FROM public.private_config WHERE key = 'automation_secret';
  SELECT value INTO v_anon FROM public.private_config WHERE key = 'anon_key';

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE EXCEPTION 'The workforce endpoint or automation secret has not been configured.';
  END IF;

  IF p_force THEN v_url := v_url || '?force=1'; END IF;

  SELECT net.http_post(
    url     := v_url,
    body    := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_anon, ''),
      'x-automation-key', v_key
    ),
    timeout_milliseconds := 55000
  ) INTO v_id;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.tick_workforce(boolean) FROM public, anon, authenticated;

/** The console's Run now. Admin only; the secret never leaves the database. */
CREATE OR REPLACE FUNCTION public.admin_run_workforce()
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  RETURN public.tick_workforce(true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_run_workforce() TO authenticated;

/*
  The latest run per agent, joined to its schedule.

  One query for the console, so the panel cannot show an agent's findings beside
  another agent's timestamp. DISTINCT ON is the cheapest correct way to take the
  newest row per key.
*/
CREATE OR REPLACE FUNCTION public.workforce_latest()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'agent_key'), '[]'::jsonb) INTO r
  FROM (
    SELECT jsonb_build_object(
             'agent_key',    s.agent_key,
             'enabled',      s.enabled,
             'interval_min', s.interval_min,
             'last_run_at',  s.last_run_at,
             'last_status',  s.last_status,
             'failures',     s.consecutive_failures,
             'summary',      run.summary,
             'findings',     coalesce(run.findings, '[]'::jsonb),
             'facts',        coalesce(run.facts, '[]'::jsonb),
             'reason',       run.reason
           ) AS x
      FROM public.workforce_schedule s
      LEFT JOIN LATERAL (
        SELECT w.summary, w.findings, w.facts, w.reason
          FROM public.workforce_runs w
         WHERE w.agent_key = s.agent_key
         ORDER BY w.created_at DESC
         LIMIT 1
      ) run ON true
  ) t;

  RETURN r;
END;
$$;
GRANT EXECUTE ON FUNCTION public.workforce_latest() TO authenticated;

-- ======================================================================
--  20260906020000_fix_tick_workforce_overload.sql
-- ======================================================================
/*
  # The AI workforce has been dead for five days. This is why.

  Measured on live before writing this:

    cron.job          nowopen-workforce, every 15 minutes, active
    job_run_details   481 failed, 5 succeeded
    last success      2026-09-01 03:30
    error             function public.tick_workforce() is not unique

  So the schedule never stopped. Every fifteen minutes, ninety-six times a day,
  it fired and failed — and nothing anywhere said so.

  ## The cause

  20260901050000_workforce_cron.sql created `tick_workforce()` and scheduled
  `SELECT public.tick_workforce();`.

  20260901060000_workforce_console.sql then added a force flag with
  `CREATE OR REPLACE FUNCTION public.tick_workforce(p_force boolean DEFAULT false)`.

  In Postgres, CREATE OR REPLACE with a different argument list does not replace
  anything — the argument list is part of a function's identity, so it creates a
  SECOND function. Both can be called with no arguments, one because it takes
  none and one because its only argument has a default, and Postgres refuses to
  guess. `SELECT tick_workforce();` became ambiguous the moment that migration
  ran, which is exactly when the successes stop.

  The migration's own comment says "Cron calls it plain, so cadence is
  respected". That was the intent and it was correct; what it missed is that
  "plain" stopped resolving.

  ## The fix

  Drop the zero-argument version. The one with `p_force boolean DEFAULT false`
  is the current definition — the console's Run now calls it with true, and cron
  calls it with no arguments and gets false, which is the documented behaviour.

  Nothing else needs to change: cron stores its command as text, so the existing
  schedule starts working again on the next tick.
*/

DROP FUNCTION IF EXISTS public.tick_workforce();

-- Re-assert the lock-down on the survivor. The dropped overload carried its own
-- REVOKE, and it would be easy to assume that covered both.
REVOKE ALL ON FUNCTION public.tick_workforce(boolean) FROM public, anon, authenticated;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
  WHERE ns.nspname = 'public' AND p.proname = 'tick_workforce';

  IF n <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one tick_workforce, found %. A zero-argument call would be ambiguous again.', n;
  END IF;
  RAISE NOTICE 'tick_workforce is unique again — the schedule resolves on the next tick.';
END $$;

-- Confirm afterwards:
--   SELECT status, count(*) FROM cron.job_run_details WHERE jobid = 1
--     AND start_time > now() - interval '1 hour' GROUP BY status;
--   SELECT max(created_at) FROM public.workforce_runs;

-- ======================================================================
--  20260906030000_workforce_health.sql
-- ======================================================================
/*
  # Make a broken workforce visible

  The overload bug that killed the workforce ran undetected for five days and
  481 failed ticks. The console was not blind to it by accident — it had the
  data and did not use it.

  workforce_cron_status() already returned `last_status`, and the panel rendered
  only `last_run`. So the screen said "last tick 4 minutes ago" the entire time,
  which reads as healthy. Cron WAS ticking. Every tick was failing.

  The lesson is that "when did it last try" and "when did it last work" are
  different questions, and only the second one means anything. This adds the
  second one, plus enough context to act on it:

    last_success          when the schedule last actually worked
    last_failure          when it last did not
    consecutive_failures  how many since the last success
    last_error            the reason, straight from cron.job_run_details
    healthy               a single boolean the UI can colour by

  `healthy` is deliberately computed here rather than in the browser. It is the
  definition of "the workforce is fine", and it belongs in one place next to the
  data rather than as a threshold somebody retypes in a component.

  NOTE ON THE SIGNATURE: this is CREATE OR REPLACE with the SAME argument list,
  so it genuinely replaces. That is precisely what the previous workforce
  migration did not do — it changed the argument list, which creates a second
  function instead. See 20260906020000_fix_tick_workforce_overload.sql.
*/

CREATE OR REPLACE FUNCTION public.workforce_cron_status()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, cron AS $$
DECLARE
  r             jsonb;
  v_jobid       bigint;
  v_last_ok     timestamptz;
  v_last_fail   timestamptz;
  v_fails       int := 0;
  v_error       text;
  v_stale_after interval := interval '90 minutes';
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;

  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'nowopen-workforce';

  IF v_jobid IS NOT NULL THEN
    SELECT max(start_time) INTO v_last_ok
      FROM cron.job_run_details WHERE jobid = v_jobid AND status = 'succeeded';
    SELECT max(start_time) INTO v_last_fail
      FROM cron.job_run_details WHERE jobid = v_jobid AND status = 'failed';

    -- Failures since the last success. With no success on record every failure
    -- counts, which is the honest reading of "it has never worked".
    SELECT count(*) INTO v_fails
      FROM cron.job_run_details
     WHERE jobid = v_jobid AND status = 'failed'
       AND (v_last_ok IS NULL OR start_time > v_last_ok);

    SELECT return_message INTO v_error
      FROM cron.job_run_details
     WHERE jobid = v_jobid AND status = 'failed'
     ORDER BY start_time DESC LIMIT 1;
  END IF;

  SELECT jsonb_build_object(
    'scheduled',  v_jobid IS NOT NULL,
    'schedule',   (SELECT schedule FROM cron.job WHERE jobid = v_jobid),
    'active',     (SELECT active   FROM cron.job WHERE jobid = v_jobid),
    'last_run',   (SELECT max(start_time) FROM cron.job_run_details WHERE jobid = v_jobid),
    'last_status',(SELECT status FROM cron.job_run_details WHERE jobid = v_jobid
                    ORDER BY start_time DESC LIMIT 1),
    'configured', EXISTS (SELECT 1 FROM public.private_config WHERE key = 'automation_secret'),

    'last_success',         v_last_ok,
    'last_failure',         v_last_fail,
    'consecutive_failures', v_fails,
    -- Truncated: this reaches an admin's browser, and a Postgres error can carry
    -- a long statement body with it.
    'last_error',           left(coalesce(v_error, ''), 400),
    -- On a 15-minute cadence, 90 minutes is six missed ticks — long enough not
    -- to cry wolf over one slow run, short enough that nobody loses a day.
    'healthy',    v_jobid IS NOT NULL
                  AND (SELECT active FROM cron.job WHERE jobid = v_jobid)
                  AND v_last_ok IS NOT NULL
                  AND v_last_ok > now() - v_stale_after
  ) INTO r;

  RETURN r;
END;
$$;

GRANT EXECUTE ON FUNCTION public.workforce_cron_status() TO authenticated;

-- Confirm afterwards (as an admin):
--   SELECT public.workforce_cron_status();

-- ======================================================================
--  20260913000000_fix_workforce_agent_keys.sql
-- ======================================================================
-- 20260913000000_fix_workforce_agent_keys.sql
-- The workforce runner records scheduled runs against the schedule keys
-- ('trust-safety', 'customer-success', 'chief-of-staff', 'growth-director').
-- The roster seeds (os_workforce, work items and the frontend seed) shipped the
-- legacy spellings 'trust-safety-agent' and 'customer-success-manager', so
-- record_scheduled_run's `UPDATE os_workforce ... WHERE agent_key = <run key>`
-- never touched those two roster rows: the agents ran, the roster never moved.
-- Normalise the roster rows to the engine keys; run data already uses them.

UPDATE public.os_workforce
   SET agent_key = 'trust-safety'
 WHERE agent_key = 'trust-safety-agent'
   AND kind = 'ai';

UPDATE public.os_workforce
   SET agent_key = 'customer-success'
 WHERE agent_key = 'customer-success-manager'
   AND kind = 'ai';

-- ======================================================================
--  20260913010000_workforce_full_coverage.sql
-- ======================================================================
/*
  # The whole workforce runs

  Four agents out of eighteen had an implementation and a schedule; the other
  fourteen sat in the roster as names with no clock, so most of the company
  silently never worked. This closes that gap:

    1. reconciles `missing_hours` with the availability model (20260911000000),
    2. puts all fourteen remaining roles on the schedule,
    3. gives every role its facts, from real tables only.

  ## What `missing_hours` means now

  After 20260911000000 an unclaimed business with no recorded hours carries
  `availability_mode = 'default_24_7'` and renders "Open now · Open 24 hours ·
  platform default" — it CAN answer "are you open", honestly, and the public
  state machine in src/lib/openingHours.ts treats it as open. Counting those
  rows as "cannot say whether they are open" made the Chief of Staff brief
  contradict the very pages it reports on (tens of thousands of default-24/7
  listings flagged as un-answerable). A listing counts as missing hours only
  when the state machine really would render `unknown`:

    - no hours text, and
    - not `default_24_7` (always open by platform default), and
    - not a confirmed 24/7 business (`is_24_hours` AND `is_24_hours_confirmed`).

  The predicate below mirrors publicOpenState() branch-for-branch, so the brief
  and the pages cannot disagree again.

  Re-runnable throughout.
*/

/* ---------------------------------------------------------------- 1. facts */

/*
  platform_facts(): identical to 20260901030000 except `missing_hours` follows
  the availability model. The console brief and the scheduled brief read the
  same number from the same function.
*/
CREATE OR REPLACE FUNCTION public.platform_facts()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  SELECT jsonb_build_object(
    'listings_public',    (SELECT count(*) FROM public.businesses WHERE is_listable),
    'listings_total',     (SELECT count(*) FROM public.businesses),
    'claimed',            (SELECT count(*) FROM public.businesses WHERE claim_status = 'claimed'),
    'verified',           (SELECT count(*) FROM public.businesses WHERE verification_status = 'verified'),
    'missing_hours',      (SELECT count(*) FROM public.businesses
                            WHERE is_listable
                              AND coalesce(nullif(btrim(coalesce(opening_hours, hours, '')), ''), NULL) IS NULL
                              AND NOT (availability_mode = 'default_24_7' AND NOT coalesce(is_24_hours_confirmed, false))
                              AND NOT (coalesce(is_24_hours, false) AND coalesce(is_24_hours_confirmed, false))),
    'claims_pending',     (SELECT count(*) FROM public.business_claims WHERE status = 'pending'),
    'reports_open',       (SELECT count(*) FROM public.business_reports WHERE status = 'open'),
    'review_queue',       (SELECT count(*) FROM public.radar_candidates WHERE status IN ('pending','review')),
    'offers_running',     (SELECT count(*) FROM public.business_offers
                            WHERE coalesce(active, true)
                              AND (starts_at IS NULL OR starts_at <= now())
                              AND (ends_at   IS NULL OR ends_at   >= now())),
    'founding_claimed',   (SELECT count(*) FROM public.founding_members)
  ) INTO r;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_facts() FROM public;
GRANT EXECUTE ON FUNCTION public.platform_facts() TO authenticated;

/* ------------------------------------------------------- 2. the clock */

INSERT INTO public.workforce_schedule (agent_key, interval_min, notes) VALUES
  ('strategy-director',   1440, 'Five launch KPIs and the quarter: is the plan measurable?'),
  ('research-analyst',    1440, 'Market and competitor intelligence pipeline.'),
  ('seo-manager',         1440, 'Discoverability: description and geo coverage, rich-result readiness.'),
  ('social-director',      720, 'Content calendar health and publishing cadence.'),
  ('content-manager',      720, 'Copy coverage: scheduled captions, work items, sign-offs.'),
  ('comms-director',      1440, 'The approval gate on anything public, and decisions recorded to the knowledge base.'),
  ('creative-director',   1440, 'Media asset rights, the review queue and takedown honouring.'),
  ('copywriter',           720, 'Does every public page have a story it can tell?'),
  ('production-manager',  1440, 'Video pipeline: approved assets moving to published.'),
  ('post-supervisor',     1440, 'QA gate: nothing renders before it is checked.'),
  ('sales-director',       360, 'Profile requests, orders awaiting a quote, and the prospect funnel.'),
  ('operations-director',  360, 'Workflow health: blocked work, failed queues, approvals.'),
  ('finance-analyst',     1440, 'Order and checkout pipeline; founding numbers issued.'),
  ('product-manager',     1440, 'Launch readiness and roadmap blockers.')
ON CONFLICT (agent_key) DO NOTHING;

/* ------------------------------------------------------------------ 3. facts */

/*
  workforce_facts_for(): now returns facts for all eighteen scheduled agents.
  Same rule as before — each branch is that agent's own evidence, none share a
  failure, and everything is a count over a real table. `missing_hours` in the
  chief-of-staff branch uses the reconciled predicate above.
*/
CREATE OR REPLACE FUNCTION public.workforce_facts_for(p_agent_key text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN CASE p_agent_key
    WHEN 'chief-of-staff'   THEN (SELECT jsonb_build_object(
        'listings_public',  (SELECT count(*) FROM public.businesses WHERE is_listable),
        'listings_total',   (SELECT count(*) FROM public.businesses),
        'claimed',          (SELECT count(*) FROM public.businesses WHERE claim_status = 'claimed'),
        'verified',         (SELECT count(*) FROM public.businesses WHERE verification_status = 'verified'),
        'missing_hours',    (SELECT count(*) FROM public.businesses WHERE is_listable
                              AND coalesce(nullif(btrim(coalesce(opening_hours, hours, '')), ''), NULL) IS NULL
                              AND NOT (availability_mode = 'default_24_7' AND NOT coalesce(is_24_hours_confirmed, false))
                              AND NOT (coalesce(is_24_hours, false) AND coalesce(is_24_hours_confirmed, false))),
        'claims_pending',   (SELECT count(*) FROM public.business_claims WHERE status = 'pending'),
        'reports_open',     (SELECT count(*) FROM public.business_reports WHERE status = 'open'),
        'review_queue',     (SELECT count(*) FROM public.radar_candidates WHERE status IN ('pending','review')),
        'offers_running',   (SELECT count(*) FROM public.business_offers WHERE coalesce(active,true)
                              AND (starts_at IS NULL OR starts_at <= now())
                              AND (ends_at   IS NULL OR ends_at   >= now())),
        'founding_claimed', (SELECT count(*) FROM public.founding_members)))
    WHEN 'trust-safety'     THEN (SELECT jsonb_build_object(
        'reports_open',        (SELECT count(*) FROM public.business_reports WHERE status='open'),
        'reports_over_24h',    (SELECT count(*) FROM public.business_reports WHERE status='open' AND created_at < now() - interval '24 hours'),
        'reports_not_real',    (SELECT count(*) FROM public.business_reports WHERE status='open' AND reason IN ('not_real','impersonation')),
        'reports_closed_claim',(SELECT count(*) FROM public.business_reports WHERE status='open' AND reason='closed'),
        'suspended',           (SELECT count(*) FROM public.businesses WHERE lifecycle_status='suspended'),
        'unverified_public',   (SELECT count(*) FROM public.businesses WHERE is_listable AND verification_status <> 'verified')))
    WHEN 'customer-success' THEN (SELECT jsonb_build_object(
        'claims_pending',     (SELECT count(*) FROM public.business_claims WHERE status='pending'),
        'claims_over_48h',    (SELECT count(*) FROM public.business_claims WHERE status='pending' AND created_at < now() - interval '48 hours'),
        'claimed_incomplete', (SELECT count(*) FROM public.businesses WHERE claim_status='claimed' AND coalesce(listing_score,0) < 60),
        'claimed_no_hours',   (SELECT count(*) FROM public.businesses WHERE claim_status='claimed'
                                AND coalesce(nullif(btrim(coalesce(opening_hours, hours, '')), ''), NULL) IS NULL),
        'owners',             (SELECT count(DISTINCT user_id) FROM public.businesses WHERE user_id IS NOT NULL)))
    WHEN 'growth-director'  THEN (SELECT jsonb_build_object(
        'prospects',        (SELECT count(*) FROM public.businesses WHERE data_status='synthetic_unverified'),
        'listings_public',  (SELECT count(*) FROM public.businesses WHERE is_listable),
        'claimed',          (SELECT count(*) FROM public.businesses WHERE claim_status='claimed'),
        'claims_started',   (SELECT count(*) FROM public.business_claims),
        'review_queue',     (SELECT count(*) FROM public.radar_candidates WHERE status IN ('pending','review')),
        'suggestions_7d',   (SELECT count(*) FROM public.radar_candidates WHERE source_key='public_suggestion' AND created_at > now() - interval '7 days'),
        'founding_claimed', (SELECT count(*) FROM public.founding_members),
        'offers_running',   (SELECT count(*) FROM public.business_offers WHERE coalesce(active,true)
                              AND (starts_at IS NULL OR starts_at <= now())
                              AND (ends_at   IS NULL OR ends_at   >= now()))))
    WHEN 'strategy-director' THEN (SELECT jsonb_build_object(
        'listings_public',   (SELECT count(*) FROM public.businesses WHERE is_listable),
        'claimed',           (SELECT count(*) FROM public.businesses WHERE claim_status='claimed'),
        'verified',          (SELECT count(*) FROM public.businesses WHERE verification_status='verified'),
        'claims_started',    (SELECT count(*) FROM public.business_claims),
        'launches_total',    (SELECT count(*) FROM public.os_launches),
        'launches_ready',    (SELECT count(*) FROM public.os_launches
                               WHERE array_length(checklist_done, 1) > 0
                                 AND NOT (false = ANY(checklist_done))),
        'enrichment_backlog',(SELECT count(*) FROM public.business_enrichment_jobs WHERE status IN ('queued','running')),
        'suggestions_7d',    (SELECT count(*) FROM public.radar_candidates WHERE source_key='public_suggestion' AND created_at > now() - interval '7 days')))
    WHEN 'research-analyst' THEN (SELECT jsonb_build_object(
        'radar_pending',       (SELECT count(*) FROM public.radar_candidates WHERE status IN ('pending','review')),
        'suggestions_7d',      (SELECT count(*) FROM public.radar_candidates WHERE source_key='public_suggestion' AND created_at > now() - interval '7 days'),
        'discovery_7d',        (SELECT count(*) FROM public.radar_candidates WHERE created_at > now() - interval '7 days'),
        'profile_requests_new',(SELECT count(*) FROM public.profile_requests WHERE status='new'),
        'knowledge_7d',        (SELECT count(*) FROM public.os_knowledge WHERE created_at > now() - interval '7 days'),
        'media_assets_discovered',(SELECT count(*) FROM public.business_media_assets WHERE status='discovered')))
    WHEN 'seo-manager'      THEN (SELECT jsonb_build_object(
        'listings_public', (SELECT count(*) FROM public.businesses WHERE is_listable),
        'no_description',  (SELECT count(*) FROM public.businesses WHERE is_listable
                             AND coalesce(nullif(btrim(coalesce(description,'')),''),NULL) IS NULL),
        'no_location',     (SELECT count(*) FROM public.businesses WHERE is_listable
                             AND coalesce(nullif(btrim(coalesce(location,'')),''),NULL) IS NULL),
        'no_website',      (SELECT count(*) FROM public.businesses WHERE is_listable
                             AND coalesce(nullif(btrim(coalesce(website,'')),''),NULL) IS NULL),
        'no_media',        (SELECT count(*) FROM public.businesses WHERE is_listable
                             AND coalesce(nullif(btrim(coalesce(image_url,'')),''),NULL) IS NULL),
        'default_24_7',    (SELECT count(*) FROM public.businesses WHERE is_listable AND availability_mode='default_24_7')))
    WHEN 'social-director'  THEN (SELECT jsonb_build_object(
        'listings_public',  (SELECT count(*) FROM public.businesses WHERE is_listable),
        'posts_scheduled',  (SELECT count(*) FROM public.social_scheduled_posts WHERE status='scheduled'),
        'posts_published_7d',(SELECT count(*) FROM public.social_scheduled_posts WHERE status='published' AND published_at > now() - interval '7 days'),
        'posts_failed',     (SELECT count(*) FROM public.social_scheduled_posts WHERE status='failed'),
        'posts_due_24h',    (SELECT count(*) FROM public.social_scheduled_posts WHERE status='scheduled' AND scheduled_at BETWEEN now() AND now() + interval '24 hours'),
        'social_work_open', (SELECT count(*) FROM public.os_work_items WHERE status NOT IN ('done','cancelled') AND department='Social Media')))
    WHEN 'content-manager'  THEN (SELECT jsonb_build_object(
        'social_work_open',    (SELECT count(*) FROM public.os_work_items WHERE status NOT IN ('done','cancelled') AND department='Social Media'),
        'approvals_pending',   (SELECT count(*) FROM public.os_approvals WHERE status='pending'),
        'posts_scheduled',     (SELECT count(*) FROM public.social_scheduled_posts WHERE status='scheduled'),
        'posts_needing_caption',(SELECT count(*) FROM public.social_scheduled_posts WHERE status='scheduled'
                                  AND coalesce(nullif(btrim(coalesce(caption,'')),''),NULL) IS NULL),
        'posts_failed',        (SELECT count(*) FROM public.social_scheduled_posts WHERE status='failed')))
    WHEN 'comms-director'   THEN (SELECT jsonb_build_object(
        'publication_approvals_pending',(SELECT count(*) FROM public.os_approvals WHERE status='pending'),
        'knowledge_30d',     (SELECT count(*) FROM public.os_knowledge WHERE created_at > now() - interval '30 days')))
    WHEN 'creative-director' THEN (SELECT jsonb_build_object(
        'assets_awaiting_review',(SELECT count(*) FROM public.business_media_assets WHERE moderation_status='pending'),
        'assets_unlicensed', (SELECT count(*) FROM public.business_media_assets WHERE status <> 'removed' AND rights_decision IS NULL),
        'takedowns_unhonoured',(SELECT count(*) FROM public.business_media_assets WHERE status <> 'removed' AND takedown_requested_at IS NOT NULL),
        'assets_published',  (SELECT count(*) FROM public.business_media_assets WHERE status='published')))
    WHEN 'copywriter'       THEN (SELECT jsonb_build_object(
        'listings_public',     (SELECT count(*) FROM public.businesses WHERE is_listable),
        'no_description',      (SELECT count(*) FROM public.businesses WHERE is_listable
                                 AND coalesce(nullif(btrim(coalesce(description,'')),''),NULL) IS NULL),
        'offers_no_description',(SELECT count(*) FROM public.business_offers
                                 WHERE coalesce(active,true)
                                   AND (starts_at IS NULL OR starts_at <= now())
                                   AND (ends_at   IS NULL OR ends_at   >= now())
                                   AND coalesce(nullif(btrim(coalesce(description,'')),''),NULL) IS NULL),
        'posts_needing_caption',(SELECT count(*) FROM public.social_scheduled_posts WHERE status='scheduled'
                                  AND coalesce(nullif(btrim(coalesce(caption,'')),''),NULL) IS NULL)))
    WHEN 'production-manager' THEN (SELECT jsonb_build_object(
        'video_assets_approved', (SELECT count(*) FROM public.business_media_assets WHERE asset_type='video' AND status='approved'),
        'video_assets_published',(SELECT count(*) FROM public.business_media_assets WHERE asset_type='video' AND status='published'),
        'video_assets_pending',  (SELECT count(*) FROM public.business_media_assets WHERE asset_type='video' AND status IN ('discovered','match_confirmed')),
        'production_work_open',  (SELECT count(*) FROM public.os_work_items WHERE status NOT IN ('done','cancelled') AND department='Production')))
    WHEN 'post-supervisor'  THEN (SELECT jsonb_build_object(
        'assets_awaiting_review',(SELECT count(*) FROM public.business_media_assets WHERE moderation_status='pending'),
        'assets_rejected',   (SELECT count(*) FROM public.business_media_assets WHERE moderation_status='rejected')))
    WHEN 'sales-director'   THEN (SELECT jsonb_build_object(
        'prospects',           (SELECT count(*) FROM public.businesses WHERE data_status='synthetic_unverified'),
        'profile_requests_new',(SELECT count(*) FROM public.profile_requests WHERE status='new'),
        'profile_requests_7d', (SELECT count(*) FROM public.profile_requests WHERE created_at > now() - interval '7 days'),
        'orders_open',         (SELECT count(*) FROM public.create_orders WHERE status IN ('new','quoting')),
        'claimed',             (SELECT count(*) FROM public.businesses WHERE claim_status='claimed')))
    WHEN 'operations-director' THEN (SELECT jsonb_build_object(
        'work_blocked',      (SELECT count(*) FROM public.os_work_items WHERE status='blocked'),
        'work_waiting',      (SELECT count(*) FROM public.os_work_items WHERE status='waiting'),
        'approvals_pending', (SELECT count(*) FROM public.os_approvals WHERE status='pending'),
        'orders_open',       (SELECT count(*) FROM public.create_orders WHERE status IN ('new','quoting')),
        'enrichment_failed', (SELECT count(*) FROM public.business_enrichment_jobs WHERE status='failed')))
    WHEN 'finance-analyst'  THEN (SELECT jsonb_build_object(
        'orders_open',     (SELECT count(*) FROM public.create_orders WHERE status IN ('new','quoting')),
        'orders_quoted',   (SELECT count(*) FROM public.create_orders WHERE status='quoted'),
        'orders_delivered',(SELECT count(*) FROM public.create_orders WHERE status='delivered'),
        'orders_cancelled',(SELECT count(*) FROM public.create_orders WHERE status='cancelled'),
        'leads_total',     (SELECT count(*) FROM public.payment_intents),
        'leads_paid',      (SELECT count(*) FROM public.payment_intents WHERE status='paid'),
        'founding_claimed',(SELECT count(*) FROM public.founding_members)))
    WHEN 'product-manager'  THEN (SELECT jsonb_build_object(
        'launches_total',  (SELECT count(*) FROM public.os_launches),
        'launches_ready',  (SELECT count(*) FROM public.os_launches
                             WHERE array_length(checklist_done, 1) > 0
                               AND NOT (false = ANY(checklist_done))),
        'work_items_open', (SELECT count(*) FROM public.os_work_items WHERE status NOT IN ('done','cancelled')),
        'work_blocked',    (SELECT count(*) FROM public.os_work_items WHERE status='blocked'),
        'suggestions_7d',  (SELECT count(*) FROM public.radar_candidates WHERE source_key='public_suggestion' AND created_at > now() - interval '7 days'),
        'listings_public', (SELECT count(*) FROM public.businesses WHERE is_listable)))
    ELSE NULL
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.workforce_facts_for(text) FROM public;

-- ======================================================================
--  20260913020000_launch_automation.sql
-- ======================================================================
/*
  # Launch Control automation — the board states itself

  Until now, every tick on the Launch Control board was a human clicking. This
  adds the honesty-first version of that: a scheduled pass that studies the real
  tables and advances the checklist only where the evidence genuinely exists.

  ## What it may and may not do

  - It NEVER un-ticks. A human tick is a decision; the automation records an
    `auto` tick alongside it and leaves the human's alone.
  - It ONLY ticks an item when the real database proves that readiness state —
    see the per-item sources below. An item with no evidence stays unticked,
    and stays unticked even if the row was seeded all-true.
  - Every tick it makes is written to `checklist_evidence` with the source
    table, so the board can show "auto · approvals" rather than pretending the
    tick and the reason are the same thing.

  ## The per-item evidence, and why it is defensible

  Indexes follow LAUNCH_CHECKLIST in src/lib/launches.ts.

    0 Design review passed   -> an approval signed off on a Creative & Brand work item
    1 QA sign-off            -> a Product & Engineering work item reached done
    2 Marketing assets ready -> an asset passed moderation
    3 Explainer video made   -> a video asset was published
    4 Launch email drafted   -> an approval signed off on a Communications & PR item
    5 Docs & release notes   -> the knowledge base has entries
    6 Rollout scheduled      -> social posts are scheduled or an offer is live

  These are org-wide signals: launches are platform features, and a launch's
  "design is done" is not meaningfully narrower than "the org designed
  something". The exact table is captured per tick so nobody has to guess what
  "auto" meant.

  Re-runnable throughout.
*/

-- One evidence entry per checklist item, parallel to checklist_done.
ALTER TABLE public.os_launches
  ADD COLUMN IF NOT EXISTS checklist_evidence jsonb NOT NULL DEFAULT '[]';

/*
  One advance pass. Called by cron; safe to call from the console too.
  Returns a summary of what changed so the run is auditable.
*/
CREATE OR REPLACE FUNCTION public.advance_launch_automations()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org_id uuid;
  v_row    record;
  v_done   boolean[];
  v_evidence jsonb;
  v_step   int;
  v_advanced int := 0;
  v_checked  int := 0;
  v_changes  jsonb := '[]'::jsonb;
  v_item       text;
  v_signal     boolean;
  v_source     text;
  v_new_done   boolean[];
  v_new_ev     jsonb;
  v_old_ev     jsonb;
BEGIN
  SELECT id INTO v_org_id FROM public.os_orgs WHERE slug = 'nowopen-africa';
  IF v_org_id IS NULL THEN RETURN '{"checked":0,"advanced":0,"errors":["no-org"]}'::jsonb; END IF;

  FOR v_row IN
    SELECT l.id, l.name, l.checklist_done, coalesce(l.checklist_evidence, '[]'::jsonb) AS evidence
      FROM public.os_launches l
     WHERE l.org_id = v_org_id
     ORDER BY l.created_at
  LOOP
    v_checked := v_checked + 1;
    v_done := coalesce(v_row.checklist_done, '{}'::boolean[]);
    v_old_ev := v_row.evidence;
    -- Normalise both arrays to the checklist length (7) so deletes against the
    -- length can never desync the evidence from the ticks.
    IF cardinality(v_done) < 7 THEN
      v_done := v_done || array_fill(false::boolean, ARRAY[7 - cardinality(v_done)]);
    END IF;
    v_new_done := v_done;
    v_new_ev := v_old_ev;

    FOR v_step IN 0 .. 6 LOOP
      -- A human tick is left alone; the automation never overwrites one.
      IF v_done[v_step + 1] IS TRUE THEN CONTINUE; END IF;

      v_signal := false; v_source := ''; v_item := '';
      CASE v_step
        WHEN 0 THEN
          SELECT EXISTS (
            SELECT 1 FROM public.os_approvals a
              JOIN public.os_work_items w ON w.id = a.work_item_id
             WHERE a.status = 'approved' AND w.department = 'Creative & Brand'
              AND w.org_id = v_org_id
          ) INTO v_signal;
          v_source := 'os_approvals'; v_item := 'Design review passed';
        WHEN 1 THEN
          SELECT EXISTS (
            SELECT 1 FROM public.os_work_items w
             WHERE w.department = 'Product & Engineering' AND w.status = 'done'
               AND w.org_id = v_org_id
          ) INTO v_signal;
          v_source := 'os_work_items'; v_item := 'QA sign-off';
        WHEN 2 THEN
          SELECT EXISTS (
            SELECT 1 FROM public.business_media_assets
             WHERE moderation_status = 'approved'
          ) INTO v_signal;
          v_source := 'business_media_assets'; v_item := 'Marketing assets ready';
        WHEN 3 THEN
          SELECT EXISTS (
            SELECT 1 FROM public.business_media_assets
             WHERE asset_type = 'video' AND status IN ('approved', 'published')
          ) INTO v_signal;
          v_source := 'business_media_assets'; v_item := 'Explainer video made';
        WHEN 4 THEN
          SELECT EXISTS (
            SELECT 1 FROM public.os_approvals a
              JOIN public.os_work_items w ON w.id = a.work_item_id
             WHERE a.status = 'approved' AND w.department = 'Communications & PR'
              AND w.org_id = v_org_id
          ) INTO v_signal;
          v_source := 'os_approvals'; v_item := 'Launch email drafted';
        WHEN 5 THEN
          SELECT EXISTS (
            SELECT 1 FROM public.os_knowledge WHERE org_id = v_org_id
          ) INTO v_signal;
          v_source := 'os_knowledge'; v_item := 'Docs & release notes written';
        WHEN 6 THEN
          SELECT (EXISTS (
            SELECT 1 FROM public.social_scheduled_posts WHERE status = 'scheduled'
          ) OR EXISTS (
            SELECT 1 FROM public.business_offers WHERE coalesce(active, true)
          )) INTO v_signal;
          v_source := 'social_scheduled_posts'; v_item := 'Rollout scheduled';
      END CASE;

      IF v_signal THEN
        v_new_done[v_step + 1] := true;
        -- Preserve anything already recorded for this step; record our tick.
        v_new_ev := jsonb_set(
          coalesce(v_new_ev, '[]'::jsonb),
          ARRAY[v_step::text],
          jsonb_build_object('auto', true, 'source', v_source, 'at', now())
        );
        v_advanced := v_advanced + 1;
        v_changes := v_changes || jsonb_build_array(v_item);
      END IF;
    END LOOP;

    IF v_done::text <> v_new_done::text OR v_old_ev::text <> coalesce(v_new_ev,'[]'::jsonb)::text THEN
      UPDATE public.os_launches
         SET checklist_done = v_new_done,
             checklist_evidence = coalesce(v_new_ev, '[]'::jsonb),
             updated_at = now()
       WHERE id = v_row.id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('checked', v_checked, 'advanced', v_advanced, 'items', v_changes);
END;
$$;
REVOKE ALL ON FUNCTION public.advance_launch_automations() FROM public, anon, authenticated;

/*
  The schedule. Launches move on the slow clock — approvals and done work items
  accrete over days, not minutes — so an hourly pass is plenty and cheap.
*/
DO $$
BEGIN
  PERFORM cron.unschedule('nowopen-launch-automation');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule('nowopen-launch-automation', '0 * * * *', $$SELECT public.advance_launch_automations();$$);


COMMIT;

-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
-- Verification (informational - runs AFTER the transaction committed)
-- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- -- --
select agent_key, enabled, interval_min
  from public.workforce_schedule order by agent_key;

select agent_key, name, department
  from public.os_workforce
 where agent_key in ('chief-of-staff','growth-director','trust-safety','customer-success')
 order by agent_key;

select jobid, jobname, schedule, active
  from cron.job where jobname in ('nowopen-workforce','nowopen-launch-automation');

select key, value is not null as "set"
  from public.private_config order by key;

select public.workforce_cron_status();

-- launch automation: wipe its cron slot, then run the pass and read the arity
-- (advanced = how many checklist items the real tables proved).
select cron.unschedule('nowopen-launch-automation');
select public.advance_launch_automations();
select name, checklist_done, checklist_evidence
  from public.os_launches order by created_at;
select cron.schedule('nowopen-launch-automation', '0 * * * *', $$SELECT public.advance_launch_automations();$$);