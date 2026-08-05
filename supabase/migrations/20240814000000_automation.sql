/*
  # Merchant automation ledger

  Supports the `run-automations` edge function (scheduled) which does the
  recurring busywork for business owners: booking reminders, post-booking
  review requests, trial-expiry nudges and low-stock alerts.

  `automation_log` records that a given automation has fired for a given target,
  so a scheduled run never double-sends. Keyed by (kind, ref_id) — e.g.
  ('booking_reminder', <booking id>), ('trial_ending', <user id>),
  ('low_stock', <product id>). Written only by the service role (the edge
  function); admins may read it for diagnostics.
*/

CREATE TABLE IF NOT EXISTS public.automation_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL,
  ref_id      text NOT NULL,
  business_id uuid,
  detail      jsonb,
  created_at  timestamptz DEFAULT now()
);

-- Hard de-dupe guarantee: one log row per (automation, target).
CREATE UNIQUE INDEX IF NOT EXISTS idx_automation_log_kind_ref
  ON public.automation_log (kind, ref_id);

ALTER TABLE public.automation_log ENABLE ROW LEVEL SECURITY;

-- Service role (edge function) bypasses RLS for writes; admins can read.
DROP POLICY IF EXISTS "Admins read automation log" ON public.automation_log;
CREATE POLICY "Admins read automation log" ON public.automation_log
  FOR SELECT TO authenticated USING (public.is_admin());
