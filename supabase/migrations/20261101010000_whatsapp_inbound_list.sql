/*
  # Read the replies

  `whatsapp_inbound` was created with the webhook that fills it, and nothing
  rendered it. That is the same shape as the claim funnel, where every part of
  the chain worked and no screen showed the result, so the feature looked dead
  for weeks.

  Staff-gated like the other admin lists. It joins the business name so the
  console does not have to resolve a uuid per row, and returns the reference
  as read so a message that matched NOTHING is still visible -- an unmatched
  reply is the one most worth seeing, because it means somebody wrote in and
  the platform could not tell who they were.
*/
create or replace function public.whatsapp_inbound_list(
  p_limit  integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  from_phone text,
  sender_name text,
  body text,
  reference text,
  business_id uuid,
  business_name text,
  received_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.from_phone, i.sender_name, i.body, i.reference,
         i.business_id, b.name, i.received_at
  from public.whatsapp_inbound i
  left join public.businesses b on b.id = i.business_id
  where public.is_staff()
  order by i.received_at desc
  limit greatest(1, least(p_limit, 200))
  offset greatest(0, p_offset);
$$;

comment on function public.whatsapp_inbound_list is
  'Owner replies via wa.me, newest first. SECURITY DEFINER, so it checks is_staff() itself - these are private messages from real people.';

revoke all on function public.whatsapp_inbound_list(integer, integer) from public, anon;
grant execute on function public.whatsapp_inbound_list(integer, integer) to authenticated;
