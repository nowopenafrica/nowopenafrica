# NOWOPEN AFRICA
## INDEPENDENT PLATFORM AUDIT

**Audit Date:** 2026-09-07
**Auditor:** Independent AI Product / Technical Audit
**Target:** production (`https://www.nowopenafrica.com`) + repo `NowOpen Africa - (OpenCode) - Claude - edit`
**Method:** live production database queries (`supabase db query --linked`), live HTTP/crawler probes, in-browser instrumentation of the deployed site at desktop and 360px, static analysis of 113,000 lines of source.
**Code was not modified during this audit** (per instruction §39).

Every quantitative claim below carries its evidence. Anything I could not establish is marked **UNVERIFIED** and must not be treated as fact.

---

# EXECUTIVE VERDICT

NowOpen Africa is a genuinely well-engineered product with almost no users, pointed at an acquisition channel that is currently broken. Those three facts, together, are the audit.

The engineering is not the problem. 113,000 lines across 50 routes, 2,811 passing tests in 210 files, zero lint errors, Row Level Security enabled on all 79 production tables, `SECURITY DEFINER` helpers with pinned `search_path`, private storage buckets for verification documents and customer artwork, and no `service_role` key anywhere in the shipped client bundle. I went looking for the usual catastrophes — leaked service keys, missing RLS, client-side-only permissions, privilege escalation — and did not find them. The one privilege-escalation path I did find in the RLS policy is neutralised by a database trigger. That is a better security posture than most funded startups reach in year two.

The problem is that this machinery serves **two businesses, both of which belong to the founder.** The production database holds 2 rows in `businesses` (`YemzoArts Studios` and `NowOpen Media Ad Placeements` — the typo is live), 11 users of whom 3 are admins and 0 are consumers, and zero rows in `business_bookings`, `business_reviews`, `business_products`, `business_offers`, `business_claims`, `business_enquiries`, `create_orders`, `media_services` and `favorites`. Fourteen days of analytics contain 114 sessions and 2 identified users. The 250-category taxonomy, the 8 booking-module shapes, the 42 industry operating systems, the 376-design Studio — all of it is scaffolding around an empty room. This is not a criticism of ambition; it is a statement about what the next 90 days must be about, and it is not more features.

Worse, the one channel that could fill that room is misconfigured. **105 of the 111 URLs in the live sitemap serve the homepage's `<title>` and a canonical tag pointing at `/`** when fetched as Googlebot. `/businesses` — the directory itself — tells Google it is a duplicate of the homepage. So do all 97 `/adverts/<uuid>` pages, which the sitemap simultaneously submits for indexing. Only `/`, `/about`, `/platform`, `/discover`, `/nominate`, `/send-business`, `/waitlist` and individual business profiles are server-rendered; everything else falls through to a static `index.html` with the homepage's metadata baked in. There are no city pages and no category pages at all — for a local directory, that is the entire organic acquisition strategy, absent.

Two further findings deserve founder attention before anything else. First, `advertisements` holds 97 rows, **89 marked `active`, with `user_id` NULL on every single one**, naming specific real-world third-party sites — "2 Double-Sided Freestanding Screens, The Palms, Lekki", "16 Digital Screens, Railway Ticketing & Waiting Area, Lagos" — with day rates attached. Whether NowOpen holds the rights to broker those placements is **UNVERIFIED and only you can answer it**; if it does not, the platform is publicly offering media inventory it does not control, and Google is being invited to index it. Second, analytics is 99.4% junk: `signin` has fired **42,910 times across 64 sessions** (≈670 per session) because it is emitted from `onAuthStateChange`'s `SIGNED_IN` event, which Supabase also fires on every token refresh and tab focus. Every decision made from this dashboard is being made on noise, and the dev server writes into the same production table — I found `localhost:5175` stack traces in production `client_error` rows.

**Overall this scores 5.1/10 — "major weaknesses" — and the score is held down almost entirely by emptiness, discoverability and scale-readiness rather than by defects.** The craft is real. The African market fit is real and unusually thoughtful (naira pricing throughout, WhatsApp as a first-class contact channel, Paystack with mobile-money and USSD, and a category list that includes POS agents, keke riders, okrika bales, buka eateries and football viewing centres). Two real payments have settled through Paystack. A business owner who lands on this today gets a genuinely good product. Almost nobody lands on it.

---

# OVERALL SCORE

# 5.1 / 10

---

# LAUNCH STATUS

## ⚠️ SOFT-LAUNCH READY

Not "MVP ready", and the distinction matters.

The **business side is genuinely ready**: a Nigerian SME can sign up, build a profile, get a server-rendered page with correct metadata and LocalBusiness schema, take bookings through any of 8 module shapes, generate brand assets in Studio, order print, and pay by card, transfer, USSD or mobile money. I verified the SSR, the schema, the modules and the payment rail directly. You could onboard businesses by hand starting today and each one would be well served.

The **customer side is not ready**, because a directory with two listings cannot serve a customer, and the SEO configuration means new customers cannot find it even when supply exists.

The **advertiser side must not launch** until the ownership question on those 89 active placements is resolved.

The correct posture is a deliberate, hand-held soft launch: recruit supply in one city and one or two verticals, fix the SEO plumbing so that supply becomes discoverable, and do not open the advertiser or creative marketplaces until they have real supply behind them.

---

# SCORECARD

| Category | Score /10 | Confidence | Biggest Problem |
| --------------------- | --------: | ---------- | --------------- |
| Product               | 5 | High | A directory with 2 listings, both the founder's |
| UX                    | 6 | High | Homepage answers "find a business" with 42 cards saying "these are not businesses" |
| UI                    | 7 | High | Strong and consistent; a few icon-only controls under-sized |
| Mobile                | 6 | High | No overflow at 360px, but 30 touch targets <40px incl. the hamburger at 35×35 |
| Performance           | 6 | Medium | 193 KB gzip entry + 4.3 MB assets; measured on fast connection only |
| Functionality         | 6 | High | Most flows work; stale-chunk failures break pages after every deploy |
| Search                | 4 | High | Client-side substring match, no pagination, no typo tolerance, no index |
| Discovery             | 2 | High | There is nothing to discover |
| Business Experience   | 7 | High | Substantial and real; unverifiable ROI because there is no traffic |
| Customer Experience   | 3 | High | No supply, no reason to return |
| Advertiser Experience | 4 | Medium | 89 "active" placements owned by nobody; rights UNVERIFIED |
| Creative Experience   | 2 | High | Marketplace is empty; 0 rows in `media_services` |
| Admin                 | 6 | Medium | Broad tooling; every moderation path is manual |
| Security              | 7 | High | Strong fundamentals; no rate limiting, policy lacks column restriction |
| Privacy               | 6 | High | Correct bucket privacy; dev telemetry writes to production |
| SEO                   | 3 | High | 105 of 111 sitemap URLs serve homepage metadata and canonical `/` |
| Accessibility         | 7 | High | Excellent semantics; touch targets and 2 unlabelled inputs |
| Data Architecture     | 6 | High | Sensible indexes and RLS; junk table, text price column, no pagination design |
| Scalability           | 3 | High | `select('*')` with no limit, all filtering client-side |
| Analytics             | 3 | High | 99.4% of events are one runaway emitter; no environment separation |
| Monetization          | 6 | High | Real Paystack/Stripe rail, 2 settled payments, plan caps now bite |
| Retention             | 2 | High | 1 keep, 0 offers, nothing to come back for |
| Trust & Safety        | 5 | Medium | Honest demo banners and no fake ratings; unowned ad inventory and aspirational taglines |
| African Market Fit    | 8 | High | Genuinely adapted, not merely localised |
| Brand                 | 8 | High | Distinctive, coherent, confident |

**Mean of 25 categories = 5.12**

---

# TOP 10 PROBLEMS

Ranked by severity × likelihood × business impact.

### 1. The platform is empty, and the roadmap keeps adding rooms to an empty house — 🔴 CRITICAL (strategic)
2 businesses, 0 bookings, 0 reviews, 0 products, 0 offers, 0 claims, 0 enquiries, 0 create orders, 0 creative services, 1 keep, 2 waitlist signups, 0 consumer accounts. Meanwhile the codebase grew to 113,000 lines and 250 categories. **Consequence:** every product decision is being made without a single real user's behaviour to learn from, and engineering capacity is being spent on breadth that supply has not yet asked for. **Fix:** freeze new surface area; make the next 90 days a supply-acquisition programme with a hard target (see remediation plan).

### 2. 105 of 111 sitemap URLs are self-canonicalising to the homepage — 🔴 CRITICAL (SEO)
Fetched as Googlebot, `/businesses`, `/media`, `/pricing`, `/founder`, `/contact`, `/terms`, `/privacy`, `/adverts` and all 97 `/adverts/<uuid>` pages return `<title>NowOpen Africa — The Operating System for Business Growth in Africa</title>` and `<link rel="canonical" href="https://nowopenafrica.com/">`. **Root cause:** `middleware.ts` server-renders only the 7 paths in `MARKETING_PAGES` plus `/:username`; everything else serves the static `index.html`. **Consequence:** Google is explicitly told 95% of the site is duplicate content, while the sitemap asks it to index those same URLs — a contradictory signal that suppresses the whole domain. **Fix:** extend SSR coverage to every indexable route, or at minimum stop submitting URLs whose canonical points elsewhere.

### 3. 89 "active" advertising placements at named real-world sites, owned by nobody — 🔴 CRITICAL (legal/trust, UNVERIFIED)
`advertisements`: 97 rows, 89 `status='active'`, `user_id` NULL on all 97. Titles name specific third-party properties with day rates. **Consequence:** if the rights do not exist, this is offering to sell media inventory NowOpen does not control, at named locations, on an indexable public page — a commercial and reputational exposure that dwarfs any technical finding here. **This requires a founder answer, not an engineering fix.** If rights do exist, the data model still records no owner, no availability and no currency.

### 4. Every deploy breaks the site for users mid-session — 🟠 HIGH (functionality)
Production `client_error` rows show `Failed to fetch dynamically imported module: https://www.nowopenafrica.com/assets/BusinessDetail-D6o_2ziK.js` on `/business/lagos-prime-realty` and `'text/html' is not a valid JavaScript MIME type.` on `/yemzoarts` — the founder's own business page. **Root cause:** a browser holding the previous `index.html` requests a content-hashed chunk that no longer exists; the SPA fallback returns `index.html`, which the browser rejects as JS. There is no chunk-load recovery, no service worker, and no version check — only a manual "reload" button in `ErrorBoundary`. **Consequence:** with six deploys in a single day, any user browsing during a deploy sees a broken page. **Fix:** catch dynamic-import failures and reload once automatically.

### 5. The directory cannot scale past roughly 1,000 listings — 🟠 HIGH (scalability)
`src/pages/Businesses.tsx:112` runs `supabase.from('businesses').select('*').eq('is_listable', true).order(...)` with **no `.limit()` and no `.range()`**, then filters by category, location, text and open-status **client-side** (lines 202–215). There is no full-text or trigram index on `businesses` — the live index list contains only btree indexes. **Consequence:** at 10,000 listings this is a multi-megabyte payload on Nigerian mobile data; and if PostgREST's `max-rows` is set, the directory silently truncates and search returns "no results" for businesses that exist. **Fix:** server-side pagination and server-side filtering before supply arrives, not after.

### 6. Analytics is 99.4% noise, and dev writes into production — 🟠 HIGH (data integrity)
`signin`: **42,910 events / 64 sessions ≈ 670 per session**, because `AuthContext.tsx:80` emits `track('signin')` on `onAuthStateChange`'s `SIGNED_IN`, which fires on every token refresh and tab focus. Separately, `src/lib/telemetry.ts` contains no environment gate — production `client_error` rows carry `http://localhost:5175` and `localhost:5173` stack traces. **Consequence:** the only instrument for judging the business reports fiction, and it accrues Supabase write cost that grows with sessions, not with signups. **Fix:** emit on the explicit sign-in path, and gate telemetry on host.

### 7. "Open now" has no concept of a public holiday — 🟠 HIGH (trust, core differentiator)
`openingHours.test.ts` covers overnight (6 assertions), midnight (6), timezone (5) and 24-hour (1). It contains **zero** coverage of public holidays, temporary closure, or override staleness. Nigeria has ~11 fixed public holidays plus two moveable Eids. Separately, the manual override at `openingHours.ts:438` short-circuits on `open_status === 'closed'` with **no expiry** — a business that marks itself closed once is closed forever. **Consequence:** the platform's headline promise is wrong on the days customers most need it, and permanently wrong for any owner who forgets to flip a switch. **Fix:** a holiday calendar and a TTL on manual overrides.

### 8. The homepage answers "find me a business" with 42 disclaimers — 🟡 MEDIUM (UX/conversion)
Below two real listings, the dominant homepage content is 42 industry cards under the heading "EXAMPLES, NOT LISTINGS — These are not businesses". Honest, and the right call versus inventing listings, but it means a first-time customer's dominant impression is of a directory explaining why it has nothing. **Fix:** lead with the two real listings and a single honest supply-side ask; move the industry wall behind a link.

### 9. The industry taglines claim capabilities that do not exist — 🟡 MEDIUM (misleading)
On the live homepage, beside "LIVE PAGE" badges: *"Designers — Portfolios that plug into Behance, Dribbble and Figma"*, *"Fashion — Catalog, custom measurement and live runway shows"*, *"Barbers — Cuts, queue status and walk-in availability in real time"*. None of those integrations or real-time features exist; the queue module is a form. `/businesses` reads *"2 businesses across food, retail, tech, health, professional services and more"* — both businesses are `Media & Publishing`. The page title is *"Find Verified Businesses Across Africa"*; exactly 1 business is verified, and it is the founder's. **Consequence:** this is the category of claim the founder's own brief prohibits, on the most-viewed surface. **Fix:** rewrite taglines to describe what ships, and derive the breadth copy from data.

### 10. 250 category filters for 2 businesses, and 3 of 11 users are admins — 🟡 MEDIUM (UX + least privilege)
The `/businesses` category selector renders all 250 categories; 249 return nothing. This is the same defect just fixed on the Create page. Separately, `users` breaks down as 8 `business` and **3 `admin`** — 27% of accounts hold full platform authority, with no least-privilege tier in use despite `is_staff()` supporting an `editor` role. **Fix:** show only categories with listings; demote admins that do not need write access.

---

# TOP 10 STRENGTHS

These are real and should not be sacrificed while fixing the above.

1. **Security fundamentals are genuinely strong.** RLS enabled on all 79 public tables; the 4 tables with zero policies are deny-all by construction; `is_admin()` and `is_staff()` are `SECURITY DEFINER` with `SET search_path TO 'public'`; `verification-docs` and `create-artwork` buckets are private; and the only JWT in the 4.3 MB client bundle decodes to `"role":"anon"`. No leaked service key.

2. **Defence in depth on role escalation actually works.** The `users` UPDATE policy is permissive (`USING (auth.uid() = id)`, no `WITH CHECK`, no column list) — but `guard_user_role_column` freezes `NEW.role := OLD.role` for anyone who is not `service_role` or already an admin. I confirmed the trigger exists in production. The mitigation is real.

3. **Test discipline is unusual for this stage.** 2,811 tests across 210 files, 0 lint errors, and the tests assert *product guarantees* (no fabricated ratings, demo banners present, contrast maintained across style × brand-colour combinations) rather than only unit behaviour.

4. **Business profiles are correctly server-rendered.** `/yemzoarts` returns the right title, the right canonical and 2 `ld+json` blocks to a crawler. The single most SEO-important page type is done properly — the plumbing exists, it is just not extended to the rest of the site.

5. **African market fit is designed in, not painted on.** Naira throughout, WhatsApp deep links with pre-filled context, Paystack with card/transfer/USSD/mobile-money plus Stripe for international cards, a local-day rule so "today" is correct at UTC+1, and a taxonomy that includes POS & Agent Banking, Keke & Okada, Thrift (Okrika), Buka, Football Viewing Centre and Gele & Aso-Oke Styling. Very few platforms built for this market get this far.

6. **The monetisation rail is real, not mocked.** Paystack and Stripe are integrated; `payment_intents` holds 2 `paid`, 4 `initiated`, 9 `lead`. Money has actually moved.

7. **Accessibility is better than most production sites.** Homepage: 1 `<h1>`, 0 heading-level skips, 11 images all with `alt`, 68 visible buttons with **0** unlabelled, a working skip link and a `<main>` landmark. Only 2 unlabelled inputs.

8. **Honest empty states, consistently.** "No reviews yet" instead of a fabricated 0.0; "No creative professionals listed yet — nobody is listed here until a real person has claimed their profile"; demo profiles carry a permanent banner. The platform tells the truth about its own emptiness, which is rarer and more valuable than it sounds.

9. **Edge performance is excellent.** TTFB 71 ms, DOMContentLoaded 263 ms, LCP 1,484 ms on the homepage — comfortably inside Core Web Vitals thresholds on a good connection.

10. **The module architecture is genuinely well-designed.** Eight module shapes covering all 250 categories, each a preset of existing config flags so the booking modal needs no changes; owner overrides are authoritative; and it is locked by tests. It has never taken a single real booking, but when supply arrives it will work.

---

# CRITICAL BUGS

### BUG-1 — Stale JS chunk after deploy breaks the page 🟠 HIGH
- **Location:** build/deploy pipeline; `src/components/ErrorBoundary.tsx:43` is the only mitigation
- **Evidence:** production `analytics_events` rows — `{"source":"react-boundary","message":"Failed to fetch dynamically imported module: https://www.nowopenafrica.com/assets/BusinessDetail-D6o_2ziK.js"}` on `/business/lagos-prime-realty`; `{"source":"react-boundary","message":"'text/html' is not a valid JavaScript MIME type."}` on `/yemzoarts`
- **Reproduction:** load the site, deploy, then navigate to a lazy-loaded route without reloading
- **Root cause:** content-hashed chunks are removed on redeploy; the SPA fallback serves `index.html` for the missing asset, which the browser refuses as JavaScript
- **Consequence:** any user browsing during a deploy hits a broken page; on this project that is frequent
- **Fix:** wrap lazy imports so an import failure triggers exactly one `location.reload()`, guarded by a `sessionStorage` flag to prevent loops
- **Complexity:** Low (½ day)

### BUG-2 — `signin` analytics event fires ~670× per session 🟠 HIGH
- **Location:** `src/contexts/AuthContext.tsx:80`
- **Evidence:** `signin` = 42,910 events across 64 distinct sessions; next-largest event is 108
- **Root cause:** `supabase.auth.onAuthStateChange` emits `SIGNED_IN` on token refresh and tab focus, not only on authentication
- **Consequence:** 99.4% of the analytics table is noise; unbounded write growth
- **Fix:** emit from the explicit sign-in/sign-up paths, or de-duplicate per session id
- **Complexity:** Low (1 hour) — plus a decision on whether to purge the 42,910 rows

### BUG-3 — Development telemetry writes to the production database 🟠 HIGH
- **Location:** `src/lib/telemetry.ts` (no environment gate present)
- **Evidence:** production `client_error` rows containing `at Discover (http://localhost:5175/src/pages/Discover.tsx…)`, `localhost:5173`, and errors for `placeInput`, `useEffect`, `PRIMARY_NAV`, `fromUrl`, `capabilityFrom` — all dev-time mistakes, none reachable in production
- **Consequence:** production error monitoring is unusable; real incidents are buried under development noise
- **Fix:** gate `track()` on `location.hostname` or `import.meta.env.PROD`
- **Complexity:** Trivial (15 minutes)

### BUG-4 — Manual "closed" override never expires 🟠 HIGH
- **Location:** `src/lib/openingHours.ts:438`
- **Root cause:** `if (b.open_status === 'closed')` short-circuits ahead of the schedule with no timestamp comparison; no `open_status_updated_at` guard exists
- **Consequence:** an owner who marks themselves closed once appears permanently closed, and neither they nor a customer gets any signal
- **Fix:** add `open_status_set_at` and expire the override at the next scheduled opening
- **Complexity:** Low-Medium (1 day + migration)

### BUG-5 — Live business name contains a typo ⚪ COSMETIC but public
- `businesses.name = 'NowOpen Media Ad Placeements'` — visible on the live site, in the sitemap, and in the URL slug `nowopen-media-ad-placeements`
- **Fix:** rename; add a redirect from the old slug
- **Complexity:** Trivial

### BUG-6 — Junk table in the production schema ⚪ LOW
- A table literally named `NowOpen Africa` with 462 rows and a single column named `-- Combined migration script for the NowOpen Supabase project` — a migration file pasted into the table editor
- **Not exposed** (RLS on, zero policies = deny-all), so this is hygiene rather than a breach
- **Fix:** drop it
- **Complexity:** Trivial

### UNVERIFIED — Safari homepage error
9 production events: `{"message":"Can't find variable: EmptyRanges","stack":"played@ | syncControl@ | handleEvent@"}` on `/`. The stack shape and `played` accessor indicate a WebKit `<video>` interaction on the homepage hero. **I could not reproduce this** — the audit browser is Chromium. Needs a real Safari/iOS check.

---

# UX/UI FINDINGS

See `NOWOPEN_AFRICA_UX_FINDINGS_2026-09-07.md` for the full detail. Summary:

- 🔴 The homepage's centre of gravity is 42 cards explaining that they are not businesses.
- 🟡 Industry taglines promise Behance/Dribbble/Figma integration, "live runway shows" and "real-time queue status" beside "LIVE PAGE" badges. None exist.
- 🟡 `/businesses` offers 250 category filters against 2 listings; 249 lead to an empty state.
- 🟡 Directory copy claims coverage of "food, retail, tech, health, professional services" for 2 `Media & Publishing` businesses; the page title promises "Verified Businesses Across Africa" with 1 verified listing, the founder's own.
- 🟢 Search works correctly: substring matching, `?search=` deep-links are honoured and pre-fill the input, and the no-results state is useful rather than a dead end.
- 🟢 Open/closed status renders correctly and honestly ("Closed · Opens tomorrow at 10:00 AM").
- 🟢 Empty states across the product are honest and offer a next action — a genuine strength.
- 🟢 The `/platform` page now separates "Working today" (derived from shipped config) from the roadmap, and the roadmap no longer wears green ticks.

---

# FUNCTIONAL AUDIT

| Feature | State | Evidence |
| --- | --- | --- |
| Business profile rendering | 🟢 WORKING | `/yemzoarts` SSR title, canonical, 2× ld+json |
| Open/closed status | 🟡 PARTIAL | overnight/midnight/TZ correct; no holidays; override never expires |
| Directory browse | 🟡 PARTIAL | works at n=2; no pagination, client-side filtering |
| Search | 🟡 PARTIAL | substring + deep-link work; no typo tolerance, no synonyms, no index |
| Booking modules | 🔵 UNVERIFIED end-to-end | 8 shapes wired and unit-tested; `business_bookings` = 0 rows, so never exercised by a real customer |
| Reviews | ⚪ MISSING in practice | `business_reviews` = 0 |
| Offers | ⚪ MISSING in practice | `business_offers` = 0 |
| Claim business | 🔵 UNVERIFIED | `business_claims` = 0 |
| Keep / saved | 🟡 PARTIAL | `business_keeps` = 1, `favorites` = 0 — two tables for one concept |
| Studio / design library | 🟢 WORKING | 376 designs render on production; 1 `studio_export` event |
| Create catalogue & packs | 🟢 WORKING | 17 items/division, priced, configurator opens |
| Create orders | 🟡 PARTIAL | `create_orders` = 0 rows, but 2 `create_order_requested` + 1 `create_order_accepted` events — **inconsistent, needs investigation** |
| Creative marketplace | ⚪ MISSING | `media_services` = 0; honest empty state shown |
| Advertising inventory | 🟠 FRAGILE | 89 active, 0 owners, rights UNVERIFIED |
| Payments | 🟢 WORKING | Paystack + Stripe; 2 `paid` |
| Admin | 🔵 UNVERIFIED depth | surfaces exist; `audit_log` = 83 rows, `feature_flags` = 12 |
| Notifications | 🟡 PARTIAL | `notifications` = 12 rows |
| Automation / workforce | 🟢 WORKING | `workforce_runs` = 53, `os_work_items` = 6 |
| Multi-location | ⚪ MISSING in practice | `business_locations` = 0 |
| Team management | ⚪ MISSING in practice | `business_members` = 0 |

**Note the discrepancy:** `create_orders` has 0 rows while analytics recorded `create_order_requested` twice and `create_order_accepted` once. Either the writes failed silently (the `insert().select()` RLS trap this codebase has hit before) or the rows were deleted. **This should be reproduced before launch** — it is the paid-conversion path.

---

# TECHNICAL FINDINGS

Full detail in `NOWOPEN_AFRICA_TECHNICAL_FINDINGS_2026-09-07.md`. Summary:

- 113,000 lines: 51,148 in 234 components, 37,353 in 165 lib files, 16,726 in 41 pages, 9,166 across 106 migrations.
- Bundle: 118 chunks, 4.3 MB `dist/assets`, entry `index-BiXrs2q_.js` 631 KB raw / **193 KB gzip**. Six chunks exceed 300 KB raw; the build warns about the 500 KB threshold.
- `tsconfig.app.json` covers only `src`; `api/` and `middleware.ts` were typechecked by **nothing** until `tsconfig.server.json` was added earlier today. Vercel's build log had been carrying real type errors non-fatally because esbuild strips types rather than checking them.
- No service worker, no offline story, no chunk-load recovery.
- No application-level rate limiting anywhere in `api/` or `middleware.ts`; 10 rapid unauthenticated requests to `/api/discovery` all returned 200.
- Live schema: 79 tables, RLS on all. Indexes on `businesses` are sensible (unique `lower(username)`, partial on `is_listable`, composite `(location, category)`, `listing_score DESC, created_at DESC`) but there is **no full-text or trigram index**.
- `advertisements.price_per_day` is stored as **text** with no currency column.
- Two competing "saved business" tables: `business_keeps` (1 row) and `favorites` (0 rows).

---

# SECURITY FINDINGS

| Severity | Finding |
| --- | --- |
| ✅ PASS | No `service_role` key in the client bundle — the only JWT present decodes to `"role":"anon"` |
| ✅ PASS | RLS enabled on all 79 public tables; the 4 with zero policies (`NowOpen Africa`, `private_config`, `social_auth_pending`, `social_connections`) are deny-all |
| ✅ PASS | `is_admin()` / `is_staff()` are `SECURITY DEFINER` with `SET search_path TO 'public'` — not spoofable via search-path injection |
| ✅ PASS | `verification-docs` and `create-artwork` buckets are private; only image/video buckets are public |
| ✅ PASS | Role escalation via `users.role` is blocked by the `guard_user_role_column` trigger |
| 🟡 MEDIUM | **Role protection is trigger-only.** The `users` UPDATE policy is `USING (auth.uid() = id)` with no `WITH CHECK` and no column restriction. If the trigger is ever dropped by a migration or a table recreate, silent privilege escalation returns with no test to catch it. Add a column-restricted policy as a second layer. |
| 🟡 MEDIUM | **No rate limiting on public writes.** `profile_requests`, `waitlist`, `platform_enquiries` and `radar_candidates` accept anonymous inserts by design. Nothing throttles them. An attacker can flood tables that a human admin must then triage by hand. |
| 🟡 MEDIUM | **3 of 11 accounts are full admins** (27%). No least-privilege use of the `editor` role that `is_staff()` already supports. A single compromised admin account is total platform compromise. |
| 🟢 LOW | Plan module caps are enforced in `BusinessForm` (client) and not at the database level; a business could exceed its plan by calling the API directly. Revenue leakage, not a breach. |
| 🟢 LOW | Junk `NowOpen Africa` table containing a pasted migration script. Not exposed, but migration scripts describe security structure and should not sit in a production schema. |
| 🔵 UNVERIFIED | Edge-function authentication for social publishing. `social_connections` and `social_auth_pending` have RLS on with zero policies, so the anon key cannot read them — publishing must therefore run through a `service_role` edge function. I did not verify that function's own authorisation. |

**No CRITICAL or HIGH security findings.** That is a genuine and uncommon result.

---

# SEO FINDINGS

The headline finding, restated with evidence.

Fetched with `User-Agent: Googlebot/2.1`:

| URL | Crawler-visible title | Canonical | Verdict |
| --- | --- | --- | --- |
| `/` | correct | `https://nowopenafrica.com` | ✅ |
| `/platform` | "Industry Operating Systems — NowOpen Africa" | `/platform` | ✅ |
| `/yemzoarts` | "YemzoArts Studios — Media & Publishing in Ikotun, Lagos Nigeria" | `/yemzoarts` | ✅ (2× ld+json) |
| `/businesses` | **homepage title** | **`/`** | ❌ |
| `/media` | **homepage title** | — | ❌ |
| `/pricing` | **homepage title** | — | ❌ |
| `/founder` | **homepage title** | — | ❌ |
| `/contact` | **homepage title** | — | ❌ |
| `/terms` | **homepage title** | — | ❌ |
| `/privacy` | **homepage title** | — | ❌ |
| `/adverts` | **homepage title** | — | ❌ |
| `/adverts/<uuid>` ×97 | **homepage title** | **`/`** | ❌ |

- **Sitemap:** 111 URLs — 12 static, 2 businesses, 97 advert UUIDs. So **87% of the sitemap is opaque UUID URLs with no keywords, all canonicalising to the homepage.**
- **SSR coverage:** `MARKETING_PAGES` in `src/lib/marketingPageRender.ts` contains exactly 7 paths (`/`, `/about`, `/discover`, `/nominate`, `/platform`, `/send-business`, `/waitlist`), plus the `/:username` business route. Three of those seven (`/discover`, `/nominate`, `/send-business`) are **not in the sitemap** — correctly rendered but not submitted.
- **No location pages. No category pages.** For a local business directory this is the entire organic acquisition strategy, and it does not exist. `/lagos/barbers` is the query shape customers actually search; nothing serves it.
- **Canonical inconsistency:** `/` declares `https://nowopenafrica.com` (no trailing slash) while `/businesses` declares `https://nowopenafrica.com/`. `robots.txt` points the sitemap at the non-`www` host while the site aliases `www`. Minor, but it splits signals.
- 🟢 `robots.txt` correctly disallows `/admin`, `/admin-creator`, `/dashboard`, `/profile`, `/security`, `/studio`, `/register`, `/login`, `/digital-forms`, `/reset-password`, `/forgot-password`.
- 🔵 **UNVERIFIED and important:** the 45 curated demo profiles (`/business/<slug>`) are reachable and content-rich. If they are indexable, Google will hold 45 fabricated businesses for a directory with 2 real ones. `src/test/indexability.test.ts` exists; the live `noindex` status of those routes was not confirmed in this audit and **must be**.

---

# MOBILE FINDINGS

Tested on production at 360×740 and 375×812.

- 🟢 **Zero horizontal overflow** on `/` and `/yemzoarts` at 360px. The only element wider than the viewport is a deliberately `w-max` marquee, correctly contained.
- 🟢 2-across card grids at 360px, readable, no clipping.
- 🟡 **30 touch targets below 40×40px** on a business profile, including:
  - **"Open menu" hamburger: 35×35** — the most-tapped control on mobile, under both the 44×44 Apple/Google guideline and comfortable thumb use
  - "Switch to dark mode": 32×32
  - "Something wrong with this listing?": 17px tall — fails even WCAG 2.2 AA (24×24)
  - Footer contact links: 32px tall
  The codebase clearly knows the rule — `min-h-[44px]` appears on primary CTAs throughout. It is the icon-only controls that were missed.
- 🟡 **Weight for the target market.** 193 KB gzip entry plus a 57 KB gzip `BusinessDetail` chunk. On a 3G connection at ~400 Kbps effective this is several seconds to interactive, and it is paid for out of the user's data bundle. Measured LCP of 1,484 ms is a *fast-connection* number and should not be read as the Lagos experience.
- 🔵 **UNVERIFIED:** behaviour under intermittent connectivity. There is no service worker and no offline state, so a dropped connection mid-navigation produces the lazy-import failure documented in BUG-1 rather than a graceful retry.

---

# PERFORMANCE FINDINGS

Measured on production, warm cache, fast connection, Chromium desktop:

| Metric | Value | Assessment |
| --- | --- | --- |
| TTFB | 71 ms | Excellent (Vercel edge) |
| DOMContentLoaded | 263 ms | Excellent |
| LCP | 1,484 ms | Good (<2,500 ms) |
| Requests | 45 | Reasonable |
| Total transfer | 319 KB | Good (warm cache) |
| Entry bundle | 631 KB raw / **193 KB gzip** | Heavy |
| `dist/assets` total | 4.3 MB across 118 chunks | Heavy |
| Largest chunks | ContentFactory 464 KB, jspdf 377 KB, AdminCreator 360 KB, Studio 315 KB, BusinessDetail 309 KB | Build warns >500 KB |

**The honest caveat:** these are good numbers taken under good conditions with a warm cache and no contention. "What happens when 10,000 people arrive at once?" is **UNVERIFIED** — but the answer is bounded by finding #5, not by the frontend: 10,000 concurrent directory loads each issue an unpaginated `select('*')` against `businesses`. The frontend will hold; the query will not.

`jspdf` at 377 KB raw is worth isolating — it should load only when a PDF is actually exported.

---

# DATA & SCALABILITY FINDINGS

**Will this architecture work at 10,000 / 100,000 / 1,000,000 businesses?**

- **10,000:** No, not without change. The directory's unpaginated `select('*')` becomes a multi-megabyte response, and client-side filtering means every filter interaction re-scans the full set in the browser. Search has no index to use — `ilike`-style substring matching cannot use the existing btree indexes.
- **100,000:** No. PostgREST row caps would silently truncate the result set, so search would confidently report "no results" for businesses that exist — a correctness failure presenting as an empty state.
- **1,000,000:** Requires a different architecture entirely: server-side pagination, a `tsvector` + `pg_trgm` search index (or an external search service), and cursor-based infinite scroll.

**What is already right:**
- Unique index on `lower(username)` — prevents case-variant squatting
- Partial index on `is_listable WHERE is_listable` — the right shape for the common query
- Composite `(location, category)` — exactly the directory's access pattern
- `(listing_score DESC, created_at DESC)` — supports the ordering actually used
- `is_listable` as a generated column — visibility cannot drift from its inputs
- `audit_log` (83 rows) and `feature_flags` (12) exist and are used

**What needs attention:**
- No full-text or trigram index
- No pagination anywhere in the directory path
- `advertisements.price_per_day` is text; no currency column
- Two tables for one concept: `business_keeps` (1) and `favorites` (0)
- 106 migrations with no CI check that the live schema matches them — this project has a documented history of live-vs-repo drift
- `business_locations` (0) and `business_members` (0) exist but are unexercised; multi-location and team features are **UNVERIFIED**

---

# BUSINESS MODEL FINDINGS

**Where revenue can come from, and what is actually wired:**

| Stream | State | Evidence |
| --- | --- | --- |
| Business subscriptions | 🟢 Wired | `MODULE_LIMITS` (starter 1 / growth 5 / pro ∞); `payment_intents` 2 paid |
| Create / print orders | 🟡 Wired, unproven | catalogue priced, configurator works, `create_orders` = 0 rows despite 3 events |
| Business packs | 🟢 Wired | ₦25k–₦250k, quote-based, honestly labelled "Estimate" |
| Create credits (AI) | 🟢 Wired | ₦2k/20 → ₦25k/400 |
| Advertising | 🟠 Blocked | 89 active placements, 0 owners, rights UNVERIFIED |
| Creative marketplace commission | ⚪ No supply | `media_services` = 0 |
| Promoted listings | ⚪ Not built | `listing_score` exists and could carry it |
| Lead generation | 🟡 Instrumented | `business_contact_clicked` = 5 events |

**The honest read:** the plan layer only started to matter today. Until this morning most categories defaulted to a single module, so a Starter cap of 1 cost nobody anything. Now that 165 categories default to 2–3 modules, Starter genuinely constrains, and there is a real reason to upgrade. That is the first coherent monetisation pressure in the product — and it arrived before there were businesses to feel it.

**The gap that matters:** a business will pay for **customers**, not for tools. Studio, brand kits and modules are all supply-side value delivered before any demand exists. With 114 sessions in 14 days there is no ROI to show, so every subscription is sold on promise. Fix demand first; monetisation follows almost automatically.

---

# AFRICAN MARKET FIT

This is the strongest dimension of the product and deserves credit.

**Genuinely adapted:**
- Naira as the working currency throughout pricing and demo content, not a converted afterthought
- WhatsApp as a first-class contact channel with pre-filled, context-aware messages — the channel Nigerian customers actually open
- `tel:` call buttons given equal prominence, matching real phone-first behaviour
- Paystack with card, bank transfer, **USSD** and mobile money; Stripe only for international cards
- A local-day rule (`src/lib/dates.ts`) so "today" is correct at UTC+1 — a bug most platforms ship
- A taxonomy that includes POS & Agent Banking, Keke & Okada Services, Roadside Mechanic, Local Market Stall, Water Vendor, Buka / Local Eatery, Thrift & Second-hand (Okrika), Football Viewing Centre, Gele & Aso-Oke Styling, Block Industry & Cement. This is somebody who knows the market, not a translated US directory.
- Module shapes that fit informal trade: a walk-in **queue** for barbers rather than a dated appointment; **enquiry** for businesses that negotiate; **estimates** for trades that quote

**Not yet adapted:**
- **Data weight.** 193 KB gzip of JavaScript before anything renders, on connections and bundles where that is a real cost. There is no lightweight path and no offline state.
- **No public-holiday handling** — in a market with ~11 fixed holidays plus two moveable Eids, "Open now" will be confidently wrong on the highest-traffic days.
- **Businesses with social-only presence** are acknowledged in the taxonomy but there is no import path from an Instagram or Facebook page, which is where most Nigerian SME identity actually lives.
- **Low digital literacy** is not yet designed for: onboarding assumes a user who will complete a multi-field form. There is no "send us your details on WhatsApp and we build it" path, despite `/send-business` existing — and that is precisely how this market prefers to transact.

---

# UNFORESEEN RISKS

Twenty-four, ordered roughly by expected cost.

| # | Problem | Why it matters | Likelihood | Impact | Fix |
| --- | --- | --- | --- | --- | --- |
| 1 | Deploying while users browse breaks their session | Already happened twice in production | **High** (every deploy) | High | Auto-reload once on dynamic-import failure |
| 2 | 45 demo profiles may be indexable | Google would hold 45 fabricated businesses vs 2 real | Medium | **High** | Verify `noindex` on `/business/*` demo routes today |
| 3 | `signin` flood at scale | 670 writes/session × 10,000 sessions = 6.7M rows/month | High | High | Fix the emitter before growth, not after |
| 4 | PostgREST row cap silently truncates the directory | Search reports "no results" for businesses that exist — a correctness bug wearing an empty state | Medium (at ~1k listings) | **High** | Server-side pagination |
| 5 | Advertising rights | Naming real third-party sites with day rates | UNVERIFIED | **Severe** | Founder decision before any advertiser launch |
| 6 | "Open now" on Christmas / Eid | Wrong on the days customers most rely on it | **High** (annual, predictable) | High | Holiday calendar |
| 7 | `is_listable` is a generated column | If its formula changes, every listing can vanish or appear silently, with no audit trail | Low | **Severe** | Test asserting the formula; alert on count deltas |
| 8 | Username squatting against future routes | `/:username` is a catch-all; a business claiming `help`, `blog` or `pricing` shadows a future page | Medium | Medium | Enforce and expand the reserved-word list; add a test |
| 9 | Soft-404s from the username catch-all | A typo'd URL renders the SPA shell with homepage metadata; Google indexes it as a duplicate | High | Medium | Return a real 404 for unknown usernames in middleware |
| 10 | Anonymous insert flood | `profile_requests` / `waitlist` accept unauthenticated writes with no throttle; admins triage by hand | Medium | High | Rate limit + captcha-free heuristics |
| 11 | 3 of 11 accounts are admin | One compromised admin = total compromise | Medium | **Severe** | Demote to `editor`; require 2FA on admin |
| 12 | `create_orders` = 0 rows but 3 order events | The paid-conversion path may be failing silently — this codebase has hit the `insert().select()` RLS trap before | **High** | **High** | Reproduce an order end-to-end today |
| 13 | Role guard is trigger-only | A migration that recreates `users` silently restores escalation | Low | **Severe** | Add a column-restricted UPDATE policy as layer 2 |
| 14 | Live schema vs 106 migrations | Documented history of drift; nothing in CI checks it | **High** | High | Schema-diff check in CI |
| 15 | Two "saved" tables | `business_keeps` (1) and `favorites` (0) — a retention feature split across two schemas | High | Medium | Pick one, migrate, delete the other |
| 16 | WhatsApp deep links with a wrong number | Pre-filled message goes to a stranger; NowOpen looks careless | Medium | Medium | Validate/verify numbers before enabling the button |
| 17 | Founding-100 scarcity badge | A public numbered promise the platform must honour forever | Medium | Medium | Document what #1–100 actually receive |
| 18 | 4 `initiated` payments never reconciled | Money may have left a customer without being credited | Medium | **High** | Reconciliation job + webhook replay |
| 19 | `price_per_day` stored as text, no currency | ₦14 vs $14 vs ₦14,000 is a 1000× mispricing | Medium | High | Numeric column + explicit currency |
| 20 | Plan caps enforced client-side only | A business can exceed its plan via the API | Medium | Medium | Enforce in RLS or a definer function |
| 21 | `onAuthStateChange` writes on every tab focus | Battery and data cost on mobile, paid by the user | High | Low | Same fix as #3 |
| 22 | No soft-delete on `businesses` | Deleting a listing 404s every inbound link and loses accrued SEO equity | Medium | Medium | Soft-delete + 410/301 |
| 23 | 42 `noindex` example pages linked from the homepage | Spends crawl budget on pages that can never rank, on a domain with little authority to spend | Medium | Low | `rel="nofollow"` or move behind one hub link |
| 24 | Voice assistant and AI features on metered data | Discoverable features that silently consume a user's bundle | Low | Medium | Make cost explicit before first use |

---

# WHAT WE THINK WE HAVE VS WHAT WE ACTUALLY HAVE

| Claimed Capability | Actual State | Gap |
| --- | --- | --- |
| **Discovery** | 2 businesses, both the founder's, both `Media & Publishing` | No supply. 249 of 250 category filters return nothing. |
| **Open Now** | Correct for overnight, midnight, timezone, 24-hour. No holidays. Manual "closed" never expires. | Will be wrong on ~13 predictable days a year and permanently wrong for any owner who forgets a toggle. |
| **Business Profiles** | 🟢 Genuinely good. SSR'd, correct canonical, LocalBusiness + Organization schema, honest empty states, module strip. | Almost none exist. |
| **Claim Business** | Flow built; `business_claims` = 0 | Never exercised by a real claimant. UNVERIFIED. |
| **Keep** | `business_keeps` = 1, `favorites` = 0 | Split across two tables; effectively unused. No retention loop attached. |
| **Offers** | `business_offers` = 0 | Exists as schema and UI only. |
| **Studio** | 🟢 Real. 376 designs (47 layouts × 8 styles), self-hosted OFL fonts, contrast asserted by test, PNG/PDF export. | 1 `studio_export` event in 14 days. |
| **Brand Kit** | Built | UNVERIFIED end-to-end; no usage data. |
| **Design Studio** | 🟢 Working on production | Rule-based, not model-based — correctly so, but "AI" framing overstates it. |
| **Social Studio** | `social_connections` RLS-locked with zero policies | UNVERIFIED whether publishing works at all. |
| **Reel & Video Studio** | `business_streams` = 7 rows | Partially exercised. |
| **Advertising** | 97 rows, 89 "active", **0 owners**, real site names, text prices | Either unlicensed inventory or an unrecorded rights model. Blocking. |
| **Media Marketplace** | `media_services` = 0 | Does not exist in practice. Honest empty state shown. |
| **Creative Marketplace** | 0 creatives | Does not exist in practice. |
| **Analytics** | 43,125 events, of which 42,910 are one broken emitter | 99.4% noise. Dev writes to prod. Effectively no analytics. |
| **Admin Studio** | Broad surface; `audit_log` 83, `feature_flags` 12, `workforce_runs` 53 | Real, but every moderation path is manual and untested at volume. |
| **AI features** | `pollinations` for images; Studio is rule-based; no LLM in the product path | "Grow with AI" on the homepage overstates what ships. |

---

# P0 FIXES

*Do these before any promotion, in this order.*

1. **Verify the 45 demo profiles are `noindex` on production.** If they are not, Google is being offered 45 fabricated businesses. One curl each; ten minutes.
2. **Resolve the advertising-rights question.** 89 `active` placements naming real third-party sites. Either produce the agreements, or unpublish and remove them from the sitemap today.
3. **Reproduce a Create order end-to-end.** `create_orders` = 0 with 3 recorded order events is either a silently failing write or deleted data. This is the paid path.
4. **Gate telemetry on environment.** Fifteen minutes; restores error monitoring to usefulness.
5. **Fix the `signin` emitter.** One hour; stops 99.4% of analytics noise and unbounded write growth.
6. **Add chunk-load recovery.** Half a day; stops every deploy breaking live sessions.
7. **Stop `/businesses` and `/adverts/*` canonicalising to the homepage.** Either SSR them or remove them from the sitemap. Currently the site actively instructs Google to ignore 95% of itself.
8. **Correct the misleading claims** on the homepage and `/businesses`: the Behance/Figma/"real-time queue"/"live runway" taglines, "2 businesses across food, retail, tech…", and "Find Verified Businesses Across Africa" with one verified listing.
9. **Fix `NowOpen Media Ad Placeements`.** A typo in a live business name and URL.
10. **Demote the surplus admin accounts.** 3 of 11 users hold full platform authority.

---

# P1 FIXES

1. Server-side pagination and server-side filtering for the directory; add `pg_trgm` + a `tsvector` index. **Do this before supply arrives, not after.**
2. Public-holiday calendar for Open Now, plus a TTL on the manual `open_status` override.
3. Raise every touch target to 44×44, starting with the 35×35 mobile hamburger.
4. Rate-limit anonymous inserts on `profile_requests`, `waitlist`, `platform_enquiries`, `radar_candidates`.
5. Add a column-restricted `WITH CHECK` to the `users` UPDATE policy so role protection is not trigger-only.
6. Reconcile the 4 `initiated` payment intents; add a webhook-replay job.
7. Consolidate `business_keeps` and `favorites` into one table.
8. Return a real 404 from middleware for unknown usernames, to stop soft-404 indexing.
9. Show only categories that have listings.
10. Schema-diff check in CI against the 106 migrations.

---

# P2 IMPROVEMENTS

1. City × category landing pages (`/lagos/barbers`) — the actual organic acquisition strategy.
2. Code-split `jspdf` (377 KB) behind the export action.
3. Convert `advertisements.price_per_day` to numeric with an explicit currency column.
4. Soft-delete for `businesses` with 301/410 handling.
5. A WhatsApp-first onboarding path — "send us your details, we build the page" — matching how this market actually transacts.
6. Phone-number verification before enabling call/WhatsApp buttons.
7. Reserved-username enforcement with a test.
8. Drop the `NowOpen Africa` junk table.
9. Add an `editor` role tier in practice, not just in `is_staff()`.
10. Instrument the funnel that matters: search → profile view → contact click → booking.

---

# P3 FUTURE

1. External search service once past ~50,000 listings.
2. Instagram/Facebook import for social-only businesses.
3. Promoted listings via `listing_score`.
4. Offline shell / service worker for intermittent connectivity.
5. A genuinely lightweight mobile entry path (<50 KB) for low-end Android.
6. Review solicitation flow once there is transaction volume to solicit from.
7. Multi-location and team management, once a business exists that needs them.

---

# NEXT 24 HOURS

Maximum ten, highest impact only.

1. Curl the demo-profile routes; confirm `noindex`. **(10 min)**
2. Answer the advertising-rights question. Unpublish if unresolved. **(founder decision)**
3. Gate `telemetry.ts` on environment. **(15 min)**
4. Fix the `signin` emitter. **(1 hr)**
5. Attempt a Create order end-to-end and capture what happens. **(30 min)**
6. Add chunk-load auto-recovery. **(4 hr)**
7. Remove the 97 advert UUID URLs from the sitemap. **(20 min)**
8. Rewrite the four misleading copy blocks. **(1 hr)**
9. Rename the typo'd business + redirect. **(15 min)**
10. Demote surplus admins. **(10 min)**

---

# NEXT 7 DAYS

1. SSR every indexable route, or de-index what cannot be rendered.
2. Server-side pagination + filtering + search index for the directory.
3. Nigerian public-holiday calendar; TTL on `open_status`.
4. Touch targets to 44×44 across the app.
5. Rate limiting on all anonymous write paths.
6. Column-restricted `WITH CHECK` on `users`.
7. Consolidate the two saved-business tables.
8. Real 404s for unknown usernames.
9. Schema-diff CI check.
10. **Onboard 10 real businesses by hand, in one city, in one vertical.** This is the most important item on the list.

---

# NEXT 30 DAYS

1. **100 real businesses in one city.** Everything else is subordinate to this.
2. City × category landing pages, generated from real supply.
3. A retention loop worth returning for: offers, or "open now near me" notifications.
4. Rebuild analytics on clean data and define the five numbers that matter.
5. Verified phone numbers on every listing.
6. WhatsApp-first onboarding.
7. Prove one paid subscription conversion from a business that has seen real traffic.
8. Close the advertiser question properly — either real inventory with contracts, or remove the surface.

---

# NEXT 90 DAYS

1. 1,000 businesses across two or three cities.
2. Organic search delivering measurable customer traffic to profiles.
3. Demonstrable ROI for a business owner: "you got N calls this month."
4. Ten paying subscribers with retention data.
5. Search architecture ready for 100,000 listings.
6. Moderation tooling that survives 1,000 listings without a human reading each one.
7. Only then: reopen the creative marketplace with real supply.

---

# DO NOT BUILD

Explicitly, for now.

1. **More industry operating systems.** 42 exist for 2 businesses. Stop.
2. **More module shapes.** Eight cover all 250 categories and have taken zero bookings.
3. **More Studio modules.** 376 designs produced 1 export in 14 days. The 20-module roadmap should not start.
4. **The creative marketplace.** Zero supply. Building matching, briefs, quoting and payments for nobody is the most expensive way to learn nothing.
5. **Advertising campaign management.** Blocked on the rights question; irrelevant until resolved.
6. **AI copilots / more AI features.** "Grow with AI" already overstates what ships. Adding more widens the gap between claim and reality.
7. **Multi-location and team management.** `business_locations` = 0, `business_members` = 0.
8. **The mobile app's feature parity port.** The web product has no users; a second client doubles the surface without adding demand. (Note: the mobile module map is 140 categories behind — that is a *consistency* debt to record, not a reason to build.)
9. **The Visual Editor / page-content system.** `page_content` = 0 rows.
10. **Anything on the /platform roadmap** presented as "the full system we are building". It is a good sales artefact. It is not a build order.

---

# RECOMMENDED PRODUCT ARCHITECTURE

Only two architectural changes are genuinely required now.

**1. Move filtering to the server.** The directory should page, filter and search in Postgres — cursor pagination on `(listing_score DESC, created_at DESC)`, a `tsvector` column with a GIN index for text, `pg_trgm` for typo tolerance, and the existing `(location, category)` composite for facets. This is a contained change to one page and one query, and it must happen before supply arrives, because after that it becomes a migration under load.

**2. Make server rendering the default for public routes, not the exception.** Today `middleware.ts` opts *in* seven paths. Invert it: every public route renders server-side metadata unless explicitly excluded. The `marketingPageFor` machinery already works — it is a coverage problem, not a capability problem.

Everything else should be left alone. The module architecture, the RLS model, the definer-function pattern, the generated `is_listable` column, the design-token system and the test discipline are all sound. Do not rewrite them.

---

# RECOMMENDED UX DIRECTION

**Stop explaining the emptiness; start filling it in one place.**

The product's current honesty about having no listings is admirable and should be preserved — but the homepage devotes its centre to 42 cards saying "these are not businesses". That is an essay where a directory should be.

Concretely: pick **one city and one vertical**. Make the homepage answer "what can I find near me right now?" with real answers from that slice, even if it is fifteen barbers in Ikeja. Move the industry wall to a single link. Let the empty categories disappear rather than listing 250 filters against 2 listings. A directory that credibly serves one neighbourhood is worth far more than one that gestures at 42 industries and serves none.

For business owners the product is already good — the gap is proof, not features. Show a real number: views, calls, WhatsApp clicks. That is the only thing that will convert a subscription.

---

# RECOMMENDED GROWTH DIRECTION

The acquisition engine for a local directory is **city × category landing pages fed by real supply and reachable by Google**. Right now none of the three legs exist: there is no supply, no landing pages, and 95% of the site tells Google to ignore it.

Sequence, strictly:
1. Fix crawlability (days).
2. Recruit supply by hand in one slice (weeks) — WhatsApp-first, `/send-business` as the intake, and build the page for them.
3. Generate landing pages from that supply (days).
4. Only then spend on promotion.

Doing 4 before 1–3 wastes money on a site that cannot be indexed and has nothing to show.

---

# FOUNDER VERDICT

**1. Is NowOpen Africa genuinely useful today?**
To a business owner, yes — meaningfully so. To a customer, no. There are two businesses and both are yours.

**2. Would I personally use it instead of existing alternatives?**
Not yet as a customer; Google Maps has the supply. As a Nigerian SME wanting a professional web presence, booking page and brand assets without hiring anyone — yes, I would genuinely choose this over a Facebook page, and that is the wedge.

**3. Would I recommend it to a Nigerian business owner?**
Yes, with one caveat stated plainly: "this will give you a better page than you have now, but it will not yet bring you customers." Anything more is overselling.

**4. Would a business owner understand its value within 30 seconds?**
Partly. "Africa is NowOpen. Discover customers. Find businesses. Advertise everywhere. Create anything. Grow with AI." names five things and lands none. A business owner needs one sentence about what they get.

**5. Would customers return?**
No. There is nothing to return for — 1 keep, 0 offers, 0 reviews, no notifications worth receiving. Retention is the emptiest dimension in the audit and it is downstream of supply.

**6. Could this realistically reach 1,000 businesses?**
Yes, and the product would serve them well — but only by hand. Nothing in the current stack acquires supply on its own, and at 1,000 the unpaginated directory query starts to hurt.

**7. Could it realistically reach 100,000 businesses?**
Not on this architecture. Search, pagination and moderation all need to change first. None of those changes are hard; they are simply not done.

**8. What is the strongest thing about it?**
The seriousness. Honest empty states, no fabricated ratings, RLS on every table, 2,811 tests asserting product guarantees, a taxonomy that knows what a keke and an okrika bale are. This is built by someone who cares about being right. That is rare and it is the foundation everything else can stand on.

**9. What is its biggest weakness?**
It has been built as though supply were solved. The engineering is two years ahead of the business, and the gap is not closing by writing more code.

**10. What is the single most important thing to fix?**
Not a bug. **Get 100 real businesses in one city.** If forced to name a technical item: make the site crawlable, because that is the only mechanism by which supply turns into demand without spending money.

**11. What is the biggest strategic mistake we could make next?**
Building the creative marketplace, or the next ten Studio modules, or the mobile parity port. Every one of them adds surface to a product whose problem is that nobody is on it. The second-biggest mistake is promoting the advertising inventory before the rights question is answered — that is the one item here that could cause real-world harm rather than lost time.

**12. What could make NowOpen Africa genuinely category-defining?**
Being the platform where a Nigerian SME with no website and no digital literacy sends a WhatsApp message and gets, within an hour, a real business page that ranks for "barber in Ikeja", takes bookings, and prints business cards. Every piece of that exists in this codebase already — the profile, the modules, Studio, print, payments. What is missing is the WhatsApp front door and the crawlability that makes the ranking real. That combination is not something Google Maps, Yelp or Facebook can offer, and it is defensible precisely because it is unglamorous operational work in a market others will not do it for.

---

# FINAL SCORE

# NOWOPEN AFRICA: 5.1 / 10

*Major weaknesses — held down by emptiness, discoverability and scale-readiness, not by craft. The floor under this score is unusually solid; the ceiling depends entirely on whether the next 90 days are spent on supply rather than on software.*

---

## Companion documents

- `NOWOPEN_AFRICA_SCORECARD_2026-09-07.md`
- `NOWOPEN_AFRICA_P0_P1_REMEDIATION_2026-09-07.md`
- `NOWOPEN_AFRICA_UX_FINDINGS_2026-09-07.md`
- `NOWOPEN_AFRICA_TECHNICAL_FINDINGS_2026-09-07.md`

## Evidence appendix — how each headline number was obtained

| Claim | Method |
| --- | --- |
| 2 businesses, 11 users, 0 bookings | `supabase db query --linked` row counts across all 79 tables |
| 42,910 `signin` / 64 sessions | `select name, count(*), count(distinct session_id) from analytics_events group by name` |
| 105/111 sitemap URLs wrong | `curl -A "Googlebot/2.1"` on each page type, comparing `<title>` and `rel=canonical` |
| 89 active adverts, 0 owners | `select count(*) filter (where status='active'), count(distinct user_id) from advertisements` |
| RLS on all 79 tables | `pg_class.relrowsecurity` joined to `pg_policies` |
| Role guard present | `pg_get_functiondef` on triggers of `public.users` |
| No `service_role` key in bundle | decoded every JWT found in `dist/assets/*.js` |
| TTFB 71 ms, LCP 1,484 ms | `performance.getEntriesByType('navigation')` + `PerformanceObserver` on production |
| 30 touch targets <40px | `getBoundingClientRect()` over all interactive elements at 360×740 |
| 193 KB gzip entry | `gzip -c dist/assets/index-*.js \| wc -c` |
| No pagination | source read of `src/pages/Businesses.tsx:112-215` |
| Production client errors | `select props from analytics_events where name='client_error'` |
