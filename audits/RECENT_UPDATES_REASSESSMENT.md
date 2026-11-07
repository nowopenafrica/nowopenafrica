# NowOpen Africa — Recent Updates Reassessment

**Date:** 2026-09-14 · Covers everything added since 2026-09-08.

The working tree is not committed (`git status` shows one commit history and a
large uncommitted surface), so "recent" is established from migration
timestamps, file mtimes and live data rather than from git log.

---

## 1. What arrived

| Change | Intended to solve | Implemented? | Works end to end? | Production-ready? |
|---|---|---|---|---|
| **Wikidata discovery** (source registry entry, SPARQL adapter, server fetch, admin panel) | No authorised source existed, so `ADAPTERS` was empty and discovery impossible | Yes | **Yes — 2,810 listings published** | Yes |
| **`business_evidence` writing** (`record_publish_evidence`) | The provenance table existed with zero rows | Yes | **Yes — 18,851 rows / 3,056 businesses** | Yes |
| **Enrichment engine** (`_shared/enrichment/*`, change proposals, owner sync preferences, auto-apply) | Fill gaps in unclaimed profiles without a person doing it by hand | Yes | **Partly** — 1,176 image proposals approved; no other field has ever been proposed | Design yes, output no (see §3) |
| **Website discovery layer** (`robots.ts`, `safeUrl.ts`, `officialWebsite.ts`) | Read a business's own site to enrich it | Yes | **No — three defects, all now fixed** | Now yes; unexercised in production |
| **Admin business editor** + claimed-profile guard | Nobody could fix an unclaimed listing without the SQL editor | Yes | Yes — verified in all four authorisation directions | Yes |
| **CSV full-profile import** (44 fields, services, socials, FAQs) | The importer could fill 11 of 72 columns | Yes | Yes — 247 listings, 543 service rows | Yes |
| **Claimed-first ranking** | The only 2 claimed businesses had never appeared on the homepage | Yes | Yes — verified live, both rank 1 and 2 | Yes |
| **Discover "See more"** | Rails capped at 8 with no way to see the rest | Yes | Yes — paged 8 → 109 and the button retired itself | Yes |
| **Admin Discovery panel** (6 sources, most of Africa) | One place to run acquisition | Yes | Partly — Wikidata works; Google Places is explicitly gated on a missing key; OSM is licence-blocked | Honest about its gaps |

---

## 2. What the new code did well

- **Rights first.** The Wikidata row records CC0 with a named authoriser; OSM is
  registered **inactive** with its share-alike problem written into the row
  rather than quietly enabled; `businesslist_ng` stays prohibited.
- **Images deliberately not taken** from Wikidata, because `P18` points at
  Commons and Commons is licensed per file.
- **Auto-apply is owner-authorised.** Every flag defaults to ask-first, there is
  one write core shared by the staff and owner paths, and the writable-field set
  is an allowlist.
- **Dedupe held.** 3,550 candidates → 3,059 businesses with **zero** duplicate
  names.
- **The publish gate re-checks rights** at publication, not just at ingestion.

---

## 3. Where it fell short

### The quality gate was red the whole time
`_probeRobots.ts` — a truncated debug scratch file at the repo root — broke lint.
`npm run verify` runs lint **before** tests, so it exited 1 and **14 failing
tests never ran**. Three of the new modules were shipping untested:

- `robots.ts` — the robots.txt gate **allowed every URL**, disallowed or not
- `officialWebsite.ts` — crashed on any page without JSON-LD
- `safeUrl.ts` — blocked correctly, but mislabelled the cloud-metadata case

All fixed and verified this session. None had run in production: the 2,810
listings came from the SPARQL endpoint, not from website crawling.

### The enrichment engine's only production output is 1,176 stock covers
Every proposal ever approved is `field_name = image_url`, reason *"Licensed
stock placeholder (Pexels License)"*. No name, phone, address, hours or
description has been proposed once.

The engine records these honestly — `business_media_assets` calls them licensed
placeholders — but nothing carried that to the page, so a visitor saw a stock
photo as the business, including in the share card and in schema.org `image`.
Fixed this session.

The deeper issue: **the engine that exists to enrich profiles has enriched
nothing but pictures.** The gap it was built for — hours, addresses, real
contact details — is still open.

### Discovery filled the directory with the wrong shape of business
2,810 listings, of which 1,621 are hospitals and 524 are schools. That follows
directly from the Wikidata type map, and it is a product decision that was never
explicitly taken. See `NOWOPEN_BUG_REGISTER.md` NOA-007.

### Zero hours
Not one of the 2,810 discovered listings carries opening hours, so the "Open
Now" promise rests on a 24/7 default for 3,056 of 3,059 listings.

---

## 4. Regressions introduced

**None found.** The public surfaces I re-checked — homepage ranking, discover
rails, profile rendering, claim guard, CSV import, SEO output — all behave as
the previous audit recorded, with the additions above.

---

## 5. Discoverability, consistency, accessibility of the new work

| Dimension | Assessment |
|---|---|
| Discoverable by users | Discovery and the business editor are admin-only and correctly placed in the console; the claim prompt is on every unclaimed profile |
| Brand-consistent | Yes — the new panels reuse the existing card, badge and table system |
| Accessible | The new admin panels were not audited in depth; the public surfaces they produce were, and one WCAG failure (31 unnamed links) was found and fixed |
| Responsive | Verified at 375×812 — no horizontal scroll |
| Tested | Now yes: 4,074 tests pass. Before this session, 14 were failing unseen |
