# Business Updates, phase 2 (owner dashboard): review sheet

Status: **built, reviewed and fixed. Migration applied, and the end-to-end test passed. Not committed or deployed.**

## Applied and tested live (2026-11-01, founder approved)

- **Migration:** `20261112010000_business_update_publish_rpc` applied. Afterwards the 33 checks pass (rolled back). `authenticated` may run it and `anon` may not. It is recorded in the ledger, and `check:drift` reports no drift with 232/232 matching the ledger.
- **End-to-end test** on YemzoArts Studios through the real UI, with Keeps alerts off:
  - **Created:** one update with one generated test photo.
  - **Server time:** `published_at` carries microsecond precision, so the server stamped it, not the phone. The lifetime is exactly 1 day.
  - **While live:** the dashboard showed the signed thumbnail (a `/object/sign/` URL that loaded). With the public key, the row could be read and the photo link could be signed, and the plain public URL was refused (400).
  - **After End:** the public key reads nothing, and signing the photo returns 404.
  - **After Delete:** the window shows "No updates yet".
  - **Query afterwards:** 0 updates, 0 media rows, 0 files in the bucket, and 0 keeper notifications.
- **Seen during the test:**
  - The keeper count read "1 person" once the owner was excluded (the I7 fix working live).
  - A grammar slip, "1 person who keep", was fixed with a test: "person who keeps".
- **Console:** only a duplicate-key warning from `BusinessContentManager`, an existing component outside this work.

One small migration (`20261112010000_business_update_publish_rpc`) has passed a dry run that rolled back. It is **NOT applied** and waits for the founder's go. The new Publish button calls it, so phase 2 cannot ship before it.

Plan: `docs/superpowers/plans/2026-11-01-business-updates-phase2.md`

## What was built

| File | What it does |
|---|---|
| `src/lib/businessUpdates.ts` (+ tests) | Adds the media checks (bucket types, 10 MB photos, 50 MB / 60 s videos, unreadable length refused), the storage path, the dashboard tab for each state, and labels like "Ends 6:40 pm" or "Goes live tomorrow 9:00 am" on the device clock. |
| `src/lib/businessUpdatesApi.ts` (+ tests) | All reads and writes. It saves the draft first with an id it makes itself, then uploads to `<business>/<update>/`, then adds the media rows, then publishes. Thumbnails use signed links. Delete ends the update first, then removes its files, then the row. Keeper counts are real and leave out the owner. |
| `src/components/dashboard/UpdateComposer.tsx` | The create and edit form. See "What an owner sees" below. |
| `src/components/dashboard/UpdatesManager.tsx` | The Updates window with three tabs: Active, Scheduled & drafts, and Archive. It handles end, delete, Publish now, Edit and Post again, with confirmations. It tells a failed read from an empty list, and moves an update to Archive when its time runs out without a reload. |
| `BusinessList.tsx`, `Dashboard.tsx` | Small additions. A 44px Updates button sits on each owned business card, and an Updates button appears under "Shared with you" for team roles that may post. `/dashboard?open=updates` opens the window. |
| `supabase/migrations/20261112010000_business_update_publish_rpc.sql` | `publish_business_update(id, at)`. "Now" becomes the server's own time. It runs with the caller's own rights, so the existing access rules and guard still apply. |
| `scripts/check-business-updates.sql` | Check 33: the server's time is used, and a stranger is refused. |

## What an owner sees

- **Choosing a type:** six chips (New product, New service, Offer, Announcement, Event, Recent work).
- **Text:** a title and body with counters.
- **Media:** up to 10 photos or videos with previews and descriptions. Files are refused when picked, before anything uploads.
- **Offer picker:** owners only. Team members are told why they don't see it.
- **Extras:** an optional button with a link, and Now or Schedule up to 14 days ahead.
- **Said before the button is pressed:**
  - "Tell the 2 people who keep YemzoArts Studios and asked about important announcements". This is a real count. No number is shown when it can't be read.
  - "Public for 24 hours from when it goes live, then only you and your team can see it".
- **If something fails:** a database refusal is shown in its own words and the draft is kept. Trying again publishes the same draft and doesn't create a second one.

## Verified

- **Business Updates tests:** 124/124 across 7 test files.
- **Typecheck and lint:** `npm run typecheck` exits 0, and the new files lint clean.
- **Dry run:** the rolled-back production run passes 33/33, including the new migration. Afterwards production has no `publish_business_update` function (checked by query).
- **Browser:** on localhost, signed in as the founder, with no writes:
  - the button is on the card, and the window opens from both the card and `?open=updates`
  - the window reads live data (0 updates) and the empty-state copy is right
  - the composer renders, and Publish is disabled with its reason shown
  - the real keeper count shows
  - at 375px there is no horizontal scroll, and every control is at least 44px
  - no console errors

## Independent review and fix pass

The fresh reviewer found 0 Critical, 9 Important and 13 Minor issues. I raised one Minor to Important (video thumbnails could download up to 50 MB each on mobile data). All 10 are fixed, and each one has a test I saw fail first.

1. A video whose length couldn't be read was let through with no length limit. It is now refused, and WebM length detection plus a timeout were added.
2. "Publish now" used the phone's clock. It now uses the server's time, through the new migration.
3. Delete trusted the phone's clock and missed silent storage refusals. It is now decided from the row, and the files removed are counted.
4. A file stayed in storage forever when its media row was refused. It is now removed.
5. A draft with only photos couldn't be published from Edit.
6. A draft saved as Quiet reopened showing "Tell the people…".
7. The "Keepers told" badge claimed alerts that may have been throttled. It now says "Keeper alert handled", and the owner is left out of the count.
8. Escape closed the window over an unsaved or uploading composer.
9. Team members had no way in.
10. Video thumbnails now load only metadata.

**Deferred minors** (recorded, not fixed):
- Save draft isn't validated.
- The offer can't be changed after a refused publish.
- Validation is frozen at the last edit.
- Picking files twice quickly can pass 10.
- No catch-all around submit.
- Thumbnail links expire after 10 minutes with the window open.
- "Publish now" in the list has no busy guard or confirmation.
- The 200-row cap is silent.
- Accessibility: focus trap, arrow-key tabs, and ConfirmDialog's name, Escape and size.
- The date picker icon in dark mode.
- .mov and 3gp files get a generic refusal.
- A partial draft isn't marked incomplete.

## Rulings I made

1. **No in-app camera recorder.** It saves to public storage. The phone's camera is used through the file picker instead. (Plan ruling, approved.)
2. **Post again doesn't copy the photos.** (Plan ruling, approved.)
3. **Only the owner gets the offer picker.** (Plan ruling, approved.)
4. **Deleting a live update ends it first.** (Plan ruling, approved.)
5. **The `?open=updates` link opens owned businesses only.** Team members use the "Shared with you" button.

## Not verified

- **A real upload, publish, signed thumbnail, end and delete.** This needs one production write (below).
- **Dark mode on screen.** The site's dark mode follows its own switch, not the system setting. The dark styles are in the code.
- **Reading video length on a real iPhone or Android.** This needs a device.

## Waiting on the founder

1. **Apply `20261112010000_business_update_publish_rpc`.**
   - Steps: dry run, then apply, then the 33 checks, then record it in the ledger, then `check:drift`.
   - Without it, Publish in the new window fails.
2. **One real end-to-end test** on YemzoArts Studios, with Keeps alerts off:
   - create 1 update with 1 photo
   - see the signed thumbnail
   - End it, then Delete it
   - confirm by query that 0 rows and 0 files remain
3. **Commit** on its own branch the same way as phase 1. Deploying is a separate approval.
