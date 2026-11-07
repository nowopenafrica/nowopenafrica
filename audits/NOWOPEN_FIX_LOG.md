# NowOpen Africa — Fix Log

**Session:** 2026-09-14 · All changes verified before being recorded here.

Baseline at start: `npm run verify` **exit 1** — 1 lint error, 14 failing tests
(invisible, because lint runs first).
Baseline at end: `npm run verify` **exit 0** — 293 files, **4,076 tests**, 0
errors, 395 pre-existing warnings.

---

## FIX-01 — Restored the quality gate (P0, NOA-002)

**Root cause.** `_probeRobots.ts` at the repo root: a 780-byte debug scratch
file, truncated mid-string, importing a mangled identifier
(`robotsAllowUrlopera`), referenced by nothing. ESLint could not parse it, and
`npm run verify` runs lint **before** tests — so the suite never executed and 14
failures across three safety-critical modules stayed hidden.

**Change.** Deleted the file.
**Files.** `_probeRobots.ts` (removed).
**Verification.** `verify` exit 1 → the suite runs; the 14 failures surface as
FIX-02, FIX-03, FIX-04.

---

## FIX-02 — robots.txt gate no longer fails open (P0, NOA-003)

**Root cause.** `pathOf()` in `supabase/functions/_shared/discovery/robots.ts`
opened with `if (!trimmed.startsWith('/')) return '/'`, and its caller passes an
**absolute URL**. Every target therefore collapsed to the root path, no
`Disallow` rule could ever match, and `robotsAllowUrl()` returned "allowed" for
everything — while reporting that it had checked.

**Change.** Parse an absolute URL properly; keep path **and** query (RFC 9309
compares both); treat an unparseable target as `/` rather than as permission.
Separately, an anchored directory pattern (`Disallow: /forum/$`) now also covers
`/forum` — a deliberate, documented deviation from a literal reading, because
for a compliance gate the conservative error is the right one.

**Files.** `supabase/functions/_shared/discovery/robots.ts`.
**Tests.** 10/10 pass (6 were failing).
**Scope note.** No production crawl had used this path — the 2,810 discovered
listings came from the Wikidata SPARQL endpoint — so no site was fetched against
its wishes.

---

## FIX-03 — Website parser no longer crashes without JSON-LD (P0, NOA-004)

**Root cause.** `addressFrom(node)` dereferenced `node.address` where `node` is
null for any page with no JSON-LD business node. Every neighbouring read already
used `node?.` — this one did not, so the parser threw on precisely the pages it
exists to handle.

**Change.** `addressFrom` accepts null and returns null.
**Files.** `supabase/functions/_shared/discovery/officialWebsite.ts`.
**Tests.** 98/98 in the discovery module (7 were crashing).

---

## FIX-04 — SSRF rejection names the real reason (P2, NOA-009)

**Root cause.** The literal-host denylist ran **before** the address
classifiers, so `169.254.169.254` reported the vague `blocked_host` instead of
`metadata`. Every dangerous target was already refused — this was diagnostics,
not a hole.

**Change.** Classifiers first; the denylist now catches only the *named*
endpoints (`metadata.googleapis.com`) that no classifier sees.
**Files.** `supabase/functions/_shared/discovery/safeUrl.ts`.
**Verification.** Probed 10 targets directly: loopback, `0.0.0.0`, link-local
metadata, all three private ranges, IPv6 loopback and internal names all
refused; `https://example.com` allowed. 10/10 tests.

---

## FIX-05 — Test fixture passing JSON to an HTML parser (P3)

`extractJsonLd` reads HTML and looks for `<script type="application/ld+json">`.
The fixture passed bare JSON, so it matched nothing and the assertion failed on
the fixture rather than on the behaviour. Wrapped in the script tag it really
arrives in.
**Files.** `supabase/functions/_shared/discovery/officialWebsite.test.ts`.

---

## FIX-06 — Stock photographs no longer presented as the business (P0, NOA-001)

**Root cause.** The enrichment engine places a licensed Pexels cover into an
empty `image_url` and records it honestly — `business_media_assets` marks it
`licensed`, the proposal reason says *"Licensed stock placeholder … replace it
with the real image"*. **Nothing carried that fact to any rendering surface.**
1,176 of 3,059 profiles showed a stock photo full-bleed with
`alt={business.name}`, and the same URL was used as the share card and as
schema.org `image`.

**Change.** New `src/lib/stockImage.ts` — `isStockPlaceholder()`,
`coverAltText()`, `STOCK_COVER_NOTICE`, `STOCK_COVER_EXPLANATION`. Applied to
four surfaces:

| Surface | Before | After |
|---|---|---|
| Profile cover (React) | full-bleed, `alt="<business>"` | caption *"Stock photo — not this business"*, honest alt |
| Card thumbnails | `alt="<business>"` | honest alt |
| `og:image` (share card) | the Pexels photo | the business's own logo, else NowOpen's card |
| schema.org `image` | the Pexels photo | absent unless a real logo exists |
| Crawler-page `<img>` | `alt="<business>"` | honest alt **and** a visible caption |

A real logo still stands — it is the business's own mark. Only the placeholder
cover is withheld.

**Files.** `src/lib/stockImage.ts` (new), `src/lib/stockImage.test.ts` (new),
`src/pages/BusinessDetail.tsx`, `src/components/discover/BusinessCard.tsx`,
`src/lib/businessPageRender.ts`, `src/lib/businessPageRender.test.ts`.
**Tests.** 11 new in `stockImage.test.ts`, 6 new in `businessPageRender.test.ts`.
**Verified live** after deploy: crawler `alt` reads *"Stock photograph used as a
placeholder cover for Duchess international hospital Lagos"*, the caption is
present, `og:image` is `nowopenafrica.com/og-image.png`, and the
`LocalBusiness.image` property is absent.

---

## FIX-07 — 31 unnamed controls on the mobile homepage (P1, NOA-005)

**Root cause.** A card's image link wrapped a bare gradient `<div>` when the
business had no image — a link with no accessible name — and duplicated the
adjacent text link when it did.

**Change.** The image link is decorative: `aria-hidden="true"` **and**
`tabIndex={-1}` (both, because hiding a focusable element alone is its own
violation). The text link carries the name and the same destination.
**Files.** `src/components/discover/BusinessCard.tsx`.
**Verified live** at 375×812: **31 → 0**.

---

## FIX-08 — Pinned the conservative "Open right now" contract (P2, NOA-011)

**Root cause.** 3,056 of 3,059 listings are `availability_mode = 'default_24_7'`
with zero confirmed. The discover rails stay honest only because
`DISCOVER_SELECT` omits `availability_mode` and `is_24_hours_confirmed` — the
right outcome reached by accident. Adding those columns would silently move
3,056 unconfirmed listings into a rail headed *"Doors open as of this minute"*.

**Change.** Two tests that fail if someone adds them, with the reasoning
recorded. No behaviour change — this converts an accident into a decision.
**Files.** `src/test/discover.test.ts`.

---

## Deliberately NOT changed

| Thing | Why |
|---|---|
| The 24/7 default returning `kind: 'open'` | A considered product decision pinned by its own test, and honest in practice: every badge renders the "· default" qualifier because nothing passes `hideDetail` |
| The stock placeholders themselves | Now labelled. Whether to keep them or replace them with branded illustration is a product decision (see UX audit §4) |
| The evidence tier for placeholders (NOA-010) | `source_confirmed` is wrong, but nothing consumes it today — `data_confidence` is `unconfirmed` for all 3,059 and is not derived from evidence. Documented for when a consumer appears |
| Five tables with RLS and zero policies | Deny-all is correct; no client reads them |
| 395 lint warnings | Pre-existing, zero errors, out of scope for a session that had a red gate to restore |
