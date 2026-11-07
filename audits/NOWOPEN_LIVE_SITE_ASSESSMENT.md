# NowOpen Africa — Live Site Assessment

**Date:** 2026-09-14
**Target:** https://www.nowopenafrica.com
**Method:** route sweep with and without a crawler user-agent, live database queries,
browser inspection at 375×812 and desktop, bundle and timing measurement.

Everything below is measured. Where I could not verify something, it says so.

---

## 1. The headline

The platform is **much further along than a first look suggests**, and its
single biggest problem is not a bug — it is that the directory it now serves is
not made of the businesses the homepage promises.

Between the last audit and today the directory grew from **453 listings to
3,059**. Ninety-two percent of them (2,810) came from Wikidata through the
discovery pipeline. That is a real achievement and the plumbing behind it is
sound. But:

| What the corpus is | Count | Share |
|---|---|---|
| Hospital & Clinic | 1,621 | 53% |
| Schools & Training | 524 | 17% |
| Professional Services | 187 | 6% |
| Hotel & Lodging | 168 | 5% |
| Restaurant | 124 | 4% |
| Café & Bakery | 39 | 1% |

**Seventy percent of NowOpen is hospitals and schools.** The homepage sells
"discover businesses… what is open now, what is near you". A visitor looking
for a tailor, a mechanic or a place to eat meets a medical directory.

That is a consequence of the type map used for Wikidata discovery — Wikidata
covers hospitals and universities in Africa densely and small shops barely at
all. It is not a defect in the code. It is a product decision that now needs
making deliberately.

---

## 2. What works

Verified live, not assumed.

**Routing and crawlability.** Every public route returns 200. A crawler
(`Googlebot` UA) is served a distinct server-rendered page per route via
`middleware.ts` → the Vercel functions — `/` (2,464 bytes), `/discover`,
`/businesses`, `/adverts`, `/media`, `/platform`, business profiles (14,468
bytes for `/yemzoarts`) and location pages (`/businesses/in/lagos`, 38,243
bytes). Each carries its own `<title>`. A human gets the SPA shell, which is
the correct dynamic-rendering split.

**404 handling is correct for crawlers.** `/this-route-does-not-exist` and
`/no-such-business-xyz` both return **HTTP 404 with `noindex`**. An empty
location page (`/businesses/in/atlantis`) returns 200 with `noindex, follow` —
the right answer for a page that may fill later.

**Structured data is real.** A profile carries valid `LocalBusiness` and
`BreadcrumbList` JSON-LD, a canonical URL, exactly one `<h1>`, zero images
without `alt`, and a meta description.

**Sitemap:** 1,113 URLs, served at 178KB, listing profiles plus the hub pages.
`robots.txt` correctly disallows `/admin`, `/dashboard`, `/profile`, `/studio`,
`/login`, `/register`, `/digital-forms` and the password routes.

**Trust labelling on profiles is honest** — better than most directories:

- an `Unclaimed` badge beside the name
- `Business Trust Score — UNVERIFIED — 11/100 — Not yet verified. 0 of 7 checks
  confirmed by our team.`
- opening hours reading `Open 24/7 — assumed · No hours confirmed yet, so we
  show the 24/7 default. The business can confirm real hours.`
- a claim prompt: *Is this your business? Claim it to manage your page…*

**No duplicate listings.** Zero duplicate-name groups across 3,059 rows. The
`(source_key, source_record_id)` unique index and the SPARQL fold held.

**Performance is good.** Homepage TTFB 0.48s, 7.6KB shell. Crawler profile
page 1.12s TTFB, 6.2KB. Largest JS chunk 353KB (`index`), plus 180KB React and
124KB Supabase vendor chunks.

---

## 3. What is broken

### 3.1 Stock photographs presented as the businesses (P0 — fixed this session)

**1,176 of 3,059 profiles** carried a cover image from `images.pexels.com`,
rendered full-bleed with `alt={business.name}`.

The enrichment engine is honest everywhere except the page: the asset is
registered in `business_media_assets` as `rights_decision: licensed, licence:
Pexels License`, and the change proposal's own reason reads *"Licensed stock
placeholder … replace it with the real image when you claim or upload."*

None of that reached a visitor. Worse, the same URL was used as:

- `og:image` — the WhatsApp/X share card, which has no room for a caption
- schema.org `image` on the LocalBusiness node — an assertion to Google that
  the photograph depicts that business

The licence is not the problem; Pexels permits the use. The **claim** is the
problem.

### 3.2 The repository's own quality gate was red (P0 — fixed)

`npm run verify` exited 1. A truncated debug scratch file at the repo root
(`_probeRobots.ts`, 780 bytes, cut off mid-string, referenced by nothing) failed
to parse, and lint runs before tests — so **14 failing tests were invisible**.

### 3.3 robots.txt compliance failed open (P0 — fixed)

`robotsAllowUrl()` returned "allowed" for every URL, including ones the site's
own `robots.txt` disallowed. `pathOf()` began `if (!trimmed.startsWith('/'))
return '/'` — and it is called with absolute URLs, so **every target collapsed
to the root path** and no `Disallow` rule could ever match.

A compliance gate that fails open is worse than no gate: it reports that a
fetch was checked and permitted.

### 3.4 The website parser crashed on most pages (P0 — fixed)

`addressFrom(node)` dereferenced `node.address` where `node` is null for any
page without a JSON-LD business node — which is most of the web. Seven tests
covered exactly those paths and all seven crashed.

### 3.5 Thirty-one unnamed controls on the mobile homepage (P1 — fixed)

Image-only links in the card grid had no accessible name when a business had no
image, and duplicated the adjacent text link when it did. A screen-reader user
heard "link" with no destination, or every business twice.

---

## 4. What is confusing or incomplete

| Finding | Detail | Priority |
|---|---|---|
| Hours exist for essentially nobody | 0 of 2,810 Wikidata listings have opening hours; 1 of 247 CSV imports does | P1 (product) |
| "Open Now" has almost nothing to work with | The feature the platform is named for covers 3 listings with real hours | P1 (product) |
| `/discover` is a thin crawler page | 1,512 bytes against 38,243 for a location page | P2 |
| Card and profile disagree | A card says "Hours not confirmed"; the profile says "Open now · Open 24 hours · default" for the same business | P2 (now pinned by test) |
| Only 2 claimed businesses | Of 3,059. The claim flow is built and reachable, but nothing has come through it | P1 (go-to-market) |
| 97 advertisements, 18 media services | Both of the other two pillars are thinly populated next to 3,059 businesses | P2 (product) |

---

## 5. What is misleading

Only one thing, and it is now fixed: the stock covers (§3.1). Everything else
I checked labels its uncertainty — the trust score, the unclaimed badge, the
24/7 default, "No reviews yet", "Hours not confirmed".

That is a genuinely unusual standard for a directory and it should be
protected.

---

## 6. Live site vs codebase

No meaningful drift. `npm run check:drift` reports every table and column the
migrations describe is present. The live database carries 83 tables against 76
the migrations create — the extra seven were created outside migrations (a
long-standing, documented condition, including a junk table named
`NowOpen Africa`).

The code deployed and the code in the working tree differ only by this
session's changes.

---

## 7. What changed recently

Since the previous audit the following arrived, all of it since 2026-09-08:

- Wikidata discovery, end to end (2,810 published listings)
- `business_evidence` — now **18,851 rows across 3,056 businesses**, where it
  held zero before
- an enrichment engine with change proposals, owner sync preferences and
  owner-authorised auto-apply
- a website-scraping discovery layer (`robots.ts`, `safeUrl.ts`,
  `officialWebsite.ts`) — the one carrying the three P0 defects above
- an admin Discovery panel spanning six sources and most of Africa

See `RECENT_UPDATES_REASSESSMENT.md`.

---

## 8. Priorities

**Do before launch**

1. Decide what the directory is *for* — 70% hospitals and schools is either the
   product or a data problem, and only the founder can say which (§1).
2. Get opening hours for something. Without them "Open Now" is decoration.
3. Drive the first real claims. Two in 3,059 is the number that decides whether
   this is a directory or a business.

**Already done this session** — §3.1 to §3.5, all verified.

**Worth doing soon**

4. Thicken `/discover` for crawlers.
5. Decide whether stock placeholders should exist at all now that they are
   labelled (see `NOWOPEN_UX_AUDIT.md`).
6. Populate Advertise and Media, or say plainly that they are early.
