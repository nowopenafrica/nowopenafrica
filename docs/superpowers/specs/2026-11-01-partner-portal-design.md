# Inventory Intelligence — Sub-project 2: Partner portal

Date: 2026-11-01 · Status: design approved in conversation, spec awaiting founder review
Builds on: `2026-10-31-inventory-trust-model-design.md` (sub-project 1, LIVE: `media_owners`, `media_owner_contacts`,
`advertisements.lifecycle/owner_id/owner_role/country_code`, `placement_availability`, `placement_field_source`,
the `placement_trust` view, `set_placement_lifecycle`, and the admin Media owners tab)

## 1. Decisions (founder, 2026-11-01)

| Question | Decision |
|---|---|
| What a media owner's account is | A **NowOpen business account** with a Media owner mode in its existing dashboard. Login, team access (`business_members`, `is_business_member`), document uploads and the public profile are all reused. |
| When advertisers see owner-added placements | **Review until verified**. Until the owner is verified, every placement waits for admin review. A verified owner's new placements publish at once as "Partner verified". Admins can always archive. |
| What verifies an owner | **Company registration plus one site proof**. Registration is CAC (Nigeria) or the country equivalent. Site proof is one of: a signage-authority permit for a listed site (e.g. LASAA), a rate card on company letterhead, or a signed authorisation letter (for representatives). The admin notes which was checked. |

## 2. Goal

A media owner can do all of the following, without admin data entry:
- turn on Media owner mode;
- prove who they are;
- list their placements (one at a time, or by spreadsheet);
- claim placements NowOpen already lists;
- keep prices and availability current.

Their confirmations drive the public "Partner verified" and "Available · confirmed {date} by {owner}" labels.

## 3. Media owner mode and verification

- **Turning it on.** On the business dashboard, the toggle "I sell advertising space" creates the `media_owners` row with `business_id` set, and name and website taken from the business. It is idempotent: one media owner per business.
  - Who may do it: anyone for whom `is_business_member(business_id)` is true.
  - The business's public profile is the owner's public page.
- **Verification panel.**
  - Two uploads:
    1. registration;
    2. one site proof, of type `signage_permit`, `rate_card` or `authorisation_letter`.
  - Files go to the existing private `verification-docs` bucket under `media-owners/{owner_id}/…`. Storage policies let only business members of that owner, and admins, read or write that prefix.
  - Uploads are recorded in `media_owner_documents` (owner_id, kind, storage_path, uploaded_by, uploaded_at).
  - When both kinds exist, the owner sets `verification = 'documents_submitted'`.
- **Status shown to the owner:**
  - "Not verified yet: add {missing}"
  - "Under review"
  - "Verified on {date}"
  - "Not approved: {reason}" (the reason is read from the latest audit entry)
  - No timing promises.
- **Admin side** (the existing Media owners tab gains a "Waiting for verification" list):
  - opens each document through a 120-second signed URL;
  - verifies with a note (the existing trigger stamps who and when), or rejects with a reason.
  - Both decisions are audited.

## 4. Placements

### 4.1 Lifecycle

A new lifecycle value: `pending_review`.

| Situation | Lifecycle |
|---|---|
| Owner-created placement while the owner is unverified | `pending_review` (not public) |
| Owner-created placement once the owner is verified | `partner_verified` (public) |
| Admin approves a `pending_review` placement | `partner_supplied` (public) |
| Admin rejects a `pending_review` placement | `rejected`, with a reason (via `set_placement_lifecycle`) |

- The value is set by a BEFORE INSERT trigger from the owner's verification. Clients cannot choose it.
- When an owner later becomes verified, their `partner_supplied` placements move to `partner_verified`. Their `pending_review` placements stay until an admin decides (one queue, no surprises).
- `placement_trust` and every public surface already exclude anything not in (imported, partner_supplied, partner_verified). `pending_review` is added to the excluded set, and a test confirms it.

### 4.2 Placement form (upgrade of `AdvertForm` for media owners)

- **Medium:** `ADVERT_CATEGORY_GROUPS` categories.
- **Site:**
  - site name;
  - city;
  - country (ISO code; the currency default follows the country);
  - address or landmark.
- **Size, structured:**

  | Kind | Fields |
  |---|---|
  | `area` | width and height in metres |
  | `screen` | resolution and orientation |
  | `airtime` | seconds per spot and spots per day |
  | `vehicle` | extent: one flank, both flanks or full wrap |
  | `other` | free text, admin-reviewed |

  Stored as `size_spec jsonb`. The legacy `dimensions` text is written as a readable summary, so existing readers keep working.
- **Price:**
  - amount, currency and period (day, week or month);
  - stored as `rate_amount`, `rate_currency`, `rate_period`;
  - the legacy `pricing` (USD per day) is derived at save time from the live rate;
  - a `placement_field_source` pricing row with basis `partner_supplied` and today's date.
- **Photos:** real photos only. Uploads go to `business-images` under `placements/{advert_id}/…`. A pexels/unsplash URL is refused ("upload a photo of the actual site").
- **Availability:** optional at creation; see 4.4.

### 4.3 Spreadsheet import (CSV or XLSX)

1. **Template.** Download a template; its columns mirror the form fields.
2. **Upload.** Parsed in the browser: XLSX via SheetJS, loaded from cdnjs or bundled, whichever the repo already uses.
3. **Column mapping,** with smart defaults by header name.
4. **Row validation,** with a per-row error list (e.g. "row 14: city missing", "row 22: price is not a number"). Rows with errors are excluded and listed.
5. **Duplicate preview.** For each valid row, the probable existing matches: same owner or no owner, same city, and normalised title similarity or the same coordinates. For each match the owner picks "this is the same site, update it" or "a different site".
6. **Confirm.**
   - Rows are inserted through the same rules as the form; the lifecycle follows 4.1.
   - "Update it" on a placement the owner doesn't own becomes a claim (4.5), never a direct edit.
   - The import is recorded in `placement_imports` (owner_id, file_name, rows_total, rows_created, rows_claimed, rows_failed, error_report jsonb, created_by, created_at).
   - Owners can see their own import history.
- **Limits:** 2,000 rows and 5MB per file. Parsing happens in the browser; writes are batched in groups of 100.

### 4.4 Keeping it current

- An owner can edit price and photos on placements linked to them (`owner_id`):
  - a price change writes a new `partner_supplied` pricing source row with today's date;
  - **verified status is kept.** A verified owner editing their own price stays partner_verified, but the source row date updates.
- **Availability.** "Available from / to", "Booked until {date}", "Unavailable" and "Maintenance" insert a `placement_availability` row with:
  - `method = 'portal'`;
  - `confirmed_by_owner` = the owner;
  - `period_from` (required).

  That is what produces "Available · confirmed {date} by {owner}".
- **Expiry reminder.** An in-app notice (existing `notifications` table) when a confirmation expires within 3 days. It is produced by the existing automation pattern: pg_cron plus `AUTOMATION_SECRET`, failing closed. It is deduplicated per confirmation. No email or WhatsApp in this sub-project.

### 4.5 Claiming an existing placement

- **Who sees the button.** "Is this your site? Claim it" shows on `/adverts/:id` for signed-in members of a media-owner business, and only when the placement has no owner and no pending claim.
- **The claim.** `placement_claims` (advert_id, owner_id, role `owner`|`authorised_representative`, statement, document_path nullable, status `pending`|`approved`|`rejected`, decided_by, decided_at, reason).
  - A representative's claim requires an authorisation letter upload.
  - A partial unique index allows only one pending claim per advert.
- **Approval** sets `owner_id` and `owner_role` through the admin path. The lifecycle becomes partner_verified if the owner is verified, otherwise partner_supplied. The decision is audited.
- **Rejection** needs a reason, which the owner sees.

## 5. Security (database-enforced)

- A media owner (any `is_business_member(media_owners.business_id)`) may:
  - create placements whose `owner_id` is their own owner, with `owner_role = 'owner'`;
  - update only their own placements, only on: title, description, size_spec, dimensions, rate fields, pricing, image_url, media_urls, location fields;
  - insert availability rows only for their own placements, as `method = 'portal'` with `confirmed_by_owner` = their owner;
  - read and write only their own documents, claims and imports.
- They can never:
  - set lifecycle, verification or `owner_id` directly. The existing trust guard stays, and owner writes go through SECURITY DEFINER functions with explicit checks (`auth.role()` guard, `search_path` set);
  - touch another owner's rows;
  - claim a claimed placement.
- The existing broad "Owners can update advertisements" policy (keyed on `user_id`) is narrowed for rows that have an `owner_id`: those rows are editable only through the owner functions. A migration test confirms a `user_id` match alone cannot edit an owned placement.
- All admin decisions (verify, reject, approve or reject placement, approve or reject claim) are audited.

## 6. Admin review queue (Media owners tab)

Three lists, each with counts and newest first:
1. **Owners waiting for verification:** documents, then Verify (note required) or Reject (reason required).
2. **Placements waiting for review:** the full placement with photos, then Approve (to partner_supplied) or Reject (reason required).
3. **Claims waiting for a decision:** statement and document, then Approve or Reject (reason required).

## 7. Build order

Each step ends with tests, a browser check (desktop and 375px, never submitting against production) and a review sheet.

1. **Database.**
   - `media_owner_documents`, `placement_claims`, `placement_imports`;
   - the `pending_review` lifecycle;
   - `size_spec` and the rate columns;
   - owner SECURITY DEFINER functions and narrowed policies;
   - storage policies;
   - the expiry-notice automation.

   Dry run, then apply only with the founder's go-ahead, then the ledger, then rolled-back behaviour checks.
2. Media owner mode and verification panel, plus the admin verification list.
3. Placement form upgrade, owner edits and availability, plus the admin placement review list.
4. Spreadsheet import with template, mapping, validation, duplicate preview and history.
5. Claims: the "Is this your site?" button plus the admin claims list.

## 8. Constraints

- All copy is plain and honest:
  - no timing promises;
  - no "booked" unless a confirmation says so;
  - stock photos are refused for owner placements.
- One money formatter on visitor surfaces (`useCurrency`). Business dates use local Lagos time (`src/lib/dates.ts`).
- 44px touch targets, in explicit px.
- The dev server shares the production DB: tests mock Supabase, and browser checks never submit.
- No commits or deploys without the founder's approval. Run `npm run check:drift` before every deploy (the shared working folder ships other sessions' code).

## 9. Out of scope (later sub-projects)

- Outreach and the CRM (3).
- Automated collection and cross-source deduplication (4).
- The full dashboard and map (5).
- Email or WhatsApp reminders.
- Partner self-serve payments and commissions.
