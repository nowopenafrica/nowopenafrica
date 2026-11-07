/*
  # Record what Meta says AFTER a message is accepted

  `onboarding_messages.status = 'sent'` only ever meant "the Cloud API
  accepted the request", and it is terminal in the admin console. So the
  screen asserted a delivered message when nothing had reached a handset.

  MEASURED 2026-10-10: a manual send to `07081547726` -- a local number
  carrying no country code at all -- was recorded `sent`. Meta accepts such a
  request and drops it silently. A green row for a message nobody can receive
  is worse than a red one, because nobody goes looking.

  The Cloud API has NO endpoint that returns a message's status. Statuses
  arrive only as webhook events, keyed by Meta's own message id -- which the
  sender was discarding. Both halves are added here.

  ## Why a separate column and not the existing `status`

  `status` drives sending: RETRYABLE_STATUSES is queued / needs_provider /
  needs_template, and the drain reads it. Writing 'delivered' into it would
  put a value the drain has never heard of into its filter, and a late
  webhook could resurrect or strand a row. Delivery is a different fact about
  the same message, so it gets its own column and cannot disturb the queue.

  Nothing is back-filled. Every row that exists today was sent before any
  message id was kept, so its delivery state is genuinely unknown, and
  unknown is what it must read.
*/

alter table public.onboarding_messages
  add column if not exists provider_message_id text,
  add column if not exists delivery_status text,
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists failure_code integer,
  add column if not exists failure_detail text,
  add column if not exists delivery_updated_at timestamptz;

comment on column public.onboarding_messages.provider_message_id is
  'Meta''s wamid. The only key a delivery webhook can be matched on.';
comment on column public.onboarding_messages.delivery_status is
  'accepted | delivered | read | failed, from Meta''s webhook. NULL means genuinely unknown - never assume delivered.';

/*
 * The webhook looks a row up by message id on every event, and Meta sends
 * several per message.
 */
create index if not exists onboarding_messages_provider_message_id_idx
  on public.onboarding_messages (provider_message_id)
  where provider_message_id is not null;

/*
 * Only the four values the shared parser can produce. A status outside this
 * set means something wrote to the column that did not come from the
 * webhook, and that is exactly the claim this feature exists to prevent.
 */
alter table public.onboarding_messages
  drop constraint if exists onboarding_messages_delivery_status_check;
alter table public.onboarding_messages
  add constraint onboarding_messages_delivery_status_check
  check (delivery_status is null or delivery_status in ('accepted', 'delivered', 'read', 'failed'));

/*
  The manual console sends land in their own ledger, and that is the table the
  founder was reading when a send showed "sent" and never arrived. It needs the
  same two facts: Meta's id, and what Meta later said about it.
*/
alter table public.onboarding_manual_sends
  add column if not exists provider_message_id text,
  add column if not exists delivery_status text,
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists failure_code integer,
  add column if not exists failure_detail text,
  add column if not exists delivery_updated_at timestamptz;

create index if not exists onboarding_manual_sends_provider_message_id_idx
  on public.onboarding_manual_sends (provider_message_id)
  where provider_message_id is not null;

alter table public.onboarding_manual_sends
  drop constraint if exists onboarding_manual_sends_delivery_status_check;
alter table public.onboarding_manual_sends
  add constraint onboarding_manual_sends_delivery_status_check
  check (delivery_status is null or delivery_status in ('accepted', 'delivered', 'read', 'failed'));

/*
  Rebuild the two list functions.

  Both are `returns setof <table>` over `select *`, so the composite type is
  resolved from the table. Re-creating them after the ALTERs above is what
  makes the new columns actually reach the console; without it the panel would
  read `delivery_status` as undefined on every row and report "unconfirmed"
  forever, which looks exactly like a webhook that never fires.
*/
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

revoke all on function public.onboarding_manual_sends_list(integer, integer) from public, anon;
revoke all on function public.onboarding_messages_list(integer, integer) from public, anon;
grant execute on function public.onboarding_manual_sends_list(integer, integer) to authenticated;
grant execute on function public.onboarding_messages_list(integer, integer) to authenticated;
