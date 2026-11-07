-- Which business tools somebody keeps in their Create menu.
--
-- ── WHY A TABLE AND NOT localStorage ─────────────────────────────────────
--
-- These are shortcuts a business owner sets up once and then relies on. A
-- caterer pins receipts and invoices; a photographer pins design and
-- catalogues. Keeping that in localStorage means it lives on one device: the
-- phone they set it up on, not the laptop they do their invoicing on, and gone
-- entirely when they clear site data.
--
-- The house rule elsewhere in this codebase is that localStorage is for
-- per-viewer conveniences — a remembered filter, a collapsed section. A
-- deliberate configuration that a person would be annoyed to redo belongs in
-- the database.
--
-- ── IT IS A PREFERENCE, NOT A PERMISSION ─────────────────────────────────
--
-- Pinning a tool does not grant access to it. Every tool here is an existing
-- Studio module with its own gates; this only decides what appears in a menu.
-- So the rules are simple: you read and write your own rows, and nobody
-- else's.

create table if not exists public.create_tool_pins (
  user_id    uuid not null references public.users(id) on delete cascade,
  -- The CreateTool.key from src/lib/create/intents.ts. Deliberately text and
  -- not an enum: the tool catalogue is application config and changes with a
  -- deploy, and a migration per new shortcut would be absurd.
  tool_key   text not null,
  -- Order in the menu. Lets somebody put the thing they use hourly first.
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, tool_key)
);

comment on table public.create_tool_pins is
  'Business tools a person keeps in their NowOpen Create menu. A preference, not a permission — every tool has its own gates.';

create index if not exists create_tool_pins_user_idx
  on public.create_tool_pins (user_id, position);

alter table public.create_tool_pins enable row level security;

-- Your own rows, for every operation. There is no reason for anybody to read
-- or change somebody else's shortcuts, including an admin.
drop policy if exists create_tool_pins_own on public.create_tool_pins;
create policy create_tool_pins_own on public.create_tool_pins
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.create_tool_pins to authenticated;

/**
 * Replace somebody's pinned tools in one call.
 *
 * Taking the whole list rather than one key at a time means the menu is never
 * briefly half-saved, and the position is simply the array order — which is
 * what the UI already knows and would otherwise have to compute.
 *
 * Acts on auth.uid(); there is no user parameter to point at somebody else.
 */
create or replace function public.set_create_tool_pins(p_keys text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not signed in.' using errcode = 'insufficient_privilege';
  end if;
  -- A menu, not a filing cabinet. Beyond this it stops being a shortcut.
  if coalesce(array_length(p_keys, 1), 0) > 12 then
    raise exception 'That is more shortcuts than a menu can usefully hold.'
      using errcode = 'check_violation';
  end if;

  delete from public.create_tool_pins where user_id = v_uid;

  if p_keys is not null and array_length(p_keys, 1) > 0 then
    insert into public.create_tool_pins (user_id, tool_key, position)
    select v_uid, k.key, k.ord - 1
      from unnest(p_keys) with ordinality as k(key, ord)
     -- A duplicate in the array would violate the primary key and lose the
     -- whole save; the menu simply cannot show the same tool twice anyway.
     on conflict (user_id, tool_key) do nothing;
  end if;
end $$;

revoke all on function public.set_create_tool_pins(text[]) from public, anon;
grant execute on function public.set_create_tool_pins(text[]) to authenticated;

comment on function public.set_create_tool_pins(text[]) is
  'Replaces the caller''s pinned Create tools in one transaction. Array order is menu order. Takes no user id — acts on auth.uid().';
