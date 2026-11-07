# Placement Trust Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every advertising placement an honest, database-enforced trust state: media owner, lifecycle, availability confirmations that expire by medium, and field provenance. Show it on Promote as one trust label plus one availability line.

**Architecture:**
- One migration adds:
  - tables: `media_owners`, `media_owner_contacts`, `placement_availability`, `placement_freshness`, `placement_field_source`;
  - four columns on `advertisements`;
  - triggers that enforce the rules and write `audit_log`;
  - the public view `placement_trust` (expiry computed at read) and an admin-only view of confirmations expiring soon.
- A client helper `src/lib/promote/trust.ts` owns all user-facing strings.
- Promote surfaces and a small admin panel consume them.

**Tech Stack:** Postgres (Supabase) SQL + RLS, React 18, TypeScript, Vitest 3 + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-31-inventory-trust-model-design.md` (Part B)

## Global Constraints

- Migration file: `supabase/migrations/20261109010000_placement_trust.sql`. It must sort after `20261108030000_brand_social_bulk_exports.sql`.
- Idempotent: `IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS` before `CREATE POLICY`.
- **No `*/` inside prose** in block comments; Postgres block comments nest. Use `--` line comments for prose.
- SECURITY DEFINER functions guard on `auth.role()`, never `current_user`. Each sets `search_path = public`.
- **Nothing is applied to the database by an implementer.** The controller applies the migration only with the founder's go-ahead (Task 2), then records it in the migration ledger. The dev server shares the production DB, so no rows are written during the build.
- Freshness days:
  - outdoor 30, transit 30;
  - digital 14;
  - broadcast 7, print 7, online 7;
  - any unknown medium 7.
- Label strings, verbatim:
  - trust labels: "Source listed", "Partner supplied", "Partner verified";
  - availability: "Available · confirmed {date} by {owner}", "Availability requires confirmation", "Booked until {date}", "Unavailable", "Under maintenance".
- Price basis strings: "indicative · published rate card" for source_listed; "partner price · {date}" otherwise.
- Audience figures are shown only with a partner_supplied/verified audience source, and always as "partner estimate".
- Preserve each file's line endings; new files are LF. No commits and no deploys.

## Review Focus

1. A placement whose owner is later un-verified. Its "Partner verified" label must drop to "Partner supplied" at once, with an audit row. → Task 1 structural test + Task 2 behaviour check `owner_unverify_downgrades`.
2. Two confirmations for one placement (an old "available" then a newer "booked"). The newest in-date one wins. → Task 2 check `latest_confirmation_wins` + Task 3 unit test.
3. A confirmation recorded for a medium missing from `placement_freshness` (e.g. "Stadium"). It uses 7 days, not null or forever. → Task 2 check `unknown_medium_uses_7_days`.
4. An anonymous visitor querying `media_owner_contacts`, `placement_field_source` or confirmation notes directly through the API. They get zero rows. → Task 2 check `anon_cannot_read_private`.
5. A placement with lifecycle `archived` or `rejected` still linked from a saved media plan. It disappears from `placement_trust`, and the plan page shows "No longer listed" rather than crashing. → Task 4 component test `plan line for an archived placement`.

---

### Task 1: The migration (written, not applied) and its structural tests

**Files:**
- Create: `supabase/migrations/20261109010000_placement_trust.sql`
- Test: `src/test/placementTrustSql.test.ts`. Copy the read-and-strip-comments pattern from `src/test/serviceCatalogueSql.test.ts`.

**Interfaces:** Produces the DB objects below. Later tasks read only `placement_trust`, `media_owners_public`, `placement_confirmations_expiring` and the tables named here.

- [ ] **Step 1: Write failing structural tests**, against the SQL with comments stripped:
  - `creates the owner tables`: `media_owners` with `verification` check (`unverified`,`documents_submitted`,`verified`,`rejected`) and `relationship` check (`prospect`,`contacted`,`onboarding`,`active`,`paused`,`declined`); a CHECK that `verification <> 'verified' OR (verified_at IS NOT NULL AND verified_by IS NOT NULL)`.
  - `contacts carry their source`: `media_owner_contacts.source_url text NOT NULL` and `found_at timestamptz NOT NULL`.
  - `extends advertisements without renaming`:
    - `ADD COLUMN IF NOT EXISTS owner_id`, `owner_role`, `lifecycle`, `country_code`;
    - lifecycle check lists exactly `discovered, imported, partner_supplied, partner_verified, rejected, archived`;
    - no `RENAME` and no `DROP COLUMN` anywhere.
  - `partner_verified needs a verified owner`: a trigger function on `advertisements` that raises when lifecycle = 'partner_verified' and the owner isn't verified; a trigger on `media_owners` that downgrades linked placements when verification leaves 'verified'.
  - `confirmations are append-only`: `placement_availability` has no UPDATE/DELETE policy for non-admins, and a trigger blocks UPDATE of `status`/`valid_until`.
  - `freshness seeded`: insert rows `('outdoor',30),('transit',30),('digital',14),('broadcast',7),('print',7),('online',7)`.
  - `trust view hides the dead`: `placement_trust` has `WHERE ... lifecycle NOT IN ('rejected','archived')` and computes availability with `valid_until > now()`.
  - `public views expose no contacts`: neither `placement_trust` nor `media_owners_public` selects any column of `media_owner_contacts`, any `note` or `verification_note`.
  - `RLS on every new table`: `ENABLE ROW LEVEL SECURITY` for all five tables; admin policies use `public.is_admin()`.
  - `audited`: lifecycle, owner verification, owner link and confirmation insert each write to `public.audit_log`.
  - `definer functions are guarded`: every `SECURITY DEFINER` function sets `search_path` and references `auth.role()`.
  - `backfills the 97 honestly`:
    - `UPDATE public.advertisements SET lifecycle = 'imported'`, limited to rows where lifecycle is null or the default;
    - `country_code` is derived from the text after the last comma of `location`, mapped by a VALUES list of country names to ISO codes for the countries present (Nigeria NG, Ghana GH, Kenya KE, South Africa ZA, Egypt EG, Tanzania TZ, Senegal SN, Cameroon CM, Mozambique MZ, Zimbabwe ZW, Botswana BW, Algeria DZ, and any other country appearing in the 97, discovered by the implementer from the seed migrations);
    - one `placement_field_source` row per priced row with basis `source_listed` and label 'published rate card';
    - no UPDATE touches `rights_holder`.
  - `no prose terminator`: the raw file has no `*/` except closing its own block comments. Use the check from `scripts/check-migrations.mjs` if one exists; otherwise assert no line contains `*/` before its comment's end.
- [ ] **Step 2:** Run `npx vitest run src/test/placementTrustSql.test.ts`. Expect FAIL (file missing).
- [ ] **Step 3: Write the migration per spec §B1–B6, B9.**
  - Media group per placement: a SQL function `public.placement_medium_group(category text) returns text` mirroring `ADVERT_CATEGORY_GROUPS` in `src/data/advertCategories.ts`. Unknown → null, so freshness falls back to 7.
  - `valid_until` is set by a BEFORE INSERT trigger: `confirmed_at + make_interval(days => coalesce(freshness.days, 7))`.
  - `placement_trust` columns:
    - `advert_id`, `trust_label` (`source_listed` | `partner_supplied` | `partner_verified`);
    - `availability` (`confirmed_available` | `booked` | `unavailable` | `maintenance` | `requires_confirmation`), `availability_confirmed_at`, `availability_valid_until`, `period_to`;
    - `owner_name`, `owner_website`, `price_basis` (`source_listed` | `partner_supplied` | `verified`), `price_as_of`.
  - Grant `select` on the views to `anon, authenticated`.
  - `placement_confirmations_expiring`: admin-only view of confirmations with `valid_until` between now() and now()+3 days. There is no cron job: computed at read (ruling; the spec's daily job is unnecessary).
  - Header comment: what, why, how to verify (Task 2), using line comments for any prose containing `*/`-like text.
- [ ] **Step 4:** Run the test. Expect PASS. Run `npm run check:migrations`. Expect PASS.

### Task 2: Behaviour check script (rolled back), then controller-only apply

**Files:**
- Create: `scripts/check-placement-trust.sql`, one transaction: `BEGIN; ... ROLLBACK;`
- Create: `scripts/check-placement-trust.mjs`. It runs the SQL through `npx supabase db query --linked` and fails on any `ASSERT`/`RAISE`.

**Interfaces:** Consumes the Task 1 objects.

- [ ] **Step 1: Write the SQL checks**, each a `DO $$ ... ASSERT ... $$` block inside the single transaction that ends in `ROLLBACK`. They insert throwaway owners, placements and confirmations, all rolled back.
  - `partner_verified_requires_verified_owner`: setting lifecycle partner_verified with an unverified owner raises.
  - `owner_unverify_downgrades`: verify the owner, mark the placement partner_verified, set the owner to `unverified`; the placement is now `partner_supplied` and an audit_log row exists.
  - `expired_confirmation_requires_confirmation`: a confirmation whose `confirmed_at` is now() − 31 days on a Billboard reads `requires_confirmation` in `placement_trust`.
  - `digital_window_is_14_days`: one confirmed 15 days ago on a Digital Screen → `requires_confirmation`; 13 days ago → `confirmed_available`.
  - `unknown_medium_uses_7_days`: on "Stadium", 6 days ago → `confirmed_available`; 8 days ago → `requires_confirmation`.
  - `latest_confirmation_wins`: "available" 5 days ago then "booked" 1 day ago → `booked`.
  - `archived_hidden`: an archived placement is absent from `placement_trust`.
  - `anon_cannot_read_private`: `SET LOCAL ROLE anon`; the counts on `media_owner_contacts`, `placement_field_source` and `placement_availability` are 0, while `placement_trust` is readable.
  - `audience_needs_partner_source`: setting `audience_note` on a placement without a partner audience source raises.
  - `the_97_are_honest`: every pre-existing row has lifecycle `imported`, trust_label `source_listed`, availability `requires_confirmation` and a non-null `country_code`; `rights_holder` is unchanged (all null).
- [ ] **Step 2:** Implementer stops here and reports. **Do not run it**: it needs the migration applied.
- [ ] **Step 3 (controller only, after the founder's go-ahead):**
  1. Apply the migration with `npx supabase db query --linked -f supabase/migrations/20261109010000_placement_trust.sql`.
  2. Record it in the migration ledger as the repo's ledger procedure requires (see `scripts/check-migrations.mjs` and the ledger note).
  3. Run `node scripts/check-placement-trust.mjs`. Expect all checks to pass with nothing persisted.
  4. Paste the result into the migration header's "Verified" section.
  5. Run `npm run check:drift`. Expect CLEAN.

### Task 3: `trust.ts` — one source of every trust string

**Files:**
- Create: `src/lib/promote/trust.ts`, `src/lib/promote/trust.test.ts`

**Interfaces:**
- Produces:
  - `type TrustLabel = 'source_listed' | 'partner_supplied' | 'partner_verified'`
  - `type Availability = 'confirmed_available' | 'booked' | 'unavailable' | 'maintenance' | 'requires_confirmation'`
  - `interface PlacementTrust { advertId: string; trustLabel: TrustLabel; availability: Availability; availabilityConfirmedAt: string | null; availabilityValidUntil: string | null; periodTo: string | null; ownerName: string | null; ownerWebsite: string | null; priceBasis: 'source_listed' | 'partner_supplied' | 'verified'; priceAsOf: string | null }`
  - `trustLabelText(t: TrustLabel): string`
  - `availabilityText(t: PlacementTrust, formatDate: (iso: string) => string): string`
  - `priceBasisText(t: PlacementTrust, formatDate: (iso: string) => string): string`
  - `fetchPlacementTrust(ids: string[]): Promise<Map<string, PlacementTrust>>`: reads the `placement_trust` view in chunks of 200 with `.in('advert_id', chunk)`. An error returns an empty Map, and the caller falls back to `IMPORTED_FALLBACK`.
  - `IMPORTED_FALLBACK(advertId): PlacementTrust`: source_listed + requires_confirmation. Used when the view is unavailable (e.g. before the migration is applied), so pages stay honest.
  - `trustRank(t: PlacementTrust): number`: partner_verified + confirmed_available = 0 … source_listed + requires_confirmation = 5. Used for tiebreaks.
- [ ] **Step 1: Write failing tests:**
  - every TrustLabel maps to its verbatim string;
  - availability strings for all five states;
  - "Available · confirmed {date} by {owner}" falls back to "Available · confirmed {date}" when the owner name is null;
  - "Booked until {date}" uses `periodTo`, or reads "Booked" when it is null;
  - price basis strings;
  - `IMPORTED_FALLBACK` yields "Source listed" and "Availability requires confirmation";
  - `fetchPlacementTrust` maps snake_case rows, chunks 450 ids into 3 calls, and returns an empty Map on error (Supabase mocked);
  - the `trustRank` order;
  - **never available without confirmation:** for every combination where availability ≠ `confirmed_available`, `availabilityText` does not start with "Available".
- [ ] **Step 2:** Run `npx vitest run src/lib/promote/trust.test.ts`. Expect FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expect PASS. Run `npm run typecheck`.

### Task 4: Show it on Promote, and the mix tiebreak

Starts after Promote hub step 1 Task 4 has landed. It reuses that task's components.

**Files:**
- Modify:
  - `src/components/promote/MediumBrowser.tsx` (placement cards);
  - `src/components/promote/GoalView.tsx` (placement rows);
  - `src/pages/AdvertDetail.tsx` (CRLF);
  - `src/pages/MediaPlan.tsx` (a line for a placement missing from `placement_trust` shows "No longer listed");
  - `src/lib/promote/mix.ts` (optional `trust?: Map<string, PlacementTrust>` in `buildMix` input; at equal cost, prefer the lower `trustRank`; ceilings unchanged).
- Test:
  - `src/test/placementTrustUi.test.tsx`;
  - extend `src/lib/promote/mix.test.ts`.

**Interfaces:** Consumes Task 3 (`fetchPlacementTrust`, `trustLabelText`, `availabilityText`, `priceBasisText`, `IMPORTED_FALLBACK`, `trustRank`).

- [ ] **Step 1: Write failing tests:**
  - `imported placement reads honestly`: with an empty trust Map, a medium-browser card, a goal-view row and AdvertDetail each show "Source listed", "Availability requires confirmation" and "indicative · published rate card".
  - `verified and confirmed reads so`: with a trust row of partner_verified + confirmed_available (owner "Acme Outdoor", confirmed 2026-11-03), AdvertDetail shows "Partner verified" and "Available · confirmed 3 Nov 2026 by Acme Outdoor".
  - `never available without confirmation`: across a fixture of 12 combinations, no rendered text matching `/^Available/` appears unless availability is confirmed_available.
  - `plan line for an archived placement`: MediaPlan shows "No longer listed" for a line whose advert has no trust row and no advert row, and does not throw.
  - `mix prefers trusted at equal cost`: two adverts at the same price, one partner_verified, one source_listed → the verified one is picked; with different prices the ceilings still hold.
  - `one string source`: grep test — no component file contains the literal "Partner verified" or "requires confirmation" except `trust.ts`.
- [ ] **Step 2:** Run. Expect FAIL.
- [ ] **Step 3:** Implement. Fetch trust once per page for the visible ids. Dates use the existing local-date formatter from `src/lib/dates.ts`. The label sits as a small chip beside the medium; the availability line goes under the price.
- [ ] **Step 4:** Run `npx vitest run src/test src/lib src/components` and `npm run typecheck`. Expect PASS.

### Task 5: Admin panel — media owners, links, confirmations, lifecycle

**Files:**
- Create:
  - `src/components/admin/MediaOwnersPanel.tsx`;
  - `src/lib/promote/mediaOwners.ts`: data functions;
  - `src/test/mediaOwnersPanel.test.tsx`.
- Modify: `src/pages/AdminDashboard.tsx`. Add a tab `{ id: 'media-owners', label: 'Media owners', icon: Building2 }` next to `claimreach` and render the panel. Keep the file's line endings.

**Interfaces:**
- Produces, in `mediaOwners.ts`. Each returns `{ ok: true, … } | { ok: false, error }` and never throws; supabase-js returns `{data, error}`.
  - `listOwners(): Promise<…>`
  - `saveOwner(input: { id?: string; name: string; website?: string; countryCodes: string[]; businessId?: string | null })`
  - `verifyOwner(id: string, note: string)`: the note is required and non-empty.
  - `unverifyOwner(id: string, reason: string)`
  - `addContact(ownerId: string, c: { kind: 'email'|'phone'|'form'|'social'|'other'; value: string; sourceUrl: string; confidence: 'high'|'medium'|'low'; isPublicBusinessContact: boolean })`: `sourceUrl` is required, an absolute http(s) URL.
  - `linkPlacements(ownerId: string, advertIds: string[], role: 'owner'|'authorised_representative')`
  - `recordConfirmation(advertId: string, c: { status: 'available'|'booked'|'unavailable'|'maintenance'; periodFrom: string; periodTo?: string; method: 'email'|'phone'|'document'|'admin'; ownerId?: string; note?: string })`
  - `setLifecycle(advertId: string, lifecycle: 'rejected'|'archived'|'imported'|'partner_supplied'|'partner_verified', reason: string)`: the reason is required.

- [ ] **Step 1: Write failing tests** (Supabase mocked; no real writes):
  - the panel lists owners with their verification badge;
  - "Verify" is disabled until a documents note is typed;
  - adding a contact without a source URL shows "Add where you found this contact" and calls nothing;
  - "Link placements" sends the chosen role;
  - "Record confirmation" requires a method and a from-date;
  - archive and reject require a reason;
  - a database error appears as the returned error text, not a silent success;
  - the tab appears in AdminDashboard for admins only (reuse the existing admin-gating test pattern).
- [ ] **Step 2:** Run. Expect FAIL.
- [ ] **Step 3:** Implement. Match `ClaimReachConsole.tsx`'s layout and controls. Use `ConfirmDialog`, not `window.confirm`, for archive, reject and unverify.
- [ ] **Step 4:** Run `npx vitest run src/test src/lib` and `npm run typecheck`. Expect PASS.

### Task 6: Verify, browser check, review sheet (controller)

- [ ] Run `npm run verify` (all pass except the known unrelated adminCreator.smoke rejection).
- [ ] After Task 2's apply: on localhost, `/adverts` and three `/adverts/:id` pages show "Source listed · Availability requires confirmation" on imported rows. The admin Media owners tab renders. Never click save, verify, link or record against the shared production DB.
- [ ] Publish a review sheet. Stop for founder approval before deploy.
