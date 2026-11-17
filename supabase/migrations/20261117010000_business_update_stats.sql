/*
  # Business Updates: counts for the owner, and quiet unhiding

  Follows 20261110010000_business_updates.sql, 20261110020000 (alerts) and the
  event names added to 20260908120000_analytics_event_integrity.sql
  (update_viewed, update_cta_clicked, update_shared).

  ## 1. business_update_stats(business_id)

  Per update: how many distinct browser sessions opened it, tapped its button,
  and shared it. Counted in the database because counting rows in the browser
  stops silently at the API's 1,000-row cap and would under-report the busiest
  updates.

  The business's own people are not its audience. Left out:
  - every event by the owner or an active team member, and
  - every event in a session where the owner or a team member appeared signed
    in on this business, so their signed-out events in the same tab are not
    counted either.

  SECURITY INVOKER on purpose: analytics_events is readable only by staff and
  by the owner of the business an event belongs to (analytics_owner_read), and
  business_members by that owner. Calling this for someone else's business
  returns nothing. It grants no read the caller did not already have.

  These are recorded counts, not audited ones: analytics events can be written
  with the public key, so counts can be inflated (never deflated: the insert
  policy only allows user_id null or the caller). They are shown to the owner,
  never publicly, and never used to rank anything.

  ## 2. Unhiding sends no keeper alert

  The alert trigger fires on any update that becomes live with alerts on and
  none sent yet. Before this, an update hidden before its alert went out would
  alert keepers, hours late, the moment staff unhid it (and if not then, the
  15-minute scheduler would). Coming back from hidden is not news: the alert is
  marked as handled instead, so neither path sends it.

  Re-runnable.
*/

CREATE OR REPLACE FUNCTION public.business_update_stats(p_business uuid)
RETURNS TABLE(update_id uuid, people integer, cta_taps integer, shares integer)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH team AS (
    SELECT b.user_id FROM public.businesses b
    WHERE b.id = p_business AND b.user_id IS NOT NULL
    UNION
    SELECT m.user_id FROM public.business_members m
    WHERE m.business_id = p_business AND m.status = 'active' AND m.user_id IS NOT NULL
  ),
  own_sessions AS (
    SELECT DISTINCT o.session_id FROM public.analytics_events o
    WHERE o.business_id = p_business
      AND o.session_id IS NOT NULL
      AND o.user_id IN (SELECT t.user_id FROM team t)
  )
  SELECT
    (e.props->>'update_id')::uuid AS update_id,
    (count(DISTINCT e.session_id) FILTER (WHERE e.name = 'update_viewed'))::integer AS people,
    (count(DISTINCT e.session_id) FILTER (WHERE e.name = 'update_cta_clicked'))::integer AS cta_taps,
    (count(DISTINCT e.session_id) FILTER (WHERE e.name = 'update_shared'))::integer AS shares
  FROM public.analytics_events e
  WHERE e.business_id = p_business
    AND e.name IN ('update_viewed', 'update_cta_clicked', 'update_shared')
    AND e.props->>'update_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND (e.user_id IS NULL OR e.user_id NOT IN (SELECT t.user_id FROM team t))
    AND (e.session_id IS NULL OR e.session_id NOT IN (SELECT s.session_id FROM own_sessions s))
  GROUP BY 1;
$$;

REVOKE ALL ON FUNCTION public.business_update_stats(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.business_update_stats(uuid) TO authenticated;

COMMENT ON FUNCTION public.business_update_stats(uuid) IS
  'Per-update distinct-session counts (opened, button taps, shares) for the business owner. Invoker rights: analytics RLS applies. Owner and team sessions excluded.';

-- 2. Unhiding sends no keeper alert --------------------------------------------------
CREATE OR REPLACE FUNCTION public.business_update_alert_on_live()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Back from hidden: never news. Mark the alert as handled so the scheduler
  -- does not send it later either.
  IF TG_OP = 'UPDATE' AND OLD.moderation_status = 'hidden' AND NEW.moderation_status = 'ok' THEN
    NEW.notified_at := coalesce(OLD.notified_at, now());
    RETURN NEW;
  END IF;

  IF NEW.notify_keepers
     AND NEW.notified_at IS NULL
     AND NEW.published_at IS NOT NULL
     AND NEW.published_at <= now()
     AND NEW.ended_at IS NULL
     AND NEW.moderation_status = 'ok'
     -- Turning alerts on after the 24 hours must not send people to an update
     -- nobody can see. NEW.expires_at is not computed yet in a BEFORE trigger,
     -- so the expiry is worked out from published_at.
     AND public.business_update_expiry(NEW.published_at) > now() THEN
    PERFORM public.send_business_update_alert(NEW);
    -- Set whether or not anyone was reached, so the alert fires once.
    NEW.notified_at := now();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.business_update_alert_on_live() FROM public, anon, authenticated;
