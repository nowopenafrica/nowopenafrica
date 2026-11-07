# Business Updates, Phase 2: Owner Dashboard (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give owners and publishing team members a dashboard to create, schedule, end and delete Business Updates, sorted into three tabs: Active, Scheduled & drafts, and Archive.

**Architecture:** The pattern follows `OffersManager`: a modal opened from the business card in `BusinessList` and from `/dashboard?open=updates&business=<id>`.
- **I/O** is in one module, `src/lib/businessUpdatesApi.ts`, which uses the phase-1 tables and the private bucket. Its tests mock supabase.
- **Pure rules** live in `src/lib/businessUpdates.ts` (phase 1).
- **UI** is two components: the composer and the manager.

The database from phase 1 is the authority. The UI shows the guard's own refusal messages and never assumes a write succeeded.

**Tech Stack:** React 18, TypeScript, Tailwind, supabase-js, Vitest 3 + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-31-business-updates-design.md` §7 "Dashboard → Updates" (approved). Phase 1 is applied; see `docs/superpowers/reviews/2026-10-31-business-updates-phase1-review.md`.

## Global Constraints

- **No production writes while building or testing.** The dev server is production. Browser checks stop before any save. The one real end-to-end publish (Task 6) happens only after the founder says go, on a business the founder owns, and is deleted afterwards.
- **Upload order is fixed:** create the draft row with a client-generated id, then upload to `<business_id>/<update_id>/<uuid>.<ext>`, then insert the media rows, then set `published_at`. Never `.select()` after an insert. Ids are generated on the client with `crypto.randomUUID()`.
- **supabase-js returns `{data, error}`.** Check `error` on every call; `.catch()` never fires.
- **Touch targets** are at least 44px, in explicit px (`min-h-[44px]`, `w-[44px]`), because the root font is under 16px.
- **Times** are shown on the device's local clock using `src/lib/dates.ts` helpers (`isSameLocalDay`) and `getHours()`/`getMinutes()`, the same as dates.ts. No UTC days.
- **Confirmations** use `ConfirmDialog` (`src/components/ConfirmDialog.tsx`) and never `window.confirm`.
- **No invented numbers.** The keeper reach shown is a real count of `business_keeps` rows for the topic, from `reachFor`. No view counts appear in this phase.
- **Shared files:** `Dashboard.tsx` and `BusinessList.tsx` have other sessions' uncommitted edits. Change them only with small, additive `Edit` replacements and never rewrite them. Do not touch `src/components/promote`, `src/lib/promote` or `MediaOwnersPanel.tsx`.
- **Copy rules:** say what will happen before the button is pressed. In particular, the keeper alert line appears above Publish, as it does in OffersManager.

## Rulings carried into this plan (founder: approve or overturn)

1. **No `OpenReelCapture`.** The spec suggested reusing it, but it uploads to the public `business-images` bucket and returns a public URL. That breaks the private-media decision. The composer instead uses a file input (`accept="image/*,video/*"`), which opens the phone's camera or library. In-app recording into the private bucket is a later follow-up.
2. **"Post again" copies text, type, CTA and offer, but not media.** Files cannot be written into a live or ended update's folder, and copying them would need a download and re-upload. The composer tells the owner to add the photos again.
3. **Team members cannot use the offer picker.** `business_offers` RLS is owner/admin only, so a marketing member sees "Only the owner can attach an offer". They can still post every other type.
4. **Deleting a live update is "End and delete".** It ends the update, removes its files, then deletes the row. Storage refuses deletes while an update is live, by design.

## Review Focus

1. **An upload fails halfway.** Some files are uploaded and one fails. The draft stays a draft with the media that did succeed, the owner sees which file failed, and nothing goes live. Pinned by `businessUpdatesApi.test.ts › a failed upload leaves a draft, never a live update`.
2. **A video is over 60s or over 50 MB.** It is refused before any upload, with the limit named. Pinned by `classifyMediaFile` tests.
3. **The guard refuses a publish.** For example: "That time has already passed", "Choose the offer this update is about", or a permission error. The composer shows that message and stays open with the draft intact. Pinned by `UpdateComposer.smoke › shows the database's refusal`.
4. **A failed read versus an empty list.** If the read fails, the manager says "Couldn't load your updates" and does not say "No updates yet". Pinned by `UpdatesManager.smoke › tells empty from unreadable`.
5. **The 24h boundary while the modal is open.** An active update moves to Archive when its time ends, without a reload. The list re-derives state every 30s. Pinned by `UpdatesManager.smoke › an update moves to Archive when its time ends` (fake timers).

---

### Task 1: More pure helpers

**Files:**
- Modify: `src/lib/businessUpdates.ts`
- Test: `src/lib/businessUpdates.test.ts`

**Interfaces (Produces):**
- `MAX_IMAGE_BYTES = 10 * 1024 * 1024` and `MAX_VIDEO_BYTES = 50 * 1024 * 1024`. `MAX_VIDEO_MS = 60_000`.
- `classifyMediaFile(f: { type: string; size: number; durationMs?: number | null }): { kind: 'image' | 'video' } | { error: string }`. The messages are:
  - `'Choose a photo or a video.'`
  - `'That photo is over 10 MB. Try a smaller one.'`
  - `'That video is over 50 MB. Try a shorter clip.'`
  - `'Videos can be up to 60 seconds.'`
  - Allowed types are `image/jpeg|png|webp` and `video/mp4|webm`. Images are checked before compression, so HEIC and other types are refused with the first message.
- `updateMediaPath(businessId: string, updateId: string, fileId: string, ext: string): string` returns `${businessId}/${updateId}/${fileId}.${ext}`. The ext is lower-cased and must match `^[a-z0-9]{1,5}$`, else `'bin'`.
- `type OwnerGroup = 'active' | 'upcoming' | 'archive'`.
- `ownerGroup(state: UpdateState): OwnerGroup` maps active → active, draft/scheduled → upcoming, ended/hidden → archive.
- `updateTimeLabel(row: UpdateLifecycleRow, now?: Date): string`:
  - active: `'Ends 6:40 pm'` on the same local day, otherwise `'Ends tomorrow 6:40 pm'`
  - scheduled: `'Goes live 9:00 am'`, `'Goes live tomorrow 9:00 am'` or `'Goes live 3 Nov 2026, 9:00 am'` (using `formatLocalDate`)
  - draft: `'Draft'`
  - ended: `'Ended'`
  - hidden: `'Hidden by NowOpen'`
  - Times use a 12-hour clock with lower-case am/pm.

- [ ] **Step 1: Write the failing tests.**
  - Each `classifyMediaFile` message, with the exact boundaries: 10 MB passes and 10 MB + 1 fails, 60000 ms passes and 60001 fails.
  - `updateMediaPath` sanitising `'JPG'` to `jpg` and `'we/ird'` to `bin`.
  - `ownerGroup` for all five states.
  - `updateTimeLabel`, using fixed local dates built with `new Date(2026, 10, 1, 18, 40)` so the test does not depend on the time zone.
- [ ] **Step 2:** Run `npx vitest run src/lib/businessUpdates.test.ts`. Expected: FAIL on the missing exports.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run the same test again. Expected: PASS, including the 24 tests from phase 1.

### Task 2: Data access module

**Files:**
- Create: `src/lib/businessUpdatesApi.ts`
- Test: `src/lib/businessUpdatesApi.test.ts`, mocking `./supabase` with a chain recorder like `src/test/templateManager.smoke.test.tsx` and recording `storage.from().upload/remove/createSignedUrls`.

**Interfaces (Produces):**
- `interface OwnerUpdate`: the `business_updates` row columns, plus `media: OwnerMedia[]`.
- `interface OwnerMedia { id; storage_path; kind; position; alt_text; url: string | null }`
- `type Result<T> = { ok: true; value: T } | { ok: false; message: string; missing?: boolean }`
- `readableError(e: { code?: string; message?: string } | null): string`:
  - `42501` gives `'You don't have permission to post for this business.'`
  - A `P0001` message passes through unchanged, because the guard's messages are written for people.
  - Anything else gives `'Something went wrong. Please try again.'`
- `listOwnerUpdates(businessId: string): Promise<Result<OwnerUpdate[]>>`
  - Reads `business_updates` with `select('*, media:business_update_media(*)')`, filtered `eq('business_id')`, ordered by `created_at` descending, with `limit(200)`.
  - Then signs every `storage_path` in one `createSignedUrls` call, with a TTL of `SIGNED_URL_MAX_TTL_S`.
  - Sets `missing: true` on `42P01`/`PGRST205`.
- `createDraftUpdate(input: { businessId: string; type: UpdateType; title: string; body: string; offerId: string | null; ctaLabel: string | null; ctaUrl: string | null; notifyKeepers: boolean }): Promise<Result<string>>`
  - Generates the id on the client and inserts with no `.select()`.
  - Trims title and body. This settles the phase-1 deferred minor M10 for the dashboard path.
- `uploadUpdateMedia(businessId: string, updateId: string, files: { file: File; durationMs: number | null; alt: string }[]): Promise<{ uploaded: number; failed: { name: string; message: string }[] }>`
  - Uploads one file at a time in order. Images go through `compressImage`.
  - Each upload uses `upload(path, body, { upsert: false, contentType, cacheControl: '3600' })`, then inserts a `business_update_media` row with `position` equal to its index.
  - If any step fails, that file is recorded as failed and the rest continue. The update is never published here.
- `publishUpdate(updateId: string, at: Date | null): Promise<Result<void>>` sets `published_at` to `at ?? new Date()`, as an ISO string.
- `endUpdate(updateId: string): Promise<Result<void>>` sets `ended_at` to the current ISO time; the server overwrites it with `now()`.
- `deleteUpdate(u: OwnerUpdate): Promise<Result<void>>`
  - If the update is active, it first calls `endUpdate`, then `storage.remove(paths)` when there are any files, then deletes the row.
  - If storage removal fails, the row is not deleted and the message says the files could not be removed.
- `loadKeeperReach(businessId: string): Promise<Record<KeepTopic, number> | null>` reads `business_keeps` with `select('topics')` and counts each topic with `reachFor`. It returns null on error, and then the UI shows no number.
- `loadOwnOffers(businessId: string): Promise<Result<{ id: string; title: string; headline: string | null }[]>>`

- [ ] **Step 1: Write the failing tests:**
  - `createDraftUpdate` never calls `.select()` and sends a uuid id.
  - `uploadUpdateMedia` builds paths with `updateMediaPath`, sends `upsert: false`, and continues past one failure (`a failed upload leaves a draft, never a live update`: no `update` call touches `published_at`).
  - `deleteUpdate` on an active update calls end, then remove, then delete, in that order. With a remove error it does not delete.
  - `readableError` maps all three cases.
  - `listOwnerUpdates` returns `missing` on 42P01, and signs the paths with TTL 600.
- [ ] **Step 2:** Run `npx vitest run src/lib/businessUpdatesApi.test.ts`. Expected: FAIL on the missing module.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run the same test again. Expected: PASS. Then `npm run typecheck`. Expected: exit 0.

### Task 3: Composer

**Files:**
- Create: `src/components/dashboard/UpdateComposer.tsx`
- Test: `src/test/updateComposer.smoke.test.tsx`

**Interfaces:**
- Consumes: Tasks 1 and 2, `validateUpdateDraft`, `UPDATE_TYPES`, `UPDATE_TOPIC`, `topicLabel` (from `keeps.ts`).
- Produces: `UpdateComposer` with props `{ businessId: string; businessName: string; isOwner: boolean; reach: Record<KeepTopic, number> | null; initial?: Partial<UpdateDraftInput>; onDone: () => void; onCancel: () => void }`.

**Behaviour:**
- **Type chips** for the six types.
- **Fields:**
  - Title, with a counter out of 80.
  - Text, with a counter out of 500.
  - Media picker: `<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" multiple>`. A video's duration is read from a hidden `<video>` element's `loadedmetadata`, and each file is checked with `classifyMediaFile` so rejects show inline beside it.
  - Up to 10 thumbnails from `URL.createObjectURL`, never `fetch()`'d, each with remove and alt-text inputs.
- **Offer type:** shows the offer picker (owner only, see ruling 3).
- **Optional button:** label and link fields.
- **When:** "Now" or "Schedule", where Schedule uses a `datetime-local` input with min now and max 14 days.
- **"Tell my keepers" checkbox,** on by default. It reads "Tell the {n} people who keep {businessName} and asked about {topicLabel}". When `reach` is null it shows "Tell the people who keep {businessName}…" without a number. When n = 0 it reads "Nobody keeps you for {topic} yet, so no one will be told."
- **Footer line** above the buttons: "Public for 24 hours from when it goes live, then only you and your team can see it."
- **Buttons:** "Save draft", and "Publish" or "Schedule". Each runs `createDraftUpdate`, then `uploadUpdateMedia`, then (unless saving a draft) `publishUpdate`, and shows a progress label. If any upload fails, it stops before publishing and says the update was saved as a draft and which file failed. A refusal shows `readableError` inline in `role="alert"`.
- All buttons are at least 44px.

- [ ] **Step 1: Write the failing smoke tests** with a mocked API module:
  - Publish is disabled with `'Add some text, a photo or a video.'` visible when the composer is empty.
  - The offer type shows the picker for the owner and the owner-only note for a member.
  - The reach line shows `Tell the 3 people` when the reach is 3, and no digit when the reach is null.
  - `shows the database's refusal`: mock `publishUpdate` to return `{ ok:false, message:'That time has already passed.' }`. The text appears in a `role="alert"` and `onDone` is not called.
  - An upload failure shows `saved as a draft` and the file name.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run the tests. Expected: PASS.

### Task 4: Manager

**Files:**
- Create: `src/components/dashboard/UpdatesManager.tsx`
- Test: `src/test/updatesManager.smoke.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–3 and `ConfirmDialog`.
- Produces: `UpdatesManager` with props `{ businessId: string; businessName: string; isOwner: boolean; onClose: () => void }`, in the same modal shell, Escape handling and `role="dialog"` as OffersManager.

**Behaviour:**
- A "Create update" button opens the composer in place.
- **Tabs** have counts: "Active", "Scheduled & drafts", and "Archive".
- **Each row shows:**
  - the first media thumbnail from the signed URL, or the type icon
  - the type label, title or the first 60 chars of the body
  - `updateTimeLabel`
  - a "Tells keepers" or "Quiet" badge, plus "Sent" once `notified_at` is set
  - the moderation note when hidden
- **Actions:**
  - Active: End now and Delete.
  - Scheduled & drafts: Publish now and Delete. Drafts also get Edit, which reopens the composer for text only; changes to media mean deleting and starting again, which keeps the flow small.
  - Archive: Post again (ruling 2) and Delete. A hidden update shows no Delete, because the database refuses it, and says why.
- End and Delete confirm through `ConfirmDialog` with the danger tone. The message for an active update says "End and delete".
- **Read states:** loading, unreadable ("Couldn't load your updates. Nothing has been deleted."), missing table, and empty ("No updates yet. An update is public for 24 hours, then it moves here to your archive.").
- The state is re-derived with `deriveUpdateState` on a 30s interval and after every action.

- [ ] **Step 1: Write the failing smoke tests:**
  - `tells empty from unreadable`
  - Rows land in the right tab for each state.
  - Ending asks for confirmation, then calls `endUpdate`.
  - A hidden update has no Delete and shows the note.
  - `an update moves to Archive when its time ends`: with `vi.useFakeTimers`, advance past `expires_at` plus 30s.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run the tests. Expected: PASS.

### Task 5: Wire it into the dashboard

**Files:**
- Modify: `src/components/dashboard/BusinessList.tsx`. Add an `onManageUpdates?: (business: Business) => void` prop and a 44px `Megaphone` button labelled `Post an update for {name}`, placed before Offers.
- Modify: `src/pages/Dashboard.tsx`:
  - add an `updatesBusiness` state
  - add a `case 'updates'` in the `openRequest` switch
  - pass `onManageUpdates`
  - mount `<UpdatesManager isOwner={String(updatesBusiness.user_id) === String(user?.id)} … />` next to OffersManager
- Test: extend `src/test/updatesManager.smoke.test.tsx`, or add `src/test/dashboardUpdatesWiring.test.ts`, to assert the `open=updates` case exists and that BusinessList renders the button when it is given the prop.

- [ ] **Step 1: Write the failing wiring test.**
- [ ] **Step 2: Watch it fail.**
- [ ] **Step 3: Make the additive edits** with Edit, re-reading the exact current lines first because other sessions edit these files.
- [ ] **Step 4: Check.** Run `npm run typecheck` and the related tests. Expected: PASS.

### Task 6: Verify, review, founder gate

- [ ] **Step 1: Browser, no writes.** Start the dev server and open `/dashboard`. Check:
  - the button appears
  - the modal opens and its empty state reads correctly
  - the composer validation messages appear
  - a video over 60s, if a test file is available, is refused before upload
  - a 375px viewport has no horizontal scroll
  - dark mode is readable
  - no console errors
  Stop before Save or Publish. Take screenshots.
- [ ] **Step 2:** Run the whole-change review with a fresh reviewer on the most capable model, then one fix pass with each fix tested red then green.
- [ ] **Step 3: Write the review sheet** at `docs/superpowers/reviews/2026-11-01-business-updates-phase2-review.md`.
- [ ] **Step 4: Founder gate.** Ask whether to run one real publish on a business the founder owns, which writes 1 update, 1 photo and the keeper alerts it triggers (`notify_keepers` off, so none). The check covers the signed thumbnail, End, and Delete, which removes the row and the file. Afterwards, confirm by query that 0 rows remain.
- [ ] **Step 5:** Commit only after the founder approves, on its own branch the same way phase 1 was committed. Deploy is a separate approval.
