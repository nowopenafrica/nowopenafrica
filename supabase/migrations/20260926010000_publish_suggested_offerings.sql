-- Publish the category-typical services and products that were already written.
--
-- MEASURED ON PRODUCTION, 2026-09-17
--
--   unclaimed businesses                                  3,139
--   with at least one service row                         2,856
--     ...of which showing a PUBLISHED service               225
--   suggested services sitting unpublished               20,931
--   suggested products sitting unpublished                2,711
--
-- The enrichment engine did its job and then stopped one step short. Nearly
-- twenty-one thousand category-typical services were generated, written with
-- the right provenance, and left invisible — so 2,631 businesses had a services
-- list waiting for them and a profile that showed nothing.
--
-- WHY PUBLISHING THESE IS NOT THE THING THE RULES FORBID
--
-- The rule is that nothing may INVENT a business-specific fact: no phone
-- number, no price, no award, no opening hour, no product nobody sells. These
-- rows invent none of that. A sample, verbatim:
--
--   Hospital & Clinic   -> "Diagnostic tests", "Outpatient care"
--   Restaurant          -> "Takeaway"
--   Schools & Training  -> "Career guidance"
--
-- No price on any of them, no description, no claim of capability specific to
-- that business. They are what the category typically offers, and every one
-- carries content_status = 'suggested' with requires_confirmation = true, which
-- is what makes SuggestedContentNotice render above the list: one sentence
-- saying some of these are not confirmed and to ask the business.
--
-- That labelling is the whole licence for this. An unlabelled list of services
-- on a clinic that does not offer them would be a claim; a labelled list of
-- what clinics usually offer, with "confirm with the business" over it, is a
-- directory being useful and honest at the same time.
--
-- WHAT IS DELIBERATELY NOT CHANGED
--
-- `content_status` stays 'suggested'. It is publication that changes here, not
-- provenance — a row does not become owner-confirmed because an operator made
-- it visible, and the day the owner claims the profile their answer replaces
-- it. publish_suggested_content() has the same rule and this mirrors it exactly.
--
-- `reviewed_by` is left null rather than attributed to a person. This was an
-- operator-run backfill, not a staff member reading twenty-one thousand rows,
-- and recording a name would misstate who checked what.
--
-- UNCLAIMED ONLY. A claimed profile is the owner's, and guard_claimed_profile_edits
-- would refuse anyway.

-- ── Services ──────────────────────────────────────────────────────────────
update public.business_services s
   set published = true,
       reviewed_at = now()
  from public.businesses b
 where b.id = s.business_id
   and b.claim_status <> 'claimed'
   and s.content_status = 'suggested'
   and s.published = false;

-- ── Products ──────────────────────────────────────────────────────────────
update public.business_products p
   set published = true,
       reviewed_at = now()
  from public.businesses b
 where b.id = p.business_id
   and b.claim_status <> 'claimed'
   and p.content_status = 'suggested'
   and p.published = false;
