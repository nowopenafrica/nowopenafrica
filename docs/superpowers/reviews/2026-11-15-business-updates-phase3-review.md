# Business Updates, phase 3 (public profile): review sheet

Status: **built, reviewed and fixed. Live end-to-end test passed and cleaned up. DEPLOYED to production 2026-11-15. Not committed.**

## Deploy (2026-11-15, founder approved)

- **Before:** `check:drift` clean, and `npm run verify` exit 0 (7,601/7,601).
- **Deploy:** `npx vercel --prod` produced `nowopenafrica-cy7jgm8fk`, aliased to www.nowopenafrica.com.
- **The deploy shipped the whole working folder,** including other sessions' work.
- **Live code:** the BusinessDetail chunk has the strip, viewer and report form. The Dashboard chunk has the Updates window and the publish call.
- **Live page:** `/yemzoarts?update=<unknown>` showed the ended notice and cleared the address. There was no strip with 0 live updates and no console errors.

## Live end-to-end test (2026-11-15, founder approved)

On YemzoArts Studios, with Keeps alerts off:

1. **Posted** from the dashboard.
2. **Strip:** appeared on `/yemzoarts` with the label `Announcement: Testing NowOpen Updates on the profile..., posted 1 min ago`.
3. **Viewer:** the signed photo loaded, keyboard focus moved inside the dialog, and the address gained `?update=<id>`.
4. **Share link:** loading that address fresh opened the viewer directly. Escape closed it and cleared the address.
5. **Logged-out visitor (public key):** could read the update and its media row and get a signed photo link. The plain public URL was refused (400).
6. **Report:** sent through the viewer. It was filed as `open`, against the right business and update. The thank-you showed and focus moved to Close.
7. **End and delete** from the dashboard.
8. **Query afterwards:** 0 updates, 0 media rows, 0 reports, 0 files, 0 keeper notifications.

Plan: `docs/superpowers/plans/2026-11-15-business-updates-phase3.md` (approved 2026-11-15)

## What was built

| File | What it does |
|---|---|
| `src/lib/publicUpdates.ts` (+ tests) | The public read: only what the database returns as live. Photo links are signed for no longer than each update lives, and links that are still good are reused on refresh. Reports are filed with no read-back, anonymously when signed out, with readable messages for an ended update or the rate limit. |
| `src/lib/businessUpdates.ts` | Adds `postedAgoLabel` ("3h ago") and `isInAppPath`. Button links like `//other-site` are refused, because they would leave NowOpen. |
| `src/components/updates/UpdatesStrip.tsx` | "Updates · last 24 hours" above the profile tabs, shown only when something is live. A failed first read shows nothing. A failed refresh keeps what was shown. It re-reads every minute while the page is visible. A link to an update that has ended shows "This update has ended." |
| `src/components/updates/UpdateViewer.tsx` | A full-screen dialog plus a list view. See "What a visitor gets" below. |
| `src/pages/BusinessDetail.tsx` | Small additions. The strip goes above the tabs (never for sample listings) and is keyed by business. `?update=<id>` opens one update, and Back closes it. |

## What a visitor gets

- **Moving between updates:** buttons, ← →, or a swipe. There is no auto-advance.
- **Video:** muted, with no autoplay and an Unmute button.
- **Details:** "Posted 3h ago · Ends 6:40 pm", the business's own button, and "See the offer".
- **Share:** uses the phone's share sheet when available, otherwise copies the link.
- **Report:** six reasons and an optional detail. No sign-in is needed, and the visitor gets a thank-you.
- **Accessibility:** the dialog names the business and position, keeps keyboard focus inside, and returns focus on close. Escape closes the report form first, then the viewer. The list view is plain text with alt text.

## Verified

- **Tests:**
  - **Business Updates:** 113/113 (phases 1–3).
  - **Full `npm run verify`:** exit 0, 7,601/7,601 tests in 499 files, typecheck clean, lint 0 errors, and the Supabase-error guard unchanged.
- **Browser (localhost, reading only):** on `/yemzoarts?update=<unknown id>` the notice shows above the tabs and the parameter is cleared. With 0 live updates there is no strip, and there is no horizontal scroll.
- **A dev-server parse error seen during the check was another session editing `BusinessDetail.tsx` at the same moment.** The file compiles, and these additions are intact.

## Independent review and fix pass

The fresh reviewer found 0 Critical, 7 Important and 14 Minor issues. I raised one Minor to Important (M1, `//host` links leaving NowOpen). All 8 are fixed, each with a test I saw fail first.

1. **The viewer vanished** when the last update ended or a refresh failed.
2. **Ended early or hidden by NowOpen:** the update stayed viewable in an open viewer.
3. **List view:** it ignored ending, and Report didn't work there.
4. **Moving to another profile** carried the open viewer over under the wrong business name. In-app links now close the viewer.
5. **Swipe:** fixed for touch (`touch-action: pan-y`). Drags on the video or other controls no longer swipe, and a cancelled pointer is ignored.
6. **Focus:** Shift+Tab escaped the dialog right after opening, and focus was lost after sending a report.
7. **Thumbnails** were signed again, and so downloaded again, every minute.
8. **`//host` and `/\host` button links** opened another site in the same tab.

**Also folded in** while editing the same lines:
- Arrow keys no longer change update while the video has focus.
- Overscroll is contained.
- Share falls back to copying the link unless cancelled.
- Summaries don't split emoji.
- The read order is stable.

**Deferred minors:**
- No retry when the very first signing fails.
- The mute button label vs the native controls.
- No body scroll lock.
- "Update not found" shows a generic message.
- A phone clock set far ahead hides updates.
- Live-region announcements.
- A deep link after a failed first read.
- No photo carousel with dots.
- "See the offer" goes to /offers, not the specific offer.

## Rulings I made

1. **The viewer gets a snapshot of the list taken when it opens,** plus the live ids, so an ended update says so instead of being replaced.
2. **A failed refresh keeps the last good list.** Only a failed first read means no strip.
3. **Keeper-alert links use `/<username>`.** That breaks for a business with no username, because `/<uuid>` doesn't resolve. Today 0 of 9 owned businesses lack one. A small database follow-up should switch to `/businesses/<id>`.

## Not verified

- **Real touch swipe, iOS inline video and the native controls** need a device.
- **A real update on a live profile, a logged-out view, the share link and a report** need one production write.
- **Contrast of grey text on the dark viewer** has not been measured.

## Waiting on the founder

1. **One real end-to-end test on YemzoArts Studios,** with Keeps alerts off:
   - post 1 update with a photo from the dashboard
   - as a logged-out visitor, see the strip and open the viewer
   - open the share link
   - send 1 report
   - end and delete the update, which removes the report with it
   - confirm by query that 0 rows and 0 files remain
2. **Deploy** (`npm run check:drift`, then `npx vercel --prod`). This is a separate approval. The deploy ships the whole working folder, including other sessions' work.
3. **Commit** on a branch the same way as phases 1–2.

