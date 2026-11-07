# Promote Hub — Step 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/adverts` (the Promote tab) into one goal-first hub. It has six goal tiles and a request bar. Each goal view offers a rule-based mix at four budget levels. The page also carries the free tools, the NowOpen placements, a single medium browser and the preview studio. `/advertise` folds into it.

**Architecture:**
- Goals and the mix are pure, tested data and logic in `src/lib/promote/` (`goals.ts`, `promoteIntent.ts`, `mix.ts`).
- The page becomes a thin assembly of focused components in `src/components/promote/`.
- Placements keep coming from `advertisements` and products from `listSellableProducts`.
- "Add to plan" reuses the existing campaign plan through one shared helper.
- No schema change in this step.

**Tech Stack:** React 18, React Router 7, Vite 7, TypeScript, Vitest 3 + Testing Library, Tailwind, Supabase JS (mocked in tests).

**Spec:** `docs/superpowers/specs/2026-10-31-promote-hub-design.md` (§3, §4, §5, §8 step 1, §9)

## Global Constraints

- Real items only.
  - No invented placements, reach, impressions, audiences or testimonials.
  - Every unquoted price says "indicative".
  - Never sum across price bases.
- One money formatter: `useCurrency().format(usd)` for placements (`advertisements.pricing` is USD). Products use `formatPrice(priceMinor, currency)`. Never a second `Intl.NumberFormat` for money.
- Budget ceilings are in NGN:
  - Free = 0
  - Starter ≤ 50,000
  - Growth ≤ 250,000
  - Campaign > 250,000
- Placements are costed for 30 days; a product for its `durationDays`.
- Touch targets are ≥ 44px using explicit px (the root font is under 16px).
- Preserve each file's line endings (check with `file`; CRLF files stay CRLF).
- The dev server shares the production DB.
  - Tests mock Supabase.
  - Browser checks never click "Add to plan" or submit forms.
- No commits, no deploys: the controller asks the founder.
- Copy is plain and specific, with no hype words ("revolutionary", "boost your", "skyrocket").

## Review Focus

1. A city with zero placements. The goal view says "No placements in {city} yet". Levels still show the free and NowOpen items; nothing breaks. → Task 2 test `fills levels with no placements in the city`.
2. All products unpriced (`listSellableProducts` returns `[]`, today's honest empty state). Mix levels still build from free tools and placements. → Task 2 test `builds without any products`.
3. A placement with `pricing == null`. It never enters a level and is listed under "Price on request". → Task 2 test `keeps unpriced placements out of levels`.
4. The request bar says a city with no goal words ("Lagos"). Open no goal, set the city filter, and keep the tiles visible. → Task 1 test `city only sets the area`.
5. An old link `/advertise#preview` or `/advertise`. It lands on the hub at the right section. → Task 5 test `redirects advertise links into the hub`.

---

### Task 1: Goals data and request-bar mapping

**Files:**
- Create: `src/lib/promote/goals.ts`, `src/lib/promote/promoteIntent.ts`, `src/lib/promote/goals.test.ts`

**Interfaces:**
- Produces:
  - `type GoalSlug = 'nearby' | 'launch' | 'sale' | 'event' | 'awareness' | 'hiring'`
  - `interface ChannelKind { kind: 'free'; tool: 'offer' | 'keeps' | 'profile' | 'insights' } | { kind: 'product'; slug: string } | { kind: 'placement'; categories: string[] }`
  - `interface Goal { slug: GoalSlug; label: string; line: string; why: string; channels: ChannelKind[]; designs: { need: string; deliverable: string }[] }`
  - `GOALS: Goal[]` in the spec's order
  - `goalBySlug(s: string): Goal | null`
  - `parsePromoteIntent(text: string): { goal: GoalSlug | null; city: string | null }`

- [ ] **Step 1: Write failing tests** in `goals.test.ts`:
  - `has the six goals in order`: `GOALS.map(g => g.slug)` equals `['nearby','launch','sale','event','awareness','hiring']`.
  - Labels and lines equal the spec §3 table verbatim.
  - `every channel is real`:
    - each `product` slug is one of `featured-business, sponsored-result, category-spotlight, city-spotlight, homepage-feature, featured-offer, industry-takeover`;
    - each `placement` category is in `ADVERT_CATEGORIES`.
  - `every design link is listed`: for each goal design, `listedFor(need, deliverable).length > 0`, using `listedFor` from `src/lib/create/needs.ts` (the Create gallery's own check, so a link never lands on an empty view).
  - `free comes first`: each goal's first channel is `kind: 'free'`.
  - `maps words to goals`:
    - "more customers for my salon in Lekki" → `{goal:'nearby', city:'Lagos'}`
    - "grand opening next month" → `launch`
    - "black friday sale" → `sale`
    - "concert in Abuja" → `{goal:'event', city:'Abuja'}`
    - "we are hiring cashiers" → `hiring`
    - "brand awareness billboard" → `awareness`
  - `city only sets the area`: "Lagos" → `{goal:null, city:'Lagos'}`.
  - `unknown stays unknown`: "asdf" → `{goal:null, city:null}`.
- [ ] **Step 2:** Run `npx vitest run src/lib/promote/goals.test.ts`. Expect FAIL (module missing).
- [ ] **Step 3: Implement.**
  - Copy is verbatim from spec §3.
  - Each goal's `why` is the one sentence from spec §5. Write it for the other five goals in the same plain register, e.g. sale: "A reason to buy this week, shown to people already deciding."
  - Channels per goal, in order:
    - **nearby:** profile, offer, city-spotlight, category-spotlight, Street Furniture, Billboard, Transit, Vehicle Wrap
    - **launch:** profile, homepage-feature, featured-business, Billboard, Digital Screen, Mall Media, Radio
    - **sale:** offer, keeps, featured-offer, sponsored-result, Digital Screen, Mall Media, Transit
    - **event:** offer, keeps, city-spotlight, Billboard, Digital Screen, Radio, Cinema
    - **awareness:** profile, featured-business, industry-takeover, Billboard, Digital Screen, Transit, Television, Airport
    - **hiring:** profile, keeps, sponsored-result, Street Furniture, Transit, Print, Online
  - Designs per spec §5; for hiring, use the deliverable the `vacancy` template is filed under (`deliverableSlugFor`).
  - `parsePromoteIntent`:
    - lowercase word/phrase tables per goal;
    - city from `AFRICAN_PLACES`, with Lagos neighbourhood aliases (Lekki, Ikeja, Yaba, VI, Victoria Island, Surulere, Ajah) → "Lagos";
    - the first goal whose phrase matches wins, in GOALS order.
- [ ] **Step 4:** Run the tests. Expect PASS.

### Task 2: The mix

**Files:**
- Create: `src/lib/promote/mix.ts`, `src/lib/promote/mix.test.ts`

**Interfaces:**
- Consumes: `Goal`, `ChannelKind` (Task 1); `RevenueProduct` (`src/lib/revenue/products.ts`); `Advertisement` (`src/types`)
- Produces:
  - `type LevelKey = 'free' | 'starter' | 'growth' | 'campaign'`
  - `LEVELS: { key: LevelKey; label: string; ceilingNgn: number | null }[]`: Free 0, Starter 50000, Growth 250000, Campaign null
  - `type MixItem = { kind: 'free'; tool: string; label: string; to: string } | { kind: 'product'; product: RevenueProduct; costNgn: number } | { kind: 'placement'; advert: Advertisement; costNgn: number; days: 30 }`
  - `interface Mix { levels: { key: LevelKey; label: string; items: MixItem[]; totalNgn: number }[]; onRequest: Advertisement[]; cityHasPlacements: boolean }`
  - `buildMix(goal: Goal, input: { products: RevenueProduct[]; adverts: Advertisement[]; city: string | null; ngnPerUsd: number }): Mix`

- [ ] **Step 1: Write failing tests** with fixture products and adverts:
  - `free level is only free tools`: every item is `kind:'free'`, and `totalNgn === 0`.
  - `never exceeds a ceiling`: for every goal × fixture city, `totalNgn <= ceilingNgn` for Free, Starter and Growth.
  - `campaign spends more than growth when inventory allows`.
  - `follows the goal's channel order`: the first paid item in Starter is the earliest affordable channel in `goal.channels`.
  - `keeps unpriced placements out of levels`: an advert with `pricing: null` appears only in `onRequest`.
  - `fills levels with no placements in the city`: city "Kano" with no Kano fixtures → `cityHasPlacements === false`, and levels still contain the free tools and products.
  - `builds without any products`: `products: []` still yields Free plus placement items.
  - `filters by city`: with city "Lagos", every placement item's `location` contains "Lagos".
  - `costs placements for 30 days in naira`: `costNgn === pricing * 30 * ngnPerUsd` (rounded to a whole naira).
  - `costs products for their period`: `costNgn === priceMinor / 100`.
  - `only active rows`: a fixture with `status: 'inactive'` never appears.
- [ ] **Step 2:** Run `npx vitest run src/lib/promote/mix.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement `buildMix`.**
  - Free = the goal's free tools. Their `to` values come from today's `PromoteMarketplace` links: offer `/offers`, keeps `/keeps`, profile `/add-business`, insights `/dashboard`.
  - Each paid level greedily walks `goal.channels`.
    - For a `product` channel, take that product if priced and it fits.
    - For a `placement` channel, take the cheapest active priced advert in that category (and city, when set) that fits and isn't already used.
    - Add while `total + cost <= ceiling`.
    - Each level starts again from its own free tools; levels don't inherit each other's items.
  - Campaign has no ceiling: take the best one per channel (the most expensive active priced advert per placement channel, each product channel), capped at 8 items.
  - `onRequest` = active adverts in the goal's categories (and city) with `pricing == null`.
- [ ] **Step 4:** Run the tests. Expect PASS.

### Task 3: One "add to plan" helper

**Files:**
- Modify: `src/lib/promote/campaigns.ts` (add the helper); `src/pages/AdvertDetail.tsx` (use it instead of its inline `saveToPlan` body)
- Test: `src/lib/promote/campaigns.test.ts` (create if absent; mock `../supabase` the way `campaignPlan.test.ts` / sibling tests do)

**Interfaces:**
- Produces: `addAdvertsToPlan(adverts: { id: string; pricing: number | null }[]): Promise<{ ok: true; added: number } | { ok: false; error: string }>`.
  - It uses the first existing campaign, or creates "My advertising plan".
  - Then it calls `addPlacement` for each advert, with 30 days.
  - A signed-out or unavailable read returns `{ ok:false, error: read.reason }`.

- [ ] **Step 1: Write failing tests:**
  - `creates a plan when there is none and adds every advert`
  - `reuses the first plan`
  - `returns the unavailable reason when signed out`
  - `stops and reports the first insert error`
- [ ] **Step 2:** Run. Expect FAIL.
- [ ] **Step 3:** Implement. Replace AdvertDetail's inline body with `addAdvertsToPlan([{ id: String(advert.id), pricing: advert.pricing ?? null }])`. The toasts are unchanged.
- [ ] **Step 4:** Run `npx vitest run src/lib/promote src/test` and `npm run typecheck`. Expect PASS.

### Task 4: The hub page

**Files:**
- Create in `src/components/promote/`:
  - `GoalTiles.tsx`
  - `GoalView.tsx`
  - `PromoteRequestBar.tsx`
  - `OnNowOpen.tsx` (the product cards and the Sponsored-label explainer, moved out of `src/pages/Advertise.tsx`)
  - `MediumBrowser.tsx`
- Modify:
  - `src/pages/Adverts.tsx`: new order per spec §4. Remove the duplicated `CategoryCarousel`/chips pair; keep data loading, the error state and the dev-only sample logic.
  - `src/components/promote/PromoteMarketplace.tsx`: becomes the "Start free" section only.
  - `src/components/create/CreateMarketplace.tsx`: read a `deliverable` query param alongside `need`, only if the Create page does not already support it.
- Test: `src/test/promoteHub.test.tsx` (render `Adverts` with Supabase, products and currency mocked; copy the harness from `src/test/createPage.test.tsx`)

**Interfaces:**
- Consumes: Tasks 1–3. Also `listSellableProducts`, `ADVERT_CATEGORY_GROUPS`, `groupForAdvertCategory`, `readAdDimensions`/`describeDimensions`, `useCurrency`, `AdPreviewStudio`, `detectLocation`.
- `ngnPerUsd` comes from the same rates source `CurrencyProvider` loads (`loadRates().rates.NGN`, falling back to the bundled NGN rate). Expose it from the currency context as `ngnPerUsd` if that is the cleanest path.

- [ ] **Step 1: Write failing tests** (`promoteHub.test.tsx`):
  - `shows the page in order`: headings in DOM order are
    1. "What do you want to achieve?"
    2. the six goal tiles
    3. "Start free"
    4. "On NowOpen"
    5. "Out in the world"
    6. "See your advert where it will run"
  - `opens a goal`:
    - clicking "Get customers nearby" shows a region named after the goal;
    - focus is on its heading;
    - the URL has `goal=nearby`;
    - four level tabs read Free, Starter, Growth, Campaign.
  - `restores a goal from the URL`: initial `?goal=sale&city=Lagos` opens Sale with the Lagos area chip.
  - `request bar opens the goal and city`: typing "black friday sale in Lagos" and submitting opens Sale with Lagos.
  - `levels show honest money`:
    - every paid placement price in the goal view is followed by "indicative";
    - no element text matches `/reach|impressions|views/i`.
  - `adds a level to the plan`: "Add all to plan" on Starter calls `addAdvertsToPlan` with exactly that level's placements (mocked).
  - `design links go to Create`: each "Designs you'll need" link's href starts with `/media?need=`.
  - `medium browser filters`: clicking the "Transit & Airport" chip shows only cards whose category is in that group, and there is exactly one row of medium chips.
  - `On NowOpen shows the label customers see`: each product card shows the Sponsored or Featured label text.
  - `empty products are honest`: with no sellable products, "On NowOpen" shows today's honest empty-state copy from `Advertise.tsx`.
- [ ] **Step 2:** Run `npx vitest run src/test/promoteHub.test.tsx`. Expect FAIL.
- [ ] **Step 3: Implement.**
  - Mirror the Create page's visual language (`NeedTiles`, `NeedView` in `src/components/create/`): same card radius, spacing, type scale and pink accent; icons from `lucide-react`.
  - The goal view is one section with:
    - the `why` sentence;
    - the area chip (city from the URL or the request bar, "Use my location" via `detectLocation`, "All cities");
    - level tabs (`role="tablist"`);
    - item rows: name, what it is, cost via the one formatter plus a basis label, "Add";
    - "Add all to plan";
    - "Price on request" (collapsed);
    - "Designs you'll need" as chips to `/media?need=<need>&deliverable=<deliverable>`.
  - Free items show "Free". Products show their price and period ("₦19,500 · 30 days").
  - Product "Add" stays "Get started" → `/contact?product=<slug>` in step 1. Products join the plan in step 2.
  - When `cityHasPlacements` is false, show "No placements in {city} yet — these work anywhere." above the levels.
  - URL: `?goal=&city=` (push on open, replace on city change); the existing `?search=`/`?location=` keep working.
  - Remove `CategoryCarousel` from this page only.
- [ ] **Step 4:** Run `npx vitest run src/test src/lib src/components` and `npm run typecheck`. Expect PASS; fix any existing Adverts tests whose expectations changed only by section order, and keep their intent.

### Task 5: Redirects, SEO, sitemap

**Files:**
- Modify:
  - `src/App.tsx`: `/advertise` becomes a redirect to `/adverts#on-nowopen`, preserving `#preview` → `/adverts#preview`. `/advertise/plan*` stays.
  - `src/pages/Advertise.tsx`: delete it if nothing else imports it after Task 4, and delete its tests or move them to `promoteHub.test.tsx`.
  - `src/lib/marketingPageRender.ts`: `/adverts` crawler snapshot with h1 "What do you want to achieve?" and an honest description.
  - `api/sitemap.xml.ts`: drop `/advertise` if it is listed; `/adverts` stays.
  - `src/lib/navigation.ts`: no change (Promote → `/adverts`).
- Test: `src/test/promoteHub.test.tsx` (extend)

- [ ] **Step 1: Write failing tests:**
  - `redirects advertise links into the hub`: rendering the routes at `/advertise` ends at `/adverts` with hash `#on-nowopen`; `/advertise#preview` ends with `#preview`.
  - `crawler snapshot is honest`: the `/adverts` snapshot contains "What do you want to achieve?" and contains neither "guaranteed" nor "reach".
  - `plan route still renders`: `/advertise/plan` renders `MediaPlan`.
- [ ] **Step 2:** Run. Expect FAIL.
- [ ] **Step 3:** Implement. Hash scrolling relies on the hash-aware `ScrollToTop` from the Create final-fix round. Verify `#on-nowopen` and `#preview` ids exist on the hub.
- [ ] **Step 4:** Run `npm run verify` and `npm run typecheck`. Expect all pass, except the known unrelated `adminCreator.smoke` unhandled rejection.

### Task 6: Browser check and review sheet (controller)

- [ ] Desktop 1280 and phone 375 on `/adverts`, checking:
  - page order;
  - each goal opens with four levels, no level over its ceiling, and "indicative" on prices;
  - the medium chips appear once;
  - `/advertise` and `/advertise#preview` land correctly;
  - no horizontal scroll;
  - no console errors from this page.
  - Never click "Add to plan" or submit.
- [ ] Publish a review sheet with screenshots and stop for founder approval before any deploy.
