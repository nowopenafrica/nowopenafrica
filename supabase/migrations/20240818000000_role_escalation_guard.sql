/*
  # Close two privilege-escalation paths onto users.role

  `is_admin()` reads `users.role = 'admin'`, and every admin-gated policy in the
  schema is `FOR ALL TO authenticated USING (is_admin())`. So whoever can write
  `users.role` owns the platform. Two routes could:

  1. SIGNUP METADATA. handle_new_user() copied the role straight out of
     `raw_user_meta_data->>'role'`. That object is supplied by whoever calls the
     public signup endpoint — the app's own form only offers business /
     media_service, but the API accepts any JSON, so a signup carrying
     `{"data":{"role":"admin"}}` created an admin account outright. Auth user
     metadata is client-owned and must never be trusted for authorisation.

  2. SELF-UPDATE. The "Users can update own profile" policy is
     `FOR UPDATE USING (auth.uid() = id)` with no WITH CHECK, so Postgres reuses
     USING for the new row too: the row's id can't change, but every other
     column can — including role. Any signed-in user could PATCH their own row
     to `{"role":"admin"}` with nothing but the public anon key. The existing
     guard_user_plan_columns trigger froze the plan columns and never covered
     role.

  Fixes, in the database because that is the only real boundary:
    - handle_new_user() now allowlists the signup role; anything else (notably
      'admin') falls back to 'business'. The 3-month business trial behaviour is
      unchanged.
    - guard_user_role_column() freezes role on UPDATE for everyone except the
      service role and existing admins, so the Admin Dashboard's role editor
      keeps working while self-promotion does not.
    - A CHECK constraint bounds the column to the three roles the app knows.
      Added NOT VALID so legacy rows can't fail the migration; it still applies
      to every INSERT and UPDATE from here on.

  AFTER APPLYING, confirm nobody escalated already:
      SELECT id, email, role FROM public.users WHERE role = 'admin';
*/

-- 1. Signup: never take an authorisation decision from client metadata --------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested text := NEW.raw_user_meta_data->>'role';
  -- Allowlist. 'admin' is deliberately absent: it is granted by an existing
  -- admin or the service role, never claimed at registration.
  v_role text := CASE
    WHEN v_requested = 'media_service' THEN 'media_service'
    ELSE 'business'
  END;
  v_is_business boolean := v_role <> 'media_service';
BEGIN
  INSERT INTO public.users (
    id, email, role, phone,
    plan, plan_status, plan_billing_cycle, plan_renews_at, plan_updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    v_role,
    NEW.raw_user_meta_data->>'phone',
    CASE WHEN v_is_business THEN 'business-pro' ELSE 'starter' END,
    CASE WHEN v_is_business THEN 'trialing'     ELSE 'active'  END,
    CASE WHEN v_is_business THEN 'trial'        ELSE NULL      END,
    CASE WHEN v_is_business THEN now() + interval '3 months'   ELSE NULL END,
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 2. Update: role is not a self-service field ---------------------------------
CREATE OR REPLACE FUNCTION public.guard_user_role_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role (edge functions) and existing admins may set roles; for
  -- everyone else the column is frozen to whatever it already was. Silently
  -- reverting rather than raising keeps ordinary profile saves working even if
  -- a client sends the whole row back.
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_admin() THEN
    NEW.role := OLD.role;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_user_role_column ON public.users;
CREATE TRIGGER guard_user_role_column
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_role_column();

-- 3. Bound the column itself --------------------------------------------------
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IS NULL OR role IN ('business', 'media_service', 'admin')) NOT VALID;
