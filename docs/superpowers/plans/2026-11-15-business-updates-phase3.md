# Business Updates, Phase 3: Public Profile Strip and Viewer (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (founder's chosen method in phases 1–2). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Show a business's live updates on its public profile: a strip above the tabs, a focused viewer, an accessible list view, share links that open one update, and a way to report one.

**Architecture:**
- **Reads:** one public read module, `src/lib/publicUpdates.ts`. It reads `business_updates` and `business_update_media` under the anonymous access rules from phase 1, so only live updates come back. Photo and video links are signed per viewer and never last longer than the update.
- **Components:** two new ones, `UpdatesStrip` and `UpdateViewer`, in `src/components/updates/`.
- **Profile page:** one small insertion in `BusinessDetail.tsx`, above the tab bar, plus handling for `?update=<id>`.
- **Database:** no changes.

**Spec:** `docs/superpowers/specs/2026-10-31-business-updates-design.md` §7 "Business profile" (approved).

## Global Constraints

- **The database decides what is public.** The page never filters by time on its own to decide visibility. What the server returns is the live set. The device clock is used only to decide when to re-read and to write labels.
- **Video:** never auto-plays with sound. It starts muted, with a visible 44px unmute button, `playsInline` and `preload="metadata"`.
- **No auto-advance.** Viewers move with next/prev buttons, arrow keys or a swipe. This avoids timed content (WCAG 2.2.1) and the need for a reduced-motion setting.
- **Touch targets** are at least 44px, in explicit px.
- **Times** come from `updateTimeLabel` plus a new `postedAgoLabel` on the device clock (`dates.ts` rules).
- **No invented numbers.** No views, likes or counts are shown in this phase. Analytics events are phase 5.
- **Reports** are inserted with no `.select()`. The anonymous rate limit applies on the server.
- **Sample businesses** (`isSampleId`) never fetch updates and never show the strip.
- **When the read fails,** the strip is simply not shown. It makes no claim about the business, so showing nothing is honest. Nothing on the page says "no updates" either.
- **Shared file:** `BusinessDetail.tsx` (2,848 lines) gets only small additive edits, made with Edit after re-reading the exact lines.
- **No production writes while building.** Browser checks only read. One real end-to-end check (post from the dashboard, view as a logged-out visitor, report, delete) needs the founder's go at the end.

## Decisions for the founder (approve or overturn)

1. **Where the strip goes:** above the tab bar, so it's the first new thing a returning customer sees. It is shown only when at least one update is live.
2. **No auto-advance and no progress bars** (see above). This is the main departure from Instagram-style stories. It is a deliberate choice for accessibility and data cost.
3. **A link to an ended update** (`/<slug>?update=<id>` after its 24 hours) opens the profile with a short notice: "This update has ended." Nothing else from it is shown.
4. **Share previews** (the link card in WhatsApp) show the business's normal preview, not the update. Per-update previews need server-rendered meta tags (as `/r/<id>` does for reels) and are a follow-up.
5. **Report reasons:** spam, misleading, offensive, scam, impersonation or other (from the phase-1 table). Signing in is not required. A confirmation is shown, and the reporter can't read reports back.

## Review Focus

1. **The 24-hour mark while the viewer is open.** The update disappears from the strip at its end time. If it's open in the viewer, the viewer shows "This update has ended" instead of the content. Pinned by `UpdateViewer.smoke › an update that ends while open says so`.
2. **A media link expires mid-view.** Links are signed for at most `signedUrlTtlSeconds`. On an image or video `error`, the viewer re-signs once, then shows the text with "Photo unavailable". Pinned by `UpdateViewer.smoke › re-signs once on a failed image`.
3. **A deep link to an ended or unknown id** shows the notice. It doesn't throw or leave a blank modal. Pinned by `UpdatesStrip.smoke › an ended link says so`.
4. **The read fails.** No strip, and no error shown to customers. Pinned by `UpdatesStrip.smoke › renders nothing when unreadable`.
5. **Keyboard and screen reader use.** The strip is a list of labelled buttons. The viewer is a dialog that names the business and position ("Update 2 of 3"), traps focus, returns focus to the strip item on close, and supports ← →. Escape closes it unless the report form is open. Pinned by viewer smoke tests.

---

### Task 1: Public read and report module

**Files:**
- Create: `src/lib/publicUpdates.ts`
- Test: `src/lib/publicUpdates.test.ts`
- Modify: `src/lib/businessUpdates.ts`, adding `postedAgoLabel`, with tests.

**Interfaces (Produces):**
- `postedAgoLabel(publishedAt: string, now?: Date): string` returns:
  - `'Just now'` under 1 minute
  - `'5 min ago'` under 1 hour
  - `'3h ago'` from 1 to 23 hours
  - `'1 day ago'` otherwise, which can't happen for a live update but keeps the function total
- `interface PublicMedia { id: string; kind: 'image' | 'video'; alt: string | null; path: string; url: string | null }`
- `interface PublicUpdate { id; type: UpdateType; title; body; cta_label; cta_url; offer_id; published_at; expires_at; media: PublicMedia[] }`
- `fetchActiveUpdates(businessId: string): Promise<{ ok: true; value: PublicUpdate[] } | { ok: false }>`
  - Ordered newest first, limit 20.
  - The media embed is ordered by position.
  - Signs every path in one `createSignedUrls` call. Each update's media uses that update's own `signedUrlTtlSeconds`, with the TTL grouped per update.
  - A signing error leaves `url` null and is handled explicitly, to satisfy the query-errors guard.
- `resignMedia(path: string, expiresAt: string): Promise<string | null>`
- `reportUpdate(updateId: string, reason: UpdateReportReason, detail: string): Promise<{ ok: true } | { ok: false; message: string }>`
  - Inserts with no `.select()`.
  - `user_id` is `auth.uid()` when signed in, otherwise null.
  - Detail is trimmed and capped at 500.
  - A `42501` error (the update has ended) gives `'This update has ended, so it can no longer be reported.'`. A rate-limit error gives `'Too many reports from this connection. Please try again later.'`.
- `UPDATE_REPORT_REASONS: { key: UpdateReportReason; label: string }[]`

- [ ] **Step 1: Write the failing tests:**
  - The `postedAgoLabel` boundaries.
  - `fetchActiveUpdates` returns `{ok:false}` on error, signs with a per-update TTL (an update with 90s left is signed for 90s, not 600s), and leaves `url` null when signing fails.
  - `reportUpdate` never calls `.select()` and maps 42501.
- [ ] **Step 2: Watch them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Check.** The tests pass and `npm run check:query-errors` is clean.

### Task 2: Strip

**Files:**
- Create: `src/components/updates/UpdatesStrip.tsx`
- Test: `src/test/updatesStrip.smoke.test.tsx`

**Interfaces:**
- Props: `{ businessId: string; businessName: string; slug: string; logoUrl?: string | null; openUpdateId: string | null; onOpenChange: (id: string | null) => void }`. The parent owns `?update=` in the URL.
- **Fetching:** fetches on mount and every 60s while the page is visible, and drops any update whose `expires_at` passes, using a 30s tick.
- **Display:**
  - A heading reading "Updates · last 24 hours".
  - A horizontally scrolling `<ul>` of 72px round thumbnails inside 88px-wide buttons with full labels, e.g. "Offer: 20% off this weekend, posted 3h ago".
  - A "View as list" button.
- **Viewer:** clicking an item opens `UpdateViewer` at that index.
- **Deep links:** when `openUpdateId` matches a live update, the viewer opens on it. When it doesn't match once loading has finished, an inline `role="status"` note says "This update has ended." and `onOpenChange(null)` clears the param.
- **No updates, or a failed read:** renders `null`.

- [ ] **Step 1: Write the failing tests:**
  - `renders nothing when unreadable`
  - `renders nothing when there are no live updates`
  - Shows one labelled button per update, newest first.
  - `an ended link says so`
  - A matching link opens the viewer on that update.
- [ ] **Steps 2–4:** watch them fail, implement, then pass.

### Task 3: Viewer and list view

**Files:**
- Create: `src/components/updates/UpdateViewer.tsx`
- Test: `src/test/updateViewer.smoke.test.tsx`

**Interfaces:**
- Props: `{ updates: PublicUpdate[]; startIndex: number; businessName: string; slug: string; mode: 'focus' | 'list'; onClose: () => void; onIndexChange: (id: string) => void }`

**Focus mode:**
- A full-screen dialog (`role="dialog"`, `aria-modal`, `aria-labelledby` pointing to "{businessName} · Update 2 of 3").
- **Media:** images use `object-contain`. When there are several media items, they go in a horizontal scroll-snap carousel with dots.
- **Video:** muted and `playsInline`, with `preload="metadata"`, no `autoPlay`, a visible Play button and a separate 44px Unmute button.
- **Header:** the type label, the title and the body, plus a line like "Posted 3h ago · Ends 6:40 pm".
- **Buttons under the content:**
  - The CTA button, when set. A `/` link goes through router `<Link>`; an `https://` link opens with `target="_blank" rel="noopener noreferrer"`.
  - For an offer update, a "See the offer" link to `/offers`.
- **Navigation:** Prev and Next buttons, ← → keys, and horizontal swipe (pointer events, more than 50px).
- **Share:** `navigator.share({ title, url })` when available, otherwise copy to the clipboard with a toast "Link copied". The URL is absolute: `window.location.origin` plus `updateShareLink`.
- **Report:** opens an inline form with reasons as radio buttons, optional detail and a Send button. On success it says "Thanks. NowOpen will review it." The form traps Escape so it closes itself first.
- **Ending while open:** if the open update's `expires_at` passes while it's shown, the content is replaced with "This update has ended." and Next/Close stay available.
- **Closing:** focus returns to the element that opened the viewer.

**List mode:** the same dialog shell, showing every update as a stacked card with real text, media with alt text, and the same share and report actions. This is the accessible feed view the spec asks for.

- [ ] **Step 1: Write the failing tests:**
  - Names the business and the position.
  - Next/prev buttons and arrow keys.
  - A video has the `muted` property set and no `autoplay` attribute, and Unmute works.
  - `an update that ends while open says so` (fake timers).
  - `re-signs once on a failed image` (fires `error` on the img and asserts `resignMedia` was called once).
  - Report sends the chosen reason and shows the thanks message.
  - Escape closes the report form first, then the viewer.
  - List mode renders every update's text.
- [ ] **Steps 2–4:** watch them fail, implement, then pass.

### Task 4: Wire into the profile

**Files:**
- Modify: `src/pages/BusinessDetail.tsx`. Import `UpdatesStrip`, and render it just above the `{/* Tabs Navigation */}` block when `business && !isSample`. Pass `openUpdateId={searchParams.get('update')}`, with an `onOpenChange` that sets or deletes `update` in the search params using `replace: true`, so the back button closes the viewer instead of stepping through every update.
- Test: `src/test/profileUpdatesWiring.test.ts`. A source-level check, like the dashboard wiring test: the import exists, the component is rendered before the tablist, it is gated on `!isSample`, and the `update` search param is wired.

- [ ] **Step 1: Write the failing test.**
- [ ] **Step 2: Watch it fail.**
- [ ] **Step 3: Make the additive edits.**
- [ ] **Step 4: Check.** The test passes and `npm run typecheck` exits 0.

### Task 5: Verify, review, founder gate

- [ ] **Step 1: Browser, no writes.** Open a real business profile on localhost:
  - with no live updates, there is no strip and no console errors
  - `?update=<random uuid>` shows "This update has ended."
  - at 375px there is no horizontal page scroll
- [ ] **Step 2: Fresh whole-change review** on the most capable model, then one fix pass with each fix tested red then green.
- [ ] **Step 3: `npm run verify`.**
- [ ] **Step 4: Review sheet** at `docs/superpowers/reviews/2026-11-15-business-updates-phase3-review.md`.
- [ ] **Step 5: Founder gate, one real end-to-end test on YemzoArts Studios,** with Keeps alerts off:
  1. Post an update with a photo from the dashboard.
  2. As a logged-out visitor, see the strip, open the viewer, check the share link opens it, and send one report.
  3. End and delete the update.
  4. Confirm 0 updates, 0 files and 0 reports remain. The report row is deleted with its update, because of the cascade.
- [ ] **Step 6: Deploy.** This is a separate approval: `npm run check:drift`, then `npx vercel --prod`.
