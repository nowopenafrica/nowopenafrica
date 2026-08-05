/*
  # 3-month all-access trial for new business registrations

  Launch promo: every NEW business account is provisioned on the top-tier
  "Business Pro" (all-access) plan for free, for 3 months. This teaches the
  existing handle_new_user() signup trigger to stamp the trial onto the profile
  row it already creates.

  - role 'business'  → plan = 'business-pro', status = 'trialing',
                       plan_renews_at = now + 3 months (the trial end date).
  - role 'media_service' → unchanged (free Creative Starter).

  The grant happens inside the INSERT, so the guard_user_plan_columns trigger
  (which only fires on UPDATE) doesn't block it. After the trial end date the
  app treats the plan as reverted to Starter (read-side, in the Dashboard) and
  prompts the owner to choose a paid plan — no scheduled job required.

  Existing accounts are intentionally NOT back-granted: the offer is for new
  registrations. Re-running this migration only redefines the function.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := COALESCE(NEW.raw_user_meta_data->>'role', 'business');
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
