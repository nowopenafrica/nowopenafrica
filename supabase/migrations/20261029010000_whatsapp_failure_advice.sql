/*
  # What to do about a delivery failure

  MEASURED 2026-10-10: three real sends came back `failed` with code 131042,
  "Business eligibility payment issue". That reads like an account
  suspension. It is a missing payment method, and nothing on the screen said
  so.

  Meta's own sentence stays in `failure_detail` untouched. The next step goes
  in its own column, written by the webhook from `failureAdvice()`, so the two
  are never confused for one another and an unrecognised code leaves this
  NULL rather than inventing guidance.

  The advice lives in the edge function, not in the browser, so there is one
  copy and nothing to drift.
*/
alter table public.onboarding_messages
  add column if not exists failure_advice text;
alter table public.onboarding_manual_sends
  add column if not exists failure_advice text;

comment on column public.onboarding_manual_sends.failure_advice is
  'Our next step for a known Meta failure code. NULL for codes we do not recognise - Meta''s own words still show.';

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
