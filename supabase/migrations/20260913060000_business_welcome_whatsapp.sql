/*
  # Business welcome — the guarantee that "every new registered business is
  # welcomed on WhatsApp" cannot be dropped

  The `send-onboarding` edge function already knows how to send the NowOpen
  welcome pack (email via Resend, WhatsApp via Meta Cloud API), but it was
  only ever triggered fire-and-forget from the client at signup — so a
  business created any other way (from the dashboard form, via the admin
  editor, or after the welcome call failed to reach a 404 because the
  function was never deployed) received nothing. Nothing persisted the
  *intent*, so "it should have gone out" and "it went out" were
  indistinguishable.

  This migration makes the intent a row in the database:

    - a trigger on `businesses` enqueues one `onboarding_messages` row the
      moment a business is registered by an owner (INSERT with user_id, or a
      later claim that fills user_id on a previously-unclaimed listing);
    - a pg_cron tick drains the queue every 15 minutes by posting to the
      send-onboarding edge function (exactly like tick_enrichment posts to
      its executor), so even if no client ever calls, the welcome goes out;
    - the forwarding client hooks (signup, dashboard create) still trigger
      the function immediately, turning "≤15 minutes" into "seconds";
    - every outcome is a status on the row — sent / no_phone / blocked
      (kill switch) / suppressed (ClaimReach §22) / needs_provider /
      needs_template / failed — never silently nothing.

  Honesty: nothing here sends. The edge function sends only when a WhatsApp
  provider is actually configured (WHATSAPP_TOKEN/WHATSAPP_PHONE_ID) and an
  approved template exists (WHATSAPP_WELCOME_TEMPLATE); until then the rows
  sit at a retryable needs_* status, which is the truth. No backfill runs for
  pre-existing businesses — this is for NEW registrations, as specified.

  Re-runnable throughout.
*/

create extension if not exists pgcrypto;
create extension if not exists pg_net;

/*
  The queue. RLS is enabled with NO policies and every role is denied — an
  opt-out / contact list is exactly the table an abuser would want. The
  enqueue trigger (security definer) writes it, and the edge function drains
  it with the service role.
*/
create table if not exists public.onboarding_messages (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id     uuid references public.users(id) on delete set null,
  phone       text,
  channel     text not null default 'whatsapp' check (channel in ('whatsapp')),
  status      text not null default 'queued' check (status in (
                'queued', 'sending', 'sent', 'no_phone', 'blocked',
                'suppressed', 'needs_provider', 'needs_template', 'failed'
              )),
  reason      text,
  error       text,
  provider    text,
  attempts    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  sent_at     timestamptz
);

-- One welcome per business, ever: the unique constraint is the de-dupe.
create unique index if not exists onboarding_messages_business_unique
  on public.onboarding_messages (business_id);

-- The drainer's scan.
create index if not exists onboarding_messages_retryable
  on public.onboarding_messages (status) where status in ('queued', 'needs_provider', 'needs_template');

alter table public.onboarding_messages enable row level security;
revoke all on public.onboarding_messages from anon, authenticated, public;

comment on table public.onboarding_messages is
  'Transactional welcome intent: one row per registered business, drained by the send-onboarding edge function. Statuses are the honest record — no row is ever "sent" unless a provider call succeeded.';

/*
  Enqueue. Runs inside the businesses insert/claim transaction, so a row that
  never saved cannot enqueue, and an enqueue that fails cannot roll back the
  save. `on conflict` makes the claim and insert paths overlap safely.
*/
create or replace function public.enqueue_business_welcome()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.onboarding_messages (business_id, user_id, phone)
  values (
    new.id,
    new.user_id,
    coalesce(
      nullif(btrim(coalesce(new.phone, '')), ''),
      nullif(btrim(coalesce(new.whatsapp, '')), ''),
      (select nullif(btrim(coalesce(u.phone, '')), '') from public.users u where u.id = new.user_id)
    )
  )
  on conflict (business_id) do nothing;
  return new;
end;
$$;

drop trigger if exists business_welcome_on_insert on public.businesses;
create trigger business_welcome_on_insert
  after insert on public.businesses
  for each row
  when (new.user_id is not null)
  execute function public.enqueue_business_welcome();

-- A previously-unclaimed listing that is claimed becomes a "registered
-- business" too — the new owner gets the same welcome (dedupe above prevents
-- a second row if one already exists).
drop trigger if exists business_welcome_on_claim on public.businesses;
create trigger business_welcome_on_claim
  after update of user_id on public.businesses
  for each row
  when (new.user_id is not null and old.user_id is null)
  execute function public.enqueue_business_welcome();

comment on function public.enqueue_business_welcome() is
  'Fire on businesses insert/claim with an owner. Captures the best contact phone (business, else whatsapp, else owner profile) so the queue row is self-contained.';

/*
  One tick — post to the sender, which drains pending rows. Deliberately dumb,
  like tick_enrichment: all judgement lives in the edge function. Returns the
  pg_net request id; a failure can be traced in net._http_response.
*/
create or replace function public.tick_onboarding_welcome()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text; v_key text; v_anon text; v_id bigint;
begin
  select value into v_url  from public.private_config where key = 'onboarding_endpoint';
  select value into v_key  from public.private_config where key = 'onboarding_secret';
  select value into v_anon from public.private_config where key = 'anon_key';

  if v_url is null or v_key is null then
    raise notice 'tick_onboarding_welcome: not configured yet; nothing scheduled to call.';
    return null;
  end if;

  select net.http_post(
    url     := v_url,
    body    := '{"mode":"drain_all"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_anon, ''),
      'x-onboarding-key', v_key
    ),
    timeout_milliseconds := 55000
  ) into v_id;

  return v_id;
end;
$$;

revoke all on function public.tick_onboarding_welcome() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('nowopen-onboarding-welcome');
exception when others then
  null; -- not scheduled yet
end $$;

select cron.schedule('nowopen-onboarding-welcome', '*/15 * * * *', $$select public.tick_onboarding_welcome();$$);

/*
  What the pipeline has been doing, for the admin console. Mirrors
  enrichment_cron_status on purpose.
*/
create or replace function public.onboarding_welcome_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, cron
as $$
declare r jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admins only';
  end if;
  select jsonb_build_object(
    'scheduled',   exists (select 1 from cron.job where jobname = 'nowopen-onboarding-welcome'),
    'schedule',    (select schedule from cron.job where jobname = 'nowopen-onboarding-welcome'),
    'active',      (select active   from cron.job where jobname = 'nowopen-onboarding-welcome'),
    'last_run',    (select max(start_time) from cron.job_run_details d
                      join cron.job j on j.jobid = d.jobid where j.jobname = 'nowopen-onboarding-welcome'),
    'last_status', (select d.status from cron.job_run_details d
                      join cron.job j on j.jobid = d.jobid where j.jobname = 'nowopen-onboarding-welcome'
                     order by d.start_time desc limit 1),
    'configured',  exists (select 1 from public.private_config where key = 'onboarding_endpoint'),
    'queued',      (select count(*) from public.onboarding_messages where status in ('queued','needs_provider','needs_template')),
    'sent',        (select count(*) from public.onboarding_messages where status = 'sent'),
    'blocked',     (select count(*) from public.onboarding_messages where status in ('no_phone','blocked','suppressed','failed'))
  ) into r;
  return r;
end;
$$;

grant execute on function public.onboarding_welcome_status() to authenticated;