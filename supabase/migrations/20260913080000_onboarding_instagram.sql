/*
  # Onboarding via Instagram — channel support

  WhatsApp was the only welcome channel. This makes the queue and the admin
  console channel-aware so an Instagram DM welcome can join the same pipeline:

    - `onboarding_messages.channel` now accepts 'instagram'. The enqueue
      triggers still write 'whatsapp' (a new business registration has a phone,
      not an IG link) — an Instagram row is enqueued by a future webhook when a
      business owner starts an IG conversation, or recorded by the manual
      console send. The drainer already branches on the channel.
    - `onboarding_manual_sends` gains `channel` + `handle` so one manual send
      can raise a WhatsApp welcome, an Instagram welcome, or both, each
      recorded honestly.
    - New status `needs_conversation`: Instagram DMs cannot be cold-opened.
      Meta only lets a business message a user inside an open conversation
      (the 24h window since their last inbound DM). A refused row sitting at
      `needs_conversation` is the truth — and it reads clearly in the console
      instead of looking like a WhatsApp-style out-of-window template problem.
      It is deliberately NOT a retryable status: nothing in this pipeline can
      open an IG window, so re-examining it every tick would just churn.
    - New kill switch `outbound_instagram`, mirroring `outbound_whatsapp`.
      feature_flags.enabled defaults TRUE for both (an admin kill switch — the
      door that can be slammed shut at any time); what actually stops a send on
      a fresh setup is the provider gate, which records needs_provider until
      the secrets exist.

  Honesty: nothing here sends either. The Instagram send is gated on the
  provider (`INSTAGRAM_TOKEN` + `INSTAGRAM_BUSINESS_ID`), the suppression
  list (channel 'instagram') and a real conversation being available. Cold
  outreach to a handle the business has never heard from is refused with
  `needs_conversation` and guidance, never performed.

  Re-runnable throughout.
*/

-- ---------------------------------------------------------------------------
-- onboarding_messages: accept the Instagram channel and its conversation gate.
-- ---------------------------------------------------------------------------

alter table public.onboarding_messages add column if not exists handle text;

alter table public.onboarding_messages
  drop constraint if exists onboarding_messages_channel_check;
alter table public.onboarding_messages
  add constraint onboarding_messages_channel_check
  check (channel in ('whatsapp', 'instagram'));

alter table public.onboarding_messages
  drop constraint if exists onboarding_messages_status_check;
alter table public.onboarding_messages
  add constraint onboarding_messages_status_check
  check (status in (
    'queued', 'sending', 'sent', 'no_phone', 'blocked',
    'suppressed', 'needs_provider', 'needs_template', 'needs_conversation', 'failed'
  ));

comment on column public.onboarding_messages.handle is
  'Instagram contact for an instagram row: the recipient IG user ID (numeric, from an open conversation) or the @handle. WhatsApp rows leave it null and use phone.';

-- ---------------------------------------------------------------------------
-- onboarding_manual_sends: record which channel a manual welcome targeted.
-- ---------------------------------------------------------------------------

alter table public.onboarding_manual_sends
  add column if not exists channel text not null default 'whatsapp';
alter table public.onboarding_manual_sends
  add column if not exists handle text;

alter table public.onboarding_manual_sends
  drop constraint if exists onboarding_manual_sends_channel_check;
alter table public.onboarding_manual_sends
  add constraint onboarding_manual_sends_channel_check
  check (channel in ('whatsapp', 'instagram'));

alter table public.onboarding_manual_sends
  drop constraint if exists onboarding_manual_sends_status_check;
alter table public.onboarding_manual_sends
  add constraint onboarding_manual_sends_status_check
  check (status in (
    'queued', 'sending', 'sent', 'no_phone', 'blocked',
    'suppressed', 'needs_provider', 'needs_template', 'needs_conversation', 'failed'
  ));

comment on column public.onboarding_manual_sends.channel is
  'Which channel this manual send targeted: whatsapp (default, pre-Instagram rows) or instagram.';
comment on column public.onboarding_manual_sends.handle is
  'Instagram recipient for an instagram channel row (IG user ID or @handle). WhatsApp rows keep it null.';

-- ---------------------------------------------------------------------------
-- Kill switch. Messaging a customer fails silent, not loud — seeded OFF.
-- ---------------------------------------------------------------------------

insert into public.feature_flags (key, label, description, default_when_unreachable) values
  ('outbound_instagram', 'Outbound Instagram', 'Automation Instagram DMs.', false)
on conflict (key) do update
  set label = excluded.label,
      description = excluded.description;