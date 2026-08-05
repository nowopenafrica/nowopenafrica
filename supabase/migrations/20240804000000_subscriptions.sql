/*
  # Subscriptions & plan provisioning

  Until now "plans" existed only as pricing catalogue data (pricingPlans.ts) —
  nothing recorded which plan an account actually held. This migration makes
  subscriptions real, end to end:

  1. Plan columns on `users`
     - `plan`            — active business tier id (starter default → the FREE plan)
     - `creative_plan`   — active creative tier id (creative-starter default → FREE)
     - `plan_status`     — active | past_due | canceled
     - `plan_billing_cycle` — monthly | annual
     - `plan_renews_at`  — when the current paid period ends (null on free)
     - `plan_updated_at`
     Every new account is provisioned on the free Starter plan automatically via
     these DEFAULTs (the handle_new_user trigger omits them, so the defaults apply).

  2. `subscriptions` table — one row per paid activation (audit trail + period).

  3. Security
     - Plan columns can ONLY be changed by the service role (the payment edge
       functions, which run after a verified Paystack charge). A trigger reverts
       any attempt by a normal signed-in user to raise their own plan — otherwise
       the existing "users can update own profile" policy would let anyone set
       plan = 'business-pro' from the browser console without paying.
     - subscriptions: owners read their own rows; admins read all; writes happen
       via the service role (edge functions), which bypasses RLS.
*/

-- 1. Plan columns on users -----------------------------------------------------
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS plan               text NOT NULL DEFAULT 'starter';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS creative_plan      text NOT NULL DEFAULT 'creative-starter';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS plan_status        text NOT NULL DEFAULT 'active';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS plan_billing_cycle text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS plan_renews_at     timestamptz;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS plan_updated_at    timestamptz DEFAULT now();

-- Backfill any rows that predate the columns (NOT NULL default already fills
-- existing rows, but be explicit for hand-created rows / re-runs).
UPDATE public.users SET plan = 'starter'                   WHERE plan IS NULL;
UPDATE public.users SET creative_plan = 'creative-starter' WHERE creative_plan IS NULL;
UPDATE public.users SET plan_status = 'active'             WHERE plan_status IS NULL;

-- 2. subscriptions table -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  kind           text NOT NULL DEFAULT 'business',   -- business | creative
  tier           text NOT NULL,                      -- e.g. growth, professional, creative-pro
  billing_cycle  text,                               -- monthly | annual
  status         text NOT NULL DEFAULT 'active',     -- active | canceled | past_due
  amount_usd     numeric,
  currency       text,
  payment_reference text,
  current_period_start timestamptz DEFAULT now(),
  current_period_end   timestamptz,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user   ON public.subscriptions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_ref    ON public.subscriptions (payment_reference);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners read their subscriptions" ON public.subscriptions;
CREATE POLICY "Owners read their subscriptions" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Admin full access (is_admin() ships in the admin_access migration).
DROP POLICY IF EXISTS "Admins manage subscriptions" ON public.subscriptions;
CREATE POLICY "Admins manage subscriptions" ON public.subscriptions
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 3. Anti-escalation: only the service role may change plan columns ------------
CREATE OR REPLACE FUNCTION public.guard_user_plan_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- auth.role() is 'service_role' for the service key (edge functions) and
  -- 'authenticated' for a signed-in browser client. Let the service role set
  -- anything; freeze plan columns for everyone else.
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    NEW.plan               := OLD.plan;
    NEW.creative_plan      := OLD.creative_plan;
    NEW.plan_status        := OLD.plan_status;
    NEW.plan_billing_cycle := OLD.plan_billing_cycle;
    NEW.plan_renews_at     := OLD.plan_renews_at;
    NEW.plan_updated_at    := OLD.plan_updated_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_user_plan_columns ON public.users;
CREATE TRIGGER guard_user_plan_columns
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_plan_columns();
