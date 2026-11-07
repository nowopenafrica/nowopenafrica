# Inventory Intelligence — programme overview + Sub-project 1: Placement trust model

Date: 2026-10-31 · Status: design approved in conversation, spec awaiting founder review
Origin: the founder's "Pan-African Advertising Inventory Intelligence & Partner Acquisition Engine" brief (2026-10-31)
Related: `2026-10-31-promote-hub-design.md` (public Promote hub; step 1 in build)

## Part A — Programme overview

### What already exists (audit, 2026-10-31)

| Brief asks for | Already built — extend, don't rebuild |
|---|---|
| Source registry with permissions | `radar_sources`: access method, rate limits, credential reference, and rights fields (`automated_access`, `bulk_extraction`, `competing_dataset`, `redistribution`, `image_reuse_allowed`, `contact_storage_allowed`, `compliance_status`). A CHECK blocks activation without rights |
| Scheduled collection, health, kill switch | `discovery-worker`, discovery scheduler + campaigns, `radar-source-health`, and `radar_config.autonomy_mode` (manual/assisted/autonomous) |
| Staging, review, confidence, evidence | `radar_candidates` (pending/review/held/published/merged/rejected, confidence 0–100) plus candidate evidence |
| Outreach with safeguards | ClaimReach: gates, dry-run, suppression list and lookup, claim batches; `claimreach-send` exists but is deliberately not switched on |
| Placement provenance | `advertisements.provenance` (`owner_submitted` / `partner_rate_card` / `platform_owned` / `unverified_import`) plus `rights_holder`, `rights_verified_at/by`, `currency`, `available_from/to`. All 97 rows are `unverified_import` with no rights verification |
| Audit trail | `public.audit_log` (actor, action, entity_type, entity_id, detail) |
| Media plan | `ad_campaigns` + `ad_campaign_placements` (UNIQUE campaign/advert) |

Today these serve business listings. The programme extends them to advertising placements.

### Sub-projects (founder-approved order)

Each gets its own spec → plan → build → review sheet.

1. **Placement trust model** (this spec). Media owners, lifecycle, availability confirmations, field provenance, derived public labels.
2. **Partner portal** (`/partners`).
   - Owners register and declare their authority.
   - They add placements manually or by CSV/XLSX import (map, validate, preview, dedupe, review), upload rate cards, photos and specs, keep availability current, and claim discovered placements.
   - An admin reviews before anything is published.
3. **Partner CRM + outreach.**
   - Media-owner pipeline: discovered → qualified → contacted → responded → interested → onboarding → documents pending → verified → active.
   - Personalised drafts on the ClaimReach rails: suppression, opt-out, frequency limits, history.
   - **Draft-only by default.** Sending only after explicit founder approval and a connected, authorised channel.
4. **Placement acquisition via Radar.**
   - Placement candidates from permitted sources and partner feeds.
   - Normalise, geolocate, duplicate-match (exact / probable / possible / separate asset at same site), manual merge and unmerge with audit.
5. **Inventory Intelligence dashboard.** Overview, sources, jobs, inventory, verification queue, duplicates, partner pipeline, data quality, map. No vanity metrics.
6. **Public Promote upgrades.** Multi-city and route search, map, compare, trust labels everywhere. Folds into Promote steps 2–3.
7. **AI assistance.** Extraction, rate-card structuring, research briefs, draft personalisation, gap analysis. Every output reviewable; AI never confirms availability, ownership, prices or audiences.

### Programme-wide rules

- **Competitor marketplaces are partnership targets, not scraping sources.** This covers VacantBoards, Alternative Adverts, Outdoor Exchange, OOHna and BuyMedia.ng.
  - Each enters the CRM (sub-project 3) as a prospect.
  - Collection from them happens only with written permission or a feed, recorded on its `radar_sources` row.
  - The existing `competing_dataset` rights check is the guard.
- **Never bypass authentication, CAPTCHAs, rate limits or terms.** If permission is unclear, the source stays `review_required`.
- **Never guess emails or invent contacts.** Every contact carries its source URL and discovery date.
- **Never fabricate** inventory, availability, prices, partners, audience figures or integration successes. Labels distinguish source-listed, partner-supplied and verified.
- **Multi-country from day one.** Use ISO country codes and currency per placement; Nigeria is the first operating market. Claim coverage only where verified supply exists.
- **Every migration is hand-applied** with the founder's go-ahead and recorded in the migration ledger. The dev server shares the production DB.

## Part B — Sub-project 1: Placement trust model

### B1. Media owners — new table `public.media_owners`

| Column | Notes |
|---|---|
| `id` uuid pk | |
| `name` text not null | |
| `website` text | |
| `country_codes` text[] not null default '{}' | ISO 3166-1 alpha-2 |
| `business_id` uuid null → `businesses(id)` | optional link to their NowOpen listing |
| `verification` text not null default 'unverified' | check in (`unverified`, `documents_submitted`, `verified`, `rejected`) |
| `verified_at` timestamptz, `verified_by` uuid → users | required when `verification = 'verified'` (CHECK) |
| `verification_note` text | which documents were checked |
| `relationship` text not null default 'prospect' | check in (`prospect`, `contacted`, `onboarding`, `active`, `paused`, `declined`); used by sub-project 3 |
| `created_at`, `updated_at` | |

Child table `public.media_owner_contacts`, admin-only:

| Column | Notes |
|---|---|
| `owner_id` | |
| `kind` | check: email / phone / form / social / other |
| `value` | |
| `source_url` text not null | where the contact was found; no source, no row |
| `found_at` timestamptz not null | |
| `confidence` | check: high / medium / low |
| `is_public_business_contact` boolean not null | |

### B2. Placements — extend `public.advertisements` (no rename; URLs and plans unaffected)

New columns:
- `owner_id` uuid null → `media_owners(id)`.
- `owner_role` text null, check in (`owner`, `authorised_representative`); required when `owner_id` is set.
- `lifecycle` text not null default 'imported', check in (`discovered`, `imported`, `partner_supplied`, `partner_verified`, `rejected`, `archived`).
  - `provenance` stays as the record of how the row arrived; `lifecycle` is where it stands now.
- `country_code` text, backfilled from `location` ("City, Country"; all 97 rows are in this form).

Constraint (trigger, so it can read the owner row): `lifecycle = 'partner_verified'` requires `owner_id` set **and** that owner's `verification = 'verified'`. Un-verifying an owner downgrades its placements to `partner_supplied` (same trigger, audited).

### B3. Availability confirmations — new table `public.placement_availability`

Append-only; nothing is overwritten.

| Column | Notes |
|---|---|
| `id`, `advert_id` → advertisements | |
| `status` | check in (`available`, `booked`, `unavailable`, `maintenance`) |
| `period_from` date, `period_to` date null | the dates the statement covers |
| `confirmed_at` timestamptz not null default now() | |
| `confirmed_by_owner` uuid → media_owners null | |
| `recorded_by` uuid → users | |
| `method` | check in (`portal`, `email`, `phone`, `document`, `admin`) |
| `valid_until` timestamptz not null | `confirmed_at` + the freshness window for the placement's medium |
| `note` text | admin-only |

Freshness windows live in `public.placement_freshness` (medium group → days), so they're editable without code:

| Medium group | Days |
|---|---|
| Outdoor & OOH | 30 |
| Transit & Airport | 30 |
| Digital Screens | 14 |
| Broadcast | 7 |
| Print | 7 |
| Online & Social | 7 |

Groups are the existing `ADVERT_CATEGORY_GROUPS` keys. An unknown medium uses 7 days (the strictest).

### B4. Field provenance — new table `public.placement_field_source`

One row per (advert, field). Fields: `pricing`, `dimensions`, `image_url`, `audience`. Columns:
- `basis`: `source_listed` / `partner_supplied` / `verified`;
- `source_label` (e.g. "published rate card", "owner portal");
- `as_of` date;
- `recorded_by`.

The audience columns (`audience_note`, `estimated_daily_traffic` and so on, added nullable) may be set only when a `partner_supplied` or `verified` audience source row exists (trigger). The public text always says "partner estimate".

### B5. Derived public state — view `public.placement_trust`

Read-only, public-safe; computed at read, so expiry needs no scheduled job.

- `trust_label`:
  - `partner_verified` when lifecycle = partner_verified;
  - else `partner_supplied` when lifecycle = partner_supplied;
  - else `source_listed`.
- `availability`, from the latest confirmation:
  - `confirmed_available` when its `valid_until > now()` and its status is available;
  - `booked`, `unavailable` or `maintenance` when that is its in-date status;
  - otherwise `requires_confirmation`.
- `availability_confirmed_at`, `availability_valid_until`, `period_to`.
- `owner_name`, `owner_website`. No contacts and no notes.
- `price_basis_label`:
  - "indicative · published rate card" for source_listed;
  - "partner price · {as_of}" otherwise.
- Rows with lifecycle `rejected` or `archived` are excluded entirely.

Client helper `src/lib/promote/trust.ts`:
- `trustLabelText(row)` → "Source listed" / "Partner supplied" / "Partner verified".
- `availabilityText(row, formatDate)`:
  - "Available · confirmed {date} by {owner}";
  - "Availability requires confirmation";
  - "Booked until {date}";
  - "Unavailable".

There is one source of these strings.

A daily job (existing pg_cron pattern, `AUTOMATION_SECRET`, fail closed) writes a list of confirmations expiring within 3 days into a view, for sub-project 3's reminders. It sends nothing.

### B6. Security

- RLS:
  - public `select` on `placement_trust` and on non-sensitive `media_owners` columns, via a view `media_owners_public` (id, name, website, country_codes, verification);
  - `media_owner_contacts`, `placement_availability.note`, `placement_field_source` and verification notes are admin-only (`public.is_admin()`).
- Sub-project 2 adds owner-scoped policies: an owner sees and edits only rows whose `owner_id` they hold.
- Audit: every lifecycle change, owner verification change, owner link and confirmation writes to `public.audit_log`, via SECURITY DEFINER triggers guarded on `auth.role()` per the existing trap note.

### B7. Admin tools (inside the existing admin dashboard; the full dashboard is sub-project 5)

- **Media owners:** list, add, edit and verify. Verifying requires a note on the documents checked.
- **Link placements to an owner:** single or bulk, choosing owner or authorised representative.
- **Record a confirmation:** an admin logs a phone or email confirmation with its method.
- **Lifecycle:** reject or archive with a reason (audited).

### B8. Public Promote integration (this sub-project's visible change)

The Promote hub's medium browser, goal-view placement rows and `/adverts/:id` show:
- the trust label;
- the availability line;
- the price basis label.

All of these come from `placement_trust` via `trust.ts`. Nothing reads "available" or "confirmed" without an in-date confirmation.

`buildMix` gains a tiebreak: at equal cost, prefer partner_verified, then confirmed available, then source_listed. Ceilings are unchanged.

### B9. Migration of existing data

One migration:
- creates the tables, views and triggers;
- sets `lifecycle = 'imported'` on all 97 rows;
- backfills `country_code` from `location`;
- writes one `placement_field_source` row per priced row (pricing, source_listed, "published rate card").

`rights_holder` stays null until a real owner claims a placement. The migration is hand-applied with the founder's go-ahead and recorded in the ledger.

### B10. Tests

- **SQL, against a scratch schema in CI or a local Postgres:**
  - partner_verified is impossible without a verified owner and a link;
  - un-verifying an owner downgrades its placements;
  - an expired confirmation reads `requires_confirmation`;
  - an anon read of contacts and notes is denied;
  - audience fields are rejected without a partner source.
- **Unit:** `trust.ts` over every label × availability combination; the `buildMix` tiebreak.
- **Component:** the hub and `/adverts/:id` show "Source listed" and "Availability requires confirmation" for an imported row, and never "Available" without an in-date confirmation.
- **Regression:** the plan page, Save to plan and all existing Promote tests are unchanged.

### B11. Out of scope here

Partner self-service (sub-project 2), outreach and sending (3), automated collection and dedupe (4), the full dashboard and map (5), multi-city search (6), AI (7).
