-- A phone signup must put the phone number on the profile.
--
-- ── WHAT WAS MEASURED, 2026-09-22 ────────────────────────────────────────
--
-- The day phone signup started working, the first real phone signups produced:
--
--   auth.users.phone     2348000000000     the number they signed up with
--   public.users.phone   NULL              the profile the app actually reads
--
-- handle_new_user() takes the phone from `raw_user_meta_data->>'phone'` — a
-- value the CLIENT chooses to send — rather than from `NEW.phone`, which is the
-- column GoTrue itself sets from the verified signup. The app's own signUp()
-- does pass that metadata, so the browser path happens to work; every other
-- way in does not.
--
-- That is a contract held together by one caller remembering. A signup through
-- the REST endpoint, a future mobile client, an admin-created user or a social
-- link all land with a phone number on the account and no phone number on the
-- profile — and nothing errors, so it would be found the day support asks why
-- a business has no contact number.
--
-- ── THE FIX ──────────────────────────────────────────────────────────────
--
-- Prefer the metadata (the app sends it in E.164, "+234…", which is the format
-- the rest of the product stores and renders) and fall back to NEW.phone, which
-- is always present for a phone signup.
--
-- GoTrue strips the leading "+" — it stores "2348000000000", not
-- "+2348000000000" — so the fallback re-adds it rather than writing a second
-- phone format into a column the app formats and dials. MEASURED: every one of
-- the 3 probe rows created today was stored without the plus.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_requested text := NEW.raw_user_meta_data->>'role';
  -- Allowlist. 'admin' is deliberately absent: it is granted by an existing
  -- admin or the service role, never claimed at registration.
  v_role text := CASE
    WHEN v_requested = 'media_service' THEN 'media_service'
    ELSE 'business'
  END;
  v_is_business boolean := v_role <> 'media_service';
  /*
   * The phone, from whichever source actually has it.
   *
   * Metadata first: the app sends E.164 and that is what the product stores.
   * NEW.phone second: authoritative, always set for a phone signup, and
   * normalised by GoTrue without the leading "+", which is added back so the
   * column holds one format rather than two.
   */
  v_meta_phone text := nullif(btrim(coalesce(NEW.raw_user_meta_data->>'phone', '')), '');
  v_auth_phone text := nullif(btrim(coalesce(NEW.phone, '')), '');
  v_phone text := coalesce(
    v_meta_phone,
    CASE
      WHEN v_auth_phone IS NULL THEN NULL
      WHEN left(v_auth_phone, 1) = '+' THEN v_auth_phone
      ELSE '+' || v_auth_phone
    END
  );
BEGIN
  INSERT INTO public.users (
    id, email, role, phone,
    plan, plan_status, plan_billing_cycle, plan_renews_at, plan_updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    v_role,
    v_phone,
    CASE WHEN v_is_business THEN 'business-pro' ELSE 'starter' END,
    CASE WHEN v_is_business THEN 'trialing'     ELSE 'active'  END,
    CASE WHEN v_is_business THEN 'trial'        ELSE NULL      END,
    CASE WHEN v_is_business THEN now() + interval '3 months'   ELSE NULL END,
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- ── Backfill ─────────────────────────────────────────────────────────────
--
-- The profiles already created without a phone. Only where the profile has
-- none and the account does, so nothing a person has typed is overwritten.
update public.users u
   set phone = CASE
         WHEN left(btrim(au.phone), 1) = '+' THEN btrim(au.phone)
         ELSE '+' || btrim(au.phone)
       END
  from auth.users au
 where au.id = u.id
   and coalesce(btrim(au.phone), '') <> ''
   and coalesce(btrim(u.phone), '') = '';
