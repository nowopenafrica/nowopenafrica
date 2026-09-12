-- ClaimReach §21/§22 — the ability to stop, and the record of having contacted.
--
-- WHY THIS IS FIRST
--
-- §22: "Before EVERY outbound message: check suppression. Never send if
-- suppressed." Measured 2026-09-08, the live schema had no suppression table,
-- no opt-out table, no consent table and no outreach log — only
-- `notifications`, which is in-app.
--
-- So there was nothing to check, and an opt-out had nowhere to be recorded.
-- That does not make a second message to somebody who replied STOP unlikely;
-- it makes it CERTAIN. A system that can send and cannot remember who asked it
-- not to is not an acquisition engine, it is a complaint generator with a
-- queue.
--
-- Nothing in ClaimReach may send until these two tables exist, which is why
-- they are the first thing built rather than a hardening pass afterwards.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. SUPPRESSION
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.claimreach_suppressions (
  id uuid primary key default gen_random_uuid(),

  /*
   * The business this concerns, when it is known. NULLABLE on purpose.
   *
   * An opt-out belongs to the PERSON who sent it, not to the listing that
   * prompted it. Somebody replying STOP to a message about one business has
   * not consented to a message about the one next door, and if suppression
   * were keyed on business_id alone that is exactly what would happen.
   */
  business_id uuid references public.businesses(id) on delete set null,

  /*
   * The contact, in the form a lookup will actually produce.
   *
   * Normalised — E.164 for a phone, lowercased for an email — because a
   * suppression stored as `08030000001` and checked as `+2348030000001` is a
   * suppression that silently does not apply. That failure looks exactly like
   * no suppression at all, and the person who asked to be left alone is the
   * one who discovers it.
   */
  contact text not null,

  /*
   * `any` is not a default, it is a decision: OPT_OUT and REMOVAL cover every
   * channel, because somebody who says stop means stop, not "stop texting and
   * start emailing".
   */
  channel text not null check (channel in ('whatsapp', 'sms', 'email', 'social', 'any')),

  reason text not null check (reason in (
    'opt_out',
    'removal',
    'wrong_contact',
    'invalid_contact',
    'complaint',
    'legal_request',
    'admin_suppression'
  )),

  /** How we learned: 'reply', 'webhook', 'admin', 'bounce', 'form'. */
  source text,

  /*
   * NULL means permanent, and for `opt_out`, `removal`, `complaint` and
   * `legal_request` it MUST be null — enforced below. A consent withdrawal
   * that expires on a timer is not a withdrawal.
   */
  expires_at timestamptz,

  created_by uuid references public.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),

  constraint claimreach_suppressions_permanent_reasons check (
    expires_at is null
    or reason not in ('opt_out', 'removal', 'complaint', 'legal_request')
  ),

  -- A contact is never empty; an empty string would match nothing and look
  -- like a recorded suppression.
  constraint claimreach_suppressions_contact_present check (length(btrim(contact)) > 0)
);

/*
 * One live suppression per contact and channel.
 *
 * Not a plain UNIQUE on (contact, channel): the same contact can legitimately
 * be suppressed for different reasons over time, and the history is worth
 * keeping. This prevents the duplicate that matters — the same person recorded
 * twice for the same reason, which would double every count in the admin.
 */
create unique index if not exists claimreach_suppressions_unique
  on public.claimreach_suppressions (contact, channel, reason);

-- The lookup every send performs. Contact first: it is the selective column.
create index if not exists claimreach_suppressions_lookup
  on public.claimreach_suppressions (contact, channel, expires_at);

create index if not exists claimreach_suppressions_business
  on public.claimreach_suppressions (business_id)
  where business_id is not null;

comment on table public.claimreach_suppressions is
  'ClaimReach §22. Checked before every outbound message. `contact` is normalised (E.164 / lowercased email) because a suppression that does not match the lookup form is worse than none. Keyed on contact rather than business: an opt-out belongs to the person, not the listing.';

-- ═══════════════════════════════════════════════════════════════════════
-- 2. OUTREACH LOG — §21's contact status, and the frequency evidence
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.claimreach_outreach (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,

  contact text not null,
  channel text not null check (channel in ('whatsapp', 'sms', 'email', 'social')),

  /*
   * §21's full lifecycle. Every transition is a row update, and `status_at`
   * says when — which is what makes "already contacted", "contacted twice
   * today" and "replied, so stop the campaign" answerable at all.
   */
  status text not null default 'queued' check (status in (
    'queued', 'scheduled', 'sent', 'delivered', 'opened', 'clicked',
    'replied', 'claim_started', 'claimed', 'verified', 'activated',
    'declined', 'wrong_contact', 'opted_out', 'removal_requested',
    'failed', 'do_not_contact'
  )),
  status_at timestamptz not null default now(),

  campaign_id uuid,
  template_key text,

  /*
   * IDEMPOTENCY — §37.
   *
   * A worker that retries after a timeout must not send twice, and a provider
   * webhook must be replayable. The key is supplied by the caller and unique,
   * so a duplicate send is a constraint violation rather than a second
   * message to somebody's phone.
   */
  idempotency_key text not null,

  provider_message_id text,
  error text,

  created_at timestamptz not null default now()
);

create unique index if not exists claimreach_outreach_idempotent
  on public.claimreach_outreach (idempotency_key);

-- "Have we contacted this business, and when?" — the frequency check.
create index if not exists claimreach_outreach_business_recent
  on public.claimreach_outreach (business_id, created_at desc);

-- "Have we contacted this contact recently, on any channel?"
create index if not exists claimreach_outreach_contact_recent
  on public.claimreach_outreach (contact, created_at desc);

comment on table public.claimreach_outreach is
  'ClaimReach §21. One row per outbound attempt, with an idempotency key so a retry or a replayed webhook cannot produce a second message. Also the evidence for §23 frequency limits.';

-- ═══════════════════════════════════════════════════════════════════════
-- 3. RLS — staff only, both tables
-- ═══════════════════════════════════════════════════════════════════════
--
-- Neither table is public. A suppression list is a list of people who asked
-- not to be contacted, which is precisely the list an abuser would want; and
-- the outreach log is who we contacted, when, on which number.
--
-- The inbound STOP handler runs as an edge function with the service role,
-- which bypasses RLS — so a person opting out never needs an account, and the
-- policies stay closed.

alter table public.claimreach_suppressions enable row level security;
alter table public.claimreach_outreach enable row level security;

drop policy if exists claimreach_suppressions_staff on public.claimreach_suppressions;
create policy claimreach_suppressions_staff on public.claimreach_suppressions
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists claimreach_outreach_staff on public.claimreach_outreach;
create policy claimreach_outreach_staff on public.claimreach_outreach
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- ═══════════════════════════════════════════════════════════════════════
-- 4. THE CHECK ITSELF, in the database
-- ═══════════════════════════════════════════════════════════════════════

/*
 * Suppression asked as a question the database answers.
 *
 * In SQL as well as in TypeScript on purpose: the application check keeps the
 * UI honest, and this one cannot be forgotten by a future caller — a worker,
 * a backfill, or an edge function written next year.
 *
 * `channel = 'any'` on the row suppresses every channel. Passing 'any' as the
 * ARGUMENT asks "is this contact suppressed for anything at all", which is
 * what an admin screen wants to show.
 */
create or replace function public.claimreach_is_suppressed(
  p_contact text,
  p_channel text default 'any'
)
returns boolean
language sql
stable
security invoker
set search_path to 'public'
as $fn$
  select exists (
    select 1
      from public.claimreach_suppressions s
     where s.contact = btrim(lower(p_contact))
       and (s.channel = 'any' or p_channel = 'any' or s.channel = p_channel)
       and (s.expires_at is null or s.expires_at > now())
  );
$fn$;

comment on function public.claimreach_is_suppressed is
  'ClaimReach §22. True when this contact must not be messaged. Compares against the normalised, lower-cased contact — callers must normalise before storing, or a suppression will silently fail to match.';
