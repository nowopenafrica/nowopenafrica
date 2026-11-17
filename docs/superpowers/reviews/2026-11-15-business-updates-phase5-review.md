# Business Updates, phase 5 (moderation and counts): review sheet

Status: **built, reviewed and fixed. Both database changes APPLIED 2026-11-15 (gate A). Not deployed or committed.**

## Gate A, applied (2026-11-15, founder approved)

- **The whitelist** `20260908120000` was applied on its own. The constraint is validated and holds all three new names.
- **The stats migration** `20261117010000` was applied:
  - The function exists. `authenticated` may call it and `anon` may not.
  - The unhide rule is in the live alert trigger.
- **Checks:** 37/37 after the apply (rolled back).
- **Ledger and drift:** `20261117010000` is recorded in the ledger, and `check:drift` is clean.

Plan: `docs/superpowers/plans/2026-11-15-business-updates-phase5.md` (approved 2026-11-15; corrections appended)

## What was built

| File | What it does |
|---|---|
| `src/lib/telemetry.ts` | Adds three event names: `update_viewed`, `update_cta_clicked`, `update_shared`. |
| `UpdateViewer.tsx`, `UpdatesStrip.tsx` | Record an open once per update shown in focus mode (none in list view), a button tap, and a successful share or copy. All are tagged with the business. |
| `20260908120000_analytics_event_integrity.sql` (regenerated) + `audits/APPLY_ALL_PENDING.sql` | The database's event-name whitelist gains the three names. Its test requires the old one-paste bundle to carry the same text, so the bundle got the same three lines. |
| `20261117010000_business_update_stats.sql` (new) | `business_update_stats(business)`: distinct visitor sessions per update (opened, button taps, shares). It runs with the caller's own rights, so only the owner, and staff, can read it. Whole sessions of the owner and the active team are left out. It also redefines the keeper-alert trigger, so unhiding never sends an alert. |
| `businessUpdatesApi.ts`, `UpdatesManager.tsx` | The owner sees "3 people opened · 1 button tap · 0 shares" on live and ended updates, with the note "Counted from visits to NowOpen. Visits by you and your team are not counted." If the counts can't be read, no number is shown. Only the owner's view asks for counts. |
| `updateModeration.ts`, `UpdatesModerationPanel.tsx` | Admin Console → **Updates** (admin-only). See "What staff can do" below. |
| `permissions.ts`, `AdminDashboard.tsx` | The `updates` tab id (admin-only), the badge showing the number of open reports, and the panel itself. |

## What staff can do

- **The tab** has three lists: Reported (oldest report first, with each reason tallied and reporters' details quoted), Live now, and Hidden by NowOpen.
- **Hide** needs a reason of 5–500 characters. It hides the update, closes its reports as actioned, and sends the owner a bell notification with the reason.
- **Dismiss reports** closes them as rejected. The update stays up and nobody is told.
- **Unhide** brings the update back.
  - If the update is still within its 24 hours, the owner is told it is visible again.
  - If its 24 hours have already ended, the owner is told exactly that.
  - Either way, keepers are not alerted.

## Verified

- **Tests:** full `npm run verify` exit 0, 7,660/7,660 tests in 504 files, typecheck clean, 0 lint errors.
- **Production dry run** (rolled back, both new database changes included): 37/37 checks. The new ones:
  - `stats_owner_only`
  - `stats_exclude_owner`
  - `stats_exclude_own_sessions`
  - `unhide_sends_no_alert`
- **After the dry run,** production has no stats function and the whitelist is unchanged, both checked by query.
- **Browser, localhost, reading only:** the Admin Console Updates tab renders against live data, showing Reported (0), Live now (0), Hidden (0) and "Nothing reported", with no console errors. That also proves the live API accepts all three of its queries.

## Independent review and fix pass

The fresh reviewer found 0 Critical, 4 Important and 13 Minor issues. All 4 Important ones are fixed.

1. **Unhiding could send a first keeper alert hours late.** This happened when an update was hidden before its alert went out, either through the trigger or the 15-minute scheduler. Unhiding now marks the alert as handled.
   - SQL check `unhide_sends_no_alert`.
   - Its first run failed for the wrong reason (a flaw in the check), which was corrected. I did not see it fail against the old trigger.
2. **Unhiding an expired update said "visible again".** It now tells the owner and staff the truth. Two tests, seen failing first.
3. **Deploy order.**
   - If the viewer ships before the whitelist, the database rejects the whole batch of that page's events, including the existing Insights events, not just the new ones.
   - This is a process rule rather than a code change: the plan now says to apply the whitelist and check drift before any deploy.
4. **"Your own visits are not counted" was only partly true.** Whole sessions of the owner and the team are now left out. SQL check `stats_exclude_own_sessions`, seen failing first.

**Deferred minors** (in the ledger):
- **What the counts mean:**
  - "People" means browser-tab sessions.
  - Button taps can exceed opens, because list view doesn't count opens.
  - Forged events can inflate counts. This was known and accepted.
- **Speed:** the stats query has no time bound or dedicated index yet, which is fine at today's size.
- **Hiding:** it is three separate writes, so a failure can leave reports open, and hiding again notifies twice.
- **Housekeeping:**
  - The reviewer isn't stamped on reports.
  - A code comment is wrong about admins reading notifications.
  - The tab badge doesn't refresh after an action.
  - A very large report set may produce an over-long request.
  - ConfirmDialog has accessibility gaps (a shared, older component).
- **The whitelist re-run locks the analytics table until it commits.** Apply it alone, at a quiet time.

**Also worth knowing:** `AdminDashboard.tsx` carries other sessions' uncommitted edits (a phone and contact column on Users). They are already in the working folder, which is what deploys.

## Rulings I made

1. **The stats migration is named `20261117010000`,** because `20261116010000` is another session's.
2. **Counts are loaded only for the owner.** Team members can't read analytics, so they would get an empty answer that looks like 0.
3. **The bundle file `audits/APPLY_ALL_PENDING.sql` gets the same three event names,** as its test requires.
4. **The unhide rule lives in the stats migration** (it redefines the alert trigger), so phase 5 is still two database changes.

## Waiting on the founder

1. **Gate A, apply.**
   1. Apply `20260908120000_analytics_event_integrity.sql` alone. It locks the analytics table for one scan.
   2. Apply `20261117010000_business_update_stats.sql`.
   3. Run the post-apply checks and expect 37/37.
   4. Record `20261117010000` in the ledger. `20260908120000` is already recorded.
   5. Run `check:drift`.
2. **Gate B, deploy.** This must come after Gate A, because the new events need the whitelist first.
3. **Gate C, a live check on YemzoArts Studios** with alerts off:
   1. Post an update.
   2. Open it as a logged-out visitor on www, tap its button, and share it.
   3. The dashboard counts show 1 / 1 / 1.
   4. Report it.
   5. Hide it from the Admin Console. The owner sees "Hidden by NowOpen" and gets a bell notification.
   6. Unhide it, then delete it.
   7. Confirm 0 updates, reports and files remain. The handful of test analytics rows stay, because they are history, and are listed here afterwards.
