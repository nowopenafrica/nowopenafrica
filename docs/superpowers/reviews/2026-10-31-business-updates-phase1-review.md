# Business Updates, phase 1: review sheet

Status: **APPLIED to production 2026-11-01 on the founder's go. Nothing committed or deployed.**

## Apply result (2026-11-01)

- Both migrations applied with no errors.
- Post-apply checks: `node scripts/check-business-updates.mjs` passed 32/32 (rolled back).
- Live now:
  - 3 tables and 11 table policies.
  - A private `business-updates` bucket with 4 storage policies.
  - The cron job `nowopen-update-alerts` on `*/15 * * * *`.
  - 0 update rows.
- Ledger: both versions recorded. `npm run check:drift` reports no drift and 229/229 ledger matches disk.
- `npm run verify`: typecheck, lint and check:all passed. Tests: 7029/7030. The one failure is `src/lib/projectPageRender.test.ts` ("omits fictional details", which expected no "Reported by the business"). That file belongs to another session's uncommitted project-stories work and doesn't touch Business Updates.

Spec: `docs/superpowers/specs/2026-10-31-business-updates-design.md`
Plan: `docs/superpowers/plans/2026-10-31-business-updates-phase1.md`

## What was built

| File | What it does |
|---|---|
| `supabase/migrations/20261110010000_business_updates.sql` | Tables `business_updates` and `business_update_media`. `expires_at` is generated as published_at + 24h and cannot be edited. A lifecycle guard trigger. RLS on both tables. The private `business-updates` bucket (50 MB, image/video allowlist) and its storage policies. |
| `supabase/migrations/20261110020000_business_update_alerts_reports.sql` | Keeper alerts through `notify_keepers` (consent topics + throttle). The `nowopen-update-alerts` cron job every 15 minutes, for scheduled updates only. The `business_update_reports` table: anonymous inserts, rate-limited, admin-only reads. |
| `src/lib/businessUpdates.ts` (+ test) | Pure mirror of the rules for the UI phases: states, topics, validation messages, signed-link TTL, share link. |
| `scripts/check-business-updates.sql` / `.mjs` (+ test) | 32 behaviour checks in one transaction that always rolls back. `--dry-run` also runs both migrations inside that transaction. |

## What the database now refuses (all proven by the dry run)

- **Public visibility:**
  - Anyone sees an update only while it is live. It disappears at exactly 24h (checked at the 24h mark and 1 second before).
  - Drafts, scheduled, ended-early, expired and hidden updates are invisible to the public.
  - Members see all of them.
- **Who can write:**
  - A stranger cannot post for a business.
  - A `support` member can read the archive but cannot post, publish or delete. A `marketing` member can post.
  - The author is always the signed-in caller.
- **Locked once live:**
  - A live update cannot be re-published (no second 24h), edited, or restarted after ending.
  - Its id and creation time cannot change.
  - Its photos and files cannot be added, swapped or uploaded into.
- **Moderation:**
  - Only an admin can hide or unhide. Hiding removes the update from public view at once and records who did it.
  - An owner cannot delete a hidden update or its files.
- **Publishing rules:**
  - Scheduling is up to 14 days ahead.
  - An update with no text and no media cannot go live.
  - An offer update needs an offer of the same business.
  - Deleting an offer still works when updates announced it.
- **Media and storage:**
  - At most 10 media per update, and a media row must point inside its own business and update folder.
  - Anonymous visitors can read media only while the update is live. Members can always read their own archive.
  - Malformed paths and folders with no update behind them take no uploads.
- **Alerts:**
  - A live update sends its keeper alert once.
  - Scheduled updates are sent by the dispatcher once live. Ended ones are skipped.
  - Turning alerts on after 24h sends nothing.
- **Reports:**
  - Anyone can report a live update, filed as `open` against the right business. Reports on expired updates are refused.
  - The business cannot read reports about itself.

## Dry-run result (production, rolled back)

```
node scripts/check-business-updates.mjs --dry-run
All 32 business updates checks passed (transaction rolled back, migrations included).
```

Afterwards, production still had no `business_updates` table, no bucket, no cron job and no new functions. I checked by query.

Also: `npm run typecheck` exit 0, eslint clean on the new files, and 86/86 Vitest tests across the four related test files.

## Independent review

A fresh reviewer read the whole change. It found 3 Important issues, and I raised one Minor to Important. All four are fixed, and each has a check:

1. **Deleting an offer was blocked if any update had announced it.** The check reproduced the failure before the fix.
2. **A publisher could swap or delete files of a live or hidden update, or upload into empty folders.**
3. **Turning alerts on after 24h, or un-hiding late, sent keepers to an invisible update.**
4. **A client could change a live update's id, breaking links already sent.**

For fixes 2–4 I did not see the check fail before the fix. The dry run stops at its first failure, and that was fix 1.

Deferred minors, recorded and not fixed:
- Ending a scheduled update before it starts.
- Emptying a scheduled update after scheduling.
- FK SET NULL edge cases for a future account-delete RPC.
- The 6h offer-alert silence when the offer was created inactive.
- Alerts for unlisted businesses.
- Unqualified column names in policy subqueries.
- The media cap under concurrent inserts.
- Weaker alert check coverage.
- Trim mismatch between client and database.
- Report dedupe.

## Rulings I made

- **Expiry wrapper.** `expires_at` uses an IMMUTABLE wrapper `business_update_expiry()`, because Postgres refuses `timestamptz + interval` in a generated column. Adding hours is absolute time, so the result is the same in every time zone.
- **Offer deleted before go-live.** A scheduled offer update whose offer is deleted goes live without the offer link, rather than blocking the delete.
- **Storage delete checks.** The storage delete cases are checked through the policy's function. Supabase blocks every direct SQL delete on storage, and only the Storage API may delete.
- **No commits.** No worktree and no commits; the files listed above are the whole change.

## Not verified yet (needs later phases or the live apply)

- Signed links through the real Storage API (`createSignedUrls`). That needs the phase 2 dashboard. The policies it relies on are checked.
- The report rate limit. It only applies to requests through the API, and fails open under direct SQL.
- The cron job firing on schedule.
- Notification rows reaching real keepers. The checks prove `notified_at` is set and the dispatcher runs, but not that a bell notification arrived.

## Apply steps, after the founder's go

1. Run `ls supabase/migrations | grep 20261110` and expect exactly these two files.
2. Run `npx supabase db query --linked -f supabase/migrations/20261110010000_business_updates.sql`.
3. Run `npx supabase db query --linked -f supabase/migrations/20261110020000_business_update_alerts_reports.sql`.
4. Run `node scripts/check-business-updates.mjs` and expect 32/32, rolled back.
5. Record both migrations in the ledger:
   ```sql
   insert into supabase_migrations.schema_migrations (version, name) values
     ('20261110010000','business_updates'),
     ('20261110020000','business_update_alerts_reports')
   on conflict (version) do nothing;
   ```
6. Run `npm run check:drift`, then `npm run verify`.

Applying changes nothing users can see. No UI reads these tables yet, and an empty table sends no alerts. Commits and deploys stay on hold until you approve them separately.
