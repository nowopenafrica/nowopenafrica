-- Claiming a batch to contact: the rules that must hold even if the caller is wrong.
--
-- ── WHY THE DATABASE AND NOT THE GATE ────────────────────────────────────
--
-- src/lib/claimreach/sendGate.ts is a thorough §28 gate — nineteen blockers,
-- seventy-one tests — and it stays the authority on POLICY: quiet hours,
-- campaign scope, confidence tiers, why a particular business was skipped.
--
-- But it runs in a browser, against data the console fetched some seconds ago,
-- and it produces a PLAN. A plan is a description. If a sender trusts that
-- description, then every bug between planning and sending — a stale page, a
-- suppression added in the meantime, two operators clicking at once — reaches
-- a real person's inbox, and no amount of testing the gate prevents it.
--
-- So this function re-checks the small set of rules whose violation cannot be
-- undone, at the moment of sending, holding a row lock:
--
--   · the business is still unclaimed
--   · the contact is not suppressed
--   · the contact has a recorded source (§7)
--   · nobody has contacted it recently, or too often
--   · the daily cap is not spent
--
-- This is not a second gate. It is the subset that must be true at send time
-- rather than at plan time, and it is deliberately small so it cannot drift
-- into a rival policy engine.
--
-- ── IT RESERVES, IT DOES NOT SEND ────────────────────────────────────────
--
-- The function INSERTS a `queued` outreach row inside the same transaction
-- that selects the business. Two concurrent runs therefore cannot both claim
-- the same business: the unique idempotency key makes the second one lose.
-- The caller then sends and reports back. A crash between the two leaves a
-- `queued` row — visible, auditable, and never a silent double-send.

create unique index if not exists idx_claimreach_outreach_idem
  on public.claimreach_outreach (idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_claimreach_outreach_business_recent
  on public.claimreach_outreach (business_id, created_at desc);

create or replace function public.claimreach_claim_batch(
  p_campaign uuid,
  p_channel text,
  p_limit integer default 25,
  p_min_days_between integer default 30,
  p_max_attempts integer default 3,
  p_daily_cap integer default 100
)
/*
 * OUT names are prefixed because plpgsql resolves an unqualified identifier to
 * the OUT PARAMETER before the column — `idempotency_key` in the ON CONFLICT
 * clause resolved to the variable and the function failed to run at all. The
 * prefix removes the ambiguity rather than relying on qualification everywhere.
 */
returns table (out_business_id uuid, out_business_name text, out_contact text, out_token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today_sent integer;
  v_room integer;
begin
  if coalesce(btrim(p_channel), '') <> 'email' then
    raise exception 'Only the email channel is implemented.' using errcode = '22023';
  end if;

  /*
   * The daily cap, counted from the record rather than trusted to the caller.
   * Attempts count whether or not they succeeded: a provider failure still
   * means we tried to reach somebody.
   */
  select count(*) into v_today_sent
    from public.claimreach_outreach
   where created_at >= date_trunc('day', now())
     and channel = p_channel;

  v_room := greatest(0, least(coalesce(p_limit, 25), coalesce(p_daily_cap, 100) - v_today_sent));
  if v_room = 0 then
    return;   -- cap spent; not an error, just nothing to do today
  end if;

  return query
  with eligible as (
    select b.id, b.name, btrim(b.email) as contact
      from public.businesses b
     where b.claim_status <> 'claimed'
       and coalesce(btrim(b.email), '') <> ''
       -- §7: a contact we cannot account for may not be used.
       and exists (
         select 1 from public.business_evidence e
          where e.business_id = b.id
            and e.field_name = 'email'
            and e.status in ('owner_confirmed','admin_verified','source_confirmed','multiple_sources','single_source')
            and coalesce(btrim(e.source_url), '') <> ''
       )
       -- Opt-outs, by contact OR by business, and expiries honoured.
       and not exists (
         select 1 from public.claimreach_suppressions s
          where (s.business_id = b.id or lower(s.contact) = lower(btrim(b.email)))
            and (s.channel is null or s.channel = p_channel)
            and (s.expires_at is null or s.expires_at > now())
       )
       -- Not too recently, and not too often.
       and not exists (
         select 1 from public.claimreach_outreach o
          where o.business_id = b.id
            and o.created_at > now() - make_interval(days => greatest(1, p_min_days_between))
       )
       and (
         select count(*) from public.claimreach_outreach o
          where o.business_id = b.id
       ) < greatest(1, p_max_attempts)
     order by b.created_at desc
     limit v_room
     /*
      * SKIP LOCKED so two runs in flight take different rows rather than one
      * waiting on the other and then re-checking stale conditions.
      */
     for update of b skip locked
  ),
  reserved as (
    insert into public.claimreach_outreach
      (business_id, contact, channel, status, status_at, campaign_id, template_key, idempotency_key)
    select e.id, e.contact, p_channel, 'queued', now(), p_campaign, 'claim_invite',
           -- One reservation per business per campaign per channel, ever.
           -- campaign_id is a uuid; the key needs a stable text form, and
           -- 'default' names the no-campaign case rather than leaving a null
           -- that would defeat the unique index.
           coalesce(p_campaign::text, 'default') || ':' || p_channel || ':' || e.id::text
      from eligible e
    on conflict (idempotency_key) where idempotency_key is not null do nothing
    returning claimreach_outreach.business_id, claimreach_outreach.contact,
              claimreach_outreach.idempotency_key
  )
  select r.business_id, e.name, r.contact, r.idempotency_key
    from reserved r
    join eligible e on e.id = r.business_id;
  -- (columns map positionally onto the OUT parameters above)
end $$;

revoke all on function public.claimreach_claim_batch(uuid, text, integer, integer, integer, integer)
  from public, anon, authenticated;

comment on function public.claimreach_claim_batch(uuid, text, integer, integer, integer, integer) is
  'Reserves businesses to contact, re-checking suppression/frequency/provenance under a row lock. Reserves only — the caller sends.';

-- ── Opting out ───────────────────────────────────────────────────────────
--
-- Every message must carry a working unsubscribe, and it has to work without
-- an account — the recipient never asked to have one. SECURITY DEFINER so an
-- anonymous caller can write a suppression without being able to read or
-- change anything else in the table.

create or replace function public.claimreach_unsubscribe(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_row public.claimreach_outreach;
begin
  /*
   * The token IS the idempotency key of the message that was sent. It is
   * already unique, already tied to one business and one channel, and it
   * cannot be guessed into a different business's opt-out because it contains
   * a uuid. No new secret to mint or store.
   */
  select * into v_row
    from public.claimreach_outreach
   where idempotency_key = p_token
   limit 1;

  if v_row.id is null then
    -- Say nothing about whether the token existed: an unsubscribe endpoint
    -- that distinguishes real from fake tokens is an address oracle.
    return true;
  end if;

  insert into public.claimreach_suppressions
    (business_id, contact, channel, reason, source, notes)
  /*
   * 'opt_out', not 'recipient_opt_out'.
   *
   * CAUGHT BEFORE SHIPPING: the reason column has a CHECK allowing only
   * opt_out | removal | wrong_contact | invalid_contact | complaint |
   * legal_request | admin_suppression. The invented value would have raised on
   * every unsubscribe — an unsubscribe link that does not unsubscribe, which
   * is worse than having no link at all because the recipient believes it
   * worked.
   *
   * expires_at stays NULL deliberately: a second CHECK forbids an expiry on an
   * opt_out, and rightly. Somebody who asked not to be contacted has not asked
   * to be contacted again in ninety days.
   */
  values (v_row.business_id, v_row.contact, v_row.channel, 'opt_out', 'unsubscribe_link',
          'One-click unsubscribe from a ClaimReach message.')
  on conflict do nothing;

  update public.claimreach_outreach
     set status = 'opted_out', status_at = now()
   where id = v_row.id;

  return true;
end $$;

grant execute on function public.claimreach_unsubscribe(text) to anon, authenticated;
