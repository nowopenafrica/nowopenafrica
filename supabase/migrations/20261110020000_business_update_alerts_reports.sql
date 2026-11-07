/*
  # Business Updates: keeper alerts, scheduled dispatch, reports

  Follows 20261110010000_business_updates.sql. Spec section 6.4 and 5.3.

  ## Alerts go through notify_keepers, and nowhere else

  An update reaches the people who keep the business and agreed to that topic.
  The topic is the consent record, and notify_keepers already respects it,
  skips the owner, and throttles per topic. Nothing here writes notifications
  directly.

  ## Why the alert runs in a BEFORE trigger

  The alert must fire once, so the row records notified_at. Setting it from an
  AFTER trigger would mean updating the row again, firing every trigger again.
  In a BEFORE trigger the alert is sent and NEW.notified_at is set in the same
  write. If the write later fails, the notifications roll back with it. The
  trigger's name sorts after trg_bu_10_guard, so the guard has already
  normalised the row.

  ## Cron alerts, it never gates

  An update scheduled for later has nobody to tell at insert time. The job
  every 15 minutes sends those once they are live, so an alert may arrive up to
  15 minutes after the update appears. Visibility does not depend on the job at
  all: the read policy filters on time. If the job stops, updates still go up
  and come down on time; only late alerts are missed.

  ## Why updates have their own reports table

  business_reports is about listing facts (closed, moved, wrong phone) and its
  reasons say so. A report about an update is about content (spam, misleading,
  a scam). Mixing the two would make the listing queue guess which is which.
  The same anonymous rate limit applies.

  Re-runnable.
*/

-- 1. Which keep topic an update reaches ----------------------------------------------
-- Mirrors UPDATE_TOPIC in src/lib/businessUpdates.ts; a test compares the two.
CREATE OR REPLACE FUNCTION public.business_update_topic(p_type text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE p_type
    WHEN 'new_product' THEN 'products'
    WHEN 'new_service' THEN 'products'
    WHEN 'offer' THEN 'promotions'
    WHEN 'announcement' THEN 'announcements'
    WHEN 'event' THEN 'events'
    WHEN 'recent_work' THEN 'announcements'
    ELSE 'announcements'
  END;
$$;

-- 2. Send one update's alert ------------------------------------------------------------
/*
  Returns how many people were reached (0 when throttled or skipped). Swallows
  its own failure: a missed alert is a small loss, an owner who cannot post is
  a broken product.

  An offer update whose offer was created in the last 6 hours stays quiet,
  because trg_keep_offer already told the same people about the same offer.
*/
CREATE OR REPLACE FUNCTION public.send_business_update_alert(p_update public.business_updates)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_slug text;
BEGIN
  IF p_update.type = 'offer' AND EXISTS (
    SELECT 1 FROM public.business_offers o
    WHERE o.id = p_update.offer_id AND o.created_at > now() - interval '6 hours'
  ) THEN
    RETURN 0;
  END IF;

  BEGIN
    SELECT b.name, coalesce(b.username, b.id::text) INTO v_name, v_slug
    FROM public.businesses b WHERE b.id = p_update.business_id;

    RETURN public.notify_keepers(
      p_update.business_id,
      public.business_update_topic(p_update.type),
      coalesce(nullif(p_update.title, ''), coalesce(v_name, 'A business you keep') || ' posted an update'),
      left(coalesce(p_update.body, ''), 400),
      '/' || v_slug || '?update=' || p_update.id::text);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'business update alert failed for %: %', p_update.id, SQLERRM;
    RETURN 0;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.send_business_update_alert(public.business_updates) FROM public, anon, authenticated;

-- 3. Immediate alert, when an update goes live now ---------------------------------------
/*
  SECURITY DEFINER because it calls send_business_update_alert, which web
  callers may not execute directly. It only reads NEW and sets notified_at.
*/
CREATE OR REPLACE FUNCTION public.business_update_alert_on_live()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.notify_keepers
     AND NEW.notified_at IS NULL
     AND NEW.published_at IS NOT NULL
     AND NEW.published_at <= now()
     AND NEW.ended_at IS NULL
     AND NEW.moderation_status = 'ok'
     -- Turning alerts on, or un-hiding, after the 24 hours must not send people
     -- to an update nobody can see. NEW.expires_at is not computed yet in a
     -- BEFORE trigger, so the expiry is worked out from published_at.
     AND public.business_update_expiry(NEW.published_at) > now() THEN
    PERFORM public.send_business_update_alert(NEW);
    -- Set whether or not anyone was reached, so the alert fires once.
    NEW.notified_at := now();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.business_update_alert_on_live() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_bu_20_alert ON public.business_updates;
CREATE TRIGGER trg_bu_20_alert
  BEFORE INSERT OR UPDATE ON public.business_updates
  FOR EACH ROW EXECUTE FUNCTION public.business_update_alert_on_live();

-- 4. Scheduled updates that have since gone live -----------------------------------------
CREATE OR REPLACE FUNCTION public.dispatch_scheduled_update_alerts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r       public.business_updates%ROWTYPE;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT * FROM public.business_updates u
    WHERE u.notify_keepers
      AND u.notified_at IS NULL
      AND u.published_at <= now()
      AND u.expires_at > now()
      AND u.ended_at IS NULL
      AND u.moderation_status = 'ok'
    ORDER BY u.published_at
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public.send_business_update_alert(r);
    UPDATE public.business_updates SET notified_at = now() WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_scheduled_update_alerts() FROM public, anon, authenticated;

COMMENT ON FUNCTION public.dispatch_scheduled_update_alerts IS
  'Sends keeper alerts for scheduled business updates once they are live. Runs every 15 minutes from pg_cron. Never decides visibility.';

SELECT cron.unschedule('nowopen-update-alerts')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nowopen-update-alerts');
SELECT cron.schedule('nowopen-update-alerts', '*/15 * * * *',
  $cron$select public.dispatch_scheduled_update_alerts();$cron$);

-- 5. Reports ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.business_update_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  update_id   uuid NOT NULL REFERENCES public.business_updates(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  -- Null for anonymous reporters.
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason      text NOT NULL,
  detail      text,
  status      text NOT NULL DEFAULT 'open',
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.business_update_reports DROP CONSTRAINT IF EXISTS business_update_reports_reason_check;
ALTER TABLE public.business_update_reports ADD CONSTRAINT business_update_reports_reason_check
  CHECK (reason IN ('spam', 'misleading', 'offensive', 'scam', 'impersonation', 'other'));

ALTER TABLE public.business_update_reports DROP CONSTRAINT IF EXISTS business_update_reports_status_check;
ALTER TABLE public.business_update_reports ADD CONSTRAINT business_update_reports_status_check
  CHECK (status IN ('open', 'actioned', 'rejected'));

ALTER TABLE public.business_update_reports DROP CONSTRAINT IF EXISTS business_update_reports_detail_check;
ALTER TABLE public.business_update_reports ADD CONSTRAINT business_update_reports_detail_check
  CHECK (detail IS NULL OR char_length(detail) <= 500);

CREATE INDEX IF NOT EXISTS idx_business_update_reports_open
  ON public.business_update_reports (created_at DESC) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_business_update_reports_update
  ON public.business_update_reports (update_id);

/*
  A reporter cannot choose which business a report lands on, set its status,
  or pretend it was reviewed. The business comes from the update itself.
  SECURITY DEFINER because the update may no longer be visible to the caller
  by the time this runs (the policy below decides that, not this).
*/
CREATE OR REPLACE FUNCTION public.fill_business_update_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT u.business_id INTO NEW.business_id FROM public.business_updates u WHERE u.id = NEW.update_id;
  IF NEW.business_id IS NULL THEN
    RAISE EXCEPTION 'Update not found.';
  END IF;
  IF coalesce(auth.role(), '') IN ('anon', 'authenticated') THEN
    NEW.status      := 'open';
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bur_10_fill ON public.business_update_reports;
CREATE TRIGGER trg_bur_10_fill
  BEFORE INSERT ON public.business_update_reports
  FOR EACH ROW EXECUTE FUNCTION public.fill_business_update_report();

DROP TRIGGER IF EXISTS business_update_reports_rate_limit ON public.business_update_reports;
CREATE TRIGGER business_update_reports_rate_limit
  BEFORE INSERT ON public.business_update_reports
  FOR EACH ROW EXECUTE FUNCTION public.enforce_public_write_limit('update_report', '30', '1 hour');

ALTER TABLE public.business_update_reports ENABLE ROW LEVEL SECURITY;

/*
  Anyone may report an update they can currently see. No public SELECT at all,
  not even for the reporter or the business: reports name content as a scam,
  which is material a competitor would mine. NOTE for the client: never chain
  .select() onto this insert; RLS would kill the write and blame the insert.
*/
DROP POLICY IF EXISTS "Anyone can report a visible update" ON public.business_update_reports;
CREATE POLICY "Anyone can report a visible update" ON public.business_update_reports
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    (user_id IS NULL OR user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.business_updates u WHERE u.id = update_id)
  );

DROP POLICY IF EXISTS "Staff read update reports" ON public.business_update_reports;
CREATE POLICY "Staff read update reports" ON public.business_update_reports
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Staff manage update reports" ON public.business_update_reports;
CREATE POLICY "Staff manage update reports" ON public.business_update_reports
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMENT ON TABLE public.business_update_reports IS
  'Reports about business update content. Anyone may file one (rate-limited); only admins read them.';
