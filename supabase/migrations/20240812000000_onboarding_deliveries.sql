/*
  # Onboarding welcome-pack delivery ledger

  Tracks that the automatic onboarding email + follow-up WhatsApp message (the
  NowOpen Africa welcome brand kit) has been sent to a new signup, so the
  `send-onboarding` edge function can de-duplicate and never double-send.

  Written only by the service role (from the edge function). Users may read
  their own row (so the app can show "welcome pack sent" state if desired);
  admins can read all for support.
*/

CREATE TABLE IF NOT EXISTS public.onboarding_deliveries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email           text,
  phone           text,
  email_status    text NOT NULL DEFAULT 'skipped',
  whatsapp_status text NOT NULL DEFAULT 'skipped',
  created_at      timestamptz DEFAULT now()
);

-- One delivery record per user (the edge function checks-then-inserts; this is
-- the hard guarantee against a race double-sending).
CREATE UNIQUE INDEX IF NOT EXISTS idx_onboarding_deliveries_user
  ON public.onboarding_deliveries (user_id);

ALTER TABLE public.onboarding_deliveries ENABLE ROW LEVEL SECURITY;

-- Users can see their own delivery record.
DROP POLICY IF EXISTS "Users read own onboarding delivery" ON public.onboarding_deliveries;
CREATE POLICY "Users read own onboarding delivery" ON public.onboarding_deliveries
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Admins can read all (support / diagnostics). Writes are service-role only,
-- which bypasses RLS — no INSERT policy is granted to regular clients on
-- purpose (nobody should forge a "sent" record).
DROP POLICY IF EXISTS "Admins read onboarding deliveries" ON public.onboarding_deliveries;
CREATE POLICY "Admins read onboarding deliveries" ON public.onboarding_deliveries
  FOR SELECT TO authenticated USING (public.is_admin());
