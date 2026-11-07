/*
  # Let the console send the brand-kit email

  The welcome email only ever went out automatically, on signup, through the
  per-user brand-pack path. Manual mode accepted `whatsapp` and `instagram`
  and nothing else, so there was no way to send the brand kit to a chosen
  address — and no screen said so, which reads as a missing button rather
  than a missing feature.

  That gap mattered more than it looked: WhatsApp cannot currently deliver
  at all (Meta code 131042, no payment method on the account), so email is
  the only channel that reaches anybody, and it was the one channel the
  console could not send on demand.

  The ledger records a contact per channel: `phone` for WhatsApp, `handle`
  for Instagram, and now `email`.
*/
alter table public.onboarding_manual_sends
  add column if not exists email text;

comment on column public.onboarding_manual_sends.email is
  'Recipient for a manual brand-kit email send. NULL for the other channels.';

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

revoke all on function public.onboarding_manual_sends_list(integer, integer) from public, anon;
grant execute on function public.onboarding_manual_sends_list(integer, integer) to authenticated;
