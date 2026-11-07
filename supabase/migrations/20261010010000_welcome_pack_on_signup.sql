-- Welcome somebody who has just signed up.
--
-- ── WHY NOBODY HAS EVER BEEN WELCOMED ────────────────────────────────────
--
-- MEASURED 2026-09-23:
--
--   accounts                                    15
--   created in the last 60 days                 10
--   onboarding_deliveries                        0   ← ever
--
-- The welcome pack was triggered from the BROWSER, right after signUp(), using
-- the new session's access token. With email confirmation enabled there IS no
-- session at that moment, so the call fell back to the anon key — which
-- send-onboarding rejects on purpose — and returned 401. The client swallows
-- that by design, because a welcome email must never break signing up.
--
-- So it failed exactly as quietly as it was built to fail: no error surfaced,
-- no delivery recorded, and the feature looked finished.
--
-- ── WHY A TRIGGER AND NOT A LOOSER CHECK ─────────────────────────────────
--
-- Letting the anon key name a recipient would turn the endpoint into a mailer
-- for whoever asks. Instead the SERVER asks on the user's behalf: this trigger
-- holds the shared secret and passes only the new user's id, and the function
-- still resolves the address from the database rather than from the request.
--
-- It also catches every route in — email, phone, Google, GitHub — rather than
-- only the ones whose signUp happens to return a session.
--
-- ── IT CANNOT DELAY OR BREAK A SIGNUP ────────────────────────────────────
--
-- net.http_post QUEUES the request and returns immediately; pg_net delivers it
-- out of band. And the whole body is wrapped so that ANY failure — pg_net
-- absent, config missing, anything — is a notice, never an exception. A
-- trigger on auth.users that can raise is a trigger that can stop people
-- creating accounts, which is a far worse outcome than a missing welcome email.

create or replace function public.welcome_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_key text;
  v_anon text;
begin
  begin
    select value into v_url  from public.private_config where key = 'onboarding_endpoint';
    select value into v_key  from public.private_config where key = 'onboarding_secret';
    select value into v_anon from public.private_config where key = 'anon_key';

    -- Not configured is not an error. Say so and let the signup finish.
    if v_url is null or v_key is null then
      raise notice 'welcome_new_user: onboarding not configured; skipping.';
      return NEW;
    end if;

    perform net.http_post(
      url     := v_url,
      body    := jsonb_build_object(
        'userId', NEW.id,
        -- The function resolves the real address from the database; these are
        -- only a hint for the greeting, and it prefers its own lookup.
        'role', NEW.raw_user_meta_data->>'role'
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(v_anon, ''),
        'x-onboarding-key', v_key
      ),
      timeout_milliseconds := 20000
    );
  exception when others then
    /*
     * Deliberately swallowed. This runs inside the transaction that creates an
     * account; an exception here would roll that back and the person could not
     * sign up at all. A missing welcome email is recoverable — a signup that
     * fails because of one is not.
     */
    raise notice 'welcome_new_user: could not queue the welcome pack (%).', sqlerrm;
  end;

  return NEW;
end $$;

revoke all on function public.welcome_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_welcome on auth.users;
create trigger on_auth_user_welcome
  after insert on auth.users
  for each row execute function public.welcome_new_user();

comment on function public.welcome_new_user() is
  'Queues the onboarding welcome pack for a new account. Never raises: a failed welcome must not fail a signup.';
