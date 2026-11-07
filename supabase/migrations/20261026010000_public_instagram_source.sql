/*
  # Register the source the public Instagram intake files under

  BUG, found in production 2026-10-10:

    insert or update on table "radar_candidates" violates foreign key
    constraint "radar_candidates_source_key_fkey"

  `instagram-intake` files candidates with `source_key = 'public_instagram'`,
  and `radar_sources` has no such row. Every public submission therefore
  failed at the last step, after the Instagram lookup had already been spent.

  `radar_sources` is not a lookup table of labels. It is the register of what
  each source is allowed to do — automated access, bulk extraction, image
  reuse, contact storage, redistribution — and the FK exists precisely so that
  nothing can file data under a source nobody has assessed.

  ── WHY A NEW KEY RATHER THAN REUSING ONE ─────────────────────────────────

  `manual_extraction` says "One page, read by a person, imported deliberately"
  and is authorised by "NowOpen admin". An anonymous visitor typing their own
  handle is neither of those things, and filing their submission under it
  would misattribute the authorisation.

  `public_suggestion` is the right POSTURE — "Lowest-trust permitted source.
  Always reviewed." — but it does not record that the fields came from the
  Instagram Graph API rather than from the person typing.

  ── WHAT THIS ROW CLAIMS, AND WHAT IT DOES NOT ────────────────────────────

  It inherits `public_suggestion`'s posture exactly: lowest trust, always
  reviewed, never published unreviewed. It asserts no new right.

  Image reuse is PROHIBITED, which is stricter than public_suggestion's
  'permitted', because the images belong to Meta and to a business that has
  not claimed its listing — `media_url` is a signed CDN address that expires
  and may not be re-hosted. The intake does not copy images at all; this row
  says so rather than leaving the field permissive.

  Automated and bulk access are prohibited: one handle, typed by one person.

  ── THE CONSTRAINT THAT CAUGHT THE FIRST ATTEMPT ──────────────────────────

  `radar_sources_active_requires_rights` refused the first version of this row,
  and it was right to. An ACTIVE source must declare competing_dataset and
  redistribution as permitted, carry a licence and an authoriser, and either
  use a human access_method or hold automated+bulk permission.

  `access_method = 'form'` and `competing_dataset = 'permitted'` are copied
  from `public_suggestion` and `business_submission`, which are the two active
  rows describing the same thing: a person filling in a form. Nothing here is
  a new assessment; it is the posture already approved for public submissions,
  with image reuse tightened.
*/

insert into public.radar_sources (
  key, name, kind, active, source_type, access_method, competing_dataset,
  automated_access, bulk_extraction, redistribution,
  image_reuse_allowed, contact_storage_allowed,
  compliance_status, authorised_by, licence, notes
) values (
  'public_instagram',
  'Public Instagram submission',
  'business_submission',
  true,
  'owner_submitted',
  /* A person typing one handle into a field -- the same shape as the other
     active public-submission rows. */
  'form',
  'permitted',
  'prohibited',
  'prohibited',
  'permitted',
  /* Meta's media may not be re-hosted, and the intake copies none of it. */
  'prohibited',
  'unknown',
  'approved',
  'NowOpen Africa',
  'Fields are read from the Instagram Graph API for a public Business or Creator account, at the request of a visitor who entered the handle. Treated as a lead; never published unreviewed.',
  'Lowest-trust permitted source, same posture as public_suggestion. Filed by instagram-intake for anonymous visitors. A person reviews every row before publication, and probable duplicates are linked via duplicate_of.'
)
on conflict (key) do nothing;
