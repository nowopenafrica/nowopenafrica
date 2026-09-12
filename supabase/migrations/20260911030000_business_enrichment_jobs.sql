/*
  # Business Intelligence — enrichment job queue

  The queue that drives continuous enrichment over EXISTING businesses (not
  candidates — radar already owns discovery of new ones). One row per
  (business, job_type) run; the executor edge function claims due rows, runs
  the Phase-3 resolvers, records evidence/proposals, and moves on.

  WHY THIS NEEDS TO EXIST ALONGSIDE `radar_candidates`

  Radar answers "is there a business here we don't have?". Enrichment answers
  "the business this row describes — what can we now find out about it?".
  Mixing the two would give a candidate row a business_id, which it has on
  purpose (published_business_id) but which means "this candidate became this
  row", not "this row needs facts".

  DRY-RUN and COST CONTROL

  The executor never runs (and operators never pay for) a job the operator has
  not budgeted for. `run_cost_budget` bounds the cost of one run; the executor
  aborts and records a `failed` row with a `reason` when it would exceed the
  bound. `dry_run` makes the executor return what it WOULD write without
  writing — the admin review surface's default mode, matches infancy.

  SAFETY: the executor may only WRITE evidence, proposals and its own job row.
  It cannot change a business directly: changes made real by the engine go
  through 20260911040000's change proposals (approved by a person or by an
  owner's sync preference). This is the same boundary the workforce draws
  between "measure and report" and "act".

  Re-runnable throughout.
*/

CREATE TABLE IF NOT EXISTS public.business_enrichment_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  agent_key   text NOT NULL DEFAULT 'enrichment',

  /*
   * What kind of enrichment. Free text, matching the resolvers the executor
   * knows about; kept as text because the set grows with the engine and an
   * enum would need a migration every addition.
   */
  job_type text NOT NULL,
  status text NOT NULL DEFAULT 'queued',  -- queued | running | succeeded | failed | cancelled
  priority integer NOT NULL DEFAULT 50,   -- lower runs first
  attempts integer NOT NULL DEFAULT 0,

  payload jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { source_keys?, fields?, dry_run? } — executor input
  result  jsonb,                                -- what the run produced (evidence counts, proposals)
  error   text,                                 -- failure message for the admin surface
  reason  text,                                 -- human reason for queuing this job

  run_cost_budget numeric DEFAULT NULL,         -- upper bound on what this run may cost, else unlimited
  queue_reason  text,                           -- why it was queued (stale-hours, never-enriched, claim…)
  run_at        timestamptz NOT NULL DEFAULT now(),
  started_at    timestamptz,
  finished_at   timestamptz,

  queued_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT business_enrichment_jobs_status_check CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  CONSTRAINT business_enrichment_jobs_priority_check CHECK (priority BETWEEN 0 AND 100)
);

-- One active (queued/running) job per business+type, so a schedule tick cannot
-- stack duplicate work.
CREATE UNIQUE INDEX IF NOT EXISTS business_enrichment_jobs_active_unique
  ON public.business_enrichment_jobs (business_id, job_type)
  WHERE status IN ('queued','running');

CREATE INDEX IF NOT EXISTS business_enrichment_jobs_due
  ON public.business_enrichment_jobs (status, run_at, priority);
CREATE INDEX IF NOT EXISTS business_enrichment_jobs_business
  ON public.business_enrichment_jobs (business_id, created_at DESC);

ALTER TABLE public.business_enrichment_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_enrichment_jobs_staff_read ON public.business_enrichment_jobs;
DROP POLICY IF EXISTS business_enrichment_jobs_staff_manage ON public.business_enrichment_jobs;

-- The queue is internal work-in-progress: staff-only on both axes. The
-- executor runs with the service role (service key), which bypasses RLS.
CREATE POLICY business_enrichment_jobs_staff_read ON public.business_enrichment_jobs
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY business_enrichment_jobs_staff_manage ON public.business_enrichment_jobs
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

COMMENT ON TABLE public.business_enrichment_jobs IS
  'Continuous-enrichment queue over existing businesses. The executor writes only evidence, proposals and its own job row — never a business directly (20260911040000 proposals carry business changes).';

-- Claim the next due job atomically, service-role only.
CREATE OR REPLACE FUNCTION public.claim_next_enrichment_job()
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  UPDATE public.business_enrichment_jobs
     SET status = 'running',
         started_at = now(),
         attempts = attempts + 1
   WHERE id = (
         SELECT id FROM public.business_enrichment_jobs
          WHERE status = 'queued' AND run_at <= now()
          ORDER BY priority, run_at
          LIMIT 1
         FOR UPDATE SKIP LOCKED)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_next_enrichment_job() FROM public;

CREATE OR REPLACE FUNCTION public.finish_enrichment_job(
  p_job uuid, p_status text, p_result jsonb, p_error text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.business_enrichment_jobs
     SET status = p_status,
         result = coalesce(p_result, result),
         error = p_error,
         finished_at = now(),
         updated_at = now()
   WHERE id = p_job;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_enrichment_job(uuid, text, jsonb, text) FROM public;