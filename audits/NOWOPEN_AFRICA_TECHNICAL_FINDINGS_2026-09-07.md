# NOWOPEN AFRICA — TECHNICAL FINDINGS
**Audit Date:** 2026-09-07 · Companion to `NOWOPEN_AFRICA_PLATFORM_AUDIT_2026-09-07.md`

Evidence from live production SQL, crawler probes, in-browser instrumentation of the deployed site, and static analysis. **No code was modified.**

---

# 1 · SYSTEM MAP

| Area | Files | Lines |
| --- | --: | --: |
| `src/components` | 234 | 51,148 |
| `src/lib` | 165 | 37,353 |
| `src/pages` | 41 | 16,726 |
| `supabase/migrations` | 106 | 9,166 |
| `src/data` | 49 | 5,373 |
| `src/hooks` | 12 | 1,683 |
| `api` (serverless) | 6 | 910 |
| **Total (excl. tests)** | **613** | **~122,000** |
| Tests | 210 files | 2,811 assertions |
| Routes | 50 | — |

**Stack:** React 18 · Vite 7 · TypeScript · Tailwind · React Router 7 · Supabase (Postgres + Auth + Storage + Realtime) · Vercel (edge middleware + serverless) · Paystack + Stripe.

**Quality gates:** `npm run verify` = typecheck → lint → CSP check → API-import check → migration check → placement check → 2,811 tests. Currently green, 0 lint errors.

---

# 2 · PRODUCTION DATA REALITY

79 tables. Full row counts:

| Rows | Table | Note |
| --: | --- | --- |
| 43,125 | `analytics_events` | **42,910 are one broken emitter** |
| 462 | `NowOpen Africa` | **junk** — a pasted migration script |
| 97 | `advertisements` | 89 `active`, **0 owners** |
| 97 | `login_events` | |
| 83 | `audit_log` | working |
| 54 | `african_countries` | reference |
| 53 | `workforce_runs` | automation is running |
| 15 | `payment_intents` | 2 paid / 4 initiated / 9 lead |
| 12 | `feature_flags`, `notifications` | |
| 11 | `users` | **8 business, 3 admin, 0 consumer** |
| 11 | `business_gallery` | |
| 9 | `business_services` | |
| **2** | **`businesses`** | **both the founder's** |
| 2 | `waitlist`, `keep_sends` | |
| 1 | `business_keeps`, `deletion_requests`, `profile_requests`, `founding_members` | |
| **0** | `business_bookings`, `business_reviews`, `business_products`, `business_offers`, `business_claims`, `business_enquiries`, `business_locations`, `business_members`, `business_reports`, `create_orders`, `media_services`, `media_reviews`, `favorites`, `platform_enquiries`, `radar_candidates`, `page_content`, `device_push_tokens`, `import_batches` | **18 core tables empty** |

**The two businesses:**
```
YemzoArts Studios          | Media & Publishing | claimed | verified: true  | has hours
NowOpen Media Ad Placeements| Media & Publishing | claimed | verified: false | has hours
```
Note the live typo: `Placeements`, which also forms the URL slug.

**14 days of traffic:** 114 sessions, 2 identified users, 108 `business_viewed`, **2 `search_performed`**.

---

# 3 · SECURITY

## Passes — verified directly

| Check | Result |
| --- | --- |
| RLS enabled | **all 79 public tables** |
| Tables with 0 policies | 4 — `NowOpen Africa`, `private_config`, `social_auth_pending`, `social_connections`. RLS on + no policies = **deny-all**. Correct. |
| `is_admin()` / `is_staff()` | `STABLE SECURITY DEFINER` with `SET search_path TO 'public'` — not vulnerable to search-path injection |
| Storage buckets | `verification-docs` **private**, `create-artwork` **private**; `business-images`, `hero-videos`, `social-media` public |
| Secrets in client bundle | Every JWT in 4.3 MB of `dist/assets/*.js` decoded to **`"role":"anon"`**. **No `service_role` key.** No `sk_live`/`sk_test`. |
| Role escalation | Blocked — see below |

## The role-escalation finding, in full

The RLS policy is permissive:
```sql
-- UPDATE, "Users can update own profile"
USING (auth.uid() = id)    -- no WITH CHECK, no column list
```
In Postgres, an UPDATE policy with only `USING` applies that expression as the check too. Read alone, this permits `update({ role: 'admin' })` on your own row.

**It is mitigated at the trigger layer.** Production carries:
```sql
CREATE FUNCTION public.guard_user_role_column() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_admin() THEN
    NEW.role := OLD.role;
  END IF;
  RETURN NEW;
END $$;
```
plus `guard_user_plan_columns` doing the same for `plan`, `creative_plan`, `plan_status`, `plan_billing_cycle`, `plan_renews_at`, `plan_updated_at`.

**Verdict: NOT exploitable.** 🟡 **MEDIUM residual risk** — protection is trigger-only, so a migration that recreates `users` or drops the trigger silently restores escalation, and no test would catch it. Add a column-restricted `WITH CHECK` as a second layer.

## Remaining security findings

| Severity | Finding |
| --- | --- |
| 🟡 MEDIUM | **No rate limiting anywhere.** No `429`, `Retry-After` or throttle logic in `api/` or `middleware.ts`. 10 rapid unauthenticated requests to `/api/discovery` → 10 × `200`. `profile_requests`, `waitlist`, `platform_enquiries`, `radar_candidates` accept anonymous inserts by design; an attacker can flood tables that a human admin triages by hand. |
| 🟡 MEDIUM | **3 of 11 accounts are full admins (27%).** `is_staff()` already supports an `editor` role; it is unused. One compromised admin = total compromise. |
| 🟢 LOW | **Plan caps are client-side only.** `MODULE_LIMITS` is enforced in `BusinessForm`; nothing stops a direct API call exceeding it. Revenue leakage, not a breach. |
| 🟢 LOW | Junk table `NowOpen Africa` holding a migration script. Not exposed, but migration text describes security structure and should not sit in production. |
| 🔵 UNVERIFIED | Edge-function authorisation for social publishing. `social_connections` / `social_auth_pending` are RLS-locked with zero policies, so publishing must run as `service_role`; that function's own auth was not audited. |
| 🔵 UNVERIFIED | Whether the 45 demo profiles return `noindex` in production. |

**No CRITICAL or HIGH security findings.**

---

# 4 · SEO — MEASURED

`curl -A "Googlebot/2.1"`, comparing `<title>` and `rel=canonical`:

| URL | Title seen by crawler | Canonical | |
| --- | --- | --- | --- |
| `/` | correct | `https://nowopenafrica.com` | ✅ |
| `/platform` | "Industry Operating Systems — NowOpen Africa" | `/platform` | ✅ |
| `/yemzoarts` | "YemzoArts Studios — Media & Publishing in Ikotun, Lagos Nigeria" | `/yemzoarts` | ✅ 2× ld+json |
| `/businesses` | **homepage title** | **`/`** | ❌ |
| `/media` `/pricing` `/founder` `/contact` `/terms` `/privacy` `/adverts` | **homepage title** | — | ❌ |
| `/adverts/<uuid>` × 97 | **homepage title** | **`/`** | ❌ |

**Root cause** — `src/lib/marketingPageRender.ts` `MARKETING_PAGES` contains exactly 7 paths:
```
/  /about  /discover  /nominate  /platform  /send-business  /waitlist
```
plus `/:username` handled separately. Everything else serves static `index.html` with the homepage's baked-in metadata. `applySeo` fixes it client-side, which crawlers may not execute on first pass.

**Sitemap:** 111 URLs = 12 static + 2 businesses + **97 advert UUIDs**. So 87% of the sitemap is opaque, keyword-free UUID URLs that canonicalise to `/`. Submitting a URL while canonicalising it elsewhere is a contradictory signal that suppresses domain-wide trust.

**Also:** `/discover`, `/nominate`, `/send-business` are correctly SSR'd but **absent from the sitemap**. There are **no city pages and no category pages** — for a local directory that is the entire organic strategy, missing. Canonical host is inconsistent (`nowopenafrica.com` vs `nowopenafrica.com/`, and `robots.txt` points at non-`www` while the site aliases `www`).

🟢 `robots.txt` correctly disallows `/admin`, `/admin-creator`, `/dashboard`, `/profile`, `/security`, `/studio`, `/register`, `/login`, `/digital-forms`, `/reset-password`, `/forgot-password`.

---

# 5 · SCALABILITY — THE DIRECTORY QUERY

`src/pages/Businesses.tsx:112`:
```ts
const { data, error } = await supabase.from('businesses').select('*')
  .eq('is_listable', true)
  .order('listing_score', { ascending: false })
  .order('created_at', { ascending: false });
```
**No `.limit()`. No `.range()`.** Then, lines 202–215, every filter runs in the browser:
```ts
if (categoryFilter)  filtered = filtered.filter(b => matchesCategory(b, categoryFilter));
if (activeGroupObj)  filtered = filtered.filter(...);
if (locQuery)        filtered = filtered.filter(b => normalize(b.location ?? '').includes(locQuery));
                     filtered = filtered.filter(...)          // text search
                     filtered = filtered.filter(matchStatus); // open/closed
```

**Live indexes on `businesses`:**
```
businesses_pkey                  btree (id) UNIQUE
businesses_username_unique       btree (lower(username)) UNIQUE
idx_businesses_open_status       btree (open_status) WHERE open_status IS NOT NULL
idx_businesses_external_id       btree (external_id) UNIQUE WHERE ...
idx_businesses_claim_status      btree (claim_status)
idx_businesses_city_category     btree (location, category)
idx_businesses_listable          btree (is_listable) WHERE is_listable
idx_businesses_directory_order   btree (listing_score DESC, created_at DESC)
```
Well chosen for the access patterns — but **no `tsvector`/GIN and no `pg_trgm`**. Substring search cannot use any of them.

| Scale | Outcome |
| --- | --- |
| 2 (today) | Fine |
| 1,000 | Multi-MB response; every filter re-scans in the browser |
| 10,000 | Unusable on Nigerian mobile data |
| 100,000 | PostgREST row cap **silently truncates**; search reports "no results" for businesses that exist — a correctness failure presenting as an empty state |

This must be fixed **before** supply arrives, not after.

---

# 6 · ANALYTICS — TWO DEFECTS

### 6.1 `signin` fires ~670× per session 🟠 HIGH
```
signin                    42,910 events /  64 sessions   2026-08-24 → 09-07
business_viewed              108 events /  58 sessions
client_error                  71 events /  25 sessions
template_picked               11 /  2
campaign_view                  6 /  1
business_contact_clicked       5 /  4
profile_request_started        4 /  3
profile_requested              3 /  2
search_performed               2 /  2
create_order_requested         2 /  2
create_order_accepted          1 /  1
studio_export                  1 /  1
```
`src/contexts/AuthContext.tsx:80` — `if (event === 'SIGNED_IN') track('signin');`. Supabase emits `SIGNED_IN` on token refresh and tab focus, not only on authentication. **99.4% of the analytics table is noise**, and writes scale with sessions rather than signups.

### 6.2 Development writes into the production table 🟠 HIGH
`src/lib/telemetry.ts` contains no environment gate — no `import.meta.env`, no hostname check. Production `client_error` rows include:
```
ReferenceError: placeInput is not defined     at Discover (http://localhost:5175/src/pages/Discover.tsx…)
ReferenceError: useEffect is not defined      at ListingExplorer (http://localhost:5173/…)
ReferenceError: PRIMARY_NAV is not defined    at Navigation (http://localhost:5175/…)
Cannot access 'fromUrl' before initialization at DesignStudio (http://localhost:5175/…)
ReferenceError: capabilityFrom is not defined at VoiceAssistant (http://localhost:5173/…)
```
All dev-time mistakes, none reachable in production. Real incidents are buried beneath them.

### 6.3 Genuine production errors, extracted
Two real, and one unexplained:
```
react-boundary  /business/lagos-prime-realty
  Failed to fetch dynamically imported module:
  https://www.nowopenafrica.com/assets/BusinessDetail-D6o_2ziK.js

react-boundary  /yemzoarts
  'text/html' is not a valid JavaScript MIME type.

window.onerror  /            × 9
  Can't find variable: EmptyRanges
  stack: played@ | syncControl@ | handleEvent@        ← WebKit <video>?  UNVERIFIED
```
The first two are the same root cause: a browser holding the previous `index.html` requests a content-hashed chunk that no longer exists; the SPA fallback serves `index.html`, which the browser refuses as JavaScript. **There is no chunk-load recovery, no service worker and no version check** — `src/components/ErrorBoundary.tsx:43` offers only a manual reload button. With six deploys in one day, any user browsing during a deploy is affected. The second occurrence is on the founder's own live business page.

---

# 7 · PERFORMANCE

Production, warm cache, fast connection, Chromium desktop:

| Metric | Value |
| --- | --- |
| TTFB | **71 ms** |
| DOMContentLoaded | 263 ms |
| `loadEventEnd` | 264 ms |
| **LCP** | **1,484 ms** |
| Requests | 45 |
| Transfer (warm) | 319 KB |

Build output:

| Chunk | Raw | Gzip |
| --- | --: | --: |
| `index-BiXrs2q_.js` | 631 KB | **193 KB** |
| `ContentFactory` | 464 KB | 132 KB |
| `jspdf.es.min` | 377 KB | 126 KB |
| `AdminCreator` | 360 KB | 83 KB |
| `Studio` | 315 KB | 74 KB |
| `BusinessDetail` | 309 KB | 57 KB |
| **`dist/assets`** | **4.3 MB across 118 chunks** | |

Vite warns: *"Some chunks are larger than 500 kB after minification."*

**Assessment:** edge delivery is excellent and Core Web Vitals pass *under these conditions*. The caveat matters — 193 KB gzip before first render, paid from the user's data bundle, is heavy for the target market, and `jspdf` (377 KB raw) should load only when a PDF is actually exported. **Throttled 3G, low-end Android and concurrent load are all UNVERIFIED**; the "10,000 simultaneous users" question is bounded by §5, not by the frontend.

---

# 8 · "OPEN NOW" — CORE DIFFERENTIATOR

`src/lib/openingHours.test.ts` coverage by keyword:

| Case | Assertions |
| --- | --: |
| overnight | 6 ✅ |
| midnight | 6 ✅ |
| timezone | 5 ✅ |
| 24-hour | 1 ✅ |
| **public holidays** | **0** ❌ |
| **temporary closure** | **0** ❌ |
| **override staleness** | **0** ❌ |
| DST | 0 — *not applicable; Nigeria is WAT with no DST* |

**Defect — manual override never expires.** `src/lib/openingHours.ts:438`:
```ts
if (b.open_status === 'closed') { … }        // short-circuits the schedule
…
if (b.open_status === 'open') return { kind: 'open', label: 'Open now', detail: '' };
```
No timestamp comparison, and no `open_status_updated_at` column exists. An owner who marks themselves closed once appears permanently closed, with no signal to them or to a customer.

**Defect — no holiday calendar.** Nigeria has ~11 fixed public holidays plus two moveable Eids. On those days the platform's headline promise will be confidently wrong, at the moment customers rely on it most.

---

# 9 · DATA ARCHITECTURE

**Right:**
- RLS on all 79 tables, `SECURITY DEFINER` helpers with pinned `search_path`
- `is_listable` as a **generated column** — visibility cannot drift from its inputs
- Unique index on `lower(username)` — blocks case-variant squatting
- Partial index on `is_listable WHERE is_listable` — correct shape for the hot query
- Composite `(location, category)` — exactly the directory's access pattern
- `audit_log` (83 rows) and `feature_flags` (12) exist and are used
- `african_countries` (54) and `ref_locations` / `ref_categories` as reference data

**Wrong or missing:**
| Issue | Consequence |
| --- | --- |
| No `tsvector`/GIN, no `pg_trgm` | Search cannot use an index; no typo tolerance |
| No pagination in the directory path | See §5 |
| `advertisements.price_per_day` is **text**, no currency column | `14` could be ₦14, $14 or ₦14,000 — a 1000× mispricing risk |
| `advertisements.user_id` NULL on all 97 rows | Inventory has no owner, no availability window |
| `business_keeps` (1) **and** `favorites` (0) | One concept, two schemas |
| Junk table `NowOpen Africa` (462 rows) | Hygiene |
| 106 migrations, no CI schema-diff | Documented history of live-vs-repo drift, unguarded |
| `business_locations` (0), `business_members` (0) | Multi-location and team features **UNVERIFIED** |

**Also flagged:** `is_listable` being generated is a strength *and* a concentrated risk — if its formula changes, every listing can appear or vanish silently. It deserves an explicit test on the formula and an alert on large count deltas.

---

# 10 · BUILD, CI AND TOOLING

- `npm run verify` chains typecheck → lint → CSP → API-import → migration → placement → 2,811 tests. Green.
- **A gap closed earlier today:** `tsconfig.app.json` includes only `src`, and `tsconfig.node.json` only `vite.config.ts` — so `api/` (6 serverless functions) and `middleware.ts` were typechecked by **nothing**. `verify` passed clean while the Vercel build log carried real type errors in those files non-fatally, because esbuild strips types rather than checking them. A genuine bug in a serverless function would have shipped silently. `tsconfig.server.json` now covers them and is chained into `typecheck`; it was verified non-vacuous by planting a deliberate error.
- **Residual:** Vercel typechecks `middleware.ts` under its own `node16` config and reports `TS2835` (relative import needs an explicit extension). The import is correct for Vercel's bundler — `/platform` returns a server-rendered `og:title` that only `marketingPageFor` can produce, proving the middleware runs. Adding `.js` to silence a log line risks breaking a working production path.
- **Missing:** no CI schema-diff against the 106 migrations; no bundle-size budget; no Lighthouse/CWV gate.

---

# 11 · WHAT COULD NOT BE VERIFIED

Stated explicitly so no assumption is read as fact.

1. Whether the 45 demo profiles return `noindex` in production
2. Whether NowOpen holds rights to the 89 named advertising placements
3. Why `create_orders` is empty despite 3 recorded order events
4. Booking submission end to end (`business_bookings` = 0 — the 8 module shapes have never served a real customer)
5. Claim-a-business flow (`business_claims` = 0)
6. Multi-location and team management (`business_locations` = 0, `business_members` = 0)
7. Social publishing (`social_connections` RLS-locked; edge-function auth not audited)
8. Admin moderation at volume — there is no volume
9. Throttled 3G, 320px, low-end Android, intermittent connectivity
10. Concurrent load behaviour
11. The Safari `EmptyRanges` homepage error (9 production occurrences, not reproducible in Chromium)
12. Whether the 4 `initiated` payment intents represent lost money
13. Email and WhatsApp onboarding delivery (`onboarding_deliveries` = 0)

---

# 12 · TECHNICAL VERDICT

The engineering is not what is holding this product back. Security fundamentals are strong and were tested, not assumed: RLS on every table, definer functions with pinned search paths, private buckets for sensitive documents, no service key in the bundle, and a working defence-in-depth mitigation on the one privilege-escalation path in the policy layer. Test discipline is unusual for the stage, and the tests assert product guarantees rather than only unit behaviour.

Three technical defects genuinely matter, and all three are cheap:
1. **Stale chunks break live sessions on every deploy** — half a day to fix, already happening in production.
2. **Analytics is 99.4% noise with no environment separation** — about an hour, and it restores the only instrument for judging the business.
3. **The directory has no pagination and no search index** — about a week, and it must happen before supply arrives rather than after.

One technical defect is strategic rather than tactical: **105 of 111 sitemap URLs tell Google to ignore them.** The SSR machinery exists and works correctly for business profiles; it simply was never extended. That is the mechanism by which supply becomes demand without spending money, and it is currently disconnected.

Everything else in this document is either already sound or a consequence of having two businesses rather than two thousand.
