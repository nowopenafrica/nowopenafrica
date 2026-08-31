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
