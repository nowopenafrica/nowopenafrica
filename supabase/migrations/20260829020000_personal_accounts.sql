/*
  # A person can have an account as a person

  Until now `users.role` was 'business' | 'media_service' | 'admin'. There was
  no value meaning "I am here to find businesses, not to run one", and the
  signup form offered no such choice. Two consequences, both real:

  1. Every shopper who signed up became a `business` on a 3-month `business-pro`
     trial. handle_new_user() reads `v_is_business := v_role <> 'media_service'`,
     so anything that is not media_service is treated as a business. The trial
     and trialing-account numbers count people who never intended to sell
     anything.

  2. Keep — the whole point of which is a person following a business — was
     gated behind a form telling that person they were in the wrong place.

  This adds 'personal'. It is deliberately NOT a permission tier: it grants
  nothing and restricts nothing. Business ownership has never been decided by
  role — the businesses insert policy is `auth.uid() = user_id` — so a personal
  account can add a business the moment they want to, and one human can be a
  customer of ten businesses and the owner of one. That is the point.

  The escalation guard from 20240818000000 is preserved exactly: 'admin' stays
  out of the allowlist, role stays frozen on UPDATE for everyone but the service
  role and existing admins. This migration widens the allowlist by one safe
  value; it does not soften the boundary.

  Re-runnable: CREATE OR REPLACE, and the constraint is dropped before it is
  added.
*/

-- 1. Signup: 'personal' is a real answer, and does not get a business trial ----

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
    WHEN v_requested = 'personal'      THEN 'personal'
    ELSE 'business'
  END;
  -- Only an actual business gets the business trial. A person browsing for
  -- somewhere to eat is not a trialing customer, and counting them as one
  -- makes the trial figures describe something that is not happening.
  v_is_business boolean := v_role = 'business';
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

-- 2. Bound the column, now with one more allowed value ------------------------

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IS NULL OR role IN ('business', 'media_service', 'personal', 'admin')) NOT VALID;
