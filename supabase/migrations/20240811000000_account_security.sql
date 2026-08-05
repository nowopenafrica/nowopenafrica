/*
  # Account & session security (security increment 3)

  Supporting tables for the Security page and admin audit log. (MFA/TOTP itself
  is handled by Supabase Auth natively — no table needed.)

  1. `login_events` — a lightweight per-user sign-in history the user can review
     from their Security page. Written best-effort by the client on sign-in.
     (IP/geo aren't reliably available client-side, so we record the user agent
     and timestamp.)

  2. `audit_log` — an append-only record of sensitive admin actions (deletes,
     role changes, verification decisions). Admin-only.
*/

CREATE TABLE IF NOT EXISTS public.login_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event      text NOT NULL DEFAULT 'sign_in',
  user_agent text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_events_user ON public.login_events (user_id, created_at DESC);

ALTER TABLE public.login_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own login events" ON public.login_events;
CREATE POLICY "Users read own login events" ON public.login_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users record own login events" ON public.login_events;
CREATE POLICY "Users record own login events" ON public.login_events
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  action      text NOT NULL,
  entity_type text,
  entity_id   text,
  detail      jsonb,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON public.audit_log (created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can read or write the audit log.
DROP POLICY IF EXISTS "Admins read audit log" ON public.audit_log;
CREATE POLICY "Admins read audit log" ON public.audit_log
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "Admins write audit log" ON public.audit_log;
CREATE POLICY "Admins write audit log" ON public.audit_log
  FOR INSERT TO authenticated WITH CHECK (public.is_admin() AND actor_id = auth.uid());
