/*
  # Admin plan management + user notifications

  1. Let admins change a user's plan from the admin panel.
     The subscriptions migration froze the plan columns for every non-service
     caller (anti-escalation). That also blocked admins editing from the
     browser. Here we relax the guard to ALSO allow admins (same pattern the
     verified-badge guard already uses), so an admin `UPDATE users SET plan=…`
     sticks, while a normal user still can't raise their own plan.

  2. `notifications` — per-user dashboard notifications (plan changes, booking
     updates, admin messages, welcome, etc.). Users read/*mark read* their own;
     admins can create a notification for anyone (and read all for support).
*/

-- 1. Allow admins (as well as the service role) to set plan columns ------------
CREATE OR REPLACE FUNCTION public.guard_user_plan_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role (edge functions) and admins may change plan columns; everyone
  -- else has them frozen to their previous values.
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_admin() THEN
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

-- (trigger already exists from the subscriptions migration; replacing the
--  function is enough.)

-- 2. Notifications ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      text NOT NULL,
  body       text,
  type       text NOT NULL DEFAULT 'info',   -- info | success | warning | plan | booking
  link       text,                           -- optional in-app path to open
  read       boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications (user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Read: own notifications (admins can read all for support).
DROP POLICY IF EXISTS "Read own notifications" ON public.notifications;
CREATE POLICY "Read own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.is_admin());

-- Update: mark your own read/unread (admins too).
DROP POLICY IF EXISTS "Update own notifications" ON public.notifications;
CREATE POLICY "Update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id OR public.is_admin());

-- Insert: admins can notify anyone; a user may create their own (system/client
-- events). The service role bypasses RLS entirely.
DROP POLICY IF EXISTS "Create notifications" ON public.notifications;
CREATE POLICY "Create notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (public.is_admin() OR auth.uid() = user_id);

-- Delete: own (admins too).
DROP POLICY IF EXISTS "Delete own notifications" ON public.notifications;
CREATE POLICY "Delete own notifications" ON public.notifications
  FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_admin());
