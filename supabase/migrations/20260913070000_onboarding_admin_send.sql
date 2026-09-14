/*
  # Onboarding admin controls — manual send + queue admin view

  The welcome pipeline is automatic; this adds the human override:

    - `onboarding_manual_sends` — a ledger for welcomes raised by hand from
      the admin console (business name + WhatsApp number as typed), with the
      same honest status set as `onboarding_messages`. Written only by the
      edge function's `manual` mode, which is JWT-gated to admins server-side.
    - admin RPCs for the dashboard tab, every one security-definer and gated
      on is_admin():
        onboarding_welcome_status()        (already exists — cron + counts)
        onboarding_messages_list(...)      recent automatic queue rows
        onboarding_manual_sends_list(...)  recent manual sends
        onboarding_messages_requeue(id)    put a terminal row back to 'queued'

  Honesty: nothing here sends either. The manual control runs the exact same
  gates as the automatic drain (kill switch, ClaimReach §22 suppression,
  configured provider, approved template) and records whichever one refused —
  the admin screen shows the truth, not a fake success.

  Re-runnable throughout.
*/

/*
  The manual ledger. Same shape and statuses as onboarding_messages, minus the
  businesses FK — a manual welcome may name a business that has no listing row
  yet, so the override carries the name as given. RLS on, no policies, every
  role denied: the only writers are the edge function (service role) and the
  writers are never the public.
*/
create table if not exists public.onboarding_manual_sends (
  id            uuid primary key default gen_random_uuid(),
  business_name text not null,
  phone         text not null,
  owner_name    text,
  profile_url   text,
  status        text not null default 'queued' check (status in (
                  'queued', 'sending', 'sent', 'no_phone', 'blocked',
                  'suppressed', 'needs_provider', 'needs_template', 'failed'
                )),
  reason        text,
  error         text,
  provider      text,
  attempts      integer not null default 0,
  created_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  sent_at       timestamptz
);

create index if not exists onboarding_manual_sends_created
  on public.onboarding_manual_sends (created_at desc);

alter table public.onboarding_manual_sends enable row level security;
revoke all on public.onboarding_manual_sends from anon, authenticated, public;

comment on table public.onboarding_manual_sends is
  'Manual onboarding WhatsApp welcomes sent from the admin console, with the honest outcome recorded. Only the edge function writes it (admins only).';

/*
  Admin read helpers. Security definer (owner reads past RLS) with an
  is_admin() gate on every call — authenticated admins only, never anon.
*/
create or replace function public.onboarding_messages_list(
  p_limit  integer default 50,
  p_offset integer default 0
)
returns setof public.onboarding_messages
language sql
stable
security definer
set search_path = public
as $$
  select * from public.onboarding_messages
  order by created_at desc
  limit greatest(1, least(p_limit, 200))
  offset greatest(0, p_offset);
$$;

create or replace function public.onboarding_manual_sends_list(
  p_limit  integer default 50,
  p_offset integer default 0
)
returns setof public.onboarding_manual_sends
language sql
stable
security definer
set search_path = public
as $$
  select * from public.onboarding_manual_sends
  order by created_at desc
  limit greatest(1, least(p_limit, 200))
  offset greatest(0, p_offset);
$$;

/*
  Admin override: put a terminal queue row back to 'queued' so the drainer
  re-examines it (e.g. after the provider or template was configured, or a
  phone was fixed). 'sent' rows are only ever re-sent by deleting the unique
  row — already-sent cannot be unsent, and the dedupe exists on purpose.
*/
create or replace function public.onboarding_messages_requeue(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;

  update public.onboarding_messages
     set status = 'queued',
         attempts = 0,
         reason = null,
         error = null,
         updated_at = now()
   where id = p_id
     and status <> 'sent';

  if not found then
    raise exception 'No requeueable row with id % (already-sent rows are final).', p_id;
  end if;
end;
$$;

comment on function public.onboarding_messages_requeue(p_id uuid) is
  'Admin-only: move a non-sent onboarding_messages row back to queued for the next drain.';

revoke all on function public.onboarding_messages_list(integer, integer) from public, anon;
revoke all on function public.onboarding_manual_sends_list(integer, integer) from public, anon;
revoke all on function public.onboarding_messages_requeue(uuid) from public, anon;

grant execute on function public.onboarding_messages_list(integer, integer) to authenticated;
grant execute on function public.onboarding_manual_sends_list(integer, integer) to authenticated;
grant execute on function public.onboarding_messages_requeue(uuid) to authenticated;