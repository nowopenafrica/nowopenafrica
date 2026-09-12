/*
  # Enrichment ops — admin levers for the scheduler

  20260912000000 scheduled enrichment but gave the console no way to act on
  it. This adds the two admin-only levers the ops panel uses, both SECURITY
  DEFINER with the same is_admin() gate that enrichment_cron_status() uses:

    - admin_requeue_enrichment(): make the scheduler's own "what is due now"
      decision run this second, returning how many jobs it queued.
    - admin_retry_failed_enrichment(): return failed jobs (attempts < 3) to
      the queue so a transient failure waits for a human nudge, not a fresh
      attempt stack.

  Neither touches a business directly — both only move work into the queue,
  which already holds for queue_due_enrichment_businesses.

  Re-runnable throughout.
*/

/** What the next cron tick would queue, but now. Admins only; service-role
 *  calls go straight to queue_due_enrichment_businesses. */
CREATE OR REPLACE FUNCTION public.admin_requeue_enrichment(p_max integer DEFAULT 20)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  RETURN public.queue_due_enrichment_businesses(p_max);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_requeue_enrichment(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_requeue_enrichment(integer) TO authenticated;

/** Failed jobs back into the line (bounded attempts so nothing loops forever). */
CREATE OR REPLACE FUNCTION public.admin_retry_failed_enrichment(p_max integer DEFAULT 25)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  UPDATE public.business_enrichment_jobs
     SET status = 'queued',
         run_at = now(),
         updated_at = now(),
         error = 'requeued from the admin console'
   WHERE id IN (
         SELECT id FROM public.business_enrichment_jobs
          WHERE status = 'failed' AND attempts < 3
          ORDER BY updated_at
          LIMIT p_max);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_retry_failed_enrichment(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_retry_failed_enrichment(integer) TO authenticated;