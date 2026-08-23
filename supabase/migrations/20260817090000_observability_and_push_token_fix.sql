/*
  # Observability, and close the device_push_tokens hole

  Two lowest-scoring items from the platform review: Observability 2/10 (nothing
  in production reports anything) and a write hole flagged as C5 in the previous
  audit and still open.

  ---------------------------------------------------------------------------
  1. device_push_tokens — anonymous UPDATE with USING (true)

  The existing policy is:

      CREATE POLICY "Anyone can update a push token" ON device_push_tokens
        FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

  USING (true) leaves the target row unrestricted, so anyone with the public
  anon key can rewrite EVERY row — repoint every device token at themselves, or
  blank the whole send list. The intent was only "let a device refresh its own
  token".

  The obvious narrowing (USING user_id = auth.uid()) does NOT work here, and
  shipping it would have broken push for real users. The mobile client calls

      .upsert({ token, platform, user_id }, { onConflict: 'token' })

  which performs an UPDATE whenever the token already exists. Tokens are
  registered BEFORE sign-in, so those rows have user_id = null and auth.uid() is
  null — every anonymous refresh would start failing silently, and push would
  simply stop working for signed-out devices.

  RLS also cannot express the correct rule. Ownership here is proof of holding
  the token, but a USING clause sees only the existing row, and there is no way
  to require "the new row keeps the same token" without referencing OLD.

  So the write path becomes a SECURITY DEFINER function, and direct client
  writes are withdrawn. The function can enforce exactly one row — the one
  matching the token presented — which is the rule we actually want. Anonymous
  registration keeps working; rewriting somebody else's row becomes impossible
  because no client can issue an UPDATE at all.

  REQUIRES A MOBILE CHANGE: usePushRegistration must call
  rpc('register_push_token', …) instead of upserting. Both ship together.

  ---------------------------------------------------------------------------
  2. analytics_events — one table, self-hosted

  Supabase rather than a third-party analytics vendor, deliberately:

    - No new CSP host. Every vendor script is a policy exception and a
      supply-chain dependency; this reuses a connection the app already has.
    - It gives the business-facing stats the Trust Panel currently refuses to
      invent (views, enquiries) a real source, so they can stop being absent
      without becoming fabricated.
    - Data stays in the same jurisdiction as everything else.

  One table with a jsonb payload rather than a column per metric, so adding an
  event is a client-side change only.

  PRIVACY. Public INSERT is unavoidable (visitors are anonymous), so the table is
  append-only from the client and readable only by staff or the owning business.
  No email, no phone, no free text: the client library allowlists primitive props
  and drops the rest before sending. `session_id` is a random per-tab value, not
  a device or user fingerprint, and is never joined outside this table.
*/

-- 1. Push tokens: one guarded write path -----------------------------------

CREATE OR REPLACE FUNCTION public.register_push_token(
  p_token text,
  p_platform text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RAISE EXCEPTION 'token required';
  END IF;

  -- Exactly one row: the one carrying this token. A caller cannot name another.
  INSERT INTO public.device_push_tokens (token, platform, user_id, updated_at)
  VALUES (
    trim(p_token),
    CASE WHEN p_platform IN ('ios', 'android', 'web') THEN p_platform ELSE NULL END,
    auth.uid(),
    now()
  )
  ON CONFLICT (token) DO UPDATE
    SET platform   = COALESCE(excluded.platform, public.device_push_tokens.platform),
        -- Claim the row on sign-in, but never un-claim it: a later anonymous
        -- call must not detach a token from the user who owns it.
        user_id    = COALESCE(excluded.user_id, public.device_push_tokens.user_id),
        updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_push_token(text, text) TO anon, authenticated;

-- Withdraw the direct client writes the function replaces.
DROP POLICY IF EXISTS "Anyone can update a push token" ON public.device_push_tokens;
DROP POLICY IF EXISTS "Anyone can register a push token" ON public.device_push_tokens;

-- A signed-in user may still remove their own device.
DROP POLICY IF EXISTS "Users can delete their own push token" ON public.device_push_tokens;
CREATE POLICY "Users can delete their own push token"
  ON public.device_push_tokens
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 2. analytics_events -------------------------------------------------------

create table if not exists public.analytics_events (
  id          bigserial primary key,
  name        text not null,
  props       jsonb not null default '{}'::jsonb,
  -- Nullable: most events happen before or without sign-in.
  user_id     uuid references auth.users(id) on delete set null,
  business_id uuid,
  -- Random per-tab value. Not a device or user fingerprint.
  session_id  text,
  path        text,
  created_at  timestamptz not null default now()
);

-- Queries are always "recent events of a kind" or "events for one business".
create index if not exists analytics_events_name_created_idx
  on public.analytics_events (name, created_at desc);
create index if not exists analytics_events_business_idx
  on public.analytics_events (business_id, created_at desc)
  where business_id is not null;

alter table public.analytics_events enable row level security;

-- Append-only from the client. Visitors are anonymous, so INSERT must be open;
-- nothing sensitive is accepted, and no client can read the table back.
drop policy if exists "analytics_insert" on public.analytics_events;
create policy "analytics_insert"
  on public.analytics_events for insert
  to anon, authenticated
  with check (true);

-- Staff read. is_staff() is SECURITY DEFINER, so the lookup is not filtered by
-- public.users' own RLS — the mistake that broke the site_settings policy.
drop policy if exists "analytics_staff_read" on public.analytics_events;
create policy "analytics_staff_read"
  on public.analytics_events for select
  to authenticated
  using (public.is_staff());

-- A business owner reads their OWN rows. This is what makes analytics a product
-- feature rather than an internal-only tool.
drop policy if exists "analytics_owner_read" on public.analytics_events;
create policy "analytics_owner_read"
  on public.analytics_events for select
  to authenticated
  using (
    business_id is not null
    and exists (
      select 1 from public.businesses b
      where b.id = analytics_events.business_id
        and b.user_id::text = auth.uid()::text
    )
  );

-- No UPDATE or DELETE policy anywhere: absent means denied, so an append-only
-- log cannot be quietly rewritten.
