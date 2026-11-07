-- The 43,363 sign-ins that never happened.
--
-- ── MEASURED ON PRODUCTION, 2026-09-22 ───────────────────────────────────
--
--   analytics_events total            43,745
--   of which name = 'signin'          43,369   (99.14%)
--   distinct users behind them             2
--   distinct sessions                     73   (~594 sign-ins per session)
--
-- The paths settle it. A sign-in happens on a sign-in page; these did not:
--
--   /                11,774
--   /studio          11,091
--   /admin-creator    5,078
--   /media            3,438
--   /dashboard        2,332
--   /login           only 6 of 43,369
--
-- Supabase fires SIGNED_IN when it RESTORES a session — on page load, tab
-- focus and after a token refresh — not only when credentials are exchanged.
-- So every page view by a signed-in operator was recorded as a fresh sign-in.
-- AuthContext now requires `last_sign_in_at` to be within two minutes, which
-- is the only signal that separates the two.
--
-- ── WHY THIS MATTERS BEYOND A WRONG NUMBER ───────────────────────────────
--
-- This table is the input to every traffic figure, every demand signal, every
-- attribution and any AI that recommends from platform data. While 99.14% of
-- it is one phantom event, a conversion rate computed from it is fiction, and
-- an agent told to "find opportunities" would be reading noise. The rule is
-- that analytics represent actual events; these do not.
--
-- ── QUARANTINED, NOT DELETED ─────────────────────────────────────────────
--
-- The rows are moved, not destroyed. They are evidence of a real bug and its
-- blast radius, and the day somebody asks "how long was this wrong for" the
-- answer should be recoverable rather than a shrug. Restoring them is a single
-- INSERT ... SELECT back.
--
-- The 6 sign-ins recorded on /login or /register are LEFT IN PLACE. They are
-- the only ones consistent with someone actually signing in, and deleting a
-- true row to tidy a table is the same error in the other direction.

create table if not exists public.analytics_events_quarantine (
  like public.analytics_events including defaults,
  quarantined_at timestamptz not null default now(),
  quarantine_reason text not null
);

comment on table public.analytics_events_quarantine is
  'Events removed from analytics_events as provably wrong. Kept so the blast radius of a telemetry bug stays measurable.';

-- Nothing here is anybody''s to read but staff; it is operational evidence.
alter table public.analytics_events_quarantine enable row level security;

drop policy if exists "quarantine is admin-only" on public.analytics_events_quarantine;
create policy "quarantine is admin-only"
  on public.analytics_events_quarantine for select
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

with doomed as (
  select id from public.analytics_events
   where name = 'signin'
     and coalesce(path, '') not in ('/login', '/register')
),
moved as (
  delete from public.analytics_events a
   using doomed d
   where a.id = d.id
  returning a.*
)
insert into public.analytics_events_quarantine
  (id, name, props, user_id, business_id, session_id, path, created_at, quarantine_reason)
select m.id, m.name, m.props, m.user_id, m.business_id, m.session_id, m.path, m.created_at,
       'phantom signin: SIGNED_IN fired on session restore, not authentication (2026-09-22)'
  from moved m;
