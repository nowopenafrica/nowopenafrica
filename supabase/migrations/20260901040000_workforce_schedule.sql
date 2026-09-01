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
