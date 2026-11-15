/*
  # Instagram gallery: sync when an owner adds their handle, and reach every listing

  Spec: docs/instagram/INSTAGRAM_LIVE_AND_GALLERY_SPEC_2026-11-15.md (phase 1),
  approved by the founder 15 Nov 2026.

  ── 1. THE REFRESH POOL WAS CAPPED AT 88 BUSINESSES ──────────────────────

  refresh-instagram-gallery found its businesses by reading
  business_gallery.business_id with .limit(1000). MEASURED 15 Nov: 17,888
  Instagram gallery rows across 360 businesses, and PostgREST silently
  returned the first 1,000 rows, which belonged to 88 businesses. Exactly 88
  handles had ever been refreshed. The other 272 listings had not been updated
  since they were published.

  instagram_gallery_refresh_pool() answers the question in one set-based
  query, with no row cap. It is service-role only.

  ── 2. A REGISTERED BUSINESS ADDING ITS HANDLE IS CONSENT ────────────────

  Until now only listings that already showed an Instagram gallery were
  refreshed. The reason was that adding posts to a listing on the strength of
  a handle alone would be publishing about a business without its say.
  A CLAIMED business whose OWNER put the handle on their own page has given
  that say. So:
    - claimed businesses with a handle join the pool; and
    - changing the handle queues an instagram_sync_requests row and pokes the
      function at once, rather than waiting up to 20 minutes.

  Still enrichment, never discovery: the handle is the owner's own, for their
  own listing, and is looked up by username through business_discovery.

  The owner's master switch is respected: business_sync_preferences.sync_enabled
  = false means no request and no place in the pool.

  ── 3. NOTHING HERE TALKS TO META ────────────────────────────────────────

  The trigger only records the request and queues an HTTP call through pg_net.
  The pg_net queue is a table, so a save that rolls back sends nothing.
  The handle ledger, the quota pacing and the rate-limit stop all stay in the
  edge function.
*/

-- ── Handle normalisation, the SQL twin of normalizeHandle() ──────────────
-- (supabase/functions/_shared/discovery/instagram.ts). The parity cases live
-- in scripts/check-instagram-owner-sync.sql and src/lib/instagramOwnerSync.test.ts.
create or replace function public.instagram_handle_of(raw text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v text;
  m text[];
begin
  if raw is null then return null; end if;
  v := regexp_replace(raw, '^\s+|\s+$', '', 'g');
  if v = '' then return null; end if;

  m := regexp_match(v, 'instagram\.com/([^/?#\s]+)', 'i');
  if m is not null then v := m[1]; end if;

  v := regexp_replace(regexp_replace(v, '^@+', ''), '^\s+|\s+$', '', 'g');
  v := split_part(split_part(v, '?', 1), '#', 1);
  v := regexp_replace(v, '/+$', '');

  if v !~ '^[A-Za-z0-9._]{1,30}$' then return null; end if;
  if v ~* '^(p|reel|reels|stories|explore|accounts|direct)$' then return null; end if;
  return lower(v);
end;
$$;

comment on function public.instagram_handle_of(text) is
  'SQL twin of normalizeHandle() in _shared/discovery/instagram.ts: any written form of an Instagram account to a bare lowercase handle, or null.';

-- ── The request queue ─────────────────────────────────────────────────────
create table if not exists public.instagram_sync_requests (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  handle        text not null,
  status        text not null default 'pending',
  requested_at  timestamptz not null default now(),
  processed_at  timestamptz,
  posts_added   integer not null default 0,
  note          text,
  constraint instagram_sync_requests_status_valid
    -- 'working' is a run's claim on the row, so a scheduled run and a poke
    -- arriving together cannot both sync it (and insert each post twice).
    -- A rate limit leaves the row 'pending' for the next tick.
    check (status in ('pending', 'working', 'done', 'not_business', 'error')),
  constraint instagram_sync_requests_handle_normalised
    check (handle = lower(handle) and handle not like '@%' and length(handle) between 1 and 30)
);

comment on table public.instagram_sync_requests is
  'One row each time the owner of a claimed business sets or changes its Instagram handle. refresh-instagram-gallery works these first. Written only by the trigger and the service role.';

-- At most one waiting request per business: a second change replaces the handle.
create unique index if not exists instagram_sync_requests_one_pending
  on public.instagram_sync_requests (business_id) where status = 'pending';
create index if not exists instagram_sync_requests_pending_idx
  on public.instagram_sync_requests (requested_at) where status = 'pending';
create index if not exists instagram_sync_requests_business_idx
  on public.instagram_sync_requests (business_id, requested_at desc);

alter table public.instagram_sync_requests enable row level security;

drop policy if exists "Staff read instagram sync requests" on public.instagram_sync_requests;
create policy "Staff read instagram sync requests"
  on public.instagram_sync_requests for select
  to authenticated
  using (public.is_staff());

-- The owner may see how their own sync went, which is what the editor shows.
drop policy if exists "Owners read their instagram sync requests" on public.instagram_sync_requests;
create policy "Owners read their instagram sync requests"
  on public.instagram_sync_requests for select
  to authenticated
  using (exists (
    select 1 from public.businesses b
    where b.id = instagram_sync_requests.business_id and b.user_id = auth.uid()
  ));

-- No insert, update or delete policy: browsers never write here.
revoke insert, update, delete on public.instagram_sync_requests from anon, authenticated;

-- ── The poke ──────────────────────────────────────────────────────────────
-- The same call tick_instagram_gallery() makes, in "requests" mode, so only
-- waiting requests are worked and the rotation is left to the schedule.
create or replace function public.poke_instagram_sync()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_key text; v_anon text; v_id bigint;
begin
  select value into v_key  from public.private_config where key = 'automation_secret';
  select value into v_anon from public.private_config where key = 'anon_key';
  if v_key is null then
    -- The scheduled tick will still pick the request up; fail quietly.
    return null;
  end if;

  select net.http_post(
    url     := 'https://wvayqqfqqocwjripugnb.supabase.co/functions/v1/refresh-instagram-gallery',
    body    := '{"mode":"requests"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_anon, ''),
      'x-automation-key', v_key
    )
  ) into v_id;
  return v_id;
end;
$$;

revoke all on function public.poke_instagram_sync() from public, anon, authenticated;

-- ── The trigger ───────────────────────────────────────────────────────────
create or replace function public.queue_instagram_owner_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new text := public.instagram_handle_of(new.social_links->>'instagram');
  v_old text := null;
begin
  -- A business that has only just become registered is treated as having had
  -- no handle before: claiming a listing that already names its Instagram is
  -- the owner adopting that handle.
  if tg_op = 'UPDATE'
     and old.user_id is not null and coalesce(old.claim_status, '') = 'claimed' then
    v_old := public.instagram_handle_of(old.social_links->>'instagram');
  end if;

  -- Registered businesses only: claimed, with an owner.
  if new.user_id is null or coalesce(new.claim_status, '') <> 'claimed' then
    return new;
  end if;
  -- A real handle that actually changed. Reformatting the same link, or
  -- saving the story without touching Instagram, does nothing.
  if v_new is null or v_new is not distinct from v_old then
    return new;
  end if;
  -- The owner's master switch.
  if exists (
    select 1 from public.business_sync_preferences p
    where p.business_id = new.id and p.sync_enabled = false
  ) then
    return new;
  end if;

  update public.instagram_sync_requests
     set handle = v_new, requested_at = now()
   where business_id = new.id and status = 'pending';
  if not found then
    insert into public.instagram_sync_requests (business_id, handle)
    values (new.id, v_new);
  end if;

  -- A failed poke must never fail the owner's save: the schedule picks the
  -- request up within 20 minutes anyway.
  begin
    perform public.poke_instagram_sync();
  exception when others then
    raise notice 'queue_instagram_owner_sync: poke failed (%), left for the schedule', sqlerrm;
  end;

  return new;
end;
$$;

revoke all on function public.queue_instagram_owner_sync() from public, anon, authenticated;

drop trigger if exists queue_instagram_owner_sync on public.businesses;
create trigger queue_instagram_owner_sync
  after insert or update of social_links, claim_status, user_id on public.businesses
  for each row execute function public.queue_instagram_owner_sync();

-- ── The refresh pool, uncapped ────────────────────────────────────────────
create or replace function public.instagram_gallery_refresh_pool()
returns table (business_id uuid, instagram text)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.social_links->>'instagram'
  from public.businesses b
  where public.instagram_handle_of(b.social_links->>'instagram') is not null
    and not exists (
      select 1 from public.business_sync_preferences p
      where p.business_id = b.id and p.sync_enabled = false
    )
    and (
      exists (select 1 from public.business_gallery g
              where g.business_id = b.id and g.source_type = 'instagram')
      or (b.claim_status = 'claimed' and b.user_id is not null)
    )
  -- A stable order, so the caller can page past PostgREST's 1,000-row cap.
  order by b.id;
$$;

revoke all on function public.instagram_gallery_refresh_pool() from public, anon, authenticated;
grant execute on function public.instagram_gallery_refresh_pool() to service_role;

comment on function public.instagram_gallery_refresh_pool() is
  'Businesses refresh-instagram-gallery may check: an existing Instagram gallery, or claimed with an owner-set handle. Excludes owners who switched sync off. No row cap.';
