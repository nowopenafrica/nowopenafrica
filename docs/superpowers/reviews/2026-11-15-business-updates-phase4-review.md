# Business Updates, phase 4 (Discover and Keeps): review sheet

Status: **built, reviewed and fixed. Live check passed and cleaned up. DEPLOYED to production 2026-11-15, which also fixes the phase 3 issue live. Not committed.**

## Deploy (2026-11-15, founder approved)

- **Before:** `check:drift` clean, and `npm run verify` exit 0 (7,630/7,630, no unhandled errors).
- **Deploy:** `npx vercel --prod` produced `nowopenafrica-jn8ri71jq`, aliased to www.nowopenafrica.com. It shipped the whole working folder, including other sessions' work.
- **Live code:** it contains the Discover row, the Keeps row and the live-only filters (`moderation_status`, `ended_at`, `business.is_listable`).
- **Live pages:** /discover, /keeps and /yemzoarts each loaded in a fresh tab with no console errors. Neither row showed, with 0 live updates.
- **A false alarm:** an older tab showed 446 realtime WebSocket errors. That was console history it kept from earlier pages. A realtime socket opened fine from this machine, and fresh tabs were clean.

## Live check (2026-11-15, founder approved)

On YemzoArts Studios, with Keeps alerts off, I posted 1 update now (with a photo) and scheduled 1 for 2 hours later.

- **New code, signed in as an admin (localhost):**
  - Discover's "Happening on NowOpen" showed only the live update. Its photo loaded and it linked to `/yemzoarts?update=<id>`.
  - Keeps' "New today" showed only the live update.
  - The profile strip showed only the live update.
  - The scheduled update appeared nowhere.
- **Deployed code (www.nowopenafrica.com), same moment, signed in as the admin:** the profile strip showed the scheduled update as "posted Just now", above the live one. That confirms the phase 3 bug on the live site, and that this fix removes it.
- **Clean-up:** both were deleted from the dashboard. A query afterwards found 0 updates, 0 media rows, 0 reports, 0 files and 0 keeper notifications. The founder's existing keep of YemzoArts was untouched.
- **Small follow-up spotted:** the composer has two buttons both named "Schedule" (the when-toggle and the submit). Screen-reader users can't tell them apart.

Plan: `docs/superpowers/plans/2026-11-15-business-updates-phase4.md` (approved 2026-11-15)

## What was built

| File | What it does |
|---|---|
| `src/lib/publicUpdates.ts` | Adds `fetchHappening`: live updates across businesses, restricted to listable, published businesses. Only each update's first photo is signed, and still-good thumbnails are reused. Adds `happeningHref`, which uses `/<username>?update=` or `/businesses/<id>?update=`. |
| `src/lib/businessUpdates.ts` | Adds `rankHappening`: newest first, and only within the same clock hour do kept businesses come first. |
| `src/components/updates/HappeningRow.tsx` | The card row. Each card shows the photo, business, type, text and "3h ago", and links to the update on the profile. It is hidden when empty or unreadable. A failed refresh keeps the last list. It re-reads every minute while visible. |
| `src/components/updates/KeptUpdates.tsx` | "New today from places you keep". It reads the person's own newest 150 keeps, explicitly by their user id, then their live updates. It shows nothing when there is nothing. |
| `Discover.tsx`, `Keeps.tsx` | Small additions. On Discover the row sits above the rails, shows only when not searching or filtering, and allows at most 2 updates per business. On Keeps the row sits above the kept list. |

## Verified

- **Tests:**
  - **Full `npm run verify`:** exit 0, 7,630/7,630 tests in 502 files, no unhandled errors, typecheck clean, 0 lint errors.
  - **Live API:** it accepted the exact query, including the business filters and the new live-only filters (200).
- **Browser (localhost, reading only):** with 0 live updates, neither row shows. I watched the requests with a `PerformanceObserver`:
  - Discover sends both business filters.
  - Keeps reads `business_keeps?user_id=eq.<me>` and then those businesses' updates.
  - The page makes no repeated requests once it settles.

## Independent review and fix pass

The fresh reviewer found 1 Critical, 4 Important and 9 Minor issues. All 5 serious ones are fixed, each with a test I saw fail first.

1. **Critical, and it also affects phase 3, which is already deployed.**
   - **The cause:** admins and a business's own team can read every state of that business's updates (drafts, scheduled, ended early, hidden). The public reads trusted the database to have filtered them.
   - **The effect:**
     - On the live site today, you as an admin, and any owner on their own profile, could see a scheduled or hidden update in the profile strip as if it were public.
     - In the new Discover row, drafts would also have filled the 24 slots.
     - Customers never saw any of this.
   - **The fix:** both reads now ask for live updates only:
     - published, and not in the future
     - not expired
     - not ended
     - not hidden
   - **This reaches the live site only when deployed.**
2. **The "place" and "category" tie-breaks could never apply on Discover,** because the row is hidden whenever either filter is set. Only "businesses you keep" now breaks ties. That is a change to decision 2, explained in the code.
3. **The wiring test passed because of a code comment.** It now checks the real code.
4. **Someone keeping hundreds of businesses** would have quietly lost the Keeps row (the request address gets too long). It now uses the newest 150 keeps.
5. **One business could fill the whole Discover row.** It is now limited to 2 updates per business.

Two other test files (`businessDetailRender`, `businessContentFailure`) had stand-in databases without the new filter methods. I added them, which is test-only.

**Deferred minors:**
- Thumbnails go stale after the tab has been hidden for more than 10 minutes.
- Short-lived links are re-signed each minute.
- A comment overstates the ranking guarantee.
- Un-keeping doesn't refresh the Keeps row.
- Focus outlines are clipped by the scroll area.
- Heading order on Keeps.
- An untested short-lived signing path.
- The row appears above Discover's loading spinner.

## Rulings I made

1. **The live-only filter uses the device clock** for admins and team members. The public is still filtered by the database's own clock. A team member whose phone clock is far off could see their own scheduled update early, or lose a live one. A small database view using the server clock would remove this, but it needs a migration (a follow-up).
2. **The place and category tie-breaks were dropped from Discover** (finding 2).
3. **Discover allows at most 2 updates per business** (finding 5).

## Not verified

- **A real update in the Discover and Keeps rows.** This needs one production write.
- **That an admin no longer sees a scheduled update in the profile strip.** This needs a real scheduled update (below).

## Waiting on the founder

1. **One real check on YemzoArts Studios,** with Keeps alerts off:
   1. Post one update now and schedule a second one for later.
   2. As an admin, confirm the live one appears on Discover, on Keeps (if you keep YemzoArts) and in the profile strip, and the scheduled one appears nowhere public.
   3. Delete both.
   4. Confirm by query that 0 remain.
2. **Deploy.** This also fixes the phase 3 issue already live.
