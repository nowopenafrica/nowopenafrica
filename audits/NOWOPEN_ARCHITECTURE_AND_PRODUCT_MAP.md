# NowOpen Africa — Architecture and Product Map

**Date:** 2026-09-14. Read from source and from the live database, not inferred
from filenames.

---

## 1. Stack

| Layer | Choice |
|---|---|
| Build | Vite 7.3.6, React 19 + TypeScript, react-router 7 |
| Hosting | Vercel. **Deploys via `npx vercel --prod`, not git push** |
| Data | Supabase (Postgres + RLS + Storage + Edge Functions) |
| Server rendering | Vercel functions under `api/`, routed by `middleware.ts` |
| Tests | Vitest — 292 files, 4,057 tests |
| Gates | `npm run verify` = typecheck → lint → CSP → events → api-imports → migrations → placements → test |

One Supabase project serves **both development and production**. Every
`npm run dev` writes to live data.

---

## 2. How a visitor moves through it

```
/                      hero + ListingExplorer (businesses | adverts | media)
  /discover            rails: Open right now, For you, New on NowOpen, Top rated, Hidden gems
  /businesses          directory + filters
    /businesses/in/:place              location page (server-rendered for crawlers)
    /businesses/:category/in/:place    category × location
  /:username           the business profile — the product's centre
  /adverts             advertising placements
  /media               creative services
  /keeps               saved businesses
  /open-now /nearby /offers
```

Authenticated:

```
/register /login → /dashboard    owner: businesses, adverts, media, insights
                 → /admin        staff console (23 tabs)
                 → /profile      account
```

Acquisition entry points: `/send-business` (an owner submitting), `/nominate`
(a customer suggesting), `/waitlist`, `/join`.

---

## 3. The two rendering paths, and why both exist

A human gets the SPA shell (7.6KB) and React boots.

A **crawler** is rewritten by `middleware.ts` to a Vercel function that
server-renders real HTML — `api/business/[slug].ts` for profiles,
`api/discovery.ts`, `api/sitemap.xml.ts`, `api/marketing.ts` for the hubs.
This is dynamic rendering, not cloaking: the content is the same, the HTML is
pre-built.

**This is the single easiest thing to misdiagnose in this codebase.** A plain
`curl` of any route returns the same 7,579-byte shell with the same title, and
looks like a catastrophic SEO failure. It is not. Send a bot UA:

```bash
curl -sL -A "Mozilla/5.0 (compatible; Googlebot/2.1)" https://www.nowopenafrica.com/<slug>
```

`vercel.json` contains no rewrite for profiles — the routing lives in
`middleware.ts`.

---

## 4. How business data is stored

`businesses` — 72 columns, 3,059 rows, all listable, 2 claimed.

Identity and contact: `name, username, category, secondary_categories[],
subcategory, location, address, phone, whatsapp, email, website`.

Story: `tagline, about, story, mission, vision, why_us(jsonb), core_values(jsonb),
faqs(jsonb), team(jsonb), credentials(jsonb), policies(jsonb),
languages(jsonb), payment_methods(jsonb), social_links(jsonb), founded_year,
employees, business_type, service_area`.

Availability: `opening_hours, hours, timezone, open_status, availability_mode,
is_24_hours, is_24_hours_confirmed, opens_on_holidays, extra_holidays`.

Provenance: `source_name, source_url, source_record_id, source_license,
source_imported_at, data_status, data_confidence`.

Two **generated** columns decide visibility:

- `is_listable` — `lifecycle_status <> 'suspended' AND (data_status <>
  'synthetic_unverified' OR claim_status = 'claimed')`
- `listing_score` — completeness out of 100: contact 25, hours 20, address 15,
  description 15, image 15, website 5, owner 5

`listing_score >= 40` gates indexability (`MIN_INDEXABLE_SCORE`) and the
"New on NowOpen" rail (`MIN_USEFUL_SCORE`).

Children: `business_services` (543 rows / 227 businesses), `business_reviews`,
`offers`, `keeps`, `business_media_assets` (1,186 rows — the media rights
registry), `business_evidence` (18,851 rows / 3,056 businesses).

---

## 5. How a listing is born

```
SOURCE                        STAGING                    PUBLIC
admin CSV     ┐
owner form    ├──► radar_candidates ──review──► businesses ──► /:username
customer tip  │    (3,550 rows,      (a person   (+ business_services rows)
Wikidata      ┘     profile jsonb)    approves)   (+ business_evidence rows)
```

- `import_batch_to_candidates()` stages a CSV batch; everything beyond the
  twelve candidate columns rides in `radar_candidates.profile` (jsonb).
- `radar_publish_candidate()` re-checks the source's rights **at the moment of
  publication**, projects `profile` by an explicit whitelist, inserts
  `business_services` rows from `services_json`, and calls
  `record_publish_evidence()` — one `business_evidence` row per field carried,
  method derived from the source (`csv_import` 55 / `owner_submitted` 70 /
  `public_suggested` 40 / `api` 80), all at tier `single_source`.
- Nothing publishes without a person. The Discovery panel stages with
  `status = 'review'`.

**Rights are enforced twice** — at ingestion and again at publish — because a
licence can be revoked between the two.

---

## 6. Source registry

`radar_sources` is the authority. `sourcePermits()` treats **unknown as a
refusal** and a blank `authorised_by` as a refusal.

| key | active | access | bulk | redistribute | licence |
|---|---|---|---|---|---|
| wikidata | yes | permitted | permitted | permitted | CC0 1.0 |
| admin_import | yes | permitted | permitted | permitted | first-party |
| business_submission | yes | permitted | permitted | permitted | first-party |
| public_suggestion | yes | permitted | permitted | permitted | first-party |
| openstreetmap | **no** | permitted | permitted | **unknown** | ODbL — share-alike, founder decision pending |
| businesslist_ng | **no** | prohibited | prohibited | prohibited | none |

---

## 7. Ownership and claims

- `claim_status`: `unclaimed → claim_pending → claimed` (also `claim_rejected`,
  `claim_suspended`); `user_id` is set on claim.
- `canEditBusinessProfile()` — staff may edit a listing **only until it is
  claimed**. An owner, a pending claim, or a non-admin role all refuse, each
  with a reason shown on screen.
- A database trigger (`guard_claimed_profile_edits`) enforces the same rule
  independently: content columns on a claimed business are refused to anyone
  but the owner, while moderation columns (lifecycle, verification, trust,
  plan) stay editable by admins. Verified live in all four directions.
- Admin edits are written to the audit log.

---

## 8. Images

- Owner uploads → Supabase Storage, WebP-compressed client-side.
- Discovery **does not take images** from Wikidata: `P18` points at Wikimedia
  Commons, which is licensed per file, not CC0.
- The enrichment engine may place a **licensed stock placeholder** (Pexels) in
  an empty `image_url`, registered in `business_media_assets` with its licence
  and rights decision. As of this session the page, the alt text, `og:image`
  and schema.org `image` all treat it as a placeholder rather than as the
  business.
- `isStockPlaceholder()` (`src/lib/stockImage.ts`) is the single rule.

---

## 9. Availability

The model the product needs already exists: `availability_mode`,
`is_24_hours`, `is_24_hours_confirmed`, `opens_on_holidays`, `extra_holidays`,
`timezone`, plus an owner override.

`publicOpenState()` resolves, in order: override → holiday → no-hours
(`default_24_7` unconfirmed → `Open now` + detail `Open 24 hours · default`;
confirmed → `Open 24 hours`; otherwise `Hours not confirmed`) → schedule, with
overnight and closing-soon handling.

`OpenStateBadge` always renders label **and** detail — nothing in the codebase
passes `hideDetail` — so the "default" qualifier is never dropped.

**Live reality: 3,056 of 3,059 are `default_24_7` with zero confirmed.** The
Discover rails stay conservative only because `DISCOVER_SELECT` omits
`availability_mode` and `is_24_hours_confirmed`; a test now pins that so it
cannot flip silently.

---

## 10. SEO

Server-rendered per route for crawlers; `noindex, follow` below
`listing_score >= 40`; canonical on every page; `LocalBusiness` +
`BreadcrumbList` JSON-LD; `sameAs` carrying website and socials; sitemap of
1,113 URLs; true 404s for unknown slugs.

---

## 11. Where the risk is

| Area | State |
|---|---|
| Directory composition | **Highest risk.** 70% hospitals and schools under a "find businesses" promise |
| Hours | Effectively absent; the core feature has no fuel |
| Claims | 2 of 3,059 |
| Enrichment auto-apply | Sound design — owner-authorised, ask-first default, allowlisted fields — but it has so far shipped exactly one thing to production: 1,176 stock covers |
| Scraping layer | Three P0 defects, all fixed this session, none of them previously exercised in production |
| `supabase db push` | Still dangerous — ledger records 20 of 119 migrations |
| Dev = prod database | Every `npm run dev` writes to live data |

## 12. What is stable

Routing, the publish pipeline, dedupe, RLS, the claim boundary, the trust
labelling, opening-hours logic, CSV import (44 fields end to end), the SSRF
guard, SEO rendering, and the 4,057-test suite.
