-- The business data extractor stopped extracting. Two reasons, both measured.
--
-- ── WHAT WAS MEASURED, 2026-10-06 ────────────────────────────────────────
--
--   nowopen-enrichment cron           active, every 10 min, firing
--   last response                     {"ok":true,"ran":0,"refilled":0}
--   newest enrichment job             2026-09-30 09:38   (six days earlier)
--   business_enrichment_jobs          3,282 — ALL of job_type
--                                     'hours_resolution'. Not one 'enrichment'
--                                     job has ever existed.
--   businesses with opening hours     4 of 3,210
--   businesses inside the 45-day
--     hours cooldown                  3,204, next eligible 2026-10-28
--   jobs stuck in 'running'           6, since 2026-09-13
--
-- So the pipeline was healthy, idle, and would stay idle for three more weeks
-- — after which it would repeat a pass that has already failed 3,282 times.
--
-- ── CAUSE 1: 'enrichment' WAS UNREACHABLE ────────────────────────────────
--
-- queue_due_enrichment_businesses chose ONE job type per business with a CASE:
--
--   hours missing or stale  → 'hours_resolution'
--   otherwise               → 'enrichment'
--
-- Opening hours are the hardest field to find for an African SME — most are
-- not in OpenStreetMap and have no website — so 3,206 of 3,210 businesses
-- have none, fall down the first branch, and can NEVER reach the second.
--
-- The richer pass, the one carrying `{"ai_resolver": true}` that extracts
-- description, services, category and contact details, has therefore never run
-- once. The single hardest field was gating everything else.
--
-- The two job types are independent work. The unique index already permits one
-- of each per business concurrently (business_enrichment_jobs_active_unique),
-- so this queues them independently instead of choosing.
--
-- ── CAUSE 2: FINDING NOTHING EARNED A FULL REST ──────────────────────────
--
-- A hours_resolution job that reports "hours: none reported" is still recorded
-- `succeeded`, and the cooldown reads `succeeded` as "done". So a job that
-- achieved nothing bought that business 45 days of silence.
--
-- The 45 days is NOT changed here. It is politeness toward OpenStreetMap, and
-- shortening it would mean asking a free service the same question far more
-- often for the same empty answer. Rechecking hours is genuinely low-yield;
-- the fix is to stop that cooldown blocking the OTHER kind of work, which is
-- what cause 1 does.

-- ════════════════════════════════════════════════════════════════════════
-- 1. RELEASE THE STUCK JOBS
-- ════════════════════════════════════════════════════════════════════════
--
-- Six jobs claimed on 2026-09-13/14 and never finished — an edge function
-- timing out mid-run leaves the row 'running' forever. The queueing function
-- skips any business with a queued-or-running job, so those six businesses
-- were permanently excluded from every future pass.

update public.business_enrichment_jobs
   set status = 'failed',
       error = coalesce(error, '') ||
               ' [released 2026-10-06: still running after more than a day; the worker died mid-job]',
       finished_at = now(),
       updated_at = now()
 where status = 'running'
   and started_at < now() - interval '1 day';

/**
 * Release jobs whose worker died, so one timeout does not exclude a business
 * forever. Run on a schedule.
 *
 * Marked 'failed' rather than requeued: the next pass will queue a fresh job
 * on its own, and a job that retries itself indefinitely is how a broken
 * extraction becomes an infinite loop against somebody else's server.
 */
create or replace function public.release_stale_enrichment_jobs(p_older_than interval default interval '1 day')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  if auth.role() <> 'service_role' and auth.uid() is not null then
    raise exception 'Not permitted.' using errcode = 'insufficient_privilege';
  end if;

  with released as (
    update public.business_enrichment_jobs
       set status = 'failed',
           error = coalesce(error, '') || ' [auto-released: worker did not finish]',
           finished_at = now(), updated_at = now()
     where status = 'running' and started_at < now() - p_older_than
    returning 1)
  select count(*) into v_n from released;
  return v_n;
end $$;

revoke all on function public.release_stale_enrichment_jobs(interval) from public, anon, authenticated;
grant execute on function public.release_stale_enrichment_jobs(interval) to service_role;

-- ════════════════════════════════════════════════════════════════════════
-- 2. QUEUE THE TWO JOB TYPES INDEPENDENTLY
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.queue_due_enrichment_businesses(p_max integer default 20)
returns integer
language plpgsql
security definer
set search_path = public
as $$
DECLARE v_inserted integer;
BEGIN
  /*
   * Two candidate sets, UNIONed — not a CASE that picks one.
   *
   * A business with no opening hours needs hours_resolution AND still needs
   * the general extraction pass. Making the second conditional on the first
   * having succeeded meant the second never ran at all.
   */
  WITH eligible AS (
    SELECT b.id, b.updated_at,
           (b.opening_hours IS NULL AND b.hours IS NULL) AS no_hours,
           (b.hours_last_verified IS NULL OR b.hours_last_verified < now() - interval '30 days') AS hours_stale
      FROM public.businesses b
      LEFT JOIN public.business_sync_preferences p ON p.business_id = b.id
     WHERE b.is_listable
       AND coalesce(b.removal_status, 'none') <> 'removed'
       AND coalesce(p.sync_enabled, true)
  ),
  due AS (
    -- Hours. Unchanged rules, including the 45-day politeness window toward
    -- OpenStreetMap.
    SELECT e.id AS business_id,
           'hours_resolution'::text AS job_type,
           CASE WHEN e.no_hours THEN 'hours never set'
                ELSE 'hours last verified over 30 days ago' END AS reason,
           40 AS priority,
           '{"sources": ["openstreetmap"]}'::jsonb AS payload,
           e.updated_at
      FROM eligible e
     WHERE (e.no_hours OR e.hours_stale)
       AND NOT EXISTS (
         SELECT 1 FROM public.business_enrichment_jobs j
          WHERE j.business_id = e.id AND j.job_type = 'hours_resolution'
            AND j.status = 'succeeded' AND j.finished_at > now() - interval '45 days')

    UNION ALL

    -- The general extraction pass, now reachable by every business rather than
    -- only by the handful that already have verified hours.
    SELECT e.id,
           'enrichment'::text,
           'rolling refresh pass',
           50,
           '{"ai_resolver": true}'::jsonb,
           e.updated_at
      FROM eligible e
     WHERE NOT EXISTS (
       SELECT 1 FROM public.business_enrichment_jobs j
        WHERE j.business_id = e.id AND j.job_type = 'enrichment'
          AND j.status = 'succeeded' AND j.finished_at > now() - interval '7 days')
  ),
  -- A business with a job already queued or running for that type is skipped,
  -- as before. Stated here rather than relying on the ON CONFLICT so the LIMIT
  -- is not spent on rows that would be discarded.
  fresh AS (
    SELECT d.* FROM due d
     WHERE NOT EXISTS (
       SELECT 1 FROM public.business_enrichment_jobs a
        WHERE a.business_id = d.business_id AND a.job_type = d.job_type
          AND a.status IN ('queued', 'running'))
     -- Hours first (priority 40), then least-recently-touched, so the queue
     -- works through the estate rather than revisiting the same rows.
     ORDER BY d.priority, d.updated_at
     LIMIT p_max
  )
  INSERT INTO public.business_enrichment_jobs
    (business_id, job_type, status, priority, payload, queue_reason, run_at)
  SELECT f.business_id, f.job_type, 'queued', f.priority, f.payload, f.reason, now()
    FROM fresh f
  ON CONFLICT (business_id, job_type) WHERE status IN ('queued','running') DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END $$;

comment on function public.queue_due_enrichment_businesses(integer) is
  'Queues due enrichment work. Hours resolution and the general extraction pass are INDEPENDENT: gating the second on the first meant it never ran, because almost no African SME has discoverable opening hours.';
