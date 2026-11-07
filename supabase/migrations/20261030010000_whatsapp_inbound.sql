/*
  # Messages owners send US

  MEASURED 2026-10-10: every business-initiated template failed with code
  131042 — the WhatsApp Business Account has no usable payment method, so Meta
  accepts the call and refuses to deliver. Outbound is the gated direction.

  Inbound is not. A `wa.me` link costs nothing, needs no template approval and
  no billing: the owner taps it, their own WhatsApp opens with a message
  pre-typed, and they press send. Their message also opens a service window,
  which is the cheap side of Meta's pricing.

  So the useful thing to capture is the reply. Without this table an owner
  writes in and the platform has no record of it outside somebody's phone.

  ## Matching

  The pre-typed message carries a reference — NOA-XXXXXXXX, derived from the
  listing id by `_shared/waLink.ts`. `business_id` is filled when the
  reference is present and resolves, and left NULL otherwise. A message from
  a phone we happen to hold is NOT treated as proof of which listing is meant:
  numbers are shared, reused and mistyped across 4,000 listings, and a wrong
  match here would attach a stranger's words to somebody's business.
*/

create table if not exists public.whatsapp_inbound (
  id uuid primary key default gen_random_uuid(),
  -- Meta's wamid for the INBOUND message. Unique, so a webhook retry is a
  -- no-op rather than a duplicate row.
  provider_message_id text not null unique,
  from_phone text not null,
  sender_name text,
  body text,
  -- The reference we found in the text, exactly as read.
  reference text,
  business_id uuid references public.businesses(id) on delete set null,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_inbound_received_at_idx
  on public.whatsapp_inbound (received_at desc);
create index if not exists whatsapp_inbound_business_id_idx
  on public.whatsapp_inbound (business_id)
  where business_id is not null;

alter table public.whatsapp_inbound enable row level security;

/*
  Staff only. These are private messages from real people: an owner's phone
  number and whatever they chose to write. Nothing about them belongs to the
  public directory, and the webhook writes with the service role, which
  bypasses RLS — so no insert policy is needed and none is given.
*/
drop policy if exists "Staff read whatsapp inbound" on public.whatsapp_inbound;
create policy "Staff read whatsapp inbound" on public.whatsapp_inbound
  for select to authenticated
  using (public.is_staff());

comment on table public.whatsapp_inbound is
  'Replies from owners via wa.me click-to-chat. business_id is set only when the message carries a resolvable NOA- reference - a matching phone number is not treated as proof.';
