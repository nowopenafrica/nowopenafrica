# Business Updates, Phase 1: Database, Security, Lifecycle (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the server-side foundation for 24-hour Business Updates. Phase 1 covers the tables, the guard rules, RLS, the private storage bucket, keeper alerts and reports. It also adds a pure TypeScript lifecycle library that the later UI phases will use.

**Architecture:** There are two migrations. `…010000` holds the tables, the lifecycle guards, RLS and storage. `…020000` holds the alerts, the cron job and reports. Visibility is enforced by RLS predicates on `now()` against a generated `expires_at`. A cron job only sends late alerts and never decides what is visible. A rolled-back SQL check script proves the behaviour against production as anon, a stranger and the owner. It runs once in dry-run mode before the apply and once after.

**Tech Stack:** Postgres (Supabase), pg_cron, Supabase Storage RLS, TypeScript, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-10-31-business-updates-design.md` (approved by the founder 2026-10-31). Read sections 5 and 6 before any task.

## Global Constraints

- Production is the only database. Nothing writes rows outside a `BEGIN … ROLLBACK` until the founder says go.
- Migrations are applied by hand with `npx supabase db query --linked -f <file>`, then recorded in `supabase_migrations.schema_migrations`, then `npm run check:drift` must be clean. Never `db push`.
- No commits and no deploys without founder approval. Commit steps below are prepared and held, not run.
- Use `npm run typecheck`. Bare `tsc` checks nothing.
- Every SECURITY DEFINER function has `SET search_path = public` and guards web callers on `auth.role() IN ('anon','authenticated')`, never `current_user`.
- Postgres block comments nest. No `*/` may appear inside prose in a block comment.
- Re-runnable migrations: `IF NOT EXISTS` on tables and indexes, `DROP POLICY IF EXISTS` and `DROP TRIGGER IF EXISTS` before each create, `CREATE OR REPLACE` on functions.
- Clients never chain `.select()` onto an anon or RLS insert (relevant to reports).
- Publisher roles: `ARRAY['manager','marketing','content_editor']`, used through `has_business_role` (owner and admin pass implicitly). Archive readers: `is_business_member`.
- Values pinned by the spec: 24h exact, schedule ≤ 14 days ahead, skew 5 minutes, ≤ 10 media, title ≤ 80, body ≤ 500, cta_label ≤ 30, alt_text ≤ 200, video ≤ 60000 ms, bucket 50 MB, signed-URL TTL `min(600s, time left)`, report limit 30/hour, offer double-alert window 6 hours, cron every 15 minutes.
- Do not touch `src/components/promote`, `src/lib/promote` or `src/components/admin/MediaOwnersPanel.tsx`.

## Review Focus

1. **The exact 24h boundary.** At `published_at + 24h` exactly, the update is invisible, because the predicate is strict `expires_at > now()`. Pinned by check `boundary_24h_is_exclusive` (Task 4) and the TS test `ended at exactly 24h` (Task 1).
2. **Re-arming an ended update.** An owner who sets `published_at = now()` on an update that already went live is refused. Pinned by check `published_at_locked_after_live`.
3. **The wrong team role.** A member with role `support` or `viewer` can read the archive but cannot insert, publish or delete. Pinned by check `support_member_cannot_publish`.
4. **Media after the update ends or is hidden.** Anon cannot read the `storage.objects` row, so signing fails, while a member still can. Pinned by checks `anon_cannot_read_ended_media` and `member_reads_archive_media`.
5. **A malformed storage path** such as `not-a-uuid/x.jpg` is refused cleanly rather than raising a cast error. Pinned by check `bad_path_refused` and the SQL helper's own null return.

---

### Task 1: Pure lifecycle library

**Files:**
- Create: `src/lib/businessUpdates.ts`
- Test: `src/lib/businessUpdates.test.ts`

**Interfaces:**
- Produces (later phases rely on these exact names):
  - `type UpdateType = 'new_product' | 'new_service' | 'offer' | 'announcement' | 'event' | 'recent_work'`
  - `const UPDATE_TYPES: { key: UpdateType; label: string }[]`. Labels: New product, New service, Offer, Announcement, Event, Recent work.
  - `const UPDATE_TOPIC: Record<UpdateType, KeepTopic>` (`KeepTopic` from `./keeps`): offer→promotions, new_product/new_service→products, event→events, announcement/recent_work→announcements.
  - `const PUBLISHER_ROLES = ['manager','marketing','content_editor'] as const`
  - `const UPDATE_LIFETIME_MS = 86_400_000`, `MAX_SCHEDULE_AHEAD_MS = 14 * 86_400_000`, `MAX_MEDIA = 10`, `SIGNED_URL_MAX_TTL_S = 600`
  - `type UpdateState = 'draft' | 'scheduled' | 'active' | 'ended' | 'hidden'`
  - `interface UpdateLifecycleRow { published_at: string | null; expires_at: string | null; ended_at: string | null; moderation_status: 'ok' | 'hidden' }`
  - `deriveUpdateState(row: UpdateLifecycleRow, now?: Date): UpdateState`. The order is: hidden, then draft, then scheduled, then ended, then active.
  - `interface UpdateDraftInput { type: UpdateType; title: string; body: string; mediaCount: number; offerId: string | null; ctaLabel: string | null; ctaUrl: string | null; publishAt: Date | null }`
  - `validateUpdateDraft(input: UpdateDraftInput, now?: Date): string[]` returns the human-readable errors, or an empty array.
  - `signedUrlTtlSeconds(expiresAt: string, now?: Date): number` returns 0 when the update is already over.
  - `updateShareLink(slug: string, updateId: string): string` returns `/<slug>?update=<id>`.

- [ ] **Step 1: Write the failing tests** in `src/lib/businessUpdates.test.ts`:
  - `deriveUpdateState`: with `published_at = T`, `expires_at = T+24h`, `ended_at = null`, `ok`, it returns `active` at T, `active` at T+24h−1ms, `ended` at exactly T+24h (`ended at exactly 24h`), and `scheduled` at T−1ms. With `published_at = null` it returns `draft`. With `ended_at` set it returns `ended`. A `hidden` row returns `hidden` even while inside its window.
  - `validateUpdateDraft`: it accepts a text-only announcement. It rejects empty title, body and media with `'Add some text, a photo or a video.'`. It rejects title length 81 (`'Title can be up to 80 characters.'`), body length 501 (`'Text can be up to 500 characters.'`), mediaCount 11 (`'Up to 10 photos or videos.'`), and offer type with `offerId` null (`'Choose the offer this update is about.'`). It rejects ctaUrl `javascript:x` and `http://x` (`'Links must start with https:// or /.'`), and accepts `/abc` and `https://x.y`. It rejects a cta_label over 30 chars, publishAt now+14d+1min (`'Schedule up to 14 days ahead.'`) and publishAt now−6min (`'That time has already passed.'`).
  - `signedUrlTtlSeconds`: it returns 600 with 2h left, 59 with 59.4s left (floor), and 0 when expired.
  - `UPDATE_TOPIC` has an entry for every key of `UPDATE_TYPES`, and every value is in `ALL_TOPICS`.
  - `updateShareLink('mama-put','abc')` returns `'/mama-put?update=abc'`.

- [ ] **Step 2: Run and see it fail.** Run `npx vitest run src/lib/businessUpdates.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/lib/businessUpdates.ts`.** Add a header comment in the house style that explains the database is the gate and this file only mirrors it for labels. There is no I/O and no React.

- [ ] **Step 4: Run and see it pass.** Run `npx vitest run src/lib/businessUpdates.test.ts`. Expected: all pass. Then run `npm run typecheck`. Expected: exit 0.

- [ ] **Step 5: Prepare the commit (held for founder approval):** `git add src/lib/businessUpdates.ts src/lib/businessUpdates.test.ts`, message `feat(updates): pure lifecycle library for 24h business updates`.

---

### Task 2: Migration A: tables, lifecycle guards, RLS, storage

**Files:**
- Create: `supabase/migrations/20261110010000_business_updates.sql`. Before creating it, confirm no other file uses timestamp `20261110010000`.
- Test: `src/test/businessUpdatesMigration.test.ts`

**Interfaces:**
- Produces SQL objects that Task 3 and Task 4 use:
  - Tables `public.business_updates` and `public.business_update_media`, with the columns exactly as in spec 5.1 and 5.2. `expires_at timestamptz GENERATED ALWAYS AS (published_at + interval '24 hours') STORED`.
  - `public.update_path_business(p_name text) RETURNS uuid`, IMMUTABLE. It returns the first path segment as a uuid when it matches `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`, otherwise null.
  - `public.business_update_state(p_published timestamptz, p_expires timestamptz, p_ended timestamptz, p_moderation text, p_at timestamptz) RETURNS text`, IMMUTABLE. It uses the same order as `deriveUpdateState`.
  - `public.update_publisher_roles() RETURNS text[]`, IMMUTABLE, returning `ARRAY['manager','marketing','content_editor']`.
  - Trigger function `public.guard_business_update()`, SECURITY DEFINER, as a BEFORE INSERT OR UPDATE OR DELETE trigger `trg_bu_10_guard`. It applies its rules only when `auth.role() IN ('anon','authenticated')`, so service jobs and direct SQL pass.
  - Trigger function `public.guard_business_update_media()`, as a BEFORE INSERT OR UPDATE OR DELETE trigger `trg_bum_10_guard`.
  - Bucket `business-updates`, private, `file_size_limit 52428800`, MIME allowlist `image/webp, image/jpeg, image/png, video/mp4, video/webm`. The insert uses `ON CONFLICT (id) DO UPDATE` of the limit and allowlist, so it is idempotent.

- [ ] **Step 1: Write the failing structural test** in `src/test/businessUpdatesMigration.test.ts`. It reads both migration files that exist (Task 3 adds the second; use `it.skipIf(!exists)`) and asserts:
  - Inside every `/* … */` block, after the opening there is no second `/*` and no `*/` before the real close (`no nested comment markers in prose`).
  - Every `SECURITY DEFINER` function body contains `SET search_path = public`.
  - Every `CREATE POLICY` is preceded by a matching `DROP POLICY IF EXISTS` with the same name, and every `CREATE TRIGGER` by a `DROP TRIGGER IF EXISTS`.
  - The text contains `GENERATED ALWAYS AS (published_at + interval '24 hours') STORED`.
  - The public select policy contains `expires_at > now()` (strict) and `moderation_status = 'ok'`.
  - The text contains no `current_user`.
  - Neither file appears in the writers list of `src/test/migrationLedgerSafety.test.ts`, which stays unchanged. To show this, run that test in Step 4.

- [ ] **Step 2: Run and see it fail.** Run `npx vitest run src/test/businessUpdatesMigration.test.ts`. Expected: FAIL, file missing.

- [ ] **Step 3: Write the migration.** Open it with a header block comment in the house style: what it is, why expiry is in RLS, and why the media lives in a private bucket. The rules it must enforce:
  - **Guard on INSERT** (web roles): set `NEW.author_id := auth.uid()`, `NEW.notified_at := NULL`, `NEW.moderation_status := 'ok'`, and null out the moderation fields.
  - **Guard on UPDATE** (web roles):
    - When `OLD.published_at <= now()`, a changed `published_at` raises `'An update that has gone live cannot be re-published. Post it again instead.'`.
    - When `OLD.published_at <= now()`, a change to `title`, `body`, `type`, `offer_id`, `cta_*` or `event_starts_at` raises `'A live update cannot be edited. End it and post again.'`.
    - `ended_at` can go from NULL to `now()` only while published, and can never go back to NULL.
    - `notified_at` is forced to `OLD.notified_at`.
    - When not `is_admin()`, the `moderation_*` fields are forced to their OLD values.
    - When `is_admin()` and `moderation_status` changes, set `moderated_by := auth.uid()` and `moderated_at := now()`.
  - **Publish rules** apply on INSERT or UPDATE when `published_at` goes from NULL to set, or changes while still in the future, for web roles:
    - The time must be in `[now() - interval '5 minutes', now() + interval '14 days']`.
    - The update needs `coalesce(title,'') <> '' OR coalesce(body,'') <> ''` or at least one media row.
    - `type = 'offer'` needs `offer_id` whose `business_offers.business_id = NEW.business_id`. This read is why the guard is SECURITY DEFINER: members cannot read offers under the offers RLS.
  - **Guard on DELETE** (web roles, not admin): raise when `OLD.moderation_status = 'hidden'`, with `'This update was hidden by NowOpen and is kept for review.'`.
  - **CHECK constraints**: type list, `moderation_status IN ('ok','hidden')`, the length limits, and `cta_url ~ '^(https://|/)'`.
  - **Media guard**:
    - `business_id` must equal the parent's.
    - `storage_path` must start with `business_id || '/' || update_id || '/'`.
    - At most 10 rows per update on insert.
    - When the parent has `published_at <= now()`, insert, update and delete raise `'Media cannot change once the update is live.'`. When the parent row no longer exists (cascade delete), allow.
    - CHECKs: `kind IN ('image','video')`, `duration_ms IS NULL OR duration_ms <= 60000`, alt_text ≤ 200.
  - **Indexes**: `(business_id, created_at DESC)`, a partial live index `(published_at DESC) WHERE ended_at IS NULL AND moderation_status = 'ok' AND published_at IS NOT NULL`, media `(update_id, position)`, and unique `storage_path`.
  - **RLS on business_updates**:
    - `"Public reads active updates"`: SELECT using spec 6.1.
    - `"Members read their updates"`: SELECT `TO authenticated USING (is_business_member(business_id))`.
    - `"Publishers write updates"`: INSERT, UPDATE and DELETE as three policies `TO authenticated`, using `has_business_role(business_id, update_publisher_roles())` in USING and WITH CHECK.
  - **RLS on media**:
    - `"Public reads active update media"`: `EXISTS (SELECT 1 FROM business_updates u WHERE u.id = update_id)`. This EXISTS runs under the caller's RLS on updates, which is the point.
    - Members read with `is_business_member`.
    - Publishers write with `has_business_role`.
  - **Storage policies on `storage.objects`**, all scoped `bucket_id = 'business-updates'`:
    - Select: `is_business_member(update_path_business(name)) OR EXISTS (SELECT 1 FROM business_update_media m WHERE m.storage_path = name OR m.poster_path = name)`.
    - Insert, update and delete, `TO authenticated`: `update_path_business(name) IS NOT NULL AND has_business_role(update_path_business(name), update_publisher_roles())`.
  - **Comments**: `COMMENT ON` each table and on `expires_at`.

- [ ] **Step 4: Run and see it pass.** Run `npx vitest run src/test/businessUpdatesMigration.test.ts src/test/migrationLedgerSafety.test.ts`. Expected: PASS.

- [ ] **Step 5: Prepare the commit (held):** the migration file and its test, message `feat(updates): business_updates schema, lifecycle guards, RLS, private bucket`.

---

### Task 3: Migration B: keeper alerts, scheduled dispatch, reports

**Files:**
- Create: `supabase/migrations/20261110020000_business_update_alerts_reports.sql`
- Test: `src/test/businessUpdatesMigration.test.ts`. The Task 2 structural assertions now cover this file. Add the specific assertions below.

**Interfaces:**
- Consumes: the Task 2 tables, `notify_keepers(uuid,text,text,text,text)`, `enforce_public_write_limit()`, `is_admin()`.
- Produces:
  - `public.business_update_topic(p_type text) RETURNS text`, IMMUTABLE. It must match `UPDATE_TOPIC` exactly.
  - `public.send_business_update_alert(p_update public.business_updates) RETURNS integer`, SECURITY DEFINER, with EXECUTE revoked from public, anon and authenticated. It returns 0 without sending when the update is an offer whose `business_offers.created_at > now() - interval '6 hours'`. Otherwise it calls `notify_keepers(business_id, topic, coalesce(nullif(title,''), '<business name> posted an update'), left(coalesce(body,''),400), '/' || coalesce(username, id::text) || '?update=' || id)` and wraps the call in `BEGIN … EXCEPTION WHEN OTHERS THEN RAISE WARNING`.
  - Trigger `trg_bu_20_alert`: BEFORE INSERT OR UPDATE, running after `trg_bu_10_guard` by name order. When `NEW.notify_keepers`, `NEW.notified_at IS NULL`, `NEW.published_at <= now()`, `NEW.ended_at IS NULL` and `NEW.moderation_status = 'ok'`, it calls the alert and sets `NEW.notified_at := now()`, whether or not anyone was reached.
  - `public.dispatch_scheduled_update_alerts() RETURNS integer`, SECURITY DEFINER, with EXECUTE revoked from anon and authenticated. It loops over updates where `notify_keepers AND notified_at IS NULL AND published_at <= now() AND expires_at > now() AND ended_at IS NULL AND moderation_status = 'ok'`, sends each one, sets `notified_at`, and returns the count.
  - The cron job `nowopen-update-alerts` on `'*/15 * * * *'` runs `select public.dispatch_scheduled_update_alerts();`. Unschedule it first if it exists, using the same pattern as `20261024010000_instagram_gallery_refresh_schedule.sql`.
  - Table `public.business_update_reports` as in spec 5.3. A BEFORE INSERT SECURITY DEFINER trigger `trg_bur_10_fill` sets `NEW.business_id` from the parent and `NEW.status := 'open'`, and nulls the review fields. The rate-limit trigger is `business_update_reports_rate_limit` with `enforce_public_write_limit('update_report', '30', '1 hour')`.
  - Policies: `"Anyone can report a visible update"`, an INSERT `TO anon, authenticated WITH CHECK ((user_id IS NULL OR user_id = auth.uid()) AND EXISTS (SELECT 1 FROM business_updates u WHERE u.id = update_id))`. `"Staff read update reports"` (SELECT) and `"Staff manage update reports"` (UPDATE) are both `is_admin()`. There is no public SELECT.

- [ ] **Step 1: Add the failing assertions.** The topic CASE in `business_update_topic` maps each of the 6 types to the same value as `UPDATE_TOPIC`. Parse the `WHEN '<type>' THEN '<topic>'` pairs and compare them to the import from `src/lib/businessUpdates.ts`. Also assert the file contains `cron.schedule('nowopen-update-alerts', '*/15 * * * *'`, and that `notify_keepers`, `send_business_update_alert` and `dispatch_scheduled_update_alerts` each have a `REVOKE` from `anon, authenticated`.

- [ ] **Step 2: Run and see it fail.** Run `npx vitest run src/test/businessUpdatesMigration.test.ts`. Expected: FAIL on the new assertions.

- [ ] **Step 3: Write the migration.** Give it a header comment covering three things. First, why the alert runs in a BEFORE trigger: it sets `notified_at` with no self-update and no recursion. Second, why cron only alerts and never gates visibility. Third, why updates get their own reports table instead of `business_reports`.

- [ ] **Step 4: Run and see it pass.** Run `npx vitest run src/test/businessUpdatesMigration.test.ts src/test/migrationLedgerSafety.test.ts`. Expected: PASS.

- [ ] **Step 5: Prepare the commit (held):** message `feat(updates): keeper alerts, scheduled dispatch, update reports`.

---

### Task 4: Rolled-back behaviour checks and the dry-run runner

**Files:**
- Create: `scripts/check-business-updates.sql`, a checks body that starts with `BEGIN;` and ends with `ROLLBACK;`, following the pattern of `scripts/check-placement-trust.sql`.
- Create: `scripts/check-business-updates.mjs`. Usage: `node scripts/check-business-updates.mjs [--dry-run]`. With `--dry-run` it writes a temp file to `os.tmpdir()` containing `BEGIN;`, then both migration files, then the check body with its own `BEGIN;`/`ROLLBACK;` stripped, then `ROLLBACK;`. It runs that file. Without the flag it runs the check file alone, after the apply. In both modes it exits 1 on `ERROR`/`assert`, or when no `ok:` lines appear.
- Test: `src/test/businessUpdatesCheckSql.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2 and 3.
- Fixtures, created inside the transaction only:
  - One existing listable business whose owner is not an admin: `SELECT b.id, b.user_id FROM businesses b JOIN users u ON u.id = b.user_id WHERE u.role <> 'admin' AND b.is_listable LIMIT 1`. Abort with a clear message if there is none.
  - A stranger: claims with `sub = gen_random_uuid()`. No `auth.users` rows are created, which avoids the signup triggers.
  - A `support` member and a `marketing` member: `business_members` rows for two other existing non-admin users who are not owners of the fixture business (rolled back).
  - Callers are simulated with `SET LOCAL ROLE anon|authenticated` plus `set_config('request.jwt.claims', json, true)`.
  - Times are moved by inserting rows with `published_at` in the past as the connection owner, which bypasses the web-role guard by design. Then reads run as anon and as the owner.
- Fixture updates use `notify_keepers = false`, except in check `alert_sets_notified_at`.

- [ ] **Step 1: Write the failing guard test** in `src/test/businessUpdatesCheckSql.test.ts`, mirroring `src/test/placementTrustCheckSql.test.ts`:
  - The file starts with `BEGIN;` and ends with `ROLLBACK;`.
  - It contains no `COMMIT` (case-insensitive, after removing line comments).
  - Every name in this list appears as `chk_pass('<name>')`: `anon_sees_active`, `boundary_24h_is_exclusive`, `anon_blind_to_draft_scheduled_ended_hidden`, `owner_sees_archive`, `stranger_cannot_insert`, `support_member_cannot_publish`, `support_member_reads_archive`, `marketing_member_can_publish`, `published_at_locked_after_live`, `live_update_text_locked`, `ended_at_cannot_be_cleared`, `owner_cannot_unhide`, `admin_hide_removes_public`, `owner_cannot_delete_hidden`, `schedule_limit_14_days`, `empty_update_refused`, `offer_needs_own_offer`, `media_cap_10`, `media_locked_when_live`, `media_path_must_match`, `anon_cannot_read_ended_media`, `member_reads_archive_media`, `bad_path_refused`, `alert_sets_notified_at`, `dispatch_sends_due_scheduled`, `report_insert_anon_ok`, `report_hidden_from_owner`, `author_forced_to_caller`.
  - The runner `.mjs` contains `ROLLBACK` handling and never the string `COMMIT`.

- [ ] **Step 2: Run and see it fail.** Run `npx vitest run src/test/businessUpdatesCheckSql.test.ts`. Expected: FAIL, file missing.

- [ ] **Step 3: Write the check SQL and the runner.** Each check is a `DO` block with `ASSERT … , '<name>: <what went wrong>'` that ends in `PERFORM pg_temp.chk_pass('<name>')`. Refusal checks catch the exception and assert that it was raised. Storage checks insert a `storage.objects` row directly, as the connection owner, with `bucket_id = 'business-updates'` and a matching `name`. They then `SELECT count(*)` as anon or the member. The two checks that need specific setups:
  - `boundary_24h_is_exclusive`: insert with `published_at = now() - interval '24 hours'`, and assert anon count = 0. A second row with `now() - interval '24 hours' + interval '1 second'` must give anon count = 1.
  - `bad_path_refused`: as the owner, inserting into `storage.objects` a name `not-a-uuid/x.jpg` in the bucket is refused by RLS (`42501`), and `update_path_business('not-a-uuid/x.jpg') IS NULL`.

- [ ] **Step 4: Run the guard test.** Run `npx vitest run src/test/businessUpdatesCheckSql.test.ts`. Expected: PASS. Run `npm run typecheck`. Expected: exit 0.

- [ ] **Step 5: Run the production dry run.** This is read-only in effect, because everything is rolled back. Run `node scripts/check-business-updates.mjs --dry-run`. Expected: 28 `ok:` lines and the message "All business updates checks passed (transaction rolled back)". Then confirm nothing persisted with `npx supabase db query --linked "select to_regclass('public.business_updates'), (select count(*) from storage.buckets where id='business-updates'), (select count(*) from cron.job where jobname='nowopen-update-alerts')"`. Expected: `null, 0, 0`.

- [ ] **Step 6: Prepare the commit (held):** message `test(updates): rolled-back behaviour checks and dry-run runner`.

---

### Task 5: Founder gate, apply, ledger, drift, review sheet

**Files:**
- Create: `docs/superpowers/reviews/2026-10-31-business-updates-phase1-review.md`

- [ ] **Step 1: Write the review sheet.** Cover what each migration creates, the dry-run output pasted in full, what was not verified, and the exact apply commands. What was not verified includes: real REST-path signing through `createSignedUrls`, which needs the phase 2 UI; the rate limit, which fails open without `x-forwarded-for` under direct SQL; and cron firing on schedule. Present it to the founder and **stop until they say go.**
- [ ] **Step 2: On go, check for collisions** with `ls supabase/migrations | grep 20261110`. Expected: exactly these two files.
- [ ] **Step 3: Apply A, then B.** Run `npx supabase db query --linked -f supabase/migrations/20261110010000_business_updates.sql`, then the same for `20261110020000_business_update_alerts_reports.sql`. Expected: no ERROR.
- [ ] **Step 4: Run the post-apply checks.** Run `node scripts/check-business-updates.mjs`. Expected: 28 `ok:` lines, rolled back.
- [ ] **Step 5: Record the ledger.** `insert into supabase_migrations.schema_migrations (version, name) values ('20261110010000','business_updates'), ('20261110020000','business_update_alerts_reports') on conflict (version) do nothing;`
- [ ] **Step 6: Check drift.** Run `npm run check:drift`. Expected: the ledger matches disk and no table or column drift is reported.
- [ ] **Step 7: Run the full gate.** Run `npm run verify`. Expected: exit 0, or report any failures that already existed and are unrelated, with their output.
- [ ] **Step 8: Update the review sheet** with the apply results, then update the project memory (`nowopen_business_updates.md` and its index line). Commits stay held for founder approval.
