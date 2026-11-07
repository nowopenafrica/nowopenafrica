# Promote Step 2 — The Plan: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One media plan that holds NowOpen products and placements, works signed out (browser-held, moved to the account at sign-in), shows a plan tray on every Promote page, and lets each line carry artwork from Create or an upload, with a shape check against the placement.

**Architecture:** Pure decision modules (`campaignPlan.ts`, new `artworkFit.ts`, new `localPlan.ts`) carry every rule and are unit-tested without a network. `campaigns.ts` stays the thin database layer and gains product lines, artwork writes and the sign-in migration. Studio gets a `plan_line` return path. Every attached artwork ends up as a stored image file plus its pixel size, so the shape check and the preview studio read one thing.

**Tech Stack:** React 18 + react-router 7, Vite 7, Vitest 3, Supabase (Postgres + Storage), Tailwind.

**Spec:** `docs/superpowers/specs/2026-10-31-promote-hub-design.md` §6 (the plan) and §8 step 2. Read §9 constraints too.

## Global Constraints

- Real items only. No invented placements, reach or testimonials. Every unquoted price says "indicative".
- Totals are grouped by price basis and never summed across bases. A group with any uncosted line shows no total.
- Money is formatted only through `useCurrency().format`. `advertisements.pricing` is USD per day; `revenue_products.price_minor` is NGN kobo. Convert NGN with `ngnToUsd` from `src/lib/promote/hubMoney.ts`.
- The dev server writes to production. Tests mock Supabase. Nothing writes rows during the build. Browser checks never click save, add, submit or attach while signed in.
- The migration (Task 1) is dry-run in `BEGIN … ROLLBACK` and applied by hand only after the founder's go-ahead in chat. Record it in `supabase_migrations.schema_migrations`, then `npm run check:drift`. Never `supabase db push`. No `*/` inside comment prose.
- A size is never guessed: an unreadable placement size says "Size to confirm with the media owner".
- 44px touch targets in explicit px (root font is under 16px). The tray never traps focus or covers content.
- Line endings: keep each file's own. CRLF: `StudioEditor.tsx`, `AdvertDetail.tsx`, `App.tsx`, `MediaPlan.tsx`. LF: the `src/lib/promote/*` files, `OnNowOpen.tsx`, `GoalView.tsx`, `Adverts.tsx`.
- Confirmations use `ConfirmDialog`, never `window.confirm`.
- Never `fetch()` a `blob:` URL (CSP). Measure images through an element.
- No commits without the founder's go-ahead. The "Commit" steps below are staged commits to run once that go-ahead is given; until then, leave the work uncommitted and move on.

## Decisions this plan takes (flag in the review sheet)

1. **NowOpen products get their own basis, `fixed`**, labelled "NowOpen price". `quoted` means a media owner's quote and must keep meaning that. `hasConfirmedTotal` is true only when every line is `quoted` or `fixed` and costed.
2. **A product line freezes its price at add time** (`price_minor` copied onto the line), the same rule placements follow. Step 3 re-checks the live price before charging.
3. **Attaching artwork needs an account.** Both a saved design and an uploaded file need somewhere to live. Signed out, "Add artwork" says "Sign in to attach artwork" with the sign-in link back to the plan.
4. **One attach path for designs:** picking a Create design opens it in Studio with `?plan_line=`; "Attach to plan" there exports the PNG, uploads it and attaches it. So the shape check and the preview always read a real image with a real size.
5. **Studio canvas for "Make one at the right size"**: the placement's ratio, long edge 2400px (the export already upsamples to 2400px).

## Review Focus

1. **Sign-in migration partly fails** (one placement since archived, or a duplicate): the browser plan must keep the lines that did not move and say how many moved; it must never be cleared on a partial failure, and never duplicate lines on a second run. → test in Task 5.
2. **Browser storage unavailable or corrupt** (private window, JSON edited by hand, an old version key): the plan reads as empty, adding still works in memory for the visit, nothing throws. → test in Task 3.
3. **A local plan line whose placement has since been delisted or whose product is no longer active**: shown as "No longer on offer" with Remove, never silently dropped and never migrated. → tests in Tasks 5 and 8.
4. **Placement with unreadable size** (`dimensions` is a count, duration or free text): the shape check says "Size to confirm with the media owner", "Make one at the right size" is offered without a preselected size, and nothing is guessed. → test in Task 2.
5. **Artwork image from the private bucket in the preview**: a signed URL must load in the preview studio in production (CSP `img-src` must allow the Supabase storage host; check `vercel.json`/CSP config), and an expired signed URL is re-signed on open rather than showing a broken image. → test in Task 8, CSP check in Task 10.

---

### Task 1: Migration — product lines, `fixed` basis, artwork columns, artwork bucket

**Files:**
- Create: `supabase/migrations/20261113010000_plan_products_and_artwork.sql`
- Create: `scripts/check-plan-step2.mjs` (rolled-back live checks, modelled on `scripts/check-placement-trust.mjs`)

**Interfaces:**
- Produces (schema): on `public.ad_campaign_placements`:
  - `advert_id` becomes nullable; new `product_id uuid REFERENCES public.revenue_products(id) ON DELETE CASCADE`;
  - `CHECK (num_nonnulls(advert_id, product_id) = 1)` named `ad_campaign_placements_one_item`;
  - `UNIQUE (campaign_id, product_id)` (Postgres treats NULLs as distinct, so the existing `UNIQUE (campaign_id, advert_id)` keeps working for placements);
  - `price_minor bigint CHECK (price_minor IS NULL OR price_minor >= 0)` (frozen product price, kobo);
  - `price_basis` check widened to `('indicative','quoted','unpriced','fixed')`;
  - `artwork_design_id uuid REFERENCES public.design_projects(id) ON DELETE SET NULL`, `artwork_width integer CHECK (artwork_width IS NULL OR artwork_width > 0)`, `artwork_height integer` (same check).
  - `artwork_url` keeps its name and now holds a storage path in bucket `plan-artwork` (not a public URL).
- Produces (storage): private bucket `plan-artwork`, 25MB limit, image MIME types `image/png, image/jpeg, image/webp`. Object path `<auth.uid()>/<campaign_id>/<line_id>-<safe name>`. Policies: insert/select/delete when `(storage.foldername(name))[1] = auth.uid()::text`; staff select.

- [ ] **Step 1: Write the migration.** Re-runnable (`IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS` before re-adding the basis check). Header comment explains why `fixed` is not `quoted`.
- [ ] **Step 2: Write `scripts/check-plan-step2.mjs`.** Inside `BEGIN … ROLLBACK`, assert, ending in ONE summary SELECT (the CLI returns only the last result set):
  - a row with both `advert_id` and `product_id` is refused;
  - a row with neither is refused;
  - the same product twice in one plan is refused (23505);
  - `price_basis = 'fixed'` is accepted, `'confirmed'` is refused;
  - the bucket exists and is not public.
- [ ] **Step 3: Dry run.** `npx supabase db query --linked -f` on the migration wrapped in `BEGIN … ROLLBACK`. Expected: no error.
- [ ] **Step 4: STOP — ask the founder for the go-ahead to apply.** Then apply with `npx supabase db query --linked -f supabase/migrations/20261113010000_plan_products_and_artwork.sql`, insert `('20261113010000','plan_products_and_artwork')` into `supabase_migrations.schema_migrations`, run `node scripts/check-plan-step2.mjs` (expected all pass) and `npm run check:drift` (expected clean, 234/234).
- [ ] **Step 5: Commit** `supabase/migrations/20261113010000_plan_products_and_artwork.sql scripts/check-plan-step2.mjs` — "Promote step 2: plan lines can hold NowOpen products and artwork".

Tasks 2–4 do not need the migration applied; Tasks 5–9 code against the new columns with mocked Supabase, so they can proceed while waiting.

---

### Task 2: Shape check — `artworkFit.ts`

**Files:**
- Create: `src/lib/promote/artworkFit.ts`
- Test: `src/lib/promote/artworkFit.test.ts`

**Interfaces:**
- Consumes: `readAdDimensions`, `ratioOf`, `AdDimensions` from `./adDimensions`.
- Produces:
  - `describeShape(width: number, height: number): string` — `"square"` within 3%; otherwise the nearest of `2:1, 3:1, 16:9, 4:3, 3:2, 5:4, 4:5, 2:3, 3:4, 9:16, 1:2, 1:3` within 3%; otherwise `"W:H"` reduced to one decimal of the long side over the short (`"2.4:1"`, `"1:2.4"`).
  - `type ArtworkFit = { verdict: 'match' } | { verdict: 'mismatch'; message: string } | { verdict: 'unknown'; message: string }`
  - `checkArtworkFit(artwork: { width: number; height: number }, placementDimensions: string | null): ArtworkFit` — tolerance 5% on the ratio.
  - `studioSizeFor(placementDimensions: string | null): { w: number; h: number } | null` — placement ratio, long edge 2400, rounded integers; null when the ratio is unknown.
  - `SIZE_TO_CONFIRM = 'Size to confirm with the media owner'`.

- [ ] **Step 1: Write the failing tests.**

```ts
it('names a square against a 2:1 board', () => {
  expect(checkArtworkFit({ width: 1080, height: 1080 }, '12m x 6m'))
    .toEqual({ verdict: 'mismatch', message: 'This is square; the placement is 2:1.' });
});
it('accepts within 5%', () => {
  expect(checkArtworkFit({ width: 2400, height: 1180 }, '12m x 6m')).toEqual({ verdict: 'match' });
});
it('never guesses an unreadable size', () => {
  expect(checkArtworkFit({ width: 1080, height: 1920 }, '30 seconds'))
    .toEqual({ verdict: 'unknown', message: 'Size to confirm with the media owner' });
  expect(checkArtworkFit({ width: 1080, height: 1920 }, null).verdict).toBe('unknown');
  expect(studioSizeFor('3 faces')).toBeNull();
});
it('sizes the studio canvas to the placement, long edge 2400', () => {
  expect(studioSizeFor('12m x 6m')).toEqual({ w: 2400, h: 1200 });
  expect(studioSizeFor('1080 x 1920 px')).toEqual({ w: 1350, h: 2400 });
});
it('describes common shapes', () => {
  expect(describeShape(1920, 1080)).toBe('16:9');
  expect(describeShape(1080, 1350)).toBe('4:5');
  expect(describeShape(2400, 1000)).toBe('2.4:1');
});
```

  The mismatch message is `This is ${describeShape(art)}; the placement is ${describeShape(placement)}.` The spec's example says "the board", but that is wrong for a screen or a bus, so the wording stays medium-neutral.
- [ ] **Step 2: Run** `npx vitest run src/lib/promote/artworkFit.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** the four exports in `src/lib/promote/artworkFit.ts`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** — "Promote: artwork shape check against the placement".

---

### Task 3: Browser-held plan — `localPlan.ts` and plan-change events

**Files:**
- Create: `src/lib/promote/localPlan.ts`
- Test: `src/lib/promote/localPlan.test.ts`

**Interfaces:**
- Produces:
  - `type LocalLine = { kind: 'placement'; advertId: string; days: number | null } | { kind: 'product'; productId: string }`
  - `LOCAL_PLAN_KEY = 'nowopen.promote.plan.v1'`
  - `readLocalPlan(): LocalLine[]` — `[]` on missing, unparsable, wrong shape or throwing storage; drops malformed entries individually; dedupes by item id.
  - `addLocalLines(lines: LocalLine[]): { added: number; skipped: number }` — skips items already present.
  - `removeLocalLine(itemId: string): void`, `setLocalDays(advertId: string, days: number | null): void`
  - `replaceLocalPlan(lines: LocalLine[]): void` (used by the migration to keep only the lines that did not move), `clearLocalPlan(): void`
  - `notifyPlanChanged(): void` and `onPlanChanged(cb: () => void): () => void` — a `window` `CustomEvent('nowopen:plan-changed')`, plus the `storage` event so a second tab updates.
  - When `localStorage` throws, an in-memory fallback array holds the plan for the visit.

- [ ] **Step 1: Write the failing tests:** round trip; add dedupes and counts skipped; corrupt JSON → `[]`; `{ v: 2 }`-shaped value → `[]`; one malformed entry among good ones is dropped alone; `localStorage.setItem` throwing → add still reports `added: 1` and `readLocalPlan()` returns it; `onPlanChanged` fires on add/remove/replace and its unsubscribe stops it.
- [ ] **Step 2: Run** `npx vitest run src/lib/promote/localPlan.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Every storage read and write in `try/catch`. Every mutator calls `notifyPlanChanged()`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** — "Promote: browser-held plan for signed-out visitors".

---

### Task 4: Plan arithmetic — products and the `fixed` basis

**Files:**
- Modify: `src/lib/promote/campaignPlan.ts`
- Test: `src/lib/promote/campaignPlan.test.ts` (extend)

**Interfaces:**
- Produces:
  - `PriceBasis = 'indicative' | 'quoted' | 'unpriced' | 'fixed'`; `BASIS_LABEL.fixed = 'NowOpen price'`; `BASIS_ORDER = ['fixed', 'quoted', 'indicative', 'unpriced']`.
  - `PlanLine` gains `kind: 'placement' | 'product'`, `productId: string | null`, `priceMinor: number | null` (kobo, products only), `artworkDesignId: string | null`, `artworkWidth: number | null`, `artworkHeight: number | null`, `offered: boolean` (false when delisted or inactive). `advertId` becomes `string | null`.
  - `lineCost(line: PlanLine, ngnPerUsd: number): number | null` — product: `ngnToUsd(priceMinor / 100, ngnPerUsd)`, null when `priceMinor` is null; placement: unchanged rule. Result is USD, to feed `format`.
  - `summarise(lines: readonly PlanLine[], ngnPerUsd: number): PlanSummary` — `hasConfirmedTotal` true only when every line is `quoted` or `fixed` and costed. `missing` counts and words placements and products separately ("1 placement has no artwork attached yet."). Products do not need artwork and never count toward "no artwork". `byMedium` counts products under `'NowOpen'`. A line with `offered: false` adds a `missing` entry "N line(s) are no longer on offer — remove them." and is left out of totals.
  - `PlanSummary` gains `artworkNeeded: number` (placement lines) so the header reads "`creativeReady` of `artworkNeeded` lines have artwork".
  - `describeCost` unchanged in shape; groups now include `fixed`.
- Update every caller of `lineCost`/`summarise` (`MediaPlan.tsx`, `mix.ts`, `GoalView.tsx` — grep for both) to pass `ngnPerUsd` from `useCurrency()`. `mix.ts` costs in NGN today: check whether it calls `lineCost`; if so, pass a line built with the same rule and keep the hub and plan agreeing (spec §5 rule 2).

- [ ] **Step 1: Write failing tests:** a product line at 2,500,000 kobo with `ngnPerUsd = 1500` costs `16.666…`; a plan of one `fixed` and one `indicative` line yields two groups, never one sum, and `hasConfirmedTotal === false`; a plan of only `fixed` lines yields `hasConfirmedTotal === true`; products never appear in the "no artwork" count; an `offered: false` line is excluded from totals and named in `missing`.
- [ ] **Step 2: Run** `npx vitest run src/lib/promote/campaignPlan.test.ts`. Expected: FAIL on the new cases.
- [ ] **Step 3: Implement**, then fix callers; `npm run typecheck` must be 0 errors.
- [ ] **Step 4: Run** the test file and `npx vitest run src/lib/promote`. Expected: PASS.
- [ ] **Step 5: Commit** — "Promote: plan totals carry NowOpen products as a fixed price".

---

### Task 5: Database layer — products, signed-out adds, artwork, sign-in migration

**Files:**
- Modify: `src/lib/promote/campaigns.ts`, `src/lib/promote/planToast.tsx`
- Test: `src/lib/promote/campaigns.test.ts` (extend the existing fake)

**Interfaces:**
- Consumes: Task 3 (`readLocalPlan`, `addLocalLines`, `replaceLocalPlan`, `notifyPlanChanged`), Task 4 (`PlanLine`).
- Produces:
  - `type PlanItem = { kind: 'placement'; id: string; pricing: number | null } | { kind: 'product'; id: string; priceMinor: number }`
  - `addToPlan(items: PlanItem[]): Promise<PlanAddResult>` — signed in: as `addAdvertsToPlan` today, plus product inserts (`product_id`, `days = duration_days` passed in or null, `price_basis = 'fixed'`, `price_minor`, `currency = 'NGN'`). Signed out: writes to the local plan and returns `{ ok: true, added, skipped, local: true }`. `addAdvertsToPlan` stays as a thin wrapper so existing callers keep compiling. `PlanAddResult`'s ok branch gains `local?: boolean`.
  - `fetchPlanLines(campaignId)` selects products too: `revenue_products ( name, slug, active, duration_days )` left-joined, and `advertisements` left-joined (drop `!inner` — a deleted placement cascades its line away anyway). Placement `offered` comes later from `placement_trust` on the page; product `offered = active`.
  - `fetchLocalPlanLines(lines: LocalLine[]): Promise<PlanLine[]>` — reads the public `advertisements` and `revenue_products` rows by id and builds `PlanLine`s with synthetic ids `local:<itemId>`; a missing row gives `offered: false` with title "No longer on offer".
  - `migrateLocalPlan(): Promise<{ moved: number; kept: number } | null>` — null when nothing local. Uses `addToPlan` signed in; on success clears; on partial failure `replaceLocalPlan(notMoved)`. Skips `offered: false` lines (left local, counted as kept). Idempotent: a second run adds nothing (duplicates count as moved).
  - `setLineArtwork(lineId: string, art: { path: string; width: number; height: number; designId?: string | null }): Promise<boolean>`
  - `uploadLineArtwork(campaignId: string, lineId: string, file: File): Promise<{ path: string } | { error: string }>` — validates with `classifyArtworkFile` (images only; a video gets "Attach an image of the artwork; video adverts are sent with the quote request."), uploads to `plan-artwork` at `<uid>/<campaignId>/<lineId>-<safeArtworkName(name)>` with `upsert: true`.
  - `artworkUrlFor(path: string): Promise<string | null>` — `createSignedUrl(path, 3600)`.
  - `fetchOwnDesigns(): Promise<{ state: 'ready'; designs: { id: string; title: string; width: number; height: number }[] } | { state: 'unavailable'; reason: string }>` — `design_projects` where `archived_at is null`, newest 30, size from `document.pages[0]`.
  - Every write calls `notifyPlanChanged()`.
- `planToast.tsx`: a `local: true` success says "Added to your plan on this device. Sign in to keep it." with the sign-in link; `SIGN_IN_TO_SAVE_PLAN` is no longer returned by adds.

- [ ] **Step 1: Write failing tests** (extend the fake for `product_id` inserts, `storage.from('plan-artwork')` and `design_projects`):
  - signed out, `addToPlan([placement, product])` writes nothing to the fake DB and two lines to local storage, returns `local: true`;
  - signed in, a product insert carries `price_basis: 'fixed'` and `price_minor`;
  - `migrateLocalPlan` with 3 local lines where the 2nd insert fails → `{ moved: 1, kept: 2 }` and local storage holds exactly lines 2 and 3; running it again after the failure clears moves the rest and adds no duplicate;
  - `migrateLocalPlan` keeps an `offered: false` line local;
  - `uploadLineArtwork` refuses an `.mp4` with the video message and uploads a PNG under `u1/<campaign>/<line>-`.
- [ ] **Step 2: Run** `npx vitest run src/lib/promote/campaigns.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS. `npm run typecheck`: 0 errors.
- [ ] **Step 5: Commit** — "Promote: plan holds products, works signed out, moves to the account at sign-in".

---

### Task 6: Plan tray and sign-in sync

**Files:**
- Create: `src/components/promote/PlanTray.tsx`, `src/components/promote/PlanSync.tsx`, `src/lib/promote/usePlanSnapshot.ts`
- Modify: `src/pages/Adverts.tsx` (LF), `src/pages/AdvertDetail.tsx` (CRLF), `src/App.tsx` (CRLF)
- Test: `src/components/promote/PlanTray.test.tsx`, `src/lib/promote/usePlanSnapshot.test.ts`

**Interfaces:**
- Consumes: Tasks 3–5.
- Produces:
  - `usePlanSnapshot(): { lines: PlanLine[]; summary: PlanSummary | null; planId: string | null; loading: boolean; failed: boolean }` — signed in: newest campaign's lines; signed out: `fetchLocalPlanLines(readLocalPlan())`. Re-reads on `onPlanChanged`. A failed read sets `failed`, never "empty".
  - `<PlanTray />` — renders nothing until `summary.lines > 0`. Shows "N in your plan", then one chip per costed basis group (`format(total)` + `BASIS_LABEL` short form: "NowOpen price", "indicative", "quoted"), "to be quoted" for uncosted groups, and an "Open plan" link to `/advertise/plan/<planId>` or `/advertise/plan`. Never a summed figure. `role="region" aria-label="Your plan"`, not a dialog, no focus trap. Fixed to the bottom; renders a same-height spacer in flow so the page's last content is never covered. On widths under 640px it is one 48px row with the count and "Open plan", cost chips hidden behind the plan page. Sits above the cookie banner and the voice assistant; keep the Universal Create FAB (bottom-left) clear — put the tray's content right-aligned on phones and check the FAB's offset in the browser.
  - `<PlanSync />` — mounted once in `App.tsx` inside the auth provider; when `user` goes from null to a user and `readLocalPlan()` is non-empty, runs `migrateLocalPlan()` once per sign-in and toasts "Moved N lines into your plan." (+ " · K kept on this device" when K > 0). Guard against the restore-session `SIGNED_IN` repeats noted in `AuthContext.tsx`: key the run on the user id and skip when nothing is local.
  - Mount `<PlanTray />` at the end of `Adverts.tsx` and `AdvertDetail.tsx`.

- [ ] **Step 1: Write failing tests:** tray hidden at 0 lines; with one `fixed` and one `indicative` line shows two separate amounts and no total; failed read shows nothing alarming (no tray, no "empty"); the spacer exists; "Open plan" link targets the plan id. `PlanSync`: migrates once for a user, not again on a second `SIGNED_IN` for the same id, never when local is empty.
- [ ] **Step 2: Run** `npx vitest run src/components/promote/PlanTray.test.tsx src/lib/promote/usePlanSnapshot.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement and mount.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** — "Promote: plan tray on every Promote page, plan moves at sign-in".

---

### Task 7: NowOpen products join the plan

**Files:**
- Modify: `src/components/promote/OnNowOpen.tsx`, `src/components/promote/GoalView.tsx`
- Test: the existing tests for these components (grep `OnNowOpen`/`GoalView` in `*.test.tsx`), extended

**Interfaces:**
- Consumes: `addToPlan`, `reportPlanAdd` (Task 5).
- Changes:
  - `OnNowOpen`: each sellable product's `/contact?product=` link becomes an "Add to plan" button calling `addToPlan([{ kind: 'product', id, priceMinor }])`. The "get in touch" fallback for the empty state stays. Update the header comment ("does not join the media plan yet" is no longer true; payment still is step 3).
  - `GoalView`: per-line product action becomes "Add" (same call); "Add all to plan" includes products. Remove both "Products join the plan in step 2" comments.
  - Button disabled while its write is in flight (no double adds); 44px min height.

- [ ] **Step 1: Write failing tests:** clicking a product's "Add to plan" calls `addToPlan` with `{ kind: 'product', id, priceMinor }`; "Add all" in a level with one product and two placements passes all three; no `/contact?product=` link remains for sellable products.
- [ ] **Step 2: Run** the two test files. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** — "Promote: NowOpen products go into the plan".

---

### Task 8: The plan page — signed-out plan, product lines, artwork per line

**Files:**
- Modify: `src/pages/MediaPlan.tsx` (CRLF), `src/components/promote/AdPreviewStudio.tsx`
- Create: `src/components/promote/LineArtwork.tsx`
- Test: `src/components/promote/LineArtwork.test.tsx`, `src/pages/MediaPlan.test.tsx` (create if absent)

**Interfaces:**
- Consumes: Tasks 2, 4, 5, 6 (`usePlanSnapshot` may replace the page's own loading if it fits; otherwise keep the page's loader and call the same helpers).
- Changes:
  - Signed out: the page no longer stops at "Sign in to build a media plan". It shows the local plan (from `fetchLocalPlanLines`) with remove and days, a banner "This plan is on this device only. Sign in to keep it and send it." with the sign-in link back here, and the send button replaced by that sign-in link.
  - Product lines show name, period ("30 days"), `format(lineCost)` and "NowOpen price"; no days editor, no artwork control, no trust chip.
  - `offered: false` lines show "No longer on offer" and Remove only.
  - Header: "`creativeReady` of `artworkNeeded` lines have artwork" (replaces "Artwork ready on …").
  - Remove uses `ConfirmDialog` only if it does today; do not add a dialog where there was none.
  - `<LineArtwork line campaignId placementDimensions signedIn />` per placement line:
    - No artwork: "Add artwork" opens three choices:
      1. "Pick a design made in Create" → `fetchOwnDesigns()` list with each design's `describeShape` and its `checkArtworkFit` verdict shown before choosing; choosing navigates to `/media/studio/<designId>?plan_line=<lineId>&plan=<campaignId>`.
      2. "Make one at the right size" → `/media/studio?w=<w>&h=<h>&plan_line=<lineId>&plan=<campaignId>&text=<placement title>` from `studioSizeFor`; when null, no `w`/`h` and the note "Size to confirm with the media owner — start square and adjust."
      3. "Upload a file" → `uploadLineArtwork`, measure the image through an `Image` element (never `fetch` a blob), `setLineArtwork`, then show the fit verdict.
    - With artwork: thumbnail via `artworkUrlFor`, the fit verdict (`match` → "Fits this placement"; `mismatch` → the message, amber; `unknown` → "Size to confirm with the media owner"), "Preview on the medium", "Replace".
    - Signed out: "Sign in to attach artwork" link instead of the three choices.
  - `AdPreviewStudio` gains `initialArtwork?: { url: string; name: string }`, loaded through the existing element-measure path on mount. "Preview on the medium" opens the page's existing preview with `placement` and `initialArtwork` (re-sign with `artworkUrlFor` on each open; a signed URL lasts an hour).

- [ ] **Step 1: Write failing tests:** signed out with two local lines → both render with the device-only banner and no send button; a product line has no artwork control and shows "NowOpen price"; `LineArtwork` for `dimensions = '12m x 6m'` links "Make one at the right size" to `w=2400&h=1200`; for `'3 faces'` the link has no `w`/`h` and shows the size note; a square upload on a 2:1 line shows "This is square; the placement is 2:1."; signed out shows "Sign in to attach artwork"; "Preview on the medium" calls `artworkUrlFor` again on a second open.
- [ ] **Step 2: Run** `npx vitest run src/components/promote/LineArtwork.test.tsx src/pages/MediaPlan.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS. `npm run typecheck`: 0 errors.
- [ ] **Step 5: Commit** — "Promote: plan page works signed out; artwork per line with a shape check".

---

### Task 9: Studio returns to the plan with the design attached

**Files:**
- Modify: `src/pages/StudioEditor.tsx` (CRLF)
- Create: `src/lib/promote/planReturn.ts`
- Test: `src/lib/promote/planReturn.test.ts`

**Interfaces:**
- Consumes: `uploadLineArtwork`-style upload (reuse the storage path rule from Task 5 via an exported `uploadLineArtworkBlob(campaignId, lineId, blob: Blob, name: string)`; add it to `campaigns.ts` next to `uploadLineArtwork` and have the File version call it), `setLineArtwork`, the Studio's existing `exportNodeToPng`.
- Produces:
  - `readPlanReturn(params: URLSearchParams): { lineId: string; campaignId: string } | null` — both must be UUIDs, else null (a hand-edited URL never writes anywhere).
  - `planReturnPath(campaignId: string): string` → `/advertise/plan/<campaignId>`.
  - In Studio, when `readPlanReturn` is non-null and the user is signed in: a slim banner "Making artwork for your plan" with "Attach to plan". It saves first if the design is unsaved or dirty (existing `save`), exports page 1 at the existing export scale, uploads, calls `setLineArtwork` with the exported pixel size and `designId`, toasts "Artwork attached.", and navigates to `planReturnPath`. Failures toast and stay in Studio with the design intact.
  - Keep `plan_line` and `plan` in the URL when the first save replaces `?template=…` with `/media/studio/<id>` (the existing `navigate(..., { replace: true })`) — otherwise the return path is lost on first save.

- [ ] **Step 1: Write failing tests** for `readPlanReturn` (valid pair; missing one; non-UUID) and `planReturnPath`.
- [ ] **Step 2: Run** `npx vitest run src/lib/promote/planReturn.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the module and the Studio banner. Preserve the query string in the first-save `navigate`.
- [ ] **Step 4: Run** the test and `npx vitest run src/pages` for Studio's existing tests. Expected: PASS.
- [ ] **Step 5: Commit** — "Create: finishing a design for a plan line attaches it and returns to the plan".

---

### Task 10: Verification and review sheet

- [ ] **Step 1:** `npm run typecheck` → 0 errors. `npx vitest run` → all pass (known noise: `adminCreator.smoke.test.tsx` unhandled mock error). `npm run verify` → pass.
- [ ] **Step 2: CSP.** Confirm the production CSP `img-src` allows the Supabase storage host for signed URLs (`vercel.json` or wherever CSP is set). If not, add it — both checks: host allowlisted AND the source token valid.
- [ ] **Step 3: Browser, signed out only, desktop and 375px** (preview `nowopen-edit`, port 5176): add a placement and a product on `/adverts` → tray appears, two separate amounts, no sum; tray does not cover the last content or the Create FAB; `/advertise/plan` shows the device-only plan; "Add artwork" shows "Sign in to attach artwork". Show the pane before judging layout. Do not sign in and add (that writes production rows).
- [ ] **Step 4: Signed-in paths** (migration, upload, Studio attach) are checked through the module tests and, after the founder's go-ahead for the migration, one founder-run pass on production with a throwaway plan — list the exact steps in the review sheet.
- [ ] **Step 5: Review sheet** as an Artifact, like the earlier Promote sheets: what changed, screenshots, the five decisions above, what was not verified. Update `docs/HANDOVER.md` §1, §3, §5.
- [ ] **Step 6:** No deploy. Deploying is `npm run check:drift` then `npx vercel --prod --yes`, only on the founder's go-ahead.
