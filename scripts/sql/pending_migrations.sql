-- Consolidated: the ONLY migrations missing from the live database.
-- Verified 2026-08-17 by probing all 46 declared tables and the SQL helper
-- functions: 45/46 tables and is_admin() are present; analytics_events,
-- is_staff(), is_editor() and register_push_token() are not.
--
-- Every statement below is idempotent, so this is safe to run more than once.
-- Paste into Supabase SQL Editor and run as a single script.


-- ============================================================
-- 20260815090000_site_settings.sql
-- ============================================================
-- Site-wide settings the admin controls and every visitor reads.
--
-- Deliberately a key/value table rather than one column per setting: the hero
-- banner is the first of these, and adding the next one should not need a
-- migration, a type change and a deploy.
--
-- Readable by everyone (anon included) because the homepage renders from it
-- before anyone signs in. Writable only by admins.

create table if not exists public.site_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

alter table public.site_settings enable row level security;

-- Public read. Nothing secret belongs in this table — it is exactly the
-- configuration the homepage already reveals by rendering it.
drop policy if exists "site_settings_public_read" on public.site_settings;
create policy "site_settings_public_read"
  on public.site_settings for select
  using (true);

-- Admin-only write, via public.is_admin() — the same helper every other admin
-- policy in this schema uses.
--
-- It must be that function and not an inline subquery. A policy runs as the
-- calling user, so `select 1 from public.users where id = auth.uid()` is itself
-- subject to public.users' RLS: the row is invisible, the check returns false,
-- and a genuine admin is refused with "new row violates row-level security
-- policy". is_admin() is SECURITY DEFINER, so the lookup actually sees the row.
-- Written the wrong way first; leaving the reason here so it isn't rewritten
-- that way again.
do $$
begin
  -- Only if missing — never clobber a live definition with this copy of it.
  if to_regprocedure('public.is_admin()') is null then
    execute $fn$
      create function public.is_admin()
      returns boolean
      language sql
      security definer
      set search_path = public
      stable
      as $body$
        select exists (select 1 from public.users where id = auth.uid() and role = 'admin');
      $body$;
    $fn$;
  end if;
end $$;

drop policy if exists "site_settings_admin_write" on public.site_settings;
create policy "site_settings_admin_write"
  on public.site_settings for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Seed the hero row so the homepage reads a real row rather than relying on a
-- missing-row fallback. Video on, no colour override -> the NowOpen gradient.
insert into public.site_settings (key, value)
values ('hero_banner', '{"videoEnabled": true, "bannerColor": null, "textSyncWithVideo": true}'::jsonb)
on conflict (key) do nothing;

-- ============================================================
-- 20260816090000_editor_role.sql
-- ============================================================
/*
  # Add the `editor` role

  A content role: the homepage banner, hero videos and listing content. NOT
  accounts, payments, verification, personal data, or deletion.

  Three things are required for the role to be real rather than cosmetic:

    1. The CHECK constraint from 20240818000000_role_escalation_guard.sql bounds
       users.role to ('business','media_service','admin'). Without widening it,
       the Users panel dropdown simply fails on save.

    2. is_editor()/is_staff() helpers, SECURITY DEFINER for the same reason
       is_admin() is: a policy runs as the caller, so an inline lookup against
       public.users is filtered by that table's own RLS and silently returns
       false. (Learned the hard way on site_settings.)

    3. Actual permissions. The Admin Console hides tabs an editor may not use,
       but hiding is not enforcing — every privileged table is already
       `USING (is_admin())`, so an editor calling the API directly gets nothing.
       That default-deny is what makes the role safe. The one thing they must be
       able to WRITE is the hero banner, granted below.

  Deliberately NOT changed:

    - handle_new_user() keeps its allowlist of business / media_service, so a
      signup carrying {"role":"editor"} still lands as 'business'. Editor is
      granted by an admin, never claimed at registration — the same rule that
      already applies to admin.

    - guard_user_role_column() already freezes role for anyone who is not the
      service role or an admin, so an editor cannot promote themselves or
      anyone else. It needs no change; is_admin() stays the gate.

  NOTE ON HERO VIDEOS: the `hero-videos` storage bucket has no policy in this
  repo (only business-images does), so upload/delete there is governed by
  whatever is configured in the Supabase dashboard. If editors cannot upload a
  hero video, that bucket's policy is why, and it needs the same is_staff()
  treatment applied there.
*/

-- 1. Widen the role constraint ------------------------------------------------
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IS NULL OR role IN ('business', 'media_service', 'editor', 'admin')) NOT VALID;

-- 2. Helpers ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_editor()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'editor'
  );
$$;

-- Admin OR editor. Use this for anything an editor is meant to reach; keep
-- is_admin() for everything else so the default stays deny.
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role IN ('admin', 'editor')
  );
$$;

-- 3. The one write an editor gains: the homepage banner -----------------------
-- site_settings may not exist yet on a project that has not run the previous
-- migration, so this is guarded rather than assumed.
DO $$
BEGIN
  IF to_regclass('public.site_settings') IS NOT NULL THEN
    DROP POLICY IF EXISTS "site_settings_admin_write" ON public.site_settings;
    DROP POLICY IF EXISTS "site_settings_staff_write" ON public.site_settings;
    CREATE POLICY "site_settings_staff_write"
      ON public.site_settings FOR ALL
      TO authenticated
      USING (public.is_staff())
      WITH CHECK (public.is_staff());
  END IF;
END $$;

-- After applying, confirm who holds staff roles:
--   SELECT id, email, role FROM public.users WHERE role IN ('admin','editor');

-- ============================================================
-- 20260817090000_observability_and_push_token_fix.sql
-- ============================================================
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
