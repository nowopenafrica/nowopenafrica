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

-- Admin-only write. Checked against public.users.role rather than a claim, to
-- match how the rest of the schema gates admin actions.
drop policy if exists "site_settings_admin_write" on public.site_settings;
create policy "site_settings_admin_write"
  on public.site_settings for all
  to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'))
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

-- Seed the hero row so the homepage reads a real row rather than relying on a
-- missing-row fallback. Video on, no colour override -> the NowOpen gradient.
insert into public.site_settings (key, value)
values ('hero_banner', '{"videoEnabled": true, "bannerColor": null}'::jsonb)
on conflict (key) do nothing;
