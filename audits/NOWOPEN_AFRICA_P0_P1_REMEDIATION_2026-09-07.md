# NOWOPEN AFRICA — P0 / P1 REMEDIATION PLAN
**Audit Date:** 2026-09-07 · Companion to `NOWOPEN_AFRICA_PLATFORM_AUDIT_2026-09-07.md`

**Nothing in this document has been implemented.** Per instruction §39, the audit produced truth first. This is the proposed remediation, awaiting approval.

Ordered so that the cheapest irreversible risks close first.

---

# BLOCK 0 — THREE QUESTIONS ONLY YOU CAN ANSWER

These gate everything else. Two are risks that grow while unanswered.

### Q1. Do we hold rights to the 89 active advertising placements?
`advertisements` contains 97 rows, 89 with `status='active'`, `user_id` NULL on all 97, naming specific third-party sites:
- "2 Double-Sided Freestanding Screens, The Palms, Lekki, Lagos" — ₦/$43/day
- "16 Digital Screens, Railway Ticketing & Waiting Area, Lagos" — 270/day
- "LED Portrait Billboard, 5th Roundabout Lekki FTF Ajah, Lagos" — 116/day
- "2-Sided Unipole Billboard, Aba Road, Port Harcourt" — 14/day

**If yes:** the data model still records no owner, no availability window and no currency. Needs `owner_org`, `available_from/to`, `currency`, and a contract reference.
**If no:** unpublish all 97 today and drop them from the sitemap. Offering to broker named third-party media without rights is the only finding in this audit with real-world legal exposure.
**If partially:** unpublish everything not covered.

> **Cost of delay:** these pages are in the live sitemap and being offered to Google for indexing right now.

### Q2. Are the 45 curated demo profiles `noindex` in production?
They are content-rich, linked from the homepage, and named after plausible businesses (`lagos-prime-realty`, `glow-beauty-lounge`). `src/test/indexability.test.ts` exists but I did not confirm the live header.
**If they are indexable,** Google will hold 45 fabricated businesses for a directory with 2 real ones — the exact outcome the "no fake businesses" rule exists to prevent.
**Verification:** `curl -A "Googlebot/2.1" https://www.nowopenafrica.com/business/lagos-prime-realty | grep -i noindex` — ten minutes, all 45.

### Q3. Why is `create_orders` empty when analytics recorded 3 order events?
`create_orders` = 0 rows. `analytics_events` holds 2 × `create_order_requested` and 1 × `create_order_accepted` (2026-09-06).
Either the inserts failed silently — this codebase has a documented history of the `insert().select()` RLS trap, where chaining `.select()` onto an insert on a write-only table makes RLS reject the whole statement and blame the insert — or the rows were deleted.
**This is the paid conversion path.** It must be reproduced end-to-end before any promotion.

---

# BLOCK 1 — P0 (24 hours)

| # | Fix | File / target | Effort | Risk if skipped |
| - | --- | --- | --- | --- |
| 1 | Gate telemetry on environment | `src/lib/telemetry.ts` | 15 min | Production error monitoring stays unusable |
| 2 | Fix the `signin` emitter | `src/contexts/AuthContext.tsx:80` | 1 hr | Unbounded write growth; analytics stays 99.4% noise |
| 3 | Chunk-load auto-recovery | lazy-import wrapper | 4 hr | Every deploy breaks live sessions |
| 4 | Drop 97 advert UUIDs from the sitemap | sitemap generator | 20 min | Google is told to index 97 pages that canonicalise away |
| 5 | Correct four misleading copy blocks | `industrySystems.ts`, `Businesses.tsx` | 1 hr | Claims capability that does not ship, on the most-viewed surface |
| 6 | Rename `NowOpen Media Ad Placeements` + redirect | live DB + redirect | 15 min | A typo in a public business name and URL |
| 7 | Demote surplus admin accounts | live DB | 10 min | 27% of accounts hold total platform authority |
| 8 | Drop the `NowOpen Africa` junk table | live DB | 5 min | A pasted migration script living in the production schema |

### 1 · Telemetry environment gate
```ts
// src/lib/telemetry.ts — proposed
const SHOULD_SEND =
  typeof location !== 'undefined' &&
  !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
```
**Evidence:** production `client_error` rows contain `at Discover (http://localhost:5175/src/pages/Discover.tsx…)` and `localhost:5173` traces for `placeInput`, `useEffect`, `PRIMARY_NAV`, `fromUrl`, `capabilityFrom` — none of which are reachable in production.

### 2 · The `signin` emitter
Current:
```ts
// AuthContext.tsx:80
if (event === 'SIGNED_IN') track('signin');
```
`onAuthStateChange` emits `SIGNED_IN` on token refresh and tab focus, not only on authentication. Result: **42,910 events across 64 sessions ≈ 670 each.**

Proposed: keep the goal (catch social and magic-link sign-ins, which never touch `signIn()`) but de-duplicate per session:
```ts
if (event === 'SIGNED_IN' && !sessionStorage.getItem('no:signin-tracked')) {
  sessionStorage.setItem('no:signin-tracked', '1');
  track('signin');
}
```
**Decision needed:** purge the 42,910 existing rows, or keep them and filter in queries? Recommend purging — they carry no information and every future aggregate has to work around them.

### 3 · Chunk-load recovery
```ts
// proposed lazy wrapper
const retryLazy = <T,>(load: () => Promise<T>) => () =>
  load().catch((err) => {
    const key = 'no:chunk-reloaded';
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1');   // once only — never a reload loop
      location.reload();
    }
    throw err;
  });
```
**Evidence:** two distinct production failures — `Failed to fetch dynamically imported module: .../BusinessDetail-D6o_2ziK.js` on `/business/lagos-prime-realty`, and `'text/html' is not a valid JavaScript MIME type.` on `/yemzoarts`.

### 5 · The four misleading copy blocks
| Where | Current | Problem |
| --- | --- | --- |
| Homepage industry cards | "Designers — Portfolios that plug into Behance, Dribbble and Figma" | No such integration exists |
| Homepage industry cards | "Fashion — Catalog, custom measurement and live runway shows" | No live runway feature |
| Homepage industry cards | "Barbers — Cuts, queue status and walk-in availability in real time" | The queue module is a form; nothing is real-time |
| `/businesses` | "2 businesses across food, retail, tech, health, professional services and more" | Both are `Media & Publishing` |
| `/businesses` `<title>` | "Find Verified Businesses Across Africa" | 1 business is verified, and it is the founder's |

Recommended approach: derive the breadth sentence from data (`the N categories actually represented`) so it cannot drift, and rewrite taglines to describe shipped modules — the `liveModulesFor()` derivation added earlier today already provides the truthful list.

---

# BLOCK 2 — P1 (7 days)

### 2.1 · Server-side pagination and search — the most important technical fix
**Current** (`src/pages/Businesses.tsx:112`):
```ts
supabase.from('businesses').select('*')
  .eq('is_listable', true)
  .order('listing_score', { ascending: false })
  .order('created_at', { ascending: false });
// no .limit(), no .range() — then filtered client-side at lines 202-215
```
**Why now, not later:** at 2 listings this is invisible. At ~1,000 it is a multi-megabyte response on Nigerian mobile data. Past PostgREST's row cap the directory **silently truncates**, and search reports "no results" for businesses that exist — a correctness failure wearing an empty state. Retrofitting pagination under live load is far harder than doing it now.

Proposed migration:
```sql
ALTER TABLE businesses ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(name,'') || ' ' || coalesce(category,'') || ' ' ||
      coalesce(location,'') || ' ' || coalesce(description,''))
  ) STORED;
CREATE INDEX idx_businesses_search ON businesses USING gin (search_vector);

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_businesses_name_trgm ON businesses USING gin (name gin_trgm_ops);
```
`pg_trgm` gives the typo tolerance the audit found missing — a Nigerian customer typing "barbin salon" or "resturant" currently gets nothing.

Then a `search_businesses(q, city, cat, cursor, limit)` function returning a page plus a cursor, and cursor-based infinite scroll on the existing `(listing_score DESC, created_at DESC)` index.

**Effort:** ~1 week including tests. **This is the single change that unblocks growth.**

### 2.2 · Public holidays + override expiry
Two defects in the core differentiator:

**Holidays.** `openingHours.test.ts` covers overnight (6), midnight (6), timezone (5), 24-hour (1) and **holidays: 0**. Nigeria has ~11 fixed public holidays plus two moveable Eids. "Open now" will be confidently wrong on the highest-traffic days of the year.
Proposed: a `public_holidays` table (date, country, name, `treat_as` = closed | reduced | normal), consulted before the weekly schedule, seeded for Nigeria and extensible to the other 53 countries in `african_countries`.

**Override expiry.** `openingHours.ts:438` short-circuits on `open_status === 'closed'` with no timestamp check. An owner who marks themselves closed once appears closed forever.
Proposed: `open_status_set_at timestamptz`; the override expires at the next scheduled opening, after which the schedule resumes.

### 2.3 · Touch targets to 44×44
30 interactive elements below 40px on a business profile. Priority order:
1. **"Open menu" hamburger — 35×35.** The most-tapped control on mobile.
2. Theme toggle — 32×32
3. "Something wrong with this listing?" — 17px tall (fails WCAG 2.2 AA, which requires 24×24)
4. Footer contact links — 32px tall

The codebase already applies `min-h-[44px]` to primary CTAs, so the standard is understood; this is icon-only controls that were missed. Worth a lint rule or a test asserting no interactive element renders under 44px at 360px width.

### 2.4 · Rate-limit anonymous writes
`profile_requests`, `waitlist`, `platform_enquiries` and `radar_candidates` accept unauthenticated inserts by design. Nothing throttles them, and 10 rapid unauthenticated requests to `/api/discovery` all returned 200. An attacker can flood tables that a human admin must triage by hand.
Proposed: a `rate_limit` table keyed on (ip_hash, action, window) checked inside the existing `SECURITY DEFINER` insert helpers — no new infrastructure required.

### 2.5 · Second layer on the role guard
Today role protection is **trigger-only**. The policy is:
```sql
-- UPDATE "Users can update own profile"
USING (auth.uid() = id)   -- no WITH CHECK, no column restriction
```
`guard_user_role_column` freezes `NEW.role := OLD.role` for non-admins, and it works. But if a future migration recreates the table or drops the trigger, silent privilege escalation returns with no test to catch it.
Proposed: add a `WITH CHECK` asserting `role` is unchanged unless `is_admin()`, plus a test that attempts escalation as a normal user and expects failure. Defence in depth on the one thing that must never regress.

### 2.6 · Real 404s for unknown usernames
`/:username` is a catch-all. A typo'd URL currently renders the SPA shell carrying the homepage's title and canonical — a soft-404 that Google may index as another duplicate of `/`. The middleware already looks up the username; when it misses, return a genuine 404.

### 2.7 · Consolidate the two saved-business tables
`business_keeps` (1 row) and `favorites` (0 rows) model the same concept. Pick one, migrate, drop the other, before either accumulates data worth preserving.

### 2.8 · Schema-diff check in CI
106 migrations, and a documented history of the live schema diverging from the repo. Nothing verifies they agree. A CI step that diffs `supabase db diff --linked` against the migration set and fails on drift would have caught several past incidents.

### 2.9 · Payment reconciliation
`payment_intents`: 2 `paid`, **4 `initiated`**, 9 `lead`. Four intents began and never resolved. At n=6 the significance is **UNVERIFIED**, but the absence of any reconciliation job means a customer could pay without being credited and nothing would notice.
Proposed: a scheduled job that re-queries Paystack/Stripe for any intent left `initiated` beyond 30 minutes, plus webhook replay.

### 2.10 · Hide empty categories
`/businesses` renders all 250 category filters against 2 listings; 249 lead to an empty state. This is the identical defect fixed on the Create page earlier today — apply the same rule: show only categories with listings, and say so.

---

# SEO REMEDIATION (spans P0 and P1)

The largest single lever, and mostly configuration rather than construction.

**Current state, measured as Googlebot:** 105 of 111 sitemap URLs return the homepage `<title>` and `rel=canonical` → `/`.

**Root cause:** `MARKETING_PAGES` in `src/lib/marketingPageRender.ts` opts *in* exactly 7 paths (`/`, `/about`, `/discover`, `/nominate`, `/platform`, `/send-business`, `/waitlist`). Everything else serves the static `index.html`, whose metadata is the homepage's. The `/:username` business route is handled separately and **works correctly** — `/yemzoarts` returns the right title, canonical and 2 `ld+json` blocks.

**Proposed, in order:**

1. **Invert the middleware default.** Every public route renders server-side metadata unless explicitly excluded. The machinery already works; this is coverage, not capability.
2. **Add the 8 missing static pages** to SSR: `/businesses`, `/media`, `/pricing`, `/adverts`, `/contact`, `/founder`, `/terms`, `/privacy`.
3. **Decide the advert pages.** If Q1 resolves in our favour, give them slugs (`/adverts/lekki-led-portrait-5th-roundabout`) and real metadata. If not, remove them entirely. Either way, 97 opaque UUIDs canonicalising to `/` must not stay in the sitemap.
4. **Add the 3 SSR'd pages missing from the sitemap:** `/discover`, `/nominate`, `/send-business` are rendered correctly but never submitted.
5. **Unify the canonical host.** `/` declares `https://nowopenafrica.com`; `/businesses` declares `https://nowopenafrica.com/`; `robots.txt` points at the non-`www` host while the site aliases `www`. Pick one and apply it everywhere.
6. **Then build city × category landing pages** (`/lagos/barbers`) — but only once real supply exists to fill them. Generated from an empty directory they would be thin-content pages, which is worse than having none.

**Expected effect:** SEO 3 → 7. This is the mechanism by which supply becomes demand without spending money, so it should not wait behind feature work.

---

# WHAT THIS PLAN DELIBERATELY DOES NOT DO

Stated explicitly, because the temptation runs the other way.

- **No new features.** Not one.
- **No new industry systems.** 42 exist for 2 businesses.
- **No new module shapes.** 8 cover all 250 categories and have taken 0 bookings.
- **No Studio expansion.** 376 designs produced 1 export in 14 days.
- **No creative marketplace.** 0 supply.
- **No mobile parity port.** The mobile module map is 140 categories behind the web — record it as debt, do not spend a sprint on it while the web product has no users.
- **No AI additions.** "Grow with AI" already overstates what ships.

---

# SEQUENCING

```
Day 0     Q1 Q2 Q3 answered  ─────────────────────────────┐
                                                          │  gates everything
Day 0-1   P0 items 1-8 (≈7 hours of work total)  ◄────────┘
Day 1-3   SEO remediation steps 1-5
Day 3-7   Pagination + search index (2.1)
Day 3-7   Holidays + override expiry (2.2)
Day 5-7   Touch targets, rate limits, role-guard layer 2, 404s
Week 2-4  ══ ONBOARD 100 REAL BUSINESSES IN ONE CITY ══
          (everything above exists to make this worth doing)
Week 5-12 City × category landing pages, from real supply
          Retention loop. Prove ROI to one paying business.
```

The whole technical programme above is roughly **two weeks of work**. The 30- and 90-day items are not engineering — they are supply acquisition. That asymmetry is the honest conclusion of this audit: the code is not what is holding NowOpen Africa back.

---

# APPROVAL

Awaiting your go-ahead before any of this is implemented.

Recommended: approve **Block 0 immediately** (three questions, mostly your answers plus ten minutes of curl), and **Block 1 P0** as one batch — it totals about seven hours and closes every irreversible risk. Block 2 can then be scheduled against the supply programme rather than ahead of it.
