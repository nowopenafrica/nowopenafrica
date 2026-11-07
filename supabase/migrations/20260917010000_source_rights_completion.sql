-- The four rights questions the registry could not answer.
--
-- WHAT WAS ALREADY THERE
--
-- `radar_sources` answers four questions well: may we fetch this with a
-- program (`automated_access`), may we take many records (`bulk_extraction`),
-- may we publish what we took (`redistribution`), and may the result compete
-- with the source (`competing_dataset`). `sourcePermits()` treats UNKNOWN as a
-- refusal on every one of them, and a blank `authorised_by` as a refusal
-- outright.
--
-- WHAT IT COULD NOT ANSWER, AND WHY EACH MATTERS
--
-- 1. MAY WE REUSE THIS SOURCE'S IMAGES?
--
--    Measured 2026-09-14: 1,176 published profiles carry a cover image and
--    `business_media_assets` holds 1,186 rows — and nothing in the registry
--    said, per source, whether images may be reused at all. The rule exists
--    only inside the Wikidata adapter, as a comment and a decision not to read
--    `P18`, because Wikimedia Commons is licensed per FILE while the data
--    around it is CC0. A rule that lives in one adapter's source code is a
--    rule the next adapter will not know about.
--
-- 2. MAY WE STORE THIS SOURCE'S CONTACT DETAILS?
--
--    Distinct from displaying them, and the question ClaimReach's suppression
--    model asks before anything is ever sent. A source may permit showing a
--    phone number on its own page and not permit us keeping it.
--
-- 3. HAS ANYBODY REVIEWED THIS SOURCE?
--
--    `active` is a switch, not a review state. It cannot distinguish "we read
--    the terms and they are fine" from "nobody has looked yet" from "this
--    needs a signed licence first". Those are different situations with
--    different next actions, and collapsing them into a boolean is how an
--    unreviewed source gets switched on by someone who assumed.
--
-- 4. WHAT KIND OF LICENCE IS IT?
--
--    `licence` is free text ('CC0 1.0 Universal (public domain dedication) —
--    https://…'), which is right for a human and useless for a query. An enum
--    beside it makes "show me every share-alike source" answerable.
--
-- EVERY NEW COLUMN DEFAULTS TO THE REFUSING VALUE. That is the same rule the
-- rest of this registry follows: the cost of refusing wrongly is a config
-- change, and the cost of permitting wrongly is a legal letter.
--
-- SAFETY: additive. Four nullable columns with safe defaults, two CHECK
-- constraints, and an idempotent backfill of the nine rows that exist.

-- ═══════════════════════════════════════════════════════════════════════
-- 1. THE COLUMNS
-- ═══════════════════════════════════════════════════════════════════════

alter table public.radar_sources
  add column if not exists image_reuse_allowed      text not null default 'unknown',
  add column if not exists contact_storage_allowed  text not null default 'unknown',
  add column if not exists compliance_status        text not null default 'review_required',
  add column if not exists license_type             text;

comment on column public.radar_sources.image_reuse_allowed is
  'May images from this source be republished on a NowOpen profile? Separate from redistribution because media is licensed separately from data — Wikidata is CC0 while the photographs it links to on Commons are not.';

comment on column public.radar_sources.contact_storage_allowed is
  'May this source''s phone numbers and email addresses be STORED, as distinct from displayed? The question ClaimReach asks before anything is sent.';

comment on column public.radar_sources.compliance_status is
  'Where this source stands in review. `active` is a switch; this is the state of the decision behind it.';

-- The same tri-state the other rights columns use, so one rule reads them all.
alter table public.radar_sources drop constraint if exists radar_sources_image_reuse_check;
alter table public.radar_sources add constraint radar_sources_image_reuse_check
  check (image_reuse_allowed in ('permitted', 'prohibited', 'unknown'));

alter table public.radar_sources drop constraint if exists radar_sources_contact_storage_check;
alter table public.radar_sources add constraint radar_sources_contact_storage_check
  check (contact_storage_allowed in ('permitted', 'prohibited', 'unknown'));

alter table public.radar_sources drop constraint if exists radar_sources_compliance_status_check;
alter table public.radar_sources add constraint radar_sources_compliance_status_check
  check (compliance_status in (
    'approved',                       -- reviewed, terms permit what we do
    'approved_with_restrictions',     -- permitted, but read the notes first
    'review_required',                -- nobody has looked. THE DEFAULT
    'api_required',                   -- usable only through an API we lack
    'license_required',               -- needs a signed licence or paid plan
    'owner_authorization_required',   -- only for businesses that authorised us
    'disabled',                       -- reviewed and switched off
    'blocked'                         -- terms forbid it; do not enable
  ));

alter table public.radar_sources drop constraint if exists radar_sources_license_type_check;
alter table public.radar_sources add constraint radar_sources_license_type_check
  check (license_type is null or license_type in (
    'public_domain',      -- CC0, PD — no conditions
    'attribution',        -- CC BY and similar
    'share_alike',        -- ODbL, CC BY-SA — output must be offered alike
    'first_party',        -- our own users gave it to us
    'commercial_api',     -- governed by a provider agreement
    'proprietary',        -- someone else's, with no grant to us
    'unknown'
  ));

-- ═══════════════════════════════════════════════════════════════════════
-- 2. BACKFILL — stated per source, never guessed
-- ═══════════════════════════════════════════════════════════════════════

/*
 * WIKIDATA. CC0 waives everything for the DATA. Images are the exception and
 * the reason this column exists: `P18` points at Wikimedia Commons, licensed
 * per file (CC BY-SA and others), so image reuse is PROHIBITED from this
 * source. The adapter already refuses to read P18; this records the rule where
 * the next adapter will see it.
 */
update public.radar_sources set
  compliance_status = 'approved',
  license_type = 'public_domain',
  image_reuse_allowed = 'prohibited',
  contact_storage_allowed = 'permitted'
where key = 'wikidata';

/*
 * FIRST-PARTY SOURCES. People typed this into a NowOpen form, so the platform
 * holds it outright — including the contact details, which is the whole point
 * of the form. Images are what an owner uploaded of their own business.
 */
update public.radar_sources set
  compliance_status = 'approved',
  license_type = 'first_party',
  image_reuse_allowed = 'permitted',
  contact_storage_allowed = 'permitted'
where key in ('admin_import', 'business_submission', 'public_suggestion');

/*
 * OPENSTREETMAP. ODbL is share-alike: publicly using a derivative database
 * obliges us to offer that database under ODbL too. That is a decision about
 * the company, not an import setting, so the source stays inactive and the
 * status says exactly what is blocking it. OSM carries no images of its own.
 */
update public.radar_sources set
  compliance_status = 'license_required',
  license_type = 'share_alike',
  image_reuse_allowed = 'prohibited',
  contact_storage_allowed = 'unknown'
where key = 'openstreetmap';

/*
 * GOOGLE PLACES. Places content carries caching, storage and attribution
 * restrictions, and photos and reviews additionally require attribution and
 * direct access to the source. Until those are encoded as rules this system
 * enforces, images are prohibited and storage is unreviewed — the API key
 * being absent is not a policy control.
 */
update public.radar_sources set
  compliance_status = 'api_required',
  license_type = 'commercial_api',
  image_reuse_allowed = 'prohibited',
  contact_storage_allowed = 'unknown'
where key = 'google';

/*
 * BUSINESSLIST.COM.NG. Terms prohibit automated access. Already refused in
 * production (HTTP 403); this states why in the registry rather than only in
 * the four rights columns.
 */
update public.radar_sources set
  compliance_status = 'blocked',
  license_type = 'proprietary',
  image_reuse_allowed = 'prohibited',
  contact_storage_allowed = 'prohibited'
where key = 'businesslist_ng';

/*
 * OPENCORPORATES. An API and a licence decide what may be stored, and neither
 * exists yet.
 */
update public.radar_sources set
  compliance_status = 'license_required',
  license_type = 'commercial_api',
  image_reuse_allowed = 'prohibited',
  contact_storage_allowed = 'unknown'
where key = 'opencorporates';

/*
 * OFFICIAL WEBSITES. A business's own site, read with robots.txt honoured and
 * rate limits applied. Contact details published by a business on its own site
 * are the clearest case there is for storing them. Images are held back until
 * somebody decides whether a logo taken from a site may be republished — the
 * safe default, and a genuinely open question.
 */
update public.radar_sources set
  compliance_status = 'approved_with_restrictions',
  license_type = 'unknown',
  image_reuse_allowed = 'unknown',
  contact_storage_allowed = 'permitted'
where key = 'official_website';

-- Anything added later starts unreviewed, which is the honest state.
