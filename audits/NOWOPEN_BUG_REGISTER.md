# NowOpen Africa — Bug Register

**Date:** 2026-09-14
**Severity:** P0 blocks launch or creates security/data risk · P1 major journey,
revenue or trust · P2 meaningful usability · P3 polish

Status: **FIXED** (verified) · **OPEN** · **DECISION** (needs the founder) ·
**VERIFIED-CORRECT** (checked, no defect — recorded so it is not re-investigated)

---

## P0

### NOA-001 — Stock photographs presented as the businesses' own · FIXED
**Where:** `src/pages/BusinessDetail.tsx`, `src/lib/businessPageRender.ts`,
`src/components/discover/BusinessCard.tsx`
**Repro:** open `/duchess-international-hospital-lagos`; inspect the cover image
and the page source.
**Expected:** a photograph NowOpen cannot attribute to the business is labelled
as such.
**Actual:** a generic `images.pexels.com` photo rendered full-bleed with
`alt="Duchess international hospital Lagos"`, reused as `og:image` (the share
card) and as schema.org `image` (an assertion to Google that the photo depicts
the business). **1,176 of 3,059 profiles.**
**Root cause:** the enrichment engine records the asset honestly —
`business_media_assets.rights_decision = licensed`, proposal reason *"Licensed
stock placeholder … replace it with the real image"* — but nothing carried that
fact to any rendering surface.
**Fix:** new `src/lib/stockImage.ts` (`isStockPlaceholder`, `coverAltText`,
notice strings); a caption strip on the cover; honest alt text on profile and
cards; placeholder excluded from `og:image` and schema.org `image` while a real
logo still stands.
**Tests:** `src/lib/stockImage.test.ts` (11), `businessPageRender.test.ts` (+4).
**Verified:** live at 375×812 and desktop — alt now reads *"Stock photograph
used as a placeholder cover for …"*, caption *"Stock photo — not this business"*.

### NOA-002 — `npm run verify` red, hiding 14 failing tests · FIXED
**Where:** `_probeRobots.ts` (repo root)
**Repro:** `npm run verify` → exit 1, `396 problems (1 error…)`.
**Root cause:** a 780-byte debug scratch file, truncated mid-string, importing a
mangled identifier (`robotsAllowUrlopera`), referenced by nothing. Lint runs
**before** tests, so the suite never executed and 14 failures were invisible.
**Fix:** file removed.
**Verified:** `verify` exit 0; the previously hidden failures then surfaced as
NOA-003/004/005.

### NOA-003 — robots.txt gate failed open · FIXED
**Where:** `supabase/functions/_shared/discovery/robots.ts`
**Expected:** `robotsAllowUrl(txt, url, ua)` refuses a disallowed path.
**Actual:** allowed **everything**; six of its own tests said so.
**Root cause:** `pathOf()` opened with `if (!trimmed.startsWith('/')) return '/'`
and is called with **absolute URLs**, so every target collapsed to `/` and no
`Disallow` rule could match.
**Fix:** parse an absolute URL properly, keep path + query (RFC 9309), and treat
an unparseable target as `/` rather than as permission. An anchored directory
pattern (`/forum/$`) now also covers `/forum` — a deliberate, documented,
conservative deviation.
**Tests:** 10/10 pass (6 were failing).
**Note:** no production crawl had used this path, so no site was crawled against
its wishes. It was a loaded gun, not a discharged one.

### NOA-004 — Website parser crashed on any page without JSON-LD · FIXED
**Where:** `supabase/functions/_shared/discovery/officialWebsite.ts:157`
**Actual:** `TypeError: Cannot read properties of null (reading 'address')` on 7
of 8 tests — every no-structured-data path, i.e. most of the web.
**Root cause:** `addressFrom(node)` dereferenced a node its own caller treats as
nullable (`node?.description`, `node?.address` on the surrounding lines).
**Fix:** accept null and return null.
**Tests:** 98/98 in the discovery module.

---

## P1

### NOA-005 — 31 controls with no accessible name on mobile · FIXED
**Where:** `src/components/discover/BusinessCard.tsx`
**Repro:** homepage at 375×812; count `a[href]`/`button` with no text, no
`aria-label`, no non-empty image alt.
**Actual:** 31. A card's image link wrapped a bare gradient `<div>` when the
business had no image (unnamed link); when it did have one it duplicated the
adjacent text link (every business announced twice). WCAG 2.2 A — 2.4.4 / 4.1.2.
**Fix:** the image link is decorative — `aria-hidden="true"` plus `tabIndex={-1}`
(both, because hiding a focusable element alone is its own violation). The text
link carries the name and the same destination.
**Verified:** live, 31 → **0**.

### NOA-006 — Almost no business has opening hours · OPEN (product)
0 of 2,810 Wikidata listings and 1 of 247 CSV imports carry hours; 3,056 of
3,059 sit on `availability_mode = 'default_24_7'` with **zero** confirmed.
"Open Now" — the feature the platform is named for — has three real listings to
work with. No code fix applies; this needs owners, or a source that carries
hours (OSM does, and is licence-blocked — see NOA-012).

### NOA-007 — The directory is 70% hospitals and schools · DECISION
1,621 Hospital & Clinic + 524 Schools & Training of 3,059, against a homepage
promising business discovery. A consequence of the Wikidata type map, which is
dense for hospitals and universities in Africa and sparse for shops. Either
narrow the type map, or change what the homepage promises.

### NOA-008 — Two claimed businesses of 3,059 · OPEN (go-to-market)
The claim flow is built, reachable and guarded on both sides. Nothing has come
through it. This is the number that decides whether NowOpen is a directory or a
business.

---

## P2

### NOA-017 — Admin Business Intelligence read three tables that did not exist in production · FIXED
**Where:** `src/components/admin/businessIntelligence/{CampaignsTab,OverviewTab,ReviewTab,SourcesTab}.tsx`, route `/admin/business-intelligence`
**Found:** `npm run check:drift` reports **3 missing tables** —
`business_discovery_campaigns`, `business_discovery_runs`,
`radar_candidate_evidence` — and **19 missing columns** on `radar_sources`
(`source_type`, `access_method`, `api_endpoint`, `rate_limit_per_minute`,
`health_status`, `attribution_required`, and 13 more).
**Actual:** four admin tabs query tables Postgres does not have. supabase-js
resolves with `{ data: null, error }` rather than throwing, so the tabs render
**empty with no explanation** instead of reporting the fault.
**Root cause:** five migrations authored today (2026-09-14, 01:15–05:46) —
`business_discovery_campaigns`, `discovery_scheduler`,
`source_registry_extension`, `candidate_evidence_and_source_health`,
`official_website_adapter` — are in the repo and **not applied to production**.
The components that depend on them are in the working tree and therefore ship
with any deploy.
**Blast radius:** admin-only. No customer, business owner or crawler surface is
affected.
**Why not fixed here:** this is in-flight work by another session — two of the
files carry future dates, suggesting deliberate staging — and applying five
unreviewed schema migrations is a decision about unfinished work, not a fix.
`npm run check:migrations` reports all 150 files safe to re-run, so applying
them is low-risk **when the author is ready**.
**Fix:** the migrations were applied one at a time via
`supabase db query --linked -f` (never `db push` — the ledger records 20 of
152, so a push would replay ~130 applied files). `npm run check:drift` now
reports **no drift: every table and column the migrations create is present**,
and the tabs were verified rendering live.
**Note on the empty states that remain:** Campaigns shows *"No campaigns"* and
Conflicts shows *"No field has two sources disagreeing"* because those are
true, not because a read failed. The Conflicts tab additionally suppresses its
empty state when a read errors — "no conflicts" is a claim about data, and
printing it above an error tells the operator the opposite of the truth.


### NOA-018 — A second source's disagreement was discarded in silence · FIXED
**Where:** `supabase/functions/enrich-business/index.ts:398`
**Found:** while building conflict resolution, a probe insert failed with
`duplicate key value violates unique constraint
"business_change_proposals_active_unique"`.
**Root cause:** that index is **partial** — `(business_id, field_name) WHERE
status = 'pending'` — so only ONE proposal per field may be open. The engine
wrote the insert bare: `await db.from(...).insert({...})`, no `.select()`, no
error inspected. supabase-js RESOLVES with `{ error }` rather than throwing, so
the rejection was **discarded**. The evidence row written a few lines earlier
survived; the proposal did not; nothing was logged and nobody was told.
**Mitigating:** `pendingFields` is passed to `runEnrichment` and filters out
fields already open at the start of a run, so collisions are rarer than the raw
code suggests — but it is a read-then-write check that a concurrent run defeats.
**Also wrong:** the job report counted `summary.deliverables.proposals.length` —
what was *drafted*, not what was *written*.
**Fix:** the error is inspected; a unique violation is tolerated explicitly
(matching the media insert twelve lines below, which already did this) and
recorded in `proposals_blocked`; anything else throws. The report now carries
`proposals_written` and `proposals_blocked` beside the draft count.
**Note:** no data was lost to this. The evidence row is the durable record, and
`business_field_conflicts` reads evidence precisely because that is the only
place a disagreement can be represented.

### NOA-019 — Register discarded the destination a user came to do · FIXED
**Where:** `src/pages/Register.tsx`
**Repro:** open any page that sends you to sign in with `?next=`, choose "create
an account", finish signup.
**Actual:** `navigate('/login')` — the `?next=` was dropped, so sign-in then
sent the user to the home page having forgotten what they came to do. Login had
honoured `?next=` (with an open-redirect guard) for a while; only Register never
passed it on. Phone signup went to `/dashboard` unconditionally for the same
reason.
**Why it mattered here:** /add-business asks an anonymous visitor to fill in a
seven-step form and only then to register. Losing the destination at that exact
moment is losing the submission.
**Fix:** the inline guard in Login was extracted to `src/lib/safeNext.ts`
(`safeNextPath`, `authRedirectTarget`) and both pages now use it. The guard
refuses anything that is not a single-slash same-site path — `//evil.example`,
`https://evil.example` and `/\evil.example` all rejected, because the page a
user trusts most with a password is the one they will follow.
**Tests:** `src/test/submissionVisibility.test.ts` (5 covering the redirect).

### NOA-020 — Unreviewed submissions would have appeared in the directory · FIXED
**Where:** `src/lib/fetchAllBusinesses.ts`, `src/pages/Discover.tsx`,
`src/pages/Campaign.tsx`, `src/components/GlobalSearchInput.tsx`,
`src/components/VoiceAssistant.tsx`, `api/discovery.ts`
**Found:** while building /add-business. `profile_state` was declared in
`src/types/index.ts` and **filtered nowhere** — every public query gated on
`is_listable` alone.
**Why that is not enough:** `is_listable` is a generated column equal to
`lifecycle_status <> 'suspended' AND (data_status <> 'synthetic_unverified' OR
claim_status = 'claimed')`. It has nothing to do with review state, so a
business submitted through a link anyone can paste into WhatsApp would have
appeared in the directory immediately. Setting `profile_state =
'ready_for_review'` would have been decorative.
**Why the column was not simply changed:** three RLS policies, nine functions
and two indexes depend on `is_listable`, and a generated column's expression
cannot be altered in place — dropping it would cascade into the policies.
**Fix:** an explicit `profile_state = 'published'` filter at all six query
sites, plus `isPubliclyListed()` in `listingStatus.ts` kept deliberately
separate from `isListable()`, which must stay an exact mirror of the database
column. A NULL `profile_state` reads as published, because all 3,059 existing
rows predate the column.
**Pinned:** `src/test/submissionVisibility.test.ts` scans `src/` and `api/` and
fails if any query filters `is_listable` without `profile_state` — so the next
query site cannot leak silently.
**Already correct, and verified rather than assumed:** `isIndexableProfile`
returns false for anything that is not `claimed` or `imported_authorized`, so
submissions are noindex automatically; `listingBadge` already renders "Pending"
for `claim_status = 'claim_pending'`; `isClaimable` already refuses a rival
claim while one is pending.

### NOA-021 — The acquisition route could be taken by a business username · FIXED
**Where:** `middleware.ts`, `src/components/dashboard/BusinessForm.tsx`,
`supabase/migrations/20260918010000_business_submission.sql`
**Actual:** usernames live at the site root, and `add-business` was in none of
the three reserved lists. A business called "Add Business" would have been
handed `/add-business` — breaking the page that created it — and the crawler
middleware would have served the route as a profile and 404'd it to Googlebot.
The repo had already been bitten by this: `/join` and `/founding-1000` shipped
as campaign aliases and both 404'd to Googlebot in production.
**Fix:** reserved in all three places that can mint a username — the crawler
middleware, the dashboard's validator, and the `submit_business` slug generator,
which suffixes a random string rather than failing.
**Caught by:** `src/lib/crawlerRouting.test.ts`, which reads `App.tsx` and
requires every single-segment route to be reserved.

### NOA-022 — Every canonical URL on the site pointed at a redirect · FIXED
**Where:** `src/lib/seo.ts`, six `api/*` defaults, `index.html`, `public/robots.txt`
**Measured:** `https://nowopenafrica.com` 308-redirects to
`https://www.nowopenafrica.com`, so www is canonical — but `SITE_URL` declared
the non-www host. That put a redirecting URL into every `<link rel="canonical">`,
every `og:url`, every structured-data `@id`, all 1,131 sitemap `<loc>` entries
and the robots.txt `Sitemap:` directive. The site told Google one thing while
the server answered another, on every page.
**Fix:** 29 occurrences across 16 files.
**Re-measured after deploy:** 0 of 1,144 sitemap URLs point at the redirecting
host; all canonicals read www.
**Pinned:** `src/test/canonicalHost.test.ts`.

### NOA-023 — The /join/business alias competed with /add-business · FIXED
Both routes served identical content and each declared ITSELF canonical — a
duplicate-content signal the site created about itself. Added
`MarketingPage.canonicalPath`; the alias now canonicalises to `/add-business`
and is deliberately excluded from the sitemap. Verified live.

### NOA-024 — Acquisition pages were absent from the sitemap · FIXED
`/add-business`, `/discover`, `/send-business`, `/nominate` and `/open-now` were
not in `STATIC_ROUTES`. The pages whose whole job is to be found by a business
owner were never submitted for indexing. Verified live.

### NOA-025 — Sixteen tables accepted anonymous writes with no ceiling · FIXED
**Where:** `supabase/migrations/20260919010000_public_write_rate_limits.sql`
**Found:** `pg_policies` showed anonymous INSERT on `waitlist`,
`business_enquiries`, `platform_enquiries`, `business_reports`,
`profile_requests`, `radar_candidates`, `business_registrations`,
`business_bookings`, `os_form_applications` and more — every policy correct,
no limit anywhere. A `curl` loop could have filled any of them.
**Fix:** per-caller fixed-window limits enforced by BEFORE INSERT triggers.
The caller is identified by `x-forwarded-for` — **verified** reachable from SQL
through PostgREST — and stored only as `sha256(address || salt)`, the salt in
`private_config` (RLS on, zero policies). Limits are 20–40/hour because much of
the audience is behind carrier-grade NAT, where one address is many people.
Payments, analytics and stream chat deliberately excluded.
**Verified through the live API:** inserts 1–20 returned 201, 21+ were refused;
all 9 throttled tables still accept a normal first write; probe rows deleted.
**A bug this caught in itself:** the first version called `digest()` unqualified.
pgcrypto lives in `extensions` and the function pins `search_path` to `public`,
so it created cleanly and then broke EVERY anonymous waitlist insert. Found by
testing through the real API rather than trusting a clean migration run. Now
`extensions.digest` — and the reason that SECURITY DEFINER lesson is worth
keeping: a pinned search_path makes extension functions invisible at runtime.

### NOA-026 — 14 of 24 workforce agents had been failing every run for days · FIXED
**Where:** `supabase/functions/run-workforce` (deployment, not source)
**Measured:** 24 agents in `os_workforce`, all with an `agent_key`; 18 scheduled;
**14 of those 18 failing** with 7–12 consecutive failures each, every run
returning `No rules are defined for "<key>"`. Only 4 worked — and they were
exactly the first four entries in the `AGENTS` map.
**Root cause:** the rules were NOT missing. All 18 functions existed in
`supabase/functions/_shared/agents.ts` with correctly matching keys.
`_shared/` is bundled into an edge function at **deploy** time, and
`run-workforce` had not been redeployed since the other 14 were written. The
deployed bundle still held the original four.
**This is the general trap:** editing anything in `supabase/functions/_shared/`
changes no deployed behaviour until every function that imports it is
redeployed. Nothing in the repo state reveals the drift.
**Fix:** redeployed. Verified by making the failing agents due and calling
`public.tick_workforce()` — the same path cron uses. All 14 now return real
counts: *"257 listings without a description"*, *"2 claimed of 3111 public"*,
*"10 assets awaiting QA"*.
**After:** 0 failing, 0 consecutive failures across the whole schedule.

### NOA-027 — Six roster entries looked staffed and did nothing · FIXED
**Measured:** `community-manager`, `data-analyst`, `email-marketing-manager`,
`motion-designer`, `partnerships-manager` and `product-designer` had **no
`workforce_schedule` row at all** and 0 runs — while showing `status = 'active'`
in the directory, the same word the working agents use. Precisely the "roster
entry looks staffed forever" failure `run-workforce`'s own header warns about.
**Fix, split by whether there was anything real to count:**
- **`data-analyst` staffed.** `analytics_events` holds 43,698 rows and the known
  problem with that table is quality, not volume. New `dataAnalyst` agent plus a
  `workforce_facts_for` branch measuring attribution — the share of events
  carrying no business and no session, which cannot answer any question.
  Scheduled daily. First live run: *"128 events this week, 0% unattributable"*.
- **The other five marked `off-schedule`.** Their data sources are empty
  (0 followers, 0 chat messages, 0 onboarding deliveries, 4 partners, and no
  data source at all for product design). Writing rules for them would mean
  inventing work to look busy, and a fabricated finding is worse than an empty
  queue because somebody acts on it. `off-schedule` already existed in the
  status vocabulary and renders as "Off schedule".
**Schema note:** `workforce_facts_for` was **renamed** to
`_workforce_facts_base` and a delegating wrapper added, rather than reproducing
14KB of per-agent CASE branches to append one. Verified afterwards that all 19
agents still receive non-empty facts.
**Verified live:** directory shows 24 members, **0 needing attention**, 19
scheduled and running, 5 honestly off-schedule.

### NOA-029 — Every hospital profile claimed 24/7 emergency care · FIXED
**Where:** `src/components/HealthCenter.tsx`
**Found:** while verifying the suggested-content notice on a real unclaimed
hospital profile (Brooklyn Chest Hospital).
**Actual:** the health renderer showed three capability actions
UNCONDITIONALLY on every business in the health categories:
- a red **"24/7 Emergency"** button wired to the business phone — shown whenever
  the listing had any phone number at all;
- **"Video consultation"**;
- **"Laboratory & results"**.

Nothing in the data said any facility offered any of them. **1,654 Hospital &
Clinic listings**, essentially all unclaimed and none verified.
**Why this is the most serious claim on the platform:** somebody may drive to a
clinic at 2am on the strength of a red emergency button. It is also a claim the
enrichment engine could never have produced — "24/7" is on its universal
forbidden list and "ambulance"/"emergency response" on the hospital one. The
generator was held to a standard the UI was not.
**Root cause:** other category renderers gate their demo chrome on `isSample`
(`BeautySalon` takes `stylists={isSample ? SALON_STYLISTS : []}`,
`RepairShop` takes `capabilities={isSample ? … : []}`). `HealthCenter` was never
given that treatment, so its chrome rendered against live data.
**Fix, data-driven rather than merely gated:**
- 24/7 Emergency now requires `is_24_hours_confirmed === true`. Otherwise the
  button reads **"Call this facility"**. The platform-wide 24/7 display default
  is an assumption and must never become an emergency-care claim.
- Video consultation requires some listed service with `is_telemedicine`.
- Laboratory requires a listed service that actually names lab/pathology work.
- A neutral **"Ask what this facility offers"** is always available, so the
  section is never empty.
**Verified live:** on Brooklyn Chest Hospital the emergency button and video
consultation are gone; "Call this facility" and the enquiry action render; the
lab chip appears only because a listed service matched.
**Worth checking next:** the other category renderers for the same pattern. This
one was found by accident while looking at something else.

### NOA-030 — The same fabricated-capability bug in two more renderers · FIXED
**Where:** `src/components/ServiceProviders.tsx`, `src/components/RetailStorefront.tsx`
**Found:** by the renderer audit NOA-029 recommended, rather than by accident.

**ServiceProviders — 190 "Professional Services" listings**, the directory's
third-largest category. Three claims, all unconditional:
- a red **"Emergency call"** button wired to the business phone — the identical
  failure as the hospital one;
- **"Available now"** — a live-availability assertion nothing measures;
- **"Live ETA on the way"** — a feature that has never existed anywhere on the
  platform.

**RetailStorefront** — a "trust bar" reading **"Same-day delivery"** and
**"Cut / packed to order"** on every retail listing. Two specific operational
promises, one of them a butcher's-counter detail, about businesses that have
never seen the page.

**Fix:** emergency now requires `is_24_hours_confirmed === true` (otherwise
"Call this business"); the availability and ETA badges are gone; the retail
trust bar is gone. A shop that genuinely offers same-day delivery can say so
once it claims the profile.

**Checked and CORRECT:** `RepairShop` gates its "Free diagnosis / Upfront quote
/ Expert repair / Warranty" steps behind `{showProcess && …}`, and the call site
passes `isSample`. It was the model the other three should have followed.

**Pinned:** `src/test/rendererClaims.test.ts` scans every component, strips
comments and object-literal definitions, and fails on any of ten operational
promises rendered without a conditional. Its own tests prove it fires on the
exact line that shipped and accepts the gated version — a guard nobody has
tested is a guard nobody can trust.

**The pattern worth remembering:** all four cases were category "chrome"
designed against demo data and never re-examined once real listings flowed
through the same components. The enrichment engine's forbidden-claims list
already banned every one of these phrases; the hand-written UI was simply never
held to it.

### NOA-009 — SSRF rejection reason was imprecise · FIXED
`checkFetchUrl('http://169.254.169.254/…')` answered `blocked_host` where the
classifier had a better word, `metadata`. **Every dangerous target was already
refused** — loopback, 0.0.0.0, all three private ranges, IPv6 loopback,
internal names — so this was a diagnostics defect, not a hole. The literal
denylist ran before the address classifiers and shadowed them; reordered.

### NOA-010 — Stock placeholders recorded at the wrong evidence tier · OPEN
1,176 `business_evidence` rows carry `extraction_method: api, status:
source_confirmed` for what the engine itself calls a placeholder.
`source_confirmed` means *a source confirmed this fact about this business*;
Pexels confirmed nothing. **No current consumer** — `data_confidence` is
`unconfirmed` for all 3,059 and is not derived from evidence — so nothing is
inflated today. It will matter the moment ClaimReach's `minDataConfidence` gate
or a trust badge starts reading it.
**Proposed:** do not write field evidence for a placeholder at all (evidence
answers "why do we believe this is the business's image"; for a placeholder the
answer is "we do not"), or add a `placeholder` status to the CHECK.

### NOA-011 — Card and profile disagree about hours · FIXED (pinned)
A card says "Hours not confirmed"; the profile says "Open now · Open 24 hours ·
default" for the same business — because `DISCOVER_SELECT` omits
`availability_mode` and `is_24_hours_confirmed`, so the rails never apply the
default. The conservative answer is the right one, but it was reached by
accident: adding those columns would silently move 3,056 unconfirmed listings
into a rail headed *"Doors open as of this minute"*. Now pinned by a test that
fails if someone adds them.

### NOA-012 — OpenStreetMap blocked on a licence decision · DECISION
OSM covers small African businesses far better than Wikidata and carries
opening hours — the exact gap in NOA-006. Its ODbL licence is share-alike:
publicly using a derivative database obliges NowOpen to offer that database
under ODbL. For a directory whose data is the asset that is a company decision,
not an import setting. The row is registered, inactive, with the question
written into it.

### NOA-013 — `/discover` is thin for crawlers · OPEN
1,512 bytes against 38,243 for `/businesses/in/lagos`. It is the hub a
discovery product should rank for.

---

## P3

### NOA-014 — Bare open-state label in one place · OPEN
`src/components/BusinessLocations.tsx:78` renders `{state.label}` without the
qualifier. Everywhere else uses `OpenStateBadge`, which always renders both.

### NOA-015 — 83 tap targets under 40px on mobile · OPEN
Mostly the known rem trap (root font < 16px, so Tailwind `h-11` = 39px, not
44). Several are decorative 9–10px dots that are not targets at all. Worth a
pass against the 44px guideline.

### NOA-016 — 395 lint warnings · OPEN
Zero errors. Mostly `no-explicit-any`, `react-hooks/exhaustive-deps` and four
unused eslint-disable directives.

---

## Verified-correct (checked, not defects)

| ID | Finding |
|---|---|
| NOA-V1 | **SSRF guard blocks everything dangerous** — loopback, 0.0.0.0, 169.254.x, 10/172.16/192.168, `[::1]`, `*.internal`, dot-less hosts; `https://example.com` passes |
| NOA-V2 | **24/7 default is labelled honestly.** No caller passes `hideDetail`, so every badge shows "· Open 24 hours · default" |
| NOA-V3 | **Zero duplicate listings** across 3,059 rows |
| NOA-V4 | **Crawler SEO is real** — unique titles per route, LocalBusiness + BreadcrumbList JSON-LD, canonical, one h1, no alt-less images, 1,113-URL sitemap |
| NOA-V5 | **404s are true 404s** for crawlers, with `noindex` |
| NOA-V6 | **RLS is on for every public table.** Five tables have RLS with zero policies (deny-all) — `private_config`, `social_connections`, `social_auth_pending`, `onboarding_messages`, `onboarding_manual_sends` — and **no client code reads any of them**. Correct, not broken |
| NOA-V7 | **No secrets in client code.** Only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PAYSTACK_PUBLIC_KEY`, `VITE_AI_ENGINE` |
| NOA-V8 | **Claim boundary holds in both layers** — `canEditBusinessProfile` in the UI and `guard_claimed_profile_edits` in the database; verified admin-blocked, owner-allowed, moderation-still-allowed, unclaimed-editable |
| NOA-V9 | **Enrichment auto-apply is owner-authorised**, defaults to ask-first, writes through one core with an allowlisted field set |
| NOA-V10 | **Wikidata discovery takes no images** — `P18` points at Commons, licensed per file, and is deliberately skipped |

---

## Conflict resolution — built 2026-09-14

`business_field_conflicts` (view over evidence), `business_source_authority`
(17 rows), `resolve_field_conflict`, `dismiss_field_conflict`, and an admin
**Conflicts** tab. Probe-verified against production inside a rolled-back
transaction: authority beats confidence, the write goes through the normal
applier, losers are superseded not deleted, and both the superseded-row and
non-admin refusals hold.

**Zero conflicts exist today** — only one source has ever enriched a business,
and one source cannot disagree with itself. The empty state says so.

---

## Public business submission — built 2026-09-14

`/add-business` and `/join/business`: a shareable link anyone can put in a
WhatsApp status, an Instagram bio, a QR code or an outreach email.

**Reused rather than rebuilt.** The status model already existed almost exactly
as specified — `profile_state`, `claim_status`, `verification_status`,
`lifecycle_status` — as did `business_members`, `business_claims`,
`business_services`, `business_products`, `business_gallery`,
`business_locations`, `verification_documents`, `campaign_referrals`,
`audit_log` and `notifications`. Only `submission_type` was genuinely missing.

**Three submission types, three different outcomes:**

| Type | Business row | claim_status | profile_state |
|---|---|---|---|
| My business | created, `user_id` = submitter | `claim_pending` | `ready_for_review` |
| I represent | created + `business_members` row | `claim_pending` | `ready_for_review` |
| Recommendation | **none** — `radar_candidates` | stays `unclaimed` | not public |

A recommendation creates no business because RLS requires `auth.uid() =
user_id` on insert — the submitter who does not own it *cannot* create one.
That is the rule `/send-business` already states in its own comment.

**Probe-verified against production inside a rolled-back transaction:** 17
assertions including anonymous refusal, missing consent, media-rights
enforcement, idempotency (a repeated key returns the same business), the
representative's recorded relationship, the recommendation creating no business,
and the ownership disclaimer being enforced server-side rather than trusted from
the UI.

---

## NowOpen Enrich — foundation, templates, engine and workspace (2026-09-14)

Built in four layers, each verified before the next.

**1. Content provenance** (`20260921010000`). `business_services`,
`business_products` and `business_gallery` had no provenance at all, and the
public read was `USING (true)`. Seven-state enum, nine columns per table,
narrowed public read, and a trigger refusing to downgrade owner content to a
machine guess. Backfill measured rather than assumed: **534 of 543** services
belong to unclaimed imported businesses and are `source_derived`; only 9 are
`owner_confirmed`.

**2. Category templates** (`categoryTemplates.ts`). 14 industry vocabularies —
services, offering groups, FAQs, schema type, gallery guidance and
`forbiddenClaims`. Keyed by industry (42) rather than category (250). Hospitals
forbid 21 phrases, schools 17, lawyers 12 — weighted where the directory
actually is. A test fails if any template forbids nothing, or suggests something
it forbids, or answers an FAQ with a claim.

**3. The engine** (`enrichment/suggest.ts`, `enrichment/runner.ts`). Pure
generation, no AI. Everything it emits is `suggested`, `requires_confirmation`
and **unpublished**. Refuses claimed businesses outright. Suppresses anything the
profile already has. Reports what it blocked rather than filtering silently.

**4. Publishing** (`20260922010000`) — **a correction to layer 1.** That
migration excluded `suggested` from the public read entirely, which is stricter
than the product rule ("clearly labelled category suggestions" are allowed) and
leaves an unclaimed hospital with a name and a phone number. The gate moved to
PUBLICATION: the engine writes unpublished, an admin publishes, and publishing
does **not** change the status — so the profile still labels it *"Typical for
this category — confirm with the business"*. `guard_generated_not_published`
makes "the engine never publishes" a database rule rather than a convention.

**5. Admin workspace** (section 33). Filter, select, generate, review, publish or
reject. Shows "none" honestly for categories with no vocabulary.

### Verified

- 12-assertion lifecycle probe against production, rolled back: generated content
  cannot arrive published, cannot claim to be owner-confirmed, is invisible while
  unpublished, publishes once, cannot be resurrected after rejection, and refuses
  non-staff.
- End-to-end through the real UI: 8 suggestions written for Chris Hani
  Baragwanath Hospital, all `suggested`/unpublished, anon read returned `[]`.
  Probe rows deleted afterwards.
- `npm run verify` exit 0 — **4,254 tests, 302 files**. No drift.

### NOA-028 — A fifth of the directory has categories the app never defined · OPEN (data)
**Measured:** "Schools & Training" (533), "Professional Services" (190), "Arts &
Culture" (68), "Health & Medical" (41) — **832 listings** — carry category names
absent from `BUSINESS_CATEGORIES`. They resolve to no industry, which silently
costs them their industry page, their booking modules and any enrichment.
**Mitigated, not fixed:** a read-time alias maps the three unambiguous ones.
"Arts & Culture" is deliberately left unmapped — it spans galleries, museums,
performers and cultural centres, and guessing would suggest gallery services to
a dance troupe. Normalising the stored categories is a decision about 832 live
rows and belongs to a migration somebody chooses to run.

### Public labelling of unconfirmed content — shipped

`SuggestedContentNotice` renders once above the services list when anything
below it is unconfirmed, and `publicContent` orders owner-confirmed content
above source-derived above suggestions. One sentence rather than a badge on
every row: the services tab feeds ~20 category renderers, and a reader who meets
eight warnings stops reading warnings.

The wording varies with what is true — "typical for this category" for a
template suggestion, "came from public sources" for imported data — and always
ends with an instruction rather than a disclaimer: *"please check before you
travel or pay."*

---

## Discovery sources and manual extraction (2026-09-14)

### Nine more sources registered, none switched on

`radar_sources` went from 9 to 18. Every new row is INACTIVE, because each
carries a real licence obligation and `sourcePermits()` treats UNKNOWN as a
refusal:

| Source | Licence | Status |
|---|---|---|
| healthsites, overpass, nominatim | ODbL (share-alike) | license_required |
| wikipedia | CC BY-SA (text) | license_required |
| geonames | CC BY 4.0 | approved_with_restrictions |
| grid3, hdx, openafrica | per dataset | review_required |
| manual_extraction | per import | approved_with_restrictions, inactive |

Chosen against the directory's actual shape — 1,654 hospitals, 533 schools —
rather than a longer list that looks thorough. **Healthsites is the closest
match there is**, and it carries the opening hours those 1,654 rows lack; it is
blocked on the same ODbL decision as OpenStreetMap.

**No social platform, deliberately.** Instagram, Facebook and TikTok prohibit
the automated access that would be required. A business's own Instagram reaches
NowOpen when its owner adds it at claim time, or through the official Graph API
with that business's authorisation. Neither is scraping.

`manual_extraction` is registered INACTIVE because
`radar_sources_active_requires_rights` permits `active = true` only when all
four rights are `permitted` — in that table ACTIVE means "a scheduler may crawl
this", and a tool driven by a person clicking Fetch is not that. The row exists
so manually-gathered data carries provenance, not to authorise a crawler.

### Manual extract tab — one page, on purpose

New `extract-page` edge function + a Business Intelligence tab. Staff-gated.
One URL per click, no link following, no queue, no schedule.

Order of refusal: SSRF guard → platform terms (before any connection is opened)
→ robots.txt → size and time caps. **A robots.txt that cannot be READ is also a
refusal**, because unknown is a refusal everywhere else in this system. Every
read is written to `audit_log` with the URL and who asked. Imports land in
`radar_candidates` at confidence 0 behind the same review queue as a public
suggestion.

`platformTerms.ts` holds the refused-host list with 12 tests, including one
that records what it does NOT catch (a lookalike domain like
`facebook.com.evil.example`) so the gap is documented rather than assumed
closed.

**Two bugs found by testing it, not by review:**
- `Access-Control-Allow-Headers` omitted `x-application-name`, which the app's
  own Supabase client sets globally. The request never reached the function, so
  nothing server-side could report it — it surfaced only as a CORS error.
- The redirect re-check read `verdict.ok`, but the type's field is `safe`.
  `!undefined` is true, so EVERY fetch looked like a refused redirect. The tool
  failed on every legitimate site while still appearing to work on the ones
  refused before the fetch — the most misleading shape a bug can take.

### Review queue improvements

- **Segment counts are now database totals.** They were counting the loaded 100
  rows, so "Discovery queue · 12" meant "12 of the most recent 100". With 3,609
  candidates on file that is a wrong number shown as a fact, and it is the one
  number a reviewer uses to decide whether there is work to do.
- Source, country and free-text filters. Country is built from the candidates
  actually loaded, so it offers only real options (Accra, Cairo, Casablanca,
  Kaduna …).
- The empty state now says WHICH filter emptied it rather than implying the
  queue is empty.

**Measured:** all 3,609 candidates are `published`; nothing is pending. The
queue showing zero is correct, not broken.
