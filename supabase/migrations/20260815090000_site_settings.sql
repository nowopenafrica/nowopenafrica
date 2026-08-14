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
values ('hero_banner', '{"videoEnabled": true, "bannerColor": null}'::jsonb)
on conflict (key) do nothing;
