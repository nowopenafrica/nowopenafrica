# NOWOPEN AFRICA — REMEDIATION BASELINE
**Date:** 2026-09-07 · **Starting score:** 5.1 / 10 · **Target:** the highest honestly-earned score

Every finding from `NOWOPEN_AFRICA_PLATFORM_AUDIT_2026-09-07.md` re-verified against the codebase and live production **before** any remediation work. Nothing here is carried over on trust.

---

## VERIFICATION RESULTS

| # | Finding | Re-verified | Evidence |
| - | --- | --- | --- |
| F1 | Telemetry has no environment gate | ✅ **STILL TRUE** | `grep "import.meta.env\|hostname\|localhost" src/lib/telemetry.ts` → **0 matches** |
| F2 | `signin` fires on every auth event | ✅ **STILL TRUE** | `AuthContext.tsx:80` — `if (event === 'SIGNED_IN') track('signin');` unchanged |
| F3 | No chunk-load recovery | ✅ **STILL TRUE** | no `retryLazy` / reload guard in `App.tsx` |
| F4 | Directory unpaginated | ✅ **STILL TRUE** | `grep "\.limit(\|\.range(" src/pages/Businesses.tsx` → **0 matches** |
| F5 | Only 7 paths server-rendered | ✅ **STILL TRUE** | 7 `path: '/'` entries in `marketingPageRender.ts` |
| F6 | Manual `open_status` never expires | ✅ **STILL TRUE** | no `open_status_set_at` anywhere in `openingHours.ts` |
| F7 | No public-holiday handling | ✅ **STILL TRUE** | `grep -i holiday src/lib/openingHours.ts` → **0 matches** |

---

## UNVERIFIED ITEMS — NOW RESOLVED

### ✅→🔴 U1. Demo profiles ARE indexable — **ESCALATED TO P0 #1**

The audit marked this UNVERIFIED. It is now **confirmed as a live critical defect.**

```
curl -A "Googlebot/2.1" https://www.nowopenafrica.com/business/lagos-prime-realty
  → robots = index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1
```
Same for `glow-beauty-lounge`, `lifeline-medical-centre`, `ace-auto-motors`. **All 45 demo profiles are crawlable and indexable.**

**Root cause — and it is not a missing `noindex`.** `src/pages/BusinessDetail.tsx:374` correctly sets `robots: 'noindex, nofollow'`, with a comment stating "noindex is what keeps demo data out of search results, and it stays." But that is applied **client-side by `applySeo`**. The `/business/<slug>` route is *not* server-rendered — `middleware.ts` handles the 7 marketing paths plus bare `/:username`, so `/business/*` falls through to the static `index.html`, which ships `index, follow`. A crawler that does not execute JS never sees the `noindex`.

**Newly discovered while verifying this:** `/business/<slug>` is a **legacy alias**. `App.tsx:148-149` declares both `/business/:username` (kept for backwards compatibility) and `/:username`. Measured:

| URL | Title to crawler | Canonical | Verdict |
| --- | --- | --- | --- |
| `/yemzoarts` | "YemzoArts Studios — Media & Publishing…" | `/yemzoarts` | ✅ canonical form |
| `/business/yemzoarts` | **homepage title** | **`/`** | ❌ legacy alias, unrendered |

So the legacy path is *also* generating duplicate-content signals for real businesses. One fix addresses both.

**Correct remedy:** emit `noindex, nofollow` **server-side** for `/business/*`. Deliberately **not** a `robots.txt` `Disallow` — disallowing prevents crawling, which prevents Google from ever seeing a `noindex`, so any already-indexed demo page would linger indefinitely. Serving `noindex` on a crawlable URL is the mechanism that actually removes pages from an index.

### 🔵 U2. Advertising rights — **UNRESOLVED, founder-gated**
97 rows, 89 `status='active'`, `user_id` NULL on all 97, naming real third-party sites. **Cannot be resolved programmatically and must not be guessed.** Remediation will build the provenance model the data lacks and move unverifiable rows to a non-public state — without deleting them and without fabricating verification.

### 🔵 U3. Order flow — **investigating in P0**
`create_orders` = 0 rows; `analytics_events` holds 2 × `create_order_requested`, 1 × `create_order_accepted` (2026-09-06). To be traced, not assumed.

---

## FINDINGS THAT ARE NO LONGER VALID

Recorded so remediation does not "fix" what is already correct.

| Finding | Status |
| --- | --- |
| `api/` and `middleware.ts` typechecked by nothing | ✅ **FIXED earlier today** — `tsconfig.server.json` added and chained into `npm run typecheck`; verified non-vacuous by planting a deliberate error |
| `api/discovery.ts` type error in the Vercel build log | ✅ **FIXED** — `Row.open_status` narrowed to `'open' \| 'closed' \| null` |
| `/platform` presented roadmap features with green ticks | ✅ **FIXED earlier today** — derived "Working today" block; roadmap chips carry a neutral marker |
| Create page rendered dead filters over an empty set | ✅ **FIXED earlier today** — gated on `marketplaceEmpty` |
| 140 categories with no transactable module | ✅ **FIXED earlier today** — all 250 mapped; 165 multi-module |
| Extra modules unreachable in the renderer | ✅ **FIXED earlier today** — "More you can do here" strip |
| Demo profiles carried fabricated ratings / trust scores | ✅ **FIXED in an earlier session** — 90 fabricated `rating`/`verified` values removed; permanent banner added |
| `/api/discovery` is an unauthenticated data API | ❌ **MISREAD IN AUDIT** — it is the SSR renderer for `/discover` and returns HTML, not JSON. Not a scraping surface. Correcting the record. |

---

## NEWLY DISCOVERED IN THIS RE-AUDIT

| # | Finding | Severity |
| - | --- | --- |
| N1 | `noindex` for demo profiles exists in code but never reaches crawlers (client-side only) | 🔴 **P0** |
| N2 | `/business/*` legacy alias serves homepage metadata + canonical `/` for **real** businesses too — duplicate-content signal | 🟠 P1 |
| N3 | `robots.txt` does not cover `/business/`, so nothing currently limits demo-profile crawling | 🔴 folded into P0 #1 |

---

## SCOPE DISCIPLINE FOR THIS PROGRAMME

Carried forward from the mandate and from the audit's own `DO NOT BUILD` list. Recorded here so it can be checked at the end:

- **No new features.** Not one.
- No new industry systems (42 exist for 2 businesses).
- No new module shapes (8 cover all 250 categories; 0 bookings taken).
- No Studio expansion (376 designs → 1 export in 14 days).
- No creative marketplace (0 supply).
- No mobile parity port.
- No AI additions.
- **No fabricated data of any kind** — no businesses, reviews, ratings, verification, ad rights, users or metrics.

## PRODUCTION DATA CHANGES REQUIRE EXPLICIT APPROVAL

Four remediation items alter live production data rather than code. They are **listed for approval, not executed unilaterally**, because they are hard to reverse or could lock a person out:

1. Renaming `NowOpen Media Ad Placeements` (+ slug redirect)
2. Demoting 2 of the 3 admin accounts
3. Dropping the junk `NowOpen Africa` table (462 rows)
4. Purging the 42,910 junk `signin` rows

Code fixes proceed immediately; these wait.

---

## BASELINE MEASUREMENTS

Captured now, to be compared after remediation.

| Metric | Baseline |
| --- | --- |
| Overall audit score | **5.1 / 10** |
| Tests | 210 files / 2,811 assertions |
| Lint errors | 0 |
| Sitemap URLs with correct crawler metadata | **6 of 111** |
| Demo profiles indexable | **45 of 45** ❌ |
| Analytics signal-to-noise | 215 real events / 43,125 total = **0.5%** |
| Directory query row limit | **none** |
| Full-text / trigram index on `businesses` | **none** |
| Touch targets <40px on a business profile | **30** |
| Entry bundle (gzip) | 193 KB |
| Homepage LCP (fast connection) | 1,484 ms |
| Businesses in production | **2** |
| Public-holiday handling | **none** |
