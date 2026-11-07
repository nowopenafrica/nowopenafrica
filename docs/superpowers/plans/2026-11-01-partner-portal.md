# Partner Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A NowOpen business can turn on Media owner mode, get verified, list placements (form or spreadsheet), claim existing placements, and keep availability current. A verified owner's placements publish as "Partner verified"; everything else waits for admin review.

**Architecture:**
- **Database.** One migration (Task 1) adds:
  - documents, claims and imports tables;
  - a `pending_review` lifecycle;
  - structured size and rate columns;
  - owner-only SECURITY DEFINER functions;
  - a narrowed update policy;
  - storage policies;
  - a SQL-only pg_cron expiry notice (the same pattern as `dispatch_scheduled_update_alerts`).
- **Client.** The client talks to the database only through `src/lib/promote/partner.ts`.
- **UI.** It lives in the business Dashboard (a new "Media owner" tab) and the existing admin Media owners tab.

**Tech Stack:** Postgres/Supabase (RLS, SECURITY DEFINER, pg_cron, Storage), React 18, TypeScript, Vitest 3, Tailwind; `read-excel-file` (new dependency, MIT) for .xlsx.

**Spec:** `docs/superpowers/specs/2026-11-01-partner-portal-design.md`

## Global Constraints

- **Migration file:** `supabase/migrations/20261111010000_partner_portal.sql`. It must sort after `20261110020000_business_update_alerts_reports.sql`.
  - Idempotent.
  - Line comments for prose (Postgres block comments nest).
  - SECURITY DEFINER functions guard on `auth.role()`, check `is_business_member(...)` or `is_admin()` explicitly, and `SET search_path = public`.
- **Nothing is applied by an implementer.** The controller applies with the founder's go-ahead (Task 2):
  1. BEGIN…ROLLBACK dry run;
  2. apply;
  3. ledger row;
  4. rolled-back behaviour checks;
  5. `npm run check:drift`.
- **Dev server / CLI = PRODUCTION.**
  - Tests mock Supabase.
  - Browser checks never submit, upload or click approve/reject.
- **Copy is plain and honest.**
  - No timing promises.
  - Stock-photo URLs (`isStockPlaceholder`) are refused for owner placements, with the message "Upload a photo of the actual site."
- **Status strings, verbatim:**
  - "Not verified yet — add {missing}"
  - "Under review"
  - "Verified on {date}"
  - "Not approved: {reason}"
- **Money and dates.**
  - Visitor money goes through `useCurrency().format`.
  - Owner-entered amounts are stored in their own currency.
  - `pricing` (USD/day) is derived once at save time.
  - Dates use `src/lib/dates.ts` (Lagos local day).
- **Size limits:**
  - spreadsheet: 2,000 rows and 5MB;
  - documents: 10MB, PDF/JPG/PNG only;
  - placement photos: 15MB, images only.
- **Layout and files.**
  - 44px touch targets in explicit px.
  - Preserve each file's line endings: `Dashboard.tsx`, `AdminDashboard.tsx` and `AdvertDetail.tsx` are CRLF; new files are LF.
- **No commits, no deploys.** The founder approves each review sheet. Run `npm run check:drift` before any deploy.

## Review Focus

1. A business member who is not the media owner's business member tries to edit a placement owned by another owner through the old `user_id` policy. It is refused. → Task 2 check `user_id_alone_cannot_edit_owned`.
2. An owner is verified while they have placements in `pending_review`. Those stay pending (one queue); their `partner_supplied` ones become `partner_verified`. → Task 2 check `verify_promotes_supplied_not_pending`.
3. A spreadsheet row "updates" a placement the owner doesn't own. It becomes a claim, never an edit. → Task 6 test `import update of unowned row creates a claim`.
4. Two owners claim the same placement at once. The second is refused while the first is pending. → Task 2 check `one_pending_claim_per_advert`.
5. An expiring confirmation produces exactly one notice even if the cron runs every 15 minutes. → Task 2 check `expiry_notice_once`.

---

### Task 1: Migration (written, not applied) and structural tests

**Files:**
- Create: `supabase/migrations/20261111010000_partner_portal.sql`
- Test: `src/test/partnerPortalSql.test.ts`. Copy the strip-comments pattern from `src/test/placementTrustSql.test.ts`.

**Produces (DB):**
- `media_owner_documents(id, owner_id → media_owners, kind check in ('registration','signage_permit','rate_card','authorisation_letter'), storage_path text not null, uploaded_by uuid, uploaded_at timestamptz default now())`
- `placement_claims(id, advert_id → advertisements, owner_id → media_owners, role check in ('owner','authorised_representative'), statement text not null, document_path text, status check in ('pending','approved','rejected') default 'pending', decided_by uuid, decided_at timestamptz, reason text, created_at)`
  - partial unique index on (advert_id) WHERE status = 'pending';
  - a representative claim requires document_path (CHECK).
- `placement_imports(id, owner_id, file_name, rows_total, rows_created, rows_claimed, rows_failed int, error_report jsonb default '[]', created_by, created_at)`
- **advertisements changes:**
  - lifecycle check gains `pending_review`;
  - new columns `size_spec jsonb`, `rate_amount numeric`, `rate_currency text`, `rate_period text check in ('day','week','month')`.
- **`placement_trust` view:** re-asserts the exclusion of `pending_review`. Use CREATE OR REPLACE with the v2 body plus pending_review in the excluded set, and keep its grants.
- **SECURITY DEFINER RPCs (owner-facing):**
  - `enable_media_owner(p_business_id uuid) returns uuid`: idempotent, one owner per business (a unique index on media_owners.business_id where not null).
  - `submit_owner_verification(p_owner_id uuid)`: requires at least one registration and one site-proof document; sets `documents_submitted`.
  - `owner_create_placement(p_owner_id uuid, p jsonb) returns uuid`:
    - inserts with owner_id and owner_role='owner';
    - lifecycle comes from the owner's verification: verified → partner_verified, else → pending_review;
    - writes a partner_supplied pricing field-source row.
  - `owner_update_placement(p_advert_id uuid, p jsonb)`:
    - allows only the spec §5 fields;
    - a price change writes a new pricing source row.
  - `owner_record_availability(p_advert_id uuid, p_status text, p_from date, p_to date)`: method 'portal', confirmed_by_owner = the advert's owner_id, period_from required.
  - `owner_claim_placement(p_advert_id uuid, p_owner_id uuid, p_role text, p_statement text, p_document_path text) returns uuid`.
- **Admin RPCs (is_admin):**
  - `admin_review_placement(p_advert_id uuid, p_approve boolean, p_reason text)`: approve takes pending_review → partner_supplied; reject → rejected with the reason (reuse `set_placement_lifecycle`).
  - `admin_decide_claim(p_claim_id uuid, p_approve boolean, p_reason text)`: approve sets owner_id/owner_role and lifecycle (verified owner → partner_verified, else partner_supplied).
  - `admin_reject_owner(p_owner_id uuid, p_reason text)`: sets verification rejected and writes an audit row with the reason.
- **Verification trigger extension:** when an owner becomes verified, their partner_supplied placements → partner_verified; pending_review is untouched.
- **Policy narrowing:** the existing advertisements UPDATE policies that key on user_id gain `AND owner_id IS NULL`. The admin ALL policy is unchanged.
- **Storage policies on `verification-docs`:**
  - prefix `media-owners/{owner_id}/` is readable and writable by `is_business_member(owner.business_id)` or admin.
  - `business-images` prefix `placements/{advert_id}/` is writable by that placement's owner members.
- **Expiry notices:**
  - `public.dispatch_confirmation_expiry_notices()` inserts one `notifications` row (type 'placement_confirmation_expiring', title, body, link `/dashboard?tab=media-owner`) per member of the owning business, for confirmations with valid_until between now() and now()+3 days.
  - Deduplicated by a `notified_at` column added to placement_availability.
  - `cron.schedule('nowopen-confirmation-expiry', '*/15 * * * *', …)`.
- Every RPC writes audit_log where it changes trust state.

- [ ] **Step 1: Write failing structural tests**, one `it` per bullet above: tables and checks; the pending-only unique index; the representative CHECK; lifecycle includes pending_review; each RPC is SECURITY DEFINER with search_path and an `auth.role()` guard; the owner RPCs check `is_business_member`; the admin RPCs check `is_admin()`; the update policies contain `owner_id IS NULL`; the view excludes pending_review and re-asserts REVOKE ALL/GRANT SELECT; the cron job name; `notified_at` dedupe; no bare `now()::date`/`current_date`; no `*/` inside prose.
- [ ] **Step 2:** Run `npx vitest run src/test/partnerPortalSql.test.ts`. Expect FAIL.
- [ ] **Step 3:** Write the migration.
- [ ] **Step 4:** Run the test and `npm run check:migrations`. Expect PASS. Mutation-check three guards: delete each and confirm a test fails.

### Task 2: Behaviour checks (rolled back), then the controller-only apply

**Files:** Create `scripts/check-partner-portal.sql` (BEGIN…ROLLBACK, `DO $$ … ASSERT …` blocks, `RAISE NOTICE 'ok: name'`, a summary SELECT) and `scripts/check-partner-portal.mjs` (copy `check-placement-trust.mjs`). Add `src/test/partnerPortalCheckSql.test.ts`, a structural test that it rolls back and names every check.

- [ ] **Step 1: Checks** (simulate roles as `check-placement-trust.sql` does):
  - `enable_is_idempotent`
  - `unverified_owner_creates_pending_review`
  - `verified_owner_creates_partner_verified`
  - `verify_promotes_supplied_not_pending`
  - `owner_cannot_set_lifecycle_directly`
  - `user_id_alone_cannot_edit_owned`
  - `owner_update_only_allowed_fields`
  - `owner_availability_names_owner`
  - `one_pending_claim_per_advert`
  - `representative_claim_needs_document`
  - `admin_claim_approval_links_owner`
  - `admin_review_reject_needs_reason`
  - `pending_review_hidden_from_trust_view`
  - `anon_cannot_read_documents_claims_imports`
  - `expiry_notice_once` (call the dispatcher twice and assert one notification per member)
  - `stock_photo_refused` (owner_create_placement with an images.pexels.com image_url raises)
- [ ] **Step 2:** The implementer stops. Do not run the checks.
- [ ] **Step 3 (controller, after the founder's go-ahead):** dry run, apply, ledger, run the checks, `check:drift`.

### Task 3: `partner.ts`, Media owner mode, verification, admin verification list

**Files:**
- Create:
  - `src/lib/promote/partner.ts` (+ test);
  - `src/components/dashboard/MediaOwnerTab.tsx`;
  - `src/components/dashboard/OwnerVerificationPanel.tsx`.
- Modify:
  - `src/pages/Dashboard.tsx` (CRLF): the TabId gains `'media-owner'`, labelled "Media owner", shown to any member of a business; `?tab=media-owner` deep link.
  - `src/components/admin/MediaOwnersPanel.tsx`: a "Waiting for verification" list.
- Test: `src/test/mediaOwnerTab.test.tsx` and an extension of `src/test/mediaOwnersPanel.test.tsx`.

**Produces (`partner.ts`)** — each returns `{ ok: true, … } | { ok: false, error }`, never throws:
- `enableMediaOwner(businessId)`
- `getMyMediaOwner(businessId)`
- `uploadOwnerDocument(ownerId, kind, file)`: path `media-owners/{ownerId}/{kind}-{timestamp}.{ext}`; PDF/JPG/PNG ≤10MB; never `.select()` after the insert.
- `listOwnerDocuments(ownerId)`
- `submitVerification(ownerId)`
- `verificationStatusText(owner, docs, lastRejectReason)`: returns the Global Constraints status strings.
- `signedDocumentUrl(path)`: 120 seconds.

- [ ] Tests:
  - the toggle calls enable once and shows the panel;
  - each missing document is named in "Not verified yet — add {missing}";
  - upload refuses a .docx and a 12MB file with plain messages;
  - submit is disabled until both kinds exist;
  - each status string renders for its state;
  - admin list: Verify needs a note, Reject needs a reason and calls `admin_reject_owner`;
  - documents open via a signed URL;
  - errors render as text.
- [ ] Run `npx vitest run src/test src/lib/promote` and `npm run typecheck`.

### Task 4: Placement form, owner edits and availability, admin placement review

**Files:**
- Create:
  - `src/components/dashboard/OwnerPlacementForm.tsx`;
  - `src/components/dashboard/OwnerPlacementList.tsx`;
  - `src/lib/promote/sizeSpec.ts` (+ test).
- Modify:
  - `partner.ts`: `createPlacement`, `updatePlacement`, `recordAvailability`, `uploadPlacementPhoto`;
  - `MediaOwnerTab.tsx`;
  - `MediaOwnersPanel.tsx`: a "Placements waiting for review" list.

**Produces:**
- `type SizeSpec = { kind: 'area'; widthM: number; heightM: number } | { kind: 'screen'; resolution: string; orientation: 'landscape'|'portrait' } | { kind: 'airtime'; seconds: number; spotsPerDay: number } | { kind: 'vehicle'; extent: 'one_flank'|'both_flanks'|'full_wrap' } | { kind: 'other'; text: string }`
- `sizeSummary(s: SizeSpec): string`, e.g. "12m × 6m", "30s spot · 4 a day"; this is the legacy `dimensions` text.
- `toUsdPerDay(amount, currency, period, ratesUsdPer)`

- [ ] Tests:
  - each SizeSpec summary;
  - USD/day derivation for NGN/month and KES/week;
  - the form refuses a pexels photo URL ("Upload a photo of the actual site.");
  - an unverified owner sees "Sent for review" after saving, a verified owner sees "Live as Partner verified";
  - availability requires a from-date, and "Booked until" requires a to-date;
  - a price edit calls updatePlacement with only allowed fields;
  - admin review: Approve → partner_supplied, Reject needs a reason;
  - the expiry notice text links to `/dashboard?tab=media-owner`.
- [ ] Run tests and `npm run typecheck`.

### Task 5: Claims

**Files:**
- Create `src/components/promote/ClaimPlacementButton.tsx`.
- Modify:
  - `src/pages/AdvertDetail.tsx` (CRLF);
  - `partner.ts`: `claimPlacement`;
  - `MediaOwnersPanel.tsx`: a "Claims waiting for a decision" list.

- [ ] Tests:
  - the button shows only for signed-in members of a media-owner business on a placement with no owner and no pending claim;
  - a representative claim requires an uploaded letter;
  - after submit the button reads "Claim sent for review";
  - admin approve and reject (with a reason) call `admin_decide_claim`;
  - a visitor never sees the button.
- [ ] Run tests and `npm run typecheck`.

### Task 6: Spreadsheet import

**Files:**
- Create:
  - `src/lib/promote/placementImport.ts` (+ test);
  - `src/components/dashboard/PlacementImport.tsx`;
  - `public/templates/nowopen-placements-template.csv`.
- Modify: `partner.ts` (`recordImport`), `MediaOwnerTab.tsx`, `package.json` (add `read-excel-file`, an exact version at least two weeks old).

**Produces:**
- `parseCsv(text): string[][]`: RFC 4180, with quotes and embedded commas and newlines.
- `parseXlsx(file): Promise<string[][]>`
- `guessMapping(headers): Record<Field, number | null>`
- `validateRows(rows, mapping): { valid: Draft[]; errors: { row: number; message: string }[] }`
- `findDuplicates(draft, existing): Advertisement[]`: same city (first comma segment), normalised-title similarity ≥ 0.8 (token-set) or the same coordinates within 50m.
- `runImport(ownerId, drafts, decisions): Promise<ImportResult>`: batches of 100; an "update" on an unowned or other-owned advert calls claimPlacement; records the import.

- [ ] Tests:
  - CSV edge cases;
  - mapping guesses for the template headers;
  - row errors (missing city, non-numeric price, unknown medium, stock-photo URL);
  - 2,001 rows refused;
  - duplicate detection both ways;
  - `import update of unowned row creates a claim`;
  - the result counts add up;
  - the UI shows the error report and import history.
- [ ] Run tests and `npm run typecheck`.

### Task 7: Verify, browser check, review sheet (controller)

- [ ] Run `npm run verify` (known unrelated failures only).
- [ ] Browser check, read-only on localhost, desktop and 375px:
  - the Media owner tab renders for your business;
  - verification status and missing-document wording;
  - the placement form and its validation;
  - the import template download;
  - the claim button on a placement;
  - the three admin lists.

  Never submit.
- [ ] Publish the review sheet. Stop for founder approval before deploy.
