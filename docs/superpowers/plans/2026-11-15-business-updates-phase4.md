# Business Updates, Phase 4: Discover and Keeps (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (founder's chosen method). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Put live updates where people already look.
- **Discover:** a "Happening on NowOpen" row above the rails.
- **Keeps:** a "New today" row on `/keeps`, showing updates from the businesses the person keeps.

**Architecture:**
- **New read:** one cross-business read, `fetchHappening`, in `src/lib/publicUpdates.ts`. It joins each update to its business, explicitly filtered to listable and published profiles, the same filters Discover already applies to businesses.
- **Ranking:** a pure function, `rankHappening`, in `src/lib/businessUpdates.ts`.
- **UI:** one card-row component, `HappeningRow`, used on both pages. A card opens the update on the business's profile (`/<slug>?update=<id>`), reusing the phase 3 viewer rather than building a second one.
- **Database:** no changes.

**Spec:** `docs/superpowers/specs/2026-10-31-business-updates-design.md` §7 "Discover" and "Keeps" (approved): newest first, relevance only breaks ties within the same hour, no counts, and hidden when nothing is live.

## Global Constraints

- **The database decides what is live** (public RLS from phase 1). The client only re-reads and hides updates whose time has ended.
- **Discover's existing filters, applied explicitly:** `business.is_listable = true` and `business.profile_state = 'published'`. RLS alone also shows admins and owners their own unlisted rows, as noted in `Discover.tsx`.
- **No invented numbers.** No views, likes or "trending". No "N updates" count on Discover. Keeps shows nothing at all when the person's businesses have nothing live.
- **Empty or failed read:** the row is not shown. Every Discover rail hides itself when empty, per the page's own rule.
- **Mobile data:** only the first photo of each update is signed for the card, for no longer than the update has left. Links still good are reused on refresh (the phase 3 pattern).
- **Touch targets:** at least 44px in explicit px. Cards are links with full accessible names.
- **Shared files:** `Discover.tsx` (427 lines) and `Keeps.tsx` get small additive edits only.
- **Production:** no writes while building. One real check at the end needs the founder's go.

## Decisions for the founder (approve or overturn)

1. **Placement on Discover:** directly under the search, filters and category carousel, above the rails.
   - It is shown when filters are off.
   - When a search or filter is active, the row is hidden, so the results stay about the search.
2. **Ordering, as the spec says:**
   - Newest `published_at` first.
   - Inside the same clock hour, businesses the person keeps come first. Next come updates matching the place they've typed or the category they've chosen. Everything else keeps time order.
   - No other ranking signal exists or is invented.
3. **Size:** up to 24 updates. There is no "See more". A row is meant to be skimmed, and a business's full set lives on its profile.
4. **Keeps "New today":** on `/keeps` for signed-in people, above their list of kept businesses. It shows live updates from kept businesses only. Signed-out people already see a sign-up prompt there.
5. **No new notifications:** Keeps alerts already exist (phase 1, consent topics). This row is the place to come back to, not another ping.

## Review Focus

1. **Unlisted or unpublished businesses must not leak onto Discover,** even for an admin. Pinned by `publicUpdates.test › fetchHappening filters to listable, published businesses` (asserts the embed filters are sent) and by the founder's live check, which is run as an admin.
2. **The tie-break must not reorder across hours.** A kept business's update from 2 hours ago must not jump above an unkept update from 10 minutes ago. Pinned by `rankHappening` tests.
3. **The row disappears when the last update ends** while the page is open (the 30-second tick). Pinned by `HappeningRow.smoke`.
4. **Keeps with no kept businesses, or none live,** shows nothing. It doesn't say "Nothing new". Pinned by `KeptUpdates.smoke`.
5. **A business without a username** links to `/businesses/<id>?update=<id>`, never `/<uuid>`, which doesn't route. Pinned by `HappeningRow.smoke`.

---

### Task 1: Data and ranking

**Files:**
- Modify: `src/lib/publicUpdates.ts` (+ test)
- Modify: `src/lib/businessUpdates.ts` (+ test)

**Interfaces (Produces):**
- `interface HappeningBusiness { id: string; name: string; username: string | null; image_url: string | null; category: string | null; location: string | null }`
- `interface HappeningItem { update: PublicUpdate; business: HappeningBusiness; thumb: { url: string; signedUntil: number } | null }`
- `fetchHappening(opts: { businessIds?: string[]; limit?: number }, previous?: HappeningItem[]): Promise<{ ok: true; value: HappeningItem[] } | { ok: false }>`
  - Selects updates with the embed `business:businesses!inner(id, name, username, image_url, category, location)` plus a media embed.
  - Applies `.eq('business.is_listable', true)` and `.eq('business.profile_state', 'published')`, plus `.in('business_id', ids)` when `businessIds` is given.
  - Orders by `published_at` descending, then `id`. The limit defaults to 24 and is capped at 50.
  - Thumbnails: signs each update's first image. Items with 600s or more left are signed in one batch call, and the others one by one, so no link outlives its update. A thumbnail is reused from `previous` while it has more than 60s left.
  - `businessIds: []` returns `{ ok: true, value: [] }` without a query.
- `happeningHref(item: HappeningItem): string` gives `/${username}?update=${id}` when a username exists, else `/businesses/${businessId}?update=${id}`.
- `rankHappening(items: T[], ctx: { keptIds: Set<string>; place: string; category: string }, now?: Date): T[]`, where `T` has `update.published_at`, `business.id`, `business.location` and `business.category`.
  - Sorts by the clock hour of `published_at`, newest first.
  - Within an hour: kept businesses first, then a place match (a case-insensitive substring of `location`), then a category match (exact), then `published_at` descending.

- [ ] **Step 1: Failing tests:**
  - `fetchHappening filters to listable, published businesses`: the recorded `.eq` calls include both business filters.
  - `businessIds: []` makes no query.
  - Thumbnails are signed in one call for items with 600s or more left, and alone for short ones.
  - A previous thumbnail with more than 60s left is reused.
  - A failed read gives `{ok:false}`.
  - `happeningHref` handles both the username and no-username forms.
  - `rankHappening`: a kept update in the same hour goes first. A kept update from 2 hours ago does not beat an unkept one from 10 minutes ago. A place match beats no match within the hour. Ties keep time order.
- [ ] **Steps 2–4:** watch them fail, implement, then pass. Run `npm run check:query-errors`.

### Task 2: HappeningRow

**Files:**
- Create: `src/components/updates/HappeningRow.tsx`
- Test: `src/test/happeningRow.smoke.test.tsx`

**Interfaces:**
- Props: `{ title: string; blurb: string; businessIds?: string[]; rankContext?: { keptIds: Set<string>; place: string; category: string } }`
- **Behaviour:**
  - Reads with `fetchHappening` on mount, and again every 60s while the page is visible, keeping the last good list.
  - A 30-second tick hides ended items.
  - Ranks with `rankHappening` when it is given `rankContext`.
- **Display:**
  - A `<section>` with an `<h2>` (the title, with a Megaphone icon) and the blurb.
  - A horizontal `<ul>` of cards. Each card is a 220px-wide `<Link to={happeningHref(item)}>` containing:
    - the thumbnail (16:9) or a type icon
    - the business name, the type label, and the update title or body (two lines)
    - "3h ago"
  - Each card's accessible name is "{business}: {type}: {summary}, posted 3h ago".
- **Empty or failed:** renders `null`.

- [ ] **Step 1: Failing tests:**
  - Renders nothing when the read fails, or when it's empty.
  - Renders a card per item, with the right href for both slug forms.
  - Accessible names.
  - Kept items rank first within the hour.
  - The row disappears after the last item's `expires_at` plus a 30s tick (fake timers).
- [ ] **Steps 2–4:** watch them fail, implement, then pass.

### Task 3: Wire into Discover and Keeps

**Files:**
- Modify `src/pages/Discover.tsx`: render `<HappeningRow title="Happening on NowOpen" blurb="Live updates from businesses, newest first. Each one is up for 24 hours." rankContext={{ keptIds, place, category }} />` above the rails, only when `!filtering && !loadError`. `keptIds` is built from the existing `kept` state.
- Create `src/components/updates/KeptUpdates.tsx`:
  - Reads the signed-in person's `business_keeps.business_id`, using RLS on their own rows.
  - Renders `<HappeningRow title="New today from places you keep" blurb="Live for 24 hours." businessIds={ids} />` when `ids.length > 0`. Otherwise it renders nothing.
  - A failed read renders nothing.
- Modify `src/pages/Keeps.tsx`: render `<KeptUpdates />` above `<MyKeeps />` when signed in.
- Tests:
  - `src/test/keptUpdates.smoke.test.tsx`: no keeps renders nothing, a failed read renders nothing, and with keeps it passes the ids.
  - `src/test/discoverHappeningWiring.test.ts`: a source check like the earlier wiring tests. The row is rendered before the rails, gated on `!filtering`, and passes `keptIds`.

- [ ] **Steps 1–4:** failing tests, watch them fail, edit, pass, then `npm run typecheck`.

### Task 4: Verify, review, founder gate

- [ ] **Step 1: Browser, no writes:** on localhost `/discover` and `/keeps`, with 0 live updates there are no new rows and no console errors.
- [ ] **Step 2: Fresh whole-change review,** then one fix pass with each fix tested red then green.
- [ ] **Step 3: `npm run verify`.**
- [ ] **Step 4: Review sheet** at `docs/superpowers/reviews/2026-11-15-business-updates-phase4-review.md`.
- [ ] **Step 5: Founder gate, one real check on YemzoArts Studios,** with Keeps alerts off:
  1. Post an update.
  2. See it on `/discover`. As an admin, also confirm an unlisted business's update would not appear: the query filters, checked by the test and by reading the network request.
  3. Keep YemzoArts from the founder's own account if it isn't kept already, then see it on `/keeps`.
  4. Delete the update, and remove the temporary keep if one was added.
  5. Confirm by query that 0 updates remain.
- [ ] **Step 6: Deploy.** This is a separate approval.
