# Promote hub — design

Date: 2026-10-31 · Status: design approved in conversation, spec awaiting founder review
Sibling of: `2026-10-31-create-flow-10-design.md` (the Create page rebuild this mirrors)

## 1. Why

Promote (`/adverts`, the nav's "Promote") scores about 5/10:

- It opens on a flat list of 97 outdoor/transit/screen/broadcast placements. Every row is
  `provenance = 'unverified_import'`, and all rates are indicative (from published Nigerian OOH rate cards).
- A medium carousel repeats the category chips; the four free NowOpen tools sit wedged between them.
- Paid placements ON NowOpen (Featured, Sponsored, Spotlights) live on a separate page, `/advertise`,
  whose "Get started" only opens `/contact`. The artwork preview studio is buried there too.
- The media plan (`/advertise/plan`) exists but is hard to find, and nothing joins Promote to Create.

Goal: one goal-first hub that serves a small shop and a brand alike. It shows only real things,
and runs as one seamless path:
**Goal → mix by budget → plan → artwork from Create → pay / request quotes → finish.**

## 2. Founder decisions (2026-10-31)

| Question | Decision |
|---|---|
| Who first | Both, goal-first: goals steer a small shop to free + NowOpen placements and a brand to outdoor plans, by budget |
| Outdoor end-point | Plan + one quote request. Nothing is called booked until a media owner confirms a price |
| Approach | A — one hub, mirroring the new Create page |

## 3. Information architecture

- `/adverts` is the hub (URL kept; nav unchanged).
- `/advertise` redirects to `/adverts#on-nowopen` (keep the old URL alive for links and crawlers).
- `/advertise#preview` redirects to `/adverts#preview`.
- `/advertise/plan`, `/advertise/plan/:id` stay; this is the plan page.
- `/adverts/:id` (placement detail) stays and gains "Add to plan" and "Add artwork".

### Goals (data: `src/lib/promote/goals.ts`)

| slug | Tile | One honest line |
|---|---|---|
| `nearby` | Get customers nearby | Be findable where people search, then seen on their route |
| `launch` | Launch something new | Make noise for a new shop, product or service |
| `sale` | Run a sale or offer | Give people a reason to buy this week |
| `event` | Fill an event | Put the date in front of the right crowd |
| `awareness` | Build awareness | Be the name people already know |
| `hiring` | Hire staff | Reach people looking for work near you |

The request bar maps words to `{ goal, city }` deterministically (same approach as `src/lib/create/intent.ts`),
e.g. "more customers for my salon in Lekki" → `nearby` + Lagos. Unknown words fall back to showing the tiles,
never to a guess.

## 4. Hub page order

1. **"What do you want to achieve?"** The request bar plus six goal tiles (2 columns on phones, 3 on desktop,
   44px+ targets).
2. **Goal view**, when a goal is open (§5). It is a section under the tiles; focus moves to its heading, and the
   URL carries `?goal=<slug>&city=<city>`.
3. **Start free.** The four existing free tools: Publish an offer (`/offers`), Update the people who kept you
   (`/keeps`), A profile that answers the question (`/add-business` or the dashboard), Then see who came
   (`/dashboard`).
4. **On NowOpen** (`#on-nowopen`). The seven `revenue_products` (`featured-business`, `sponsored-result`,
   `category-spotlight`, `city-spotlight`, `homepage-feature`, `featured-offer`, `industry-takeover`).
   - Only sellable (priced, active) products are listed, as today.
   - Each shows its period and price and the exact Sponsored/Featured label customers will see.
   - The action is "Add to plan" (not `/contact`).
5. **Out in the world.**
   - Medium chips from `ADVERT_CATEGORY_GROUPS` (Outdoor & OOH, Transit & Airport, Digital Screens,
     Broadcast, Print, Online & Social) plus a city filter. This replaces today's duplicated carousel and chips.
   - Cards: real photo (or plain card), site, honest size (`readAdDimensions`; unreadable → "Size to confirm"),
     price as "indicative · per day", struck list price only where the DB has one, "Add to plan".
6. **Preview your artwork** (`#preview`): the existing `AdPreviewStudio`.
7. **Footer strip:** Your plan · Media owners: list your site · Help.

A **plan tray** (§6) is pinned to the bottom of every Promote page once the plan has a line.

## 5. Goal view and recommended mix

The goal view contains:

- One sentence on what works for this goal.
- An area chip, filled from the request bar or "Use my location" (`src/lib/geolocation.ts`); it filters placements
  by city. A city with no placements says so honestly.
- **Four budget levels:**

  | Level | Ceiling |
  |---|---|
  | Free | ₦0 |
  | Starter | ≤ ₦50,000 |
  | Growth | ≤ ₦250,000 |
  | Campaign | > ₦250,000 |

  Each level is a short mix of real items, with "Add all to plan" and per-line "Add".
- **Designs you'll need:** two or three Create deliverables for this goal, deep-linked into Create's need/deliverable.
  - sale: flyer, Instagram post, WhatsApp status
  - event: event poster, ticket, event backdrop
  - nearby: shopfront sign, pavement A-board, flyer
  - launch: launch post, flyer, roll-up banner
  - awareness: billboard, LED screen ad, social post
  - hiring: vacancy flyer, social post

### Mix rules (`src/lib/promote/mix.ts`, pure, tested)

1. Each goal has an ordered list of channel kinds. Example, `nearby`:
   - `profile`, `offer` (free tools)
   - `city-spotlight`, `category-spotlight` (NowOpen)
   - Street Furniture, Billboard in the city
   - Transit (BRT, keke)
2. A level is filled greedily from that order with real, active items whose cost fits under the ceiling.
   - Outdoor is costed for one month.
   - A NowOpen product is costed for its own period.
   - Costing uses the plan page's existing cost rule (`lineCost` in `src/lib/promote/campaignPlan.ts`), so the hub and the plan always
     agree.
3. Items with no price never enter a level; they appear under "Price on request".
4. Every unquoted figure is labelled "indicative".
5. There are no reach, impression or audience numbers anywhere.
6. Money is formatted only through `useCurrency` (`advertisements.pricing` is stored in USD; a second formatter
   once showed ₦14 for an ₦18,680 billboard).

Tests:
- every goal × level × city in the data contains only real active items and never exceeds its ceiling;
- an empty level shows the honest note "Nothing in this budget in {city} yet";
- the Free level never contains a paid item.

## 6. The plan

- **One plan for both kinds of line**: NowOpen products and placements. It is built on the existing `ad_campaigns`
  tables (owner-scoped RLS).
  - **Signed out:** the plan lives in browser storage, and is migrated to the account on sign-in. Nobody has to
    sign in just to look around.
  - **Signed in:** it is saved as today.
- **Line:** site or product, dates, cost with price basis (`quoted` / `indicative` / `unpriced`), artwork status,
  remove.
- **Totals:** grouped by price basis, never summed across bases. A group with any uncosted line shows no total
  (existing `summarise` rules).
- **Tray:**
  - Shows the line count and the per-basis cost, never a fake total.
  - Opens the plan.
  - On phones it is a slim bar that doesn't cover content (page bottom padding).

### Artwork per line (the Promote ↔ Create join)

"Add artwork" offers three choices:
1. **Pick a design made in Create.** It is checked against the placement's shape, with a clear warning on a
   mismatch ("this is square; the board is 2:1").
2. **Make one at the right size.** This opens Create with the placement's format preselected (48-sheet, 12m×6m,
   LED portrait, BRT flank…). Finishing in Create returns to the plan with the design attached.
3. **Upload a file.** Checked the same way.

After that:
- Each line can open its artwork in the preview studio on the real medium.
- Unknown sizes say "Size to confirm with the media owner"; a size is never guessed.
- The plan header shows "N of M lines have artwork".

## 7. Checkout, quotes, finish

- **NowOpen products → Paystack**, using the existing `promotion_orders` + `payment_intents` + `verify-payment`
  path.
  - A line goes `draft → awaiting_payment → active` only after server-side verification. The memory notes say
    the Paystack webhook never fired, so verify, don't wait.
  - `starts_at`/`ends_at` are set on activation.
  - Test mode until the founder switches live keys.
- **Placements → one quote request** for the whole plan: dates, artwork links, contact.
  - Status is `enquiry_sent`, labelled "Quote requested". Nothing is "booked".
  - A line becomes payable only when NowOpen records `price_basis = 'quoted'`. That switch-over is built and
    tested, but nothing writes it yet.
- **Finish screen** (`/advertise/plan/:id/done`):
  - What's live, with dates ("Your City Spotlight runs from 3 to 30 Nov").
  - What was requested, with the reply promise (wording to confirm with the founder before step 3 ships).
  - Receipt.
  - "See who came" (`/dashboard`) and "Make another design" (`/media`).

## 8. Build order

Each step ends with tests, a browser check (desktop + 375px) and a review sheet before any deploy.

1. **Step 1 — Hub.** Goals data and request-bar mapping, hub page order (§4), goal view and mix (§5),
   medium browser, "Add to plan" wiring to the existing plan, `/advertise` redirect, SEO/crawler snapshot
   and sitemap.
2. **Step 2 — Plan.** Tray on every Promote page, browser-held plan migrated at sign-in, artwork per line with
   the Create join and the shape check.
3. **Step 3 — Checkout.** Paystack for NowOpen products, one quote request, finish screen.

## 9. Constraints

- Real items only.
  - No invented placements, reach or testimonials.
  - Every unquoted price says "indicative".
  - No summed totals across price bases.
- One money formatter (`useCurrency`).
- The dev server shares the production DB: tests mock Supabase; nothing writes rows during the build; any
  migration is recorded in the migration ledger and applied by hand with the founder's go-ahead.
- Payments stay in test mode; live keys are the founder's action.
- Accessibility:
  - 44px targets (explicit px; root font is under 16px);
  - focus moves to an opened goal view;
  - the tray never traps focus or covers content.
- No commits or deploys without founder approval.
