# NowOpen Africa — Multi-Source Enrichment Network: Audit and Implementation Plan

**Date:** 2026-09-14
**Requested:** turn the Discovery source dropdown into a multi-source Business
Intelligence Enrichment Network.
**Audit first, as instructed. No code changed in producing this document.**

---

## 0. The headline finding

**Phases 1 and most of Phase 2 of your own rollout plan are already built in
this repository. They are not live.**

The brief describes the current state as "Wikidata, BusinessList, Google
Console" with a simple dropdown. The working tree contains considerably more
than that, and a good deal of it is exactly what §2–§7 ask for.

So the real task is **not** "build a multi-source engine". It is:

1. **land** what already exists (five unapplied migrations),
2. **close** the specific gaps the brief identifies that genuinely are not
   built,
3. **extend** to the new sources, in the order that earns the most.

---

## 1. Your Google question — answered from the code

**The concern is already handled.** There is no Google Search Console
integration anywhere in the codebase, and the selector does **not** say "Google
Console". It says:

```ts
{ key: 'google', label: 'Google Places' }
```

`api/acquire/google.ts` targets the Places API and is gated on
`GOOGLE_PLACES_API_KEY`, which is not configured — the panel says so on screen
rather than failing silently. There is no Google Business Profile usage at all,
so the lead-generation misuse you warn about cannot occur today.

**Remaining work on Google is real but narrow:** Places' caching, storage and
attribution restrictions are not yet encoded as *rules the system enforces*
(see §4, Phase 1). Right now the constraint is "no key", which is not a policy
control.

---

## 2. What already exists

### 2.1 Adapters — four, with real endpoints

| Source | Endpoint | State |
|---|---|---|
| Wikidata | `api/acquire/wikidata.ts` | **Working.** 2,810 listings published through it |
| OpenStreetMap | `api/acquire/openstreetmap.ts` | Built; source row `active: false` pending the ODbL decision |
| Google Places | `api/acquire/google.ts` | Built; gated on a missing API key, stated honestly |
| BusinessList | `api/acquire/businesslist.ts` | Built; **correctly refused in production** — verified live, HTTP 403: *"BusinessList.com.ng's terms prohibit automated access"* |

Plus first-party sources in the panel: Digital Forms registrations, waitlist
signups.

### 2.2 A shared discovery module — nine units, all tested

`supabase/functions/_shared/discovery/`: `evidence`, `normalize`,
`officialWebsite`, `osm`, `plan`, `quality`, `robots`, `safeUrl`, `wikidata`,
`types` — 98 tests passing (three defects in this module were found and fixed
in the audit immediately before this plan).

### 2.3 Five migrations written and **not applied**

| Migration | Creates |
|---|---|
| `20260914010000_business_discovery_campaigns` | `business_discovery_campaigns`, `business_discovery_runs`, `radar_candidates.campaign_id` |
| `20260915010000_discovery_scheduler` | `tick_discovery`, `claim_due_discovery_campaign`, `stage_discovery_candidate`, `finish_discovery_run`, `discovery_cron_status` |
| `20260916010000_source_registry_extension` | 19 registry columns — `source_type`, `access_method`, `api_endpoint`, `auth_type`, `credential_reference`, `documentation_url`, `coverage` (jsonb), `attribution_required`, `attribution_text`, `rate_limit_per_minute`, `rate_limit_per_day`, `refresh_limit`, `estimated_cost_per_record`, `data_retention_days`, `health_status`, `last_successful_sync`, `last_error`, `last_reviewed_at` |
| `20260916020000_candidate_evidence_and_source_health` | `radar_candidate_evidence` — field-level provenance at the candidate stage |
| `20260916030000_official_website_adapter` | website adapter wiring into `evidence_method_for_source` |

`npm run check:migrations` reports **all 150 files safe to re-run**.

### 2.4 An admin Business Intelligence area — 1,570 lines, six tabs

`src/components/admin/businessIntelligence/`: Overview, Sources, Campaigns,
Review, Compliance, shared. Route `/admin/business-intelligence` is registered.

**Four of these tabs query the three tables above, which do not exist in
production.** supabase-js resolves with `{data: null, error}` rather than
throwing, so **they render empty instead of reporting the fault.**

### 2.5 Already-live foundations

- Rights gate (`sourcePermits`) — **unknown is a refusal**, blank
  `authorised_by` is a refusal; enforced at ingestion *and* again at publish
- Field-level provenance on published businesses — `business_evidence`,
  **18,851 rows across 3,056 businesses**
- Media rights registry — `business_media_assets`, 1,186 rows with
  `rights_decision`, `licence`, `moderation_status`, `takedown_requested_at`
- Review queue, Import Center, audit log, kill switches
- Enrichment engine with change proposals and owner-authorised auto-apply

---

## 3. What is genuinely missing

Measured against the brief, field by field.

### 3.1 Registry columns the brief asks for and nothing provides

| Column | Why it matters |
|---|---|
| `compliance_status` | The brief's eight-state review machine (`APPROVED`, `REVIEW_REQUIRED`, `LICENSE_REQUIRED`, `OWNER_AUTHORIZATION_REQUIRED`, `BLOCKED`…). Today there is only a boolean `active` plus a pending `health_status` — operational health, not legal review |
| `image_reuse_allowed` | **The one with a live consequence.** 1,176 profiles carry stock covers and 1,186 media assets exist; nothing in the registry says per-source whether images may be reused at all |
| `contact_storage_allowed` | Whether a source's phone numbers may be *stored*, distinct from displayed — the question ClaimReach's suppression model will ask |
| `license_type` | `licence` is free text today (`'CC0 1.0 Universal…'`). An enum makes it queryable |
| `country_coverage`, `category_coverage` | The pending `coverage` jsonb probably subsumes both — confirm before adding columns |

Note the four rights columns that **do** exist and already carry most of the
brief's intent: `automated_access`, `bulk_extraction`, `redistribution`,
`competing_dataset`.

### 3.2 Conflict resolution (§8) — not built

No `business_field_conflicts` table. `business_media_assets.conflicts_with` is
the only conflict concept anywhere. Today a proposal either applies or waits;
two sources disagreeing is not modelled.

### 3.3 Adapters not built

OpenCorporates · Foursquare · HERE · TomTom · country registries (CAC, RGD,
CIPC…) · chambers of commerce · VConnect, Finelib, Hotfrog, Yellow Pages ·
social references (Instagram, Facebook, LinkedIn, TikTok, YouTube) ·
marketplaces.

### 3.4 Multi-select

The selector is single-choice. The brief wants multiple sources per campaign
with priority and fallback order.

---

## 4. Plan

### Phase 0 — Land what exists (½ day, no new code)

1. Apply the five migrations **in timestamp order**, one at a time, in the SQL
   editor — **not** `supabase db push`, which would replay 99 migrations, three
   of which write rows.
2. Re-run `npm run check:drift` → expect "No drift".
3. Open `/admin/business-intelligence` and confirm the four tabs populate.
4. If anything in them is unfinished, gate the route behind a feature flag
   rather than shipping tabs that present emptiness as data.

**This is the highest-value half-day available.** It converts 1,570 lines of
written UI and five migrations from invisible to working.

### Phase 1 — Close the registry gaps (1–2 days)

One migration adding, to `radar_sources`:

```
compliance_status    text  CHECK (approved | approved_with_restrictions |
                                 review_required | api_required |
                                 license_required |
                                 owner_authorization_required |
                                 disabled | blocked)
license_type         text
image_reuse_allowed  text  CHECK (permitted | prohibited | unknown)  DEFAULT 'unknown'
contact_storage_allowed text CHECK (permitted | prohibited | unknown) DEFAULT 'unknown'
```

Every one defaults to the **refusing** value, consistent with `sourcePermits`.
Then extend `sourcePermits()` with two operations — `store_contact` and
`reuse_image` — so the existing gate answers the new questions, rather than a
second gate growing beside it.

Backfill the six existing sources explicitly. Wikidata is CC0 → all permitted
except images (Commons is per-file — `image_reuse_allowed: prohibited`, which
encodes in data the rule the Wikidata adapter already follows in code).

**Deliverable that matters:** Google Places' caching/attribution limits become
`data_retention_days` + `attribution_required` + `attribution_text` on its row,
so the policy is enforced by the gate rather than by a missing key.

### Phase 2 — Multi-select and source cards (2–3 days)

- `business_discovery_campaign_sources` (campaign, source, priority, enabled) —
  the brief's own table name.
- Replace the single `<select>` with the source-card grid from §6, grouped Open
  Data / Directories / Commercial APIs / Registries / Websites / Social / Owner
  Submitted. Each card shows compliance status, health, coverage, rate limit,
  cost estimate, last sync, and a Test-connection button.
- Campaign runs iterate sources in priority order with fallback.

### Phase 3 — Conflict resolution (2–3 days)

`business_field_conflicts` (business, field, values[] with source + confidence +
observed_at, status, resolved_by, resolved_at, previous_value). Surface in the
Review tab: conflicting values side by side with source authority, freshness and
evidence; a recommended value; approve/override; rollback.

Default authority order configurable per field, seeded as the brief specifies —
owner-confirmed → official website → authorised social → official registry →
licensed provider → directory → open data → AI.

### Phase 4 — New adapters, in earning order

1. **Official websites** (already built — activate it). Highest-value source in
   the list: it is the only one that yields services, products, hours and
   booking links together, and the business owns the data.
2. **OpenStreetMap** — *pending your ODbL decision*. It is the one source that
   would fix the hours gap (0 of 2,810 discovered listings have hours).
3. **Google Places** — once a key exists and Phase 1's policy fields are set.
4. **OpenCorporates** — legal-entity confirmation, strongest for legal name and
   registration number only.
5. **Foursquare / HERE / TomTom** — supplementary; pick **one** first and
   measure its marginal yield before adding a second.
6. **Country registries** — a `country_source_registry` shaped exactly as your
   brief describes.

### Phase 5 — Social references and marketplaces

Reference-only, as you specify: store handle, profile URL, source URL, match
confidence, discovery date, owner-confirmed flag, messaging-permitted flag.
Official Meta/LinkedIn APIs only where eligible. No unofficial endpoints, no
bulk DMs — outreach drafts go to a human, which is how ClaimReach already
works.

---

## 5. What I recommend against

**Do not build a generic directory scraper.** BusinessList is the proof the
current design is right: the scraper exists, the source row prohibits it, and
production answers **403** with the reason. Each directory needs its own row
and its own decision. That pattern should be copied, not bypassed.

**Do not seed the registry with sources you have not reviewed.** The brief
lists ~36. Adding rows with `compliance_status: review_required` is honest;
adding them as selectable options is not — an operator will assume a listed
source is a usable one.

**Do not let adapter count become the metric.** The directory already holds
3,059 listings of which 70% are hospitals and schools, none have hours, and two
are claimed. A seventh adapter does not fix any of those. Sources 1 and 2 above
do.

---

## 6. Sequencing recommendation

Phase 0 this week — it is nearly free and unblocks work already paid for.
Phase 1 next, because `image_reuse_allowed` has a live consequence today.
Then Phase 4 items 1 and 2, because hours and owner-supplied facts are what the
product is short of.

Phases 2, 3 and 5 are real but they improve the *operation* of acquisition.
Phases 0, 1 and 4 improve what a visitor actually finds.

---

## 7. Acceptance criteria — current state

| Criterion | State |
|---|---|
| Admins can select multiple sources | ✗ single-select (Phase 2) |
| Each source has a compliance state | ◐ `active` + rights columns; no review machine (Phase 1) |
| Each source has a health status | ◐ built, unapplied (Phase 0) |
| Each imported field has provenance | ✓ 18,851 rows live |
| Conflicting values are reviewable | ✗ (Phase 3) |
| Duplicates detected | ✓ zero duplicate names across 3,059 |
| Search Console not used as a business source | ✓ no integration exists |
| Google Places policy-controlled | ◐ gated on a missing key, not on policy (Phase 1) |
| OSM with attribution and rate limits | ◐ adapter built, inactive pending ODbL |
| Website enrichment safe and auditable | ✓ robots + SSRF + rate limits, all tested |
| Instagram not scraped unofficially | ✓ no Instagram code exists |
| No bulk unsolicited DMs | ✓ ClaimReach has no sender at all |
| Owner-confirmed data protected | ✓ DB trigger, verified in four directions |
| Costs and quotas visible | ◐ columns built, unapplied |
| Admins can pause any source | ✓ `active` flag + kill switches |
| All imports auditable | ✓ audit log + evidence |
| RLS and security tests pass | ✓ 4,076 tests green |

---

## 8. EXECUTION LOG — Phases 0 and 1 (2026-09-14, same day)

### Phase 0 — landed

All five migrations applied in timestamp order, one at a time, via the SQL
editor. **Not** `db push`. Scanned first: no drops, no truncates, no writes to
`businesses`; the only two top-level inserts are `ON CONFLICT` idempotent seeds
(a feature flag, and `radar_sources` rows), and the single `DELETE` is inside a
function body (re-staging a candidate clears its own prior evidence).

| Result | Evidence |
|---|---|
| `check:drift` | **✓ No drift** (was: 3 missing tables, 19 missing columns) |
| Live tables | 94 → **97** |
| Registry | 7 → **9 sources**, now carrying `source_type`, `health_status`, `access_method`, rate limits |
| New tables | `business_discovery_campaigns`, `business_discovery_runs`, `radar_candidate_evidence` — all RLS-enabled, 2 policies each |
| Scheduler | `discovery_cron_status()` present, and correctly refuses a non-admin caller ("Admins only") |
| **BI tabs** | **Now populate.** Sources tab lists 9 sources with rights, health, licence and sign-off — verified in the running admin console |

### Phase 1 — landed

**Migration `20260917010000_source_rights_completion`** adds the four columns
nothing provided, each defaulting to the refusing value:

`image_reuse_allowed` · `contact_storage_allowed` · `compliance_status`
(8-state review machine) · `license_type` (7-value enum)

and backfills all nine sources explicitly:

| source | review | licence | images | contacts |
|---|---|---|---|---|
| wikidata | approved | public_domain | **prohibited** | permitted |
| admin_import / business_submission / public_suggestion | approved | first_party | permitted | permitted |
| official_website | approved_with_restrictions | unknown | unknown | permitted |
| google | api_required | commercial_api | prohibited | unknown |
| openstreetmap | license_required | share_alike | prohibited | unknown |
| opencorporates | license_required | commercial_api | prohibited | unknown |
| businesslist_ng | blocked | proprietary | prohibited | prohibited |

**The Wikidata row is the point of the whole exercise:** four rights permitted
and images prohibited, because Commons is licensed per file. That rule
previously existed only as a comment inside one adapter.

**`sourcePermits()` extended** with two operations — `reuse_image` and
`store_contact` — so the existing gate answers the new questions rather than a
second gate growing beside it. UNKNOWN remains a refusal; a missing field
refuses; a blank `authorised_by` still refuses everything.

**Surfaced in two places:** the Discovery panel's rights banner, and the
Sources tab — which now shows **six** rights boxes rather than four, plus
review state and licence type. Verified live in the console: Wikidata reads
`IMAGE REUSE | prohibited` beside four `permitted` rights.

### Verification

- `npm run verify` **exit 0 — 293 files, 4,080 tests, 0 errors** (+4 new,
  falsified by removing the operation mapping and watching the permit assertion
  fail)
- `check:drift` ✓ no drift · `check:migrations` ✓ 151 files safe to re-run
- Deployed. Public smoke after deploy: home 200, crawler profile 200

### Still open at that point

Phase 2 (multi-select + source cards), Phase 3 (conflict resolution), Phase 4
(new adapters). The two decisions that gate the most value remain yours: the
**ODbL share-alike question** for OpenStreetMap, and a **Google Places API
key**.

---

## 9. EXECUTION LOG — Phases 2 and 3 (2026-09-14)

### Phase 2 was already built

Audited rather than assumed. `business_discovery_campaigns.source_keys` is
already a multi-source array, and `CampaignsTab.tsx:342` already renders a
`ToggleChip` per source against `form.sourceKeys.includes(k)`. Verified live:
status filters, "New campaign", and the honest empty states *"No campaigns.
Build one to scope a discovery run."* and *"No runs recorded."*

Nothing was rewritten. The brief assumed a single-source dropdown; the
repository had moved past it.

### Phase 3 — conflict resolution

**The first design was wrong, and the database said so.**

The obvious model is two rival *proposals*: `business_change_proposals` carries
`current_value`, `proposed_value`, source, confidence and evidence, so two of
them naming one field reads exactly like a conflict. A migration was written on
that basis.

It cannot happen. `business_change_proposals_active_unique` is a **partial
unique index** on `(business_id, field_name) WHERE status = 'pending'` — at
most ONE proposal per field may be open. The probe that proved it failed with
`duplicate key value violates unique constraint`. The model was discarded and
rebuilt, not patched.

**Which exposed a real defect (NOA-018).** `enrich-business/index.ts:398` wrote
that insert bare — `await db.from(...).insert({...})`, no `.select()`, no error
inspected. supabase-js RESOLVES with `{ error }` rather than throwing, so the
rejection was discarded: the evidence row written moments earlier survived, the
proposal did not, and **nothing was logged and nobody was told**. The media
insert twelve lines below already checked its error and tolerated unique
violations deliberately; the proposal insert was the odd one out.

**So a conflict is an evidence fact.** `business_evidence` is the durable record
of "source X observed value Y for field F", has no such uniqueness rule, and
already holds 18,851 rows. Two non-superseded rows for one field with differing
values IS the conflict, and it is the only representation this schema permits.

**Delivered** (`20260917020000_field_conflict_resolution.sql`, applied):

- `business_source_authority` — per-field ranking, **17 rows**: an 11-source
  default ladder plus 6 field-specific overrides. Lower wins; sparse numbering
  so a source can be slotted in later without renumbering.
- `source_authority_rank(field, source)` — field-specific, then wildcard, then
  **500**. An unranked source sorts *below* everything ranked, because "nobody
  has decided" is the weak answer everywhere else in this system.
- `business_field_conflicts` — a VIEW over evidence. No new table: a conflict is
  not a new fact, it is a shape the existing facts are already in. A parallel
  table would duplicate six columns needing perpetual sync.
- `resolve_field_conflict(evidence_id, note)` and
  `dismiss_field_conflict(business, field, note)`.
- Admin `Conflicts` tab, `src/lib/fieldConflicts.ts` as the pure decision layer.

**A second bug in my own migration, caught before it shipped.**
`apply_business_change_proposal` raises `'proposal is not approved'` unless the
row is already `approved` — the review panel stamps first, then applies. The
resolver required `pending` and applied directly, so it would have failed every
single time. It now performs the same two steps in the same order. The
resolution is an approval, made by an admin, recorded with the rivals it beat.

**Dismissal keeps the provenance of what is kept.** It supersedes only evidence
whose value *differs* from the current one; superseding all of it would leave
the business holding a value nothing on file supports.

### Verification — probed against production, then rolled back

A transaction inserted two rival evidence rows on a real unclaimed business and
was thrown away. Every assertion held:

| Check | Result |
|---|---|
| View sees the conflict | 2 distinct values, 2 evidence rows |
| **Authority beats confidence** | website ranked first (**20**) over Wikidata (**65**) despite Wikidata's 99 vs 70 confidence |
| Write went through the normal applier | `applied: true`, note `Applied by engine · <operator note>` |
| Business row updated | `tagline` = the website's value |
| Loser superseded, not deleted | `superseded_at` set; winner still live |
| Conflict cleared | 0 remaining |
| Re-resolving a superseded row | refused — *"already superseded on …"* |
| **Non-admin** | refused — *"Admins only"* |

The admin gate also refused a direct SQL session outright, which is worth
recording as a positive: it does not rely on the UI.

### The honest empty state

**Zero conflicted fields exist today.** Only Wikidata has ever enriched a
business, and one source cannot disagree with itself. The tab says exactly that
rather than implying the feature is broken. This is machinery built for the
moment a second source is switched on — which is the entire point of the
enrichment network, and which is gated on the two decisions below.

A read failure now suppresses that empty state, because "no conflicts" is a
claim about the data and saying it above an error message tells the operator
the opposite of the truth. That defect was caught by its own test, not by
review.

### Verification

- `npm run verify` **exit 0 — 295 files, 4,103 tests** (+23: 16 decision-layer,
  7 component)
- `check:migrations` ✓ 152 files safe to re-run
- Deployed: `enrich-business` function and the site (aliased to
  www.nowopenafrica.com)

### Still open

**Phase 4 (new adapters) remains blocked on the same two founder decisions**,
and neither is mine to take:

1. **OpenStreetMap / ODbL share-alike.** OSM carries opening hours — the exact
   gap in NOA-006 — and covers African SMEs far better than Wikidata. Publicly
   using a derivative database obliges NowOpen to offer that database under
   ODbL. For a directory whose data is the asset, that is a company decision.
2. **A Google Places API key.** The absence of a key is not a policy control;
   the source sits at `api_required` with images prohibited and contact storage
   unreviewed until the caching, storage and attribution rules are encoded as
   rules this system enforces.
