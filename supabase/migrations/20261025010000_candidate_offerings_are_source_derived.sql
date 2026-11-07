/*
  # A service nobody confirmed must not be recorded as owner-confirmed

  MEASURED 2026-10-09 on the live schema:

    business_services.content_status         DEFAULT 'owner_confirmed'
    business_services.requires_confirmation  DEFAULT false
    business_products.content_status         DEFAULT 'owner_confirmed'

  and `radar_publish_candidate` inserts offerings with only
  (business_id, name, price, description) -- so it takes those defaults.

  The result: a service read out of a business's own Instagram caption,
  approved by one of our reviewers, lands on the listing stamped as confirmed
  BY THE OWNER. The owner has never seen it. 1,105 listable businesses
  currently hold no offerings at all, so this is the label almost every
  offering we add from here would carry.

  ── WHY THIS IS NOT COSMETIC ──────────────────────────────────────────────

  `content_status` is not only display ordering. `src/lib/claimreach/sendGate.ts`
  scores 'owner_confirmed' at tier 3, above 'source_confirmed', so the
  mislabel does not merely sort a list -- it inflates the confidence that
  decides whether we are willing to contact a business about its data. A
  wrong label feeding a trust decision is the failure this platform exists to
  avoid.

  `publicContent()` already sorts source-derived content below owner-confirmed,
  and the Instagram gallery already writes `source_derived`. Offerings were
  simply never brought into line.

  ── THE RULE, STATED PLAINLY ──────────────────────────────────────────────

  `owner_confirmed` means the owner confirmed it. So a row may only claim it
  when the person inserting it owns the business.

  That one test separates every case correctly, which no inspection of the
  columns can:

    * owner editing their own listing in the dashboard  -> owner_confirmed
      (they send no provenance fields, and they ARE the owner)
    * `radar_publish_candidate` projecting a candidate  -> source_derived
      (runs as definer for an admin, who is not the owner)
    * the enrichment runner writing from a website      -> source_derived
      (service role owns nothing)

  ── WHY A TRIGGER AND NOT AN EDIT TO THE PUBLISH FUNCTION ─────────────────

  `radar_publish_candidate` is three hundred lines whose comment history is
  the record of which field may write where, and it is not the only writer
  here. A trigger covers every path -- the projection, the enrichment runner,
  an admin tool, and a hand-run INSERT during an incident -- and touches none
  of that function. The same reasoning the Instagram gallery trigger follows.

  ── WHAT IS DELIBERATELY NOT DONE ─────────────────────────────────────────

  No existing row is rewritten. Back-filling would mean deciding which of the
  rows published before today an owner has since confirmed, and guessing that
  is the same class of mistake in the other direction. The query at the foot
  of this file lists them so the decision can be taken deliberately.
*/

create or replace function public.mark_offering_source_derived()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as '
begin
  /*
   * A row may claim owner confirmation only if the owner is the one writing
   * it. auth.uid() is the caller''s JWT subject; it is NULL for the service
   * role and for a SECURITY DEFINER projection run by an admin, and neither
   * of those is the owner.
   */
  if NEW.content_status = ''owner_confirmed''::public.content_provenance
     and not exists (
       select 1 from public.businesses b
       where b.id = NEW.business_id
         and b.user_id is not null
         and b.user_id::text = (select auth.uid())::text
     )
  then
    NEW.content_status := ''source_derived''::public.content_provenance;
    NEW.requires_confirmation := true;
  end if;
  return NEW;
end;
';

comment on function public.mark_offering_source_derived is
  'Stops an offering claiming owner confirmation unless the owner inserted it. content_status feeds ClaimReach trust tiers, so a wrong label here is not cosmetic.';

drop trigger if exists trg_services_source_derived on public.business_services;
create trigger trg_services_source_derived
  before insert on public.business_services
  for each row execute function public.mark_offering_source_derived();

drop trigger if exists trg_products_source_derived on public.business_products;
create trigger trg_products_source_derived
  before insert on public.business_products
  for each row execute function public.mark_offering_source_derived();

/*
  Rows published before this migration that carry the old claim:

    select count(*) from public.business_services s
     join public.businesses b on b.id = s.business_id
     where s.content_status = 'owner_confirmed' and b.claim_status <> 'claimed';

  Left alone on purpose -- see the header.
*/
