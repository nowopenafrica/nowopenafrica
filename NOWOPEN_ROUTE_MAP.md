# NowOpen Africa — Route Map

**Date:** 1 September 2026
**Purpose:** the record §28 requires before any public route changes. Every
public URL, its rendering mode, and whether it is in the sitemap.

**Rule this document exists to enforce:** no established public URL changes
without a permanent redirect recorded here. Business profiles at `/:username`
are the platform's ranking asset and its most-shared link. They do not move.

---

## Rendering modes

| Mode | Meaning |
|---|---|
| **SSR** | Server-rendered HTML with metadata and JSON-LD, via `api/business/[slug].ts`, selected by `middleware.ts` on crawler user-agent |
| **SPA** | Client-rendered. A crawler receives the app shell and a generic `<title>` |
| **FN** | Serverless function response, not an app route |

---

## Public routes

| Route | Mode | Sitemap | Notes |
|---|---|---|---|
| `/` | SPA | yes | Architectural decision. Product entry point |
| `/businesses` | SPA | yes | Directory index. **Should be SSR** |
| `/businesses/in/:place` | SPA | yes (4 of 8 cities) | **Priority 1 for SSR** |
| `/businesses/:category/in/:place` | SPA | no | **Priority 1 for SSR.** Not currently submitted |
| `/businesses/:id` | SSR | no | UUID form. Canonical points at `/:username` |
| `/:username` | **SSR** | yes (32) | **The ranking asset. Do not move** |
| `/discover` | SPA | yes | **Should be SSR** |
| `/open-now` | SPA | yes | **Should be SSR** — the signature capability |
| `/offers` | SPA | yes | SSR once offers exist (currently 0) |
| `/keeps` | SPA | no | Correctly excluded — personal |
| `/nearby` | SPA | no | Correctly excluded — device-dependent |
| `/adverts` · `/adverts/:id` | SPA | yes (~120) | Ad placements |
| `/media` · `/media/:id` | SPA | yes | Media services |
| `/founding` | SPA | no | Founding hub |
| `/campaign/founding-1000` | SPA | no | **Canonical campaign URL** |
| `/founding-1000` | SPA | no | Alias → canonical via `applySeo` |
| `/join` | SPA | no | Alias → canonical. Short URL for posters/QR |
| `/platform` · `/os` | SPA | yes | Industry systems |
| `/pricing` · `/about` · `/contact` · `/founder` | SPA | yes | Marketing |
| `/terms` · `/privacy` | SPA | yes | **Only 2 of 11 legal documents exist** |
| `/waitlist` · `/forms` · `/digital-forms` | SPA | partial | |
| `/r/:id` | FN | no | Reel share — server-rendered preview |
| `/live/:id` | FN | no | Live share — server-rendered preview |
| `/sitemap.xml` | FN | — | 175 URLs, anon-key reads |

## Authenticated routes

`/login` · `/register` · `/forgot-password` · `/reset-password` · `/profile` ·
`/security` · `/dashboard` · `/studio` · `/admin` · `/admin-creator`

All SPA, all correctly absent from the sitemap.

---

## The reserved-segment contract

`middleware.ts` rewrites any **single-segment** path to the business-profile
renderer when the request is from a crawler. A single-segment app route missing
from `RESERVED` therefore 404s for crawlers — which removes it from search **and
kills the WhatsApp/Facebook link preview**.

This happened: `/join` and `/founding-1000` shipped and both returned 404 to
Googlebot in production. Fixed, and a test now reads `App.tsx` and requires
every single-segment route to be reserved, so the next route added cannot repeat
it.

**Any new single-segment public route must be added to `RESERVED`.** The test
enforces it; this is the explanation of why.

---

## Planned additions

No existing URL changes. All additive, so no redirects are required.

| New route | Mode | Indexed when |
|---|---|---|
| `/businesses/in/:place` | SPA → **SSR** | ≥5 listable businesses in that place |
| `/businesses/:category/in/:place` | SPA → **SSR** | ≥5 listable businesses in that pair |
| `/discover` · `/open-now` | SPA → **SSR** | always |
| `/categories/:category` | new, SSR | ≥5 listable businesses |
| `/stories` · `/stories/:slug` | new, SSR | on publish |
| `/press` | new, SSR | always |
| `/help` | new, SPA | always |

**The quality threshold is deliberate.** §29 forbids thin pages, and Google's
current guidance rewards non-commodity content. A city+category page with two
listings, neither of which publishes hours, is a thin result for the exact query
it would rank for. The threshold is configurable and defaults to 5.

---

## Redirects

**None yet.** Nothing in this plan moves an existing URL.

If that changes, each row gets: old URL · new URL · status (301) · canonical ·
date · internal links updated · sitemap updated. Google's site-move guidance
requires the mapping and sustained redirects; this table is where that mapping
lives.

---

## Do not

- Move or rename `/:username`. It is the shared link and the ranking asset.
- Add a single-segment route without adding it to `RESERVED`.
- Submit a URL to the sitemap that returns the app shell to a crawler — that is
  volunteering a near-duplicate.
- Index a city or category page below the content threshold.
- Change `middleware.ts`'s matcher without re-running `crawlerRouting.test.ts`.
